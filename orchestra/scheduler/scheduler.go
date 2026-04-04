package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
	"github.com/robfig/cron/v3"
)

// AgentReplier is the subset of *orchestra.Agent used by the scheduler.
type AgentReplier interface {
	Reply(ctx context.Context, msg *orchestra.Message) (string, error)
}

// MessageSender is the subset of *channels.TelegramChannel used by the scheduler.
type MessageSender interface {
	SendBubbles(ctx context.Context, chatID int64, text string) error
}

// SchedulerUpdater is the interface used by skills to manage schedules at runtime.
type SchedulerUpdater interface {
	AddRule(ctx context.Context, rule config.ScheduleRule) error
	RemoveRule(index int) error
	Rules() []config.ScheduleRule
}

// Scheduler fires proactive messages on a cron schedule.
type Scheduler struct {
	mu     sync.RWMutex
	rules  []config.ScheduleRule
	entryIDs []cron.EntryID
	agent  AgentReplier
	sender MessageSender
	c      *cron.Cron
	// ctx saved on Start so AddRule can register jobs with the same context.
	ctx context.Context
}

// New creates a Scheduler. If rules is empty, Start is a no-op.
func New(rules []config.ScheduleRule, agent AgentReplier, sender MessageSender) *Scheduler {
	return &Scheduler{
		rules:  append([]config.ScheduleRule(nil), rules...),
		agent:  agent,
		sender: sender,
		c:      cron.New(),
	}
}

// Start registers all cron jobs and starts the internal runner in a background
// goroutine. A second goroutine watches ctx for cancellation and calls Stop.
// Non-blocking.
func (s *Scheduler) Start(ctx context.Context) {
	s.ctx = ctx
	for _, rule := range s.rules {
		rule := rule
		id, err := s.c.AddFunc(rule.Cron, func() {
			s.fire(ctx, rule)
		})
		if err != nil {
			log.Printf("[scheduler] invalid cron %q for prompt %q: %v", rule.Cron, rule.Prompt, err)
			continue
		}
		s.entryIDs = append(s.entryIDs, id)
	}
	s.c.Start()
	log.Printf("[scheduler] started with %d rule(s)", len(s.rules))

	go func() {
		<-ctx.Done()
		s.Stop()
	}()
}

// Stop halts the cron runner and waits for any running jobs to finish.
func (s *Scheduler) Stop() {
	stopCtx := s.c.Stop()
	<-stopCtx.Done()
	log.Println("[scheduler] stopped")
}

// AddRule registers a new cron rule at runtime. Safe to call after Start.
func (s *Scheduler) AddRule(ctx context.Context, rule config.ScheduleRule) error {
	runCtx := ctx
	if runCtx == nil {
		runCtx = s.ctx
	}
	id, err := s.c.AddFunc(rule.Cron, func() {
		s.fire(runCtx, rule)
	})
	if err != nil {
		return fmt.Errorf("invalid cron %q: %w", rule.Cron, err)
	}
	s.mu.Lock()
	s.rules = append(s.rules, rule)
	s.entryIDs = append(s.entryIDs, id)
	s.mu.Unlock()
	return nil
}

// RemoveRule removes the rule at the given index. Safe to call after Start.
func (s *Scheduler) RemoveRule(index int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if index < 0 || index >= len(s.rules) {
		return fmt.Errorf("index %d out of range (have %d rules)", index, len(s.rules))
	}
	s.c.Remove(s.entryIDs[index])
	s.rules = append(s.rules[:index], s.rules[index+1:]...)
	s.entryIDs = append(s.entryIDs[:index], s.entryIDs[index+1:]...)
	return nil
}

// Rules returns a snapshot of all active rules.
func (s *Scheduler) Rules() []config.ScheduleRule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]config.ScheduleRule(nil), s.rules...)
}

func (s *Scheduler) fire(ctx context.Context, rule config.ScheduleRule) {
	msgID := fmt.Sprintf("sched-%d", time.Now().UnixNano())
	channelID := fmt.Sprintf("%d", rule.ChatID)
	msg := orchestra.NewMessage(msgID, rule.Prompt, channelID)

	reply, err := s.agent.Reply(ctx, msg)
	if err != nil {
		log.Printf("[scheduler] agent.Reply error for prompt %q: %v", rule.Prompt, err)
		return
	}
	if reply == "" {
		return
	}

	if err := s.sender.SendBubbles(ctx, rule.ChatID, reply); err != nil {
		log.Printf("[scheduler] SendBubbles error to %d: %v", rule.ChatID, err)
	}
}

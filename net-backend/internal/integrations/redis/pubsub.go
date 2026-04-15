package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type PubSub struct {
	client *redis.Client
}

// NewPubSub creates a new PubSub instance
func NewPubSub(client *Client) *PubSub {
	return &PubSub{
		client: client.rdb,
	}
}

// MessageHandler processes received messages
type MessageHandler func(channel string, message string)

// Subscribe subscribes to a Redis channel and processes messages
func (p *PubSub) Subscribe(ctx context.Context, channel string, handler MessageHandler) error {
	pubsub := p.client.Subscribe(ctx, channel)
	defer pubsub.Close()

	// Wait for confirmation that subscription is created
	if _, err := pubsub.Receive(ctx); err != nil {
		return fmt.Errorf("failed to subscribe to channel %s: %w", channel, err)
	}

	log.Printf("Subscribed to Redis channel: %s", channel)

	// Channel to receive messages from Redis
	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Unsubscribing from channel %s", channel)
			return nil
		case msg := <-ch:
			if msg == nil {
				continue
			}

			// Process message in separate goroutine to avoid blocking
			go func(m *redis.Message) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("Panic in message handler for channel %s: %v", m.Channel, r)
					}
				}()

				handler(m.Channel, m.Payload)
			}(msg)
		}
	}
}

// Publish sends a message to a Redis channel
func (p *PubSub) Publish(ctx context.Context, channel string, message interface{}) error {
	var msgStr string

	switch m := message.(type) {
	case string:
		msgStr = m
	case []byte:
		msgStr = string(m)
	default:
		// Try to marshal to JSON
		jsonBytes, err := json.Marshal(m)
		if err != nil {
			return fmt.Errorf("failed to marshal message: %w", err)
		}
		msgStr = string(jsonBytes)
	}

	result := p.client.Publish(ctx, channel, msgStr)
	if err := result.Err(); err != nil {
		return fmt.Errorf("failed to publish to channel %s: %w", channel, err)
	}

	return nil
}

// PatternSubscribe subscribes to multiple channels using a pattern
func (p *PubSub) PatternSubscribe(ctx context.Context, pattern string, handler MessageHandler) error {
	pubsub := p.client.PSubscribe(ctx, pattern)
	defer pubsub.Close()

	// Wait for confirmation
	if _, err := pubsub.Receive(ctx); err != nil {
		return fmt.Errorf("failed to subscribe to pattern %s: %w", pattern, err)
	}

	log.Printf("Subscribed to Redis pattern: %s", pattern)
	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Unsubscribing from pattern %s", pattern)
			return nil
		case msg := <-ch:
			if msg == nil {
				continue
			}

			go func(m *redis.Message) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("Panic in pattern handler for channel %s: %v", m.Channel, r)
					}
				}()

				handler(m.Channel, m.Payload)
			}(msg)
		}
	}
}

// SubscribeMultiple subscribes to multiple channels
func (p *PubSub) SubscribeMultiple(ctx context.Context, channels []string, handler MessageHandler) error {
	pubsub := p.client.Subscribe(ctx, channels...)
	defer pubsub.Close()

	if _, err := pubsub.Receive(ctx); err != nil {
		return fmt.Errorf("failed to subscribe to channels: %w", err)
	}

	log.Printf("Subscribed to %d Redis channels", len(channels))
	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Unsubscribing from %d channels", len(channels))
			return nil
		case msg := <-ch:
			if msg == nil {
				continue
			}

			go func(m *redis.Message) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("Panic in multi-channel handler for channel %s: %v", m.Channel, r)
					}
				}()

				handler(m.Channel, m.Payload)
			}(msg)
		}
	}
}

// ChannelStats represents statistics for a channel
type ChannelStats struct {
	Channel     string    `json:"channel"`
	Subscribers int64     `json:"subscribers"`
	LastMessage time.Time `json:"last_message"`
}

// GetChannelStats returns statistics for a channel
func (p *PubSub) GetChannelStats(ctx context.Context, channel string) (*ChannelStats, error) {
	cmd := p.client.PubSubNumSub(ctx, channel)
	result, err := cmd.Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get channel stats: %w", err)
	}

	// result is a map of channel -> subscriber count
	subscribers, exists := result[channel]
	if !exists {
		subscribers = 0
	}

	return &ChannelStats{
		Channel:     channel,
		Subscribers: subscribers,
		LastMessage: time.Now(), // TODO: Implement tracking last message time
	}, nil
}

// Unsubscribe unsubscribes from channels
func (p *PubSub) Unsubscribe(ctx context.Context, channels ...string) error {
	pubsub := p.client.Subscribe(ctx, channels...)
	defer pubsub.Close()

	if err := pubsub.Unsubscribe(ctx, channels...); err != nil {
		return fmt.Errorf("failed to unsubscribe: %w", err)
	}

	log.Printf("Unsubscribed from %d channels", len(channels))
	return nil
}

// PatternUnsubscribe unsubscribes from pattern subscriptions
func (p *PubSub) PatternUnsubscribe(ctx context.Context, patterns ...string) error {
	pubsub := p.client.PSubscribe(ctx, patterns...)
	defer pubsub.Close()

	if err := pubsub.PUnsubscribe(ctx, patterns...); err != nil {
		return fmt.Errorf("failed to unsubscribe from patterns: %w", err)
	}

	log.Printf("Unsubscribed from %d patterns", len(patterns))
	return nil
}

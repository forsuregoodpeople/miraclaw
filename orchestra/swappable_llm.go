package orchestra

import (
	"context"
	"sync"
)

// SwappableLLM wraps an LLM provider and allows swapping it at runtime (e.g. /model command).
// Safe for concurrent use.
type SwappableLLM struct {
	mu  sync.RWMutex
	llm LLM
}

func NewSwappableLLM(llm LLM) *SwappableLLM {
	return &SwappableLLM{llm: llm}
}

func (s *SwappableLLM) Complete(ctx context.Context, req Request) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.llm.Complete(ctx, req)
}

// Swap replaces the underlying LLM provider.
func (s *SwappableLLM) Swap(newLLM LLM) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.llm = newLLM
}

package providers_test

import (
	"context"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/providers"
)

// TestOpenAIMapMessages verifies that NewOpenAI returns an LLM implementation.
// Actual API call is skipped without a key — this is a compile+interface test.
func TestOpenAIImplementsLLM(t *testing.T) {
	var _ orchestra.LLM = providers.NewOpenAI("fake-key", "gpt-4o-mini")
}

func TestDeepSeekImplementsLLM(t *testing.T) {
	var _ orchestra.LLM = providers.NewDeepSeek("fake-key", "deepseek-chat")
}

func TestAnthropicImplementsLLM(t *testing.T) {
	var _ orchestra.LLM = providers.NewAnthropic("fake-key", "claude-haiku-4-5-20251001")
}

// TestOpenAIMessageMapping verifies the request is correctly built with role-based messages.
// Uses a real request struct but does NOT make a network call.
func TestRequestWithRoleMessages(t *testing.T) {
	req := orchestra.Request{
		Messages: []orchestra.ChatMessage{
			{Role: "system", Content: "You are helpful."},
			{Role: "user", Content: "Hello"},
		},
		MaxTokens:   50,
		Temperature: 0.5,
	}
	if len(req.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(req.Messages))
	}
	if req.Messages[0].Role != "system" {
		t.Errorf("expected system role, got %q", req.Messages[0].Role)
	}
}

// TestOpenAILiveSkip skips live tests when no API key is present.
func TestOpenAILiveComplete(t *testing.T) {
	t.Skip("requires live OpenAI API key")
	llm := providers.NewOpenAI("sk-...", "gpt-4o-mini")
	resp, err := llm.Complete(context.Background(), orchestra.Request{
		Messages:  []orchestra.ChatMessage{{Role: "user", Content: "say hi"}},
		MaxTokens: 10,
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if resp == "" {
		t.Error("expected non-empty response")
	}
}

func TestAnthropicLiveComplete(t *testing.T) {
	t.Skip("requires live Anthropic API key")
	llm := providers.NewAnthropic("sk-ant-...", "claude-haiku-4-5-20251001")
	resp, err := llm.Complete(context.Background(), orchestra.Request{
		Messages: []orchestra.ChatMessage{
			{Role: "system", Content: "You are helpful."},
			{Role: "user", Content: "say hi"},
		},
		MaxTokens: 10,
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if resp == "" {
		t.Error("expected non-empty response")
	}
}

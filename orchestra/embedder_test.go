package orchestra_test

import (
	"context"
	"testing"

	"github.com/miraclaw/orchestra"
)

// mockLLM implements the new LLM interface for testing.
type mockLLM struct {
	response string
	err      error
	lastReq  orchestra.Request
}

func (m *mockLLM) Complete(ctx context.Context, req orchestra.Request) (string, error) {
	m.lastReq = req
	return m.response, m.err
}

func TestChatMessageRoles(t *testing.T) {
	msgs := []orchestra.ChatMessage{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "Hello"},
		{Role: "assistant", Content: "Hi there!"},
	}
	if msgs[0].Role != "system" {
		t.Errorf("expected system role, got %s", msgs[0].Role)
	}
	if msgs[1].Role != "user" {
		t.Errorf("expected user role, got %s", msgs[1].Role)
	}
	if msgs[2].Role != "assistant" {
		t.Errorf("expected assistant role, got %s", msgs[2].Role)
	}
}

func TestRequestHasMessages(t *testing.T) {
	req := orchestra.Request{
		Messages: []orchestra.ChatMessage{
			{Role: "user", Content: "test"},
		},
		MaxTokens:   100,
		Temperature: 0.7,
	}
	if len(req.Messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(req.Messages))
	}
	if req.Messages[0].Content != "test" {
		t.Errorf("expected content 'test', got %s", req.Messages[0].Content)
	}
}

func TestMockLLMComplete(t *testing.T) {
	llm := &mockLLM{response: "hello world"}
	req := orchestra.Request{
		Messages: []orchestra.ChatMessage{
			{Role: "user", Content: "say hello"},
		},
		MaxTokens: 50,
	}
	resp, err := llm.Complete(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp != "hello world" {
		t.Errorf("expected 'hello world', got %s", resp)
	}
	if len(llm.lastReq.Messages) != 1 {
		t.Errorf("expected lastReq to have 1 message")
	}
}

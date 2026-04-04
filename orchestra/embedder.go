package orchestra

import "context"

// ChatMessage is a role-tagged message for LLM conversations.
type ChatMessage struct {
	Role    string // "system", "user", "assistant"
	Content string
}

// Request contains parameters for an LLM completion request.
type Request struct {
	Messages    []ChatMessage
	MaxTokens   int
	Temperature float64
}

// LLM is the interface for language model providers.
type LLM interface {
	Complete(ctx context.Context, req Request) (string, error)
}

// Embedder converts text into a vector for semantic search.
type Embedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
	Dimensions() uint64
}

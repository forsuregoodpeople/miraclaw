package embedders

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

type GeminiEmbedder struct {
	client *genai.Client
}

func NewGeminiEmbedder(apiKey string) (*GeminiEmbedder, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:      apiKey,
		HTTPOptions: genai.HTTPOptions{APIVersion: "v1beta"},
	})
	if err != nil {
		return nil, fmt.Errorf("gemini embedder: %w", err)
	}
	return &GeminiEmbedder{client: client}, nil
}

func (e *GeminiEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	result, err := e.client.Models.EmbedContent(
		ctx,
		"gemini-embedding-001",
		genai.Text(text),
		&genai.EmbedContentConfig{TaskType: "RETRIEVAL_QUERY"},
	)
	if err != nil {
		return nil, fmt.Errorf("gemini embed: %w", err)
	}
	if result == nil || len(result.Embeddings) == 0 {
		return nil, fmt.Errorf("gemini embed: empty embeddings response")
	}
	raw := result.Embeddings[0].Values
	vec := make([]float32, len(raw))
	for i, v := range raw {
		vec[i] = float32(v)
	}
	return vec, nil
}

func (e *GeminiEmbedder) Dimensions() uint64 { return 3072 }

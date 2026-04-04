package providers

import (
	"context"
	"fmt"

	"github.com/miraclaw/orchestra"
	"google.golang.org/genai"
)

type Gemini struct {
	client *genai.Client
	model  string
}

func NewGemini(apiKey, model string) (*Gemini, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: %w", err)
	}
	return &Gemini{client: client, model: model}, nil
}

func (g *Gemini) Complete(ctx context.Context, req orchestra.Request) (string, error) {
	var contents []*genai.Content
	cfg := &genai.GenerateContentConfig{
		Temperature:     genai.Ptr(float32(req.Temperature)),
		MaxOutputTokens: int32(req.MaxTokens),
	}

	for _, m := range req.Messages {
		switch m.Role {
		case "system":
			// Gemini uses SystemInstruction for system-level context.
			// Append to existing if multiple system messages.
			if cfg.SystemInstruction == nil {
				cfg.SystemInstruction = genai.NewContentFromText(m.Content, genai.RoleUser)
			} else {
				cfg.SystemInstruction.Parts = append(cfg.SystemInstruction.Parts, &genai.Part{Text: m.Content})
			}
		case "assistant":
			contents = append(contents, genai.NewContentFromText(m.Content, genai.RoleModel))
		default: // "user"
			contents = append(contents, genai.NewContentFromText(m.Content, genai.RoleUser))
		}
	}

	result, err := g.client.Models.GenerateContent(ctx, g.model, contents, cfg)
	if err != nil {
		return "", fmt.Errorf("gemini: %w", err)
	}
	return result.Text(), nil
}

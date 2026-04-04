package providers

import (
	"context"
	"fmt"

	"github.com/miraclaw/orchestra"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

type OpenAI struct {
	client openai.Client
	model  string
}

func NewOpenAI(apiKey, model string) *OpenAI {
	return &OpenAI{
		client: openai.NewClient(option.WithAPIKey(apiKey)),
		model:  model,
	}
}

func (o *OpenAI) Complete(ctx context.Context, req orchestra.Request) (string, error) {
	params := openai.ChatCompletionNewParams{
		Model:       openai.ChatModel(o.model),
		MaxTokens:   openai.Int(int64(req.MaxTokens)),
		Temperature: openai.Float(float64(req.Temperature)),
	}
	for _, m := range req.Messages {
		switch m.Role {
		case "system":
			params.Messages = append(params.Messages, openai.SystemMessage(m.Content))
		case "assistant":
			params.Messages = append(params.Messages, openai.AssistantMessage(m.Content))
		default: // "user"
			params.Messages = append(params.Messages, openai.UserMessage(m.Content))
		}
	}
	resp, err := o.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", fmt.Errorf("openai: %w", err)
	}
	return resp.Choices[0].Message.Content, nil
}

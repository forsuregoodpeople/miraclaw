package providers

import (
	"context"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/miraclaw/orchestra"
)

type Anthropic struct {
	client anthropic.Client
	model  string
}

func NewAnthropic(apiKey, model string) *Anthropic {
	return &Anthropic{
		client: anthropic.NewClient(option.WithAPIKey(apiKey)),
		model:  model,
	}
}

func (a *Anthropic) Complete(ctx context.Context, req orchestra.Request) (string, error) {
	var systemText string
	var messages []anthropic.MessageParam

	for _, m := range req.Messages {
		switch m.Role {
		case "system":
			if systemText != "" {
				systemText += "\n"
			}
			systemText += m.Content
		case "assistant":
			messages = append(messages, anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content)))
		default: // "user"
			messages = append(messages, anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content)))
		}
	}

	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(a.model),
		MaxTokens: int64(req.MaxTokens),
		Messages:  messages,
	}
	if systemText != "" {
		params.System = []anthropic.TextBlockParam{
			{Text: systemText},
		}
	}

	msg, err := a.client.Messages.New(ctx, params)
	if err != nil {
		return "", fmt.Errorf("anthropic: %w", err)
	}
	if len(msg.Content) == 0 {
		return "", nil
	}
	return msg.Content[0].Text, nil
}

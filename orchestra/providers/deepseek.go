package providers

import (
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

func NewDeepSeek(apiKey, model string) *OpenAI {
	return &OpenAI{
		client: openai.NewClient(
			option.WithAPIKey(apiKey),
			option.WithBaseURL("https://api.deepseek.com/v1"),
		),
		model: model,
	}
}

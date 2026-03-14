package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type llmClient struct {
	httpClient *http.Client
}

type llmChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type llmChatRequest struct {
	Model       string           `json:"model"`
	Messages    []llmChatMessage `json:"messages"`
	MaxTokens   int              `json:"max_tokens,omitempty"`
	Temperature float64          `json:"temperature,omitempty"`
	Stream      bool             `json:"stream"`
}

type llmChatResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

func newLLMClient(timeout time.Duration) *llmClient {
	if timeout <= 0 {
		timeout = 90 * time.Second
	}

	return &llmClient{
		httpClient: &http.Client{Timeout: timeout},
	}
}

func (c *llmClient) chatCompletion(
	ctx context.Context,
	model aiModelPayload,
	messages []llmChatMessage,
) (string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(model.APIBaseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("default AI model apiBaseUrl is required")
	}
	if strings.TrimSpace(model.APIKey) == "" {
		return "", fmt.Errorf("default AI model apiKey is required")
	}
	if strings.TrimSpace(model.ID) == "" {
		return "", fmt.Errorf("default AI model id is required")
	}
	if len(messages) == 0 {
		return "", fmt.Errorf("chat messages are required")
	}

	requestBody, err := json.Marshal(llmChatRequest{
		Model:       strings.TrimSpace(model.ID),
		Messages:    messages,
		MaxTokens:   1200,
		Temperature: 0.35,
		Stream:      false,
	})
	if err != nil {
		return "", err
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		baseURL+"/chat/completions",
		bytes.NewReader(requestBody),
	)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(model.APIKey))
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	rawBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return "", err
	}

	var payload llmChatResponse
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return "", fmt.Errorf("invalid LLM response: %w", err)
	}

	if response.StatusCode >= 400 {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return "", fmt.Errorf("LLM request failed: %s", strings.TrimSpace(payload.Error.Message))
		}
		return "", fmt.Errorf("LLM request failed: %s", response.Status)
	}

	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
		return "", fmt.Errorf("LLM request failed: %s", strings.TrimSpace(payload.Error.Message))
	}
	if len(payload.Choices) == 0 {
		return "", fmt.Errorf("LLM response did not include any choices")
	}

	content := strings.TrimSpace(payload.Choices[0].Message.Content)
	if content == "" {
		return "", fmt.Errorf("LLM response content was empty")
	}

	return content, nil
}

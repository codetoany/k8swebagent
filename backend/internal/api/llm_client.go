package api

import (
	"bufio"
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

type llmChatStreamResponse struct {
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"delta"`
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
	return c.doChatCompletion(ctx, model, messages, false, nil)
}

func (c *llmClient) streamChatCompletion(
	ctx context.Context,
	model aiModelPayload,
	messages []llmChatMessage,
	onDelta func(string) error,
) (string, error) {
	return c.doChatCompletion(ctx, model, messages, true, onDelta)
}

func (c *llmClient) doChatCompletion(
	ctx context.Context,
	model aiModelPayload,
	messages []llmChatMessage,
	stream bool,
	onDelta func(string) error,
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
		Stream:      stream,
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

	if stream && strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "application/json") {
		rawBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		if err != nil {
			return "", err
		}
		return parseLLMJSONResponse(rawBody, response.StatusCode, onDelta)
	}

	if stream {
		return c.readStreamingResponse(response, onDelta)
	}

	rawBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return "", err
	}

	return parseLLMJSONResponse(rawBody, response.StatusCode, nil)
}

func parseLLMJSONResponse(rawBody []byte, statusCode int, onDelta func(string) error) (string, error) {
	var payload llmChatResponse
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return "", fmt.Errorf("invalid LLM response: %w", err)
	}

	if statusCode >= 400 {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return "", fmt.Errorf("LLM request failed: %s", strings.TrimSpace(payload.Error.Message))
		}
		return "", fmt.Errorf("LLM request failed with status %d", statusCode)
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

	if onDelta != nil {
		for _, chunk := range chunkText(content, 36) {
			if err := onDelta(chunk); err != nil {
				return "", err
			}
		}
	}

	return content, nil
}

func (c *llmClient) readStreamingResponse(response *http.Response, onDelta func(string) error) (string, error) {
	if response.StatusCode >= 400 {
		rawBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		if err != nil {
			return "", err
		}
		return parseLLMJSONResponse(rawBody, response.StatusCode, onDelta)
	}

	reader := bufio.NewScanner(response.Body)
	reader.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var builder strings.Builder

	for reader.Scan() {
		line := strings.TrimSpace(reader.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}

		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			break
		}

		var chunk llmChatStreamResponse
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil && strings.TrimSpace(chunk.Error.Message) != "" {
			return "", fmt.Errorf("LLM request failed: %s", strings.TrimSpace(chunk.Error.Message))
		}
		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta.Content
		if delta == "" {
			continue
		}
		builder.WriteString(delta)
		if onDelta != nil {
			if err := onDelta(delta); err != nil {
				return "", err
			}
		}
	}

	if err := reader.Err(); err != nil {
		return "", err
	}

	content := strings.TrimSpace(builder.String())
	if content == "" {
		return "", fmt.Errorf("LLM streaming response content was empty")
	}

	return content, nil
}

func chunkText(value string, size int) []string {
	if size <= 0 {
		size = 32
	}

	runes := []rune(value)
	if len(runes) == 0 {
		return nil
	}

	chunks := make([]string, 0, (len(runes)/size)+1)
	for start := 0; start < len(runes); start += size {
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
	}

	return chunks
}

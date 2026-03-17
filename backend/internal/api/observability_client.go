package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"k8s-agent-backend/internal/config"
	"k8s-agent-backend/internal/service"
)

type observabilityClient struct {
	httpClient         *http.Client
	prometheusURL      string
	prometheusToken    string
	prometheusCPUQuery string
	prometheusMemQuery string
	lokiURL            string
	lokiToken          string
	lokiQueryTemplate  string
}

type prometheusQueryRangeResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string                    `json:"resultType"`
		Result     []prometheusMatrixResult `json:"result"`
	} `json:"data"`
}

type prometheusMatrixResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]any           `json:"values"`
}

type lokiQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string            `json:"resultType"`
		Result     []lokiStreamEntry `json:"result"`
	} `json:"data"`
}

type lokiStreamEntry struct {
	Stream map[string]string `json:"stream"`
	Values [][]string        `json:"values"`
}

func newObservabilityClient(cfg config.ObservabilityConfig) *observabilityClient {
	return &observabilityClient{
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second,
		},
		prometheusURL:      strings.TrimRight(strings.TrimSpace(cfg.PrometheusURL), "/"),
		prometheusToken:    strings.TrimSpace(cfg.PrometheusToken),
		prometheusCPUQuery: strings.TrimSpace(cfg.PrometheusCPUQuery),
		prometheusMemQuery: strings.TrimSpace(cfg.PrometheusMemoryQuery),
		lokiURL:            strings.TrimRight(strings.TrimSpace(cfg.LokiURL), "/"),
		lokiToken:          strings.TrimSpace(cfg.LokiToken),
		lokiQueryTemplate:  strings.TrimSpace(cfg.LokiQueryTemplate),
	}
}

func (c *observabilityClient) HasPrometheus() bool {
	return c != nil && c.prometheusURL != ""
}

func (c *observabilityClient) HasLoki() bool {
	return c != nil && c.lokiURL != ""
}

func (c *observabilityClient) QueryMetricsHistory(ctx context.Context, resourceRange service.ResourceUsageRange) ([]service.ResourceUsagePoint, error) {
	if !c.HasPrometheus() {
		return nil, errObservabilityNotConfigured("prometheus")
	}

	start, end, step := observabilityRangeWindow(resourceRange, time.Now())
	cpuPoints, err := c.queryPrometheusSeries(ctx, c.prometheusCPUQuery, start, end, step)
	if err != nil {
		return nil, err
	}
	memPoints, err := c.queryPrometheusSeries(ctx, c.prometheusMemQuery, start, end, step)
	if err != nil {
		return nil, err
	}

	size := len(cpuPoints)
	if len(memPoints) > size {
		size = len(memPoints)
	}
	points := make([]service.ResourceUsagePoint, 0, size)
	for index := 0; index < size; index++ {
		var point service.ResourceUsagePoint
		if index < len(cpuPoints) {
			point.Time = cpuPoints[index].Time
			point.CPUUsage = cpuPoints[index].CPUUsage
		}
		if index < len(memPoints) {
			if point.Time == "" {
				point.Time = memPoints[index].Time
			}
			point.MemoryUsage = memPoints[index].MemoryUsage
		}
		points = append(points, point)
	}

	return points, nil
}

func (c *observabilityClient) QueryAggregatedLogs(ctx context.Context, pods []service.PodListItem, limit int) ([]aiAggregatedLogItem, error) {
	if !c.HasLoki() {
		return nil, errObservabilityNotConfigured("loki")
	}
	if len(pods) == 0 {
		return []aiAggregatedLogItem{}, nil
	}

	items := make([]aiAggregatedLogItem, 0, len(pods))
	for _, pod := range pods {
		query := fmt.Sprintf(c.lokiQueryTemplate, pod.Namespace, pod.Name)
		values := url.Values{}
		values.Set("query", query)
		values.Set("limit", strconv.Itoa(limit*20))
		end := time.Now().UTC()
		start := end.Add(-30 * time.Minute)
		values.Set("start", strconv.FormatInt(start.UnixNano(), 10))
		values.Set("end", strconv.FormatInt(end.UnixNano(), 10))
		body, err := c.doJSONRequest(ctx, http.MethodGet, c.lokiURL+"/loki/api/v1/query_range?"+values.Encode(), c.lokiToken)
		if err != nil {
			return nil, err
		}

		var response lokiQueryResponse
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, err
		}

		snippets := make([]string, 0, 3)
		for _, stream := range response.Data.Result {
			for index := len(stream.Values) - 1; index >= 0 && len(snippets) < 3; index-- {
				if len(stream.Values[index]) < 2 {
					continue
				}
				message := truncateText(strings.TrimSpace(stream.Values[index][1]), 160)
				if message == "" {
					continue
				}
				snippets = append(snippets, message)
			}
			if len(snippets) >= 3 {
				break
			}
		}
		if len(snippets) == 0 {
			continue
		}

		items = append(items, aiAggregatedLogItem{
			Namespace: pod.Namespace,
			Name:      pod.Name,
			Status:    pod.Status,
			Node:      pod.Node,
			Snippets:  snippets,
		})
	}

	return items, nil
}

func (c *observabilityClient) queryPrometheusSeries(ctx context.Context, query string, start time.Time, end time.Time, step time.Duration) ([]service.ResourceUsagePoint, error) {
	values := url.Values{}
	values.Set("query", query)
	values.Set("start", strconv.FormatInt(start.Unix(), 10))
	values.Set("end", strconv.FormatInt(end.Unix(), 10))
	values.Set("step", strconv.Itoa(int(step.Seconds())))

	body, err := c.doJSONRequest(ctx, http.MethodGet, c.prometheusURL+"/api/v1/query_range?"+values.Encode(), c.prometheusToken)
	if err != nil {
		return nil, err
	}

	var response prometheusQueryRangeResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}
	if len(response.Data.Result) == 0 {
		return []service.ResourceUsagePoint{}, nil
	}

	points := make([]service.ResourceUsagePoint, 0, len(response.Data.Result[0].Values))
	for _, row := range response.Data.Result[0].Values {
		if len(row) < 2 {
			continue
		}
		sec, ok := asFloat64(row[0])
		if !ok {
			continue
		}
		rawValue, ok := row[1].(string)
		if !ok {
			continue
		}
		parsed, err := strconv.ParseFloat(rawValue, 64)
		if err != nil {
			continue
		}
		value := clampUsageValue(int(parsed + 0.5))
		point := service.ResourceUsagePoint{
			Time: time.Unix(int64(sec), 0).In(dashboardDisplayLocation).Format("01/02 15:04"),
		}
		valueCopy := value
		point.CPUUsage = &valueCopy
		points = append(points, point)
	}

	return points, nil
}

func (c *observabilityClient) doJSONRequest(ctx context.Context, method string, endpoint string, token string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}
	if response.StatusCode >= 400 {
		return nil, fmt.Errorf("observability upstream error: %s", strings.TrimSpace(string(body)))
	}
	return body, nil
}

func observabilityRangeWindow(resourceRange service.ResourceUsageRange, now time.Time) (time.Time, time.Time, time.Duration) {
	current := now.In(dashboardDisplayLocation)
	switch resourceRange {
	case service.ResourceUsageRangeWeek:
		return current.AddDate(0, 0, -6), current, 24 * time.Hour
	case service.ResourceUsageRangeMonth:
		return current.AddDate(0, 0, -29), current, 24 * time.Hour
	default:
		start := time.Date(current.Year(), current.Month(), current.Day(), 0, 0, 0, 0, dashboardDisplayLocation)
		return start, current, time.Hour
	}
}

func clampUsageValue(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func asFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case int64:
		return float64(typed), true
	case int:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func errObservabilityNotConfigured(kind string) error {
	return fmt.Errorf("%s not configured", kind)
}

package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type EventsService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type EventItem struct {
	ID             string      `json:"id"`
	Type           string      `json:"type"`
	Reason         string      `json:"reason"`
	Message        string      `json:"message"`
	Namespace      string      `json:"namespace"`
	InvolvedObject EventTarget `json:"involvedObject"`
	Count          int32       `json:"count"`
	FirstTimestamp string      `json:"firstTimestamp"`
	LastTimestamp   string      `json:"lastTimestamp"`
	Source         string      `json:"source"`
}

type EventTarget struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

type EventFilter struct {
	Namespace          string
	Type               string
	InvolvedObjectKind string
}

func NewEventsService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *EventsService {
	return &EventsService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *EventsService) ListPayload(ctx context.Context, clusterID string, filter EventFilter) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID, filter)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *EventsService) list(ctx context.Context, clusterID string, filter EventFilter) ([]EventItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return []EventItem{}, nil
	case err != nil:
		return nil, err
	}

	listOpts := metav1.ListOptions{}
	listNamespace := ""
	if filter.Namespace != "" {
		listNamespace = filter.Namespace
	}

	list, err := clientset.CoreV1().Events(listNamespace).List(ctx, listOpts)
	if err != nil {
		return []EventItem{}, nil
	}

	type eventRecord struct {
		item EventItem
		time time.Time
	}

	records := make([]eventRecord, 0, len(list.Items))
	for _, item := range list.Items {
		if filter.Type != "" && !strings.EqualFold(item.Type, filter.Type) {
			continue
		}
		if filter.InvolvedObjectKind != "" && !strings.EqualFold(item.InvolvedObject.Kind, filter.InvolvedObjectKind) {
			continue
		}

		occurredAt := eventTimeFor(item)
		records = append(records, eventRecord{
			time: occurredAt,
			item: mapEvent(item, occurredAt),
		})
	}

	sort.Slice(records, func(i, j int) bool {
		return records[i].time.After(records[j].time)
	})

	items := make([]EventItem, 0, len(records))
	for _, record := range records {
		items = append(items, record.item)
	}

	return items, nil
}

func mapEvent(item corev1.Event, occurredAt time.Time) EventItem {
	firstTimestamp := ""
	if !item.FirstTimestamp.IsZero() {
		firstTimestamp = item.FirstTimestamp.UTC().Format(time.RFC3339)
	}

	source := ""
	if item.Source.Component != "" {
		source = item.Source.Component
	}
	if item.ReportingController != "" && source == "" {
		source = item.ReportingController
	}

	return EventItem{
		ID:        eventIDFor(item),
		Type:      eventLevelFor(item),
		Reason:    item.Reason,
		Message:   item.Message,
		Namespace: item.Namespace,
		InvolvedObject: EventTarget{
			Kind:      item.InvolvedObject.Kind,
			Name:      item.InvolvedObject.Name,
			Namespace: item.InvolvedObject.Namespace,
		},
		Count:          item.Count,
		FirstTimestamp:  firstTimestamp,
		LastTimestamp:   occurredAt.UTC().Format(time.RFC3339),
		Source:         source,
	}
}

func eventTimeFor(event corev1.Event) time.Time {
	switch {
	case !event.EventTime.IsZero():
		return event.EventTime.Time
	case !event.LastTimestamp.IsZero():
		return event.LastTimestamp.Time
	case !event.FirstTimestamp.IsZero():
		return event.FirstTimestamp.Time
	case !event.CreationTimestamp.IsZero():
		return event.CreationTimestamp.Time
	default:
		return time.Now().UTC()
	}
}

func eventIDFor(event corev1.Event) string {
	if string(event.UID) != "" {
		return string(event.UID)
	}

	return fmt.Sprintf("%s/%s/%s/%s", event.Namespace, event.InvolvedObject.Kind, event.InvolvedObject.Name, event.Reason)
}

func eventLevelFor(event corev1.Event) string {
	if strings.EqualFold(event.Type, "Warning") {
		lower := strings.ToLower(event.Reason + " " + event.Message)
		for _, marker := range []string{"fail", "err", "backoff", "unhealthy", "timeout"} {
			if strings.Contains(lower, marker) {
				return "error"
			}
		}
		return "warning"
	}

	lower := strings.ToLower(event.Reason + " " + event.Message)
	for _, marker := range []string{"successful", "started", "created", "scaled", "updated", "scheduled", "pulled", "completed"} {
		if strings.Contains(lower, marker) {
			return "success"
		}
	}

	return "info"
}

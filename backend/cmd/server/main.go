package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"k8s-agent-backend/internal/api"
	"k8s-agent-backend/internal/cache"
	"k8s-agent-backend/internal/config"
	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	startupCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	pool, err := store.NewPool(startupCtx, cfg.PG)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer pool.Close()

	redisCache := cache.NewRedisCache(startupCtx, cfg.Redis)
	defer redisCache.Close()

	snapshotStore := store.NewSnapshotStore(pool, redisCache)
	if err := snapshotStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize storage: %v", err)
	}

	settingsStore := store.NewSettingsStore(pool)
	if err := settingsStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize settings storage: %v", err)
	}

	authStore := store.NewAuthStore(pool)
	if err := authStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize auth storage: %v", err)
	}

	clusterStore := store.NewClusterStore(pool)
	if err := clusterStore.Init(startupCtx, cfg.K8s.Bootstrap); err != nil {
		log.Fatalf("failed to initialize cluster storage: %v", err)
	}

	auditStore := store.NewAuditStore(pool)
	if err := auditStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize audit storage: %v", err)
	}

	aiHistoryStore := store.NewAIConversationStore(pool)
	if err := aiHistoryStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize ai history storage: %v", err)
	}

	aiTemplateStore := store.NewAITemplateStore(pool)
	if err := aiTemplateStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize ai template storage: %v", err)
	}

	aiMemoryStore := store.NewAIMemoryStore(pool)
	if err := aiMemoryStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize ai memory storage: %v", err)
	}

	aiInspectionStore := store.NewAIInspectionStore(pool)
	if err := aiInspectionStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize ai inspection storage: %v", err)
	}

	aiIssueStore := store.NewAIIssueStore(pool)
	if err := aiIssueStore.Init(startupCtx); err != nil {
		log.Fatalf("failed to initialize ai issue storage: %v", err)
	}

	k8sManager := k8s.NewManager(clusterStore, time.Duration(cfg.K8s.RequestTimeoutSeconds)*time.Second)
	aiInspectionRunner := api.NewAIInspectionRunner(aiInspectionStore, aiIssueStore, clusterStore, auditStore, snapshotStore, k8sManager)

	startAIInspectionScheduler(
		ctx,
		aiInspectionRunner,
		time.Duration(cfg.AI.InspectionIntervalSeconds)*time.Second,
		time.Duration(cfg.AI.InspectionStartupDelaySeconds)*time.Second,
	)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           api.NewRouter(snapshotStore, settingsStore, authStore, clusterStore, auditStore, aiHistoryStore, aiTemplateStore, aiMemoryStore, aiInspectionStore, aiIssueStore, aiInspectionRunner, k8sManager, redisCache, cfg.ClusterConsole, cfg.HostShell, cfg.Observability),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)
		}
	}()

	log.Printf("k8s-agent-backend listening on port %d", cfg.Port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server exited unexpectedly: %v", err)
	}
}

func startAIInspectionScheduler(ctx context.Context, runner *api.AIInspectionRunner, interval time.Duration, startupDelay time.Duration) {
	if runner == nil || interval <= 0 {
		log.Printf("ai inspection scheduler disabled")
		return
	}

	go func() {
		if startupDelay > 0 {
			select {
			case <-time.After(startupDelay):
			case <-ctx.Done():
				return
			}
		}

		log.Printf("running initial ai inspection sweep")
		runner.RunEnabledClusters(ctx, store.AIInspectionTriggerScheduled)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				log.Printf("running scheduled ai inspection sweep")
				runner.RunEnabledClusters(ctx, store.AIInspectionTriggerScheduled)
			case <-ctx.Done():
				return
			}
		}
	}()
}

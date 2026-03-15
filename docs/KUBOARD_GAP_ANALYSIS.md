# K8s Agent vs Kuboard Gap Analysis

## 1. Current project status

The current project already has a usable management-console baseline:

- Frontend pages: dashboard, nodes, pods, workloads, settings, AI diagnosis
- Backend stack: Go + PostgreSQL + Redis + Docker
- Real Kubernetes connection: multi-cluster config, token/kubeconfig/in-cluster access
- Read capabilities: nodes, pods, workloads, namespaces, dashboard aggregates, recent events
- Write capabilities already online:
  - node cordon / uncordon
  - node maintenance taint enable / disable
  - pod restart / delete / logs
  - deployment and statefulset scale
  - deployment / statefulset / daemonset restart
  - deployment pause / resume
  - workload delete
- Supporting modules:
  - audit logs
  - notification center
  - AI diagnosis with external LLM
  - cluster configuration UI

Key implementation references:

- Frontend routes: `src/App.tsx`
- API definitions: `src/lib/api.ts`
- Backend routes: `backend/internal/api/router.go`
- Kubernetes services:
  - `backend/internal/service/nodes.go`
  - `backend/internal/service/pods.go`
  - `backend/internal/service/workloads.go`
  - `backend/internal/service/dashboard.go`
- Settings and audits:
  - `backend/internal/store/settings.go`
  - `backend/internal/store/audits.go`
  - `src/pages/Settings.tsx`

## 2. Kuboard-like capabilities already covered

Compared with Kuboard's common management-console baseline, the current project already covers these areas:

### 2.1 Cluster access and cluster switching

- multiple clusters
- default cluster
- token / kubeconfig / in-cluster connection
- connection testing
- resource-side cluster switching

### 2.2 Core resource browsing

- dashboard overview
- nodes
- pods
- workloads:
  - deployments
  - statefulsets
  - daemonsets
  - cronjobs
- namespaces

### 2.3 Basic operational actions

- pod delete / restart / logs
- workload scale / restart / pause / resume / delete
- node cordon / uncordon / maintenance taint

### 2.4 Platform supporting capabilities

- audit logs with filters and pagination
- notification center
- AI diagnosis
- persistent settings and AI model config

## 3. Major gaps compared with Kuboard

These are the most important feature gaps if the goal is to move closer to Kuboard as a practical cluster operations platform.

### P0: resource coverage is still narrow

Current project lacks management pages and APIs for many day-to-day Kubernetes objects:

- services
- ingresses
- configmaps
- secrets
- persistentvolumes
- persistentvolumeclaims
- storageclasses
- jobs
- replicasets
- events as a first-class page

Impact:

- operations still need `kubectl` for many common tasks
- troubleshooting flow is broken across pages
- storage and traffic management are not visualized

Recommended next step:

1. add `Service / Ingress / ConfigMap / Secret`
2. add `PVC / PV / StorageClass`
3. add `Event` page and event timeline

### P0: monitoring is still snapshot-style, not real observability

Current dashboard is useful, but it is still closer to an operations overview than a monitoring platform:

- no Prometheus integration
- no real historical metrics retention
- no query-based charts
- no alert rules
- no alert silence / ack flow

Impact:

- dashboard cannot replace mature monitoring
- "today / week / month" is not enough for production troubleshooting
- AI diagnosis has limited historical context

Recommended next step:

1. integrate Prometheus or VictoriaMetrics as the metrics source
2. add namespace / workload / pod metric drill-down
3. add alert rules and notification routing

### P0: logging is only per-pod, not aggregated logging

Current project supports pod log reading, but not a real logging system:

- no log aggregation backend
- no cross-pod / cross-namespace search
- no label-based log query
- no log retention strategy

Impact:

- production troubleshooting still depends on external tooling
- AI cannot correlate cluster-wide log evidence

Recommended next step:

1. integrate Loki or Elasticsearch-compatible logging
2. add log search page
3. add workload / namespace / pod filters

### P0: no user, role, or permission system inside the platform

Current project has a simplified auth state, but it is not a real multi-user management platform:

- no user management
- no role model
- no namespace-scoped authorization
- no per-cluster permissions
- audit actor is still simplistic

Impact:

- cannot safely onboard multiple operators
- cannot deliver as a proper team platform
- hard to control risky actions

Recommended next step:

1. add platform users
2. add roles and permission matrix
3. add cluster / namespace scoping
4. bind audit logs to real user identity

### P1: no YAML-centric operations flow

Kuboard-style users often expect object inspection and adjustment around manifests:

- view YAML
- compare YAML
- edit YAML
- apply / patch from UI

Current project does not provide this workflow.

Impact:

- advanced troubleshooting still leaves the UI
- object mutation paths are incomplete

Recommended next step:

1. add read-only YAML viewer first
2. then add safe patch / edit mode with confirmation and audit

### P1: no terminal / exec capability

The platform currently has no browser-side terminal features:

- no pod exec
- no shell terminal
- no file browser

Impact:

- many debugging workflows still require external terminal access

Recommended next step:

1. add pod exec terminal
2. restrict by RBAC and namespace permission
3. add audit for exec session start/stop

### P1: no installation / addon management

Kuboard often acts as an operational hub around add-ons:

- install or manage monitoring stack
- install or manage logging stack
- install or manage ingress / storage dependencies

Current project has no add-on lifecycle view.

Impact:

- operations remain fragmented

Recommended next step:

1. add "platform integrations" or "addons" module
2. manage metrics, logging, ingress, storage dependencies from there

### P1: AI is useful but still isolated

Current AI diagnosis is already a differentiator, but compared with a mature operations console it still lacks deeper workflow hooks:

- no action suggestions tied to specific objects
- no one-click jump from AI result to resource detail
- no event/log/metric evidence timeline in a single diagnosis result
- no streaming output
- no diagnosis templates per scenario

Impact:

- AI feels like a separate assistant instead of an operations copilot

Recommended next step:

1. AI result cards with deep links to node / pod / workload pages
2. correlate AI with metrics, events, and logs
3. add streaming response
4. add scenario templates:
   - pod pending
   - pvc pending
   - crashloop
   - node pressure

## 4. Recommended implementation roadmap

This is the most practical sequence if you want to evolve toward a Kuboard-like product without overloading the project.

### Stage A: make the console operationally complete

Priority: highest

- Service management
- Ingress management
- ConfigMap management
- Secret read-only management
- Event page
- PVC / PV / StorageClass

Result:

- the console becomes useful for most daily K8s operations

### Stage B: observability foundation

Priority: highest

- Prometheus integration
- historical metrics
- workload/pod metric drill-down
- alert rules
- notification routing
- log aggregation integration

Result:

- the console starts to compete with real operations platforms

### Stage C: platform security and multi-user delivery

Priority: high

- users
- roles
- permission scopes
- safer confirmations for destructive actions
- richer audit dimensions

Result:

- usable by teams, not just by one operator

### Stage D: advanced operations workflow

Priority: medium

- YAML viewer/editor
- pod exec terminal
- resource jump links
- addon management

Result:

- users leave the UI less often

### Stage E: AI copilot enhancement

Priority: medium

- streaming answer
- evidence-backed diagnosis
- action suggestions
- diagnosis templates
- object-aware chat entry points

Result:

- AI becomes tightly integrated with the platform instead of being a side feature

## 5. Recommended next build batch

If the goal is "reference Kuboard and fill the most valuable missing parts", the best next batch is:

1. `Events + Services + Ingress`
2. `PVC / PV / StorageClass`
3. `Prometheus integration`
4. `Aggregated logs`
5. `RBAC / user / role model`

## 6. Features not recommended to rush

These are feasible, but should not be the immediate next step:

- full browser file manager
- broad in-browser shell access without permission model
- full add-on marketplace
- large-scale platform plugin system

Reason:

- higher security and maintenance cost
- weaker short-term value than observability and resource coverage

## 7. Suggested target state

A realistic medium-term target is not "clone Kuboard", but:

- Kuboard-like operations coverage
- stronger AI diagnosis and remediation workflow
- lighter, cleaner, more focused product scope

That would give this project a clearer identity:

- Kuboard-style Kubernetes console
- plus AI-native troubleshooting
- plus simpler custom deployment and control

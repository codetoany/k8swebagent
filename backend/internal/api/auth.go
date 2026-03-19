package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"k8s-agent-backend/internal/store"
)

type authContextKey string

const authUserContextKey authContextKey = "auth-user"

type authLoginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authLoginResponse struct {
	Token string         `json:"token"`
	User  store.AuthUser `json:"user"`
}

func (h *handler) apiAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if !strings.HasPrefix(path, "/api") {
			next.ServeHTTP(w, r)
			return
		}
		if path == "/api/health" || path == "/api/auth/login" {
			next.ServeHTTP(w, r)
			return
		}

		user, err := h.resolveAuthUser(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"message": "请先登录后再访问系统",
			})
			return
		}

		if permission := requiredPermission(r.Method, path); permission != "" && !userHasPermission(*user, permission) {
			writeJSON(w, http.StatusForbidden, map[string]string{
				"message": "当前账号没有执行此操作的权限",
			})
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), authUserContextKey, *user)))
	})
}

func (h *handler) login(w http.ResponseWriter, r *http.Request) error {
	if h.authStore == nil {
		return newHTTPError(http.StatusServiceUnavailable, "认证服务尚未初始化")
	}

	var payload authLoginPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, "无效的登录参数")
	}

	user, token, err := h.authStore.Authenticate(r.Context(), payload.Username, payload.Password)
	if err != nil {
		switch err {
		case store.ErrInvalidCredentials:
			return newHTTPError(http.StatusUnauthorized, "用户名或密码错误")
		case store.ErrUserInactive:
			return newHTTPError(http.StatusForbidden, "当前账号已被禁用")
		default:
			return err
		}
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "auth.login",
		ResourceType: "auth",
		ResourceName: user.Username,
		Status:       store.AuditStatusSuccess,
		Message:      "用户登录成功",
		ActorName:    user.Username,
		ActorEmail:   user.Email,
	})

	writeJSON(w, http.StatusOK, authLoginResponse{
		Token: token,
		User:  *user,
	})
	return nil
}

func (h *handler) logoutHandler(w http.ResponseWriter, r *http.Request) error {
	token := extractRequestToken(r)
	if token == "" {
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	if h.authStore != nil {
		if err := h.authStore.DeleteSession(r.Context(), token); err != nil {
			return err
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *handler) userInfo(w http.ResponseWriter, r *http.Request) error {
	user, err := h.resolveAuthUser(r)
	if err != nil {
		return newHTTPError(http.StatusUnauthorized, "登录已过期，请重新登录")
	}
	writeJSON(w, http.StatusOK, user)
	return nil
}

func (h *handler) resolveAuthUser(r *http.Request) (*store.AuthUser, error) {
	if user, ok := r.Context().Value(authUserContextKey).(store.AuthUser); ok {
		return &user, nil
	}
	token := extractRequestToken(r)
	if token == "" || h.authStore == nil {
		return nil, store.ErrSessionNotFound
	}
	return h.authStore.UserByToken(r.Context(), token)
}

func authUserFromContext(ctx context.Context) (*store.AuthUser, bool) {
	user, ok := ctx.Value(authUserContextKey).(store.AuthUser)
	if !ok {
		return nil, false
	}
	return &user, true
}

func extractBearerToken(headerValue string) string {
	if headerValue == "" {
		return ""
	}
	parts := strings.Fields(headerValue)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func extractRequestToken(r *http.Request) string {
	if r == nil {
		return ""
	}

	if token := extractBearerToken(r.Header.Get("Authorization")); token != "" {
		return token
	}

	return strings.TrimSpace(r.URL.Query().Get("access_token"))
}

func userHasPermission(user store.AuthUser, permission string) bool {
	if user.Role == "admin" {
		return true
	}
	for _, item := range user.Permissions {
		if strings.TrimSpace(item) == permission {
			return true
		}
	}
	return false
}

func requiredPermission(method string, path string) string {
	if method == http.MethodOptions {
		return ""
	}
	if method == http.MethodGet {
		if strings.HasPrefix(path, "/api/pods/") && strings.HasSuffix(path, "/exec") {
			return "pods:write"
		}
		if strings.HasPrefix(path, "/api/cluster-console") {
			return "cluster.console"
		}
		if strings.HasPrefix(path, "/api/node-shell") || (strings.HasPrefix(path, "/api/nodes/") && strings.HasSuffix(path, "/shell")) {
			return "node.shell"
		}
		return ""
	}

	switch {
	case strings.HasPrefix(path, "/api/nodes"):
		return "nodes:write"
	case strings.HasPrefix(path, "/api/pods"):
		return "pods:write"
	case strings.HasPrefix(path, "/api/deployments"),
		strings.HasPrefix(path, "/api/statefulsets"),
		strings.HasPrefix(path, "/api/daemonsets"),
		strings.HasPrefix(path, "/api/cronjobs"),
		strings.HasPrefix(path, "/api/jobs"):
		return "workloads:write"
	case strings.HasPrefix(path, "/api/services"):
		return "services:write"
	case strings.HasPrefix(path, "/api/ingresses"):
		return "ingresses:write"
	case strings.HasPrefix(path, "/api/configmaps"):
		return "configmaps:write"
	case strings.HasPrefix(path, "/api/settings"):
		return "settings:write"
	case strings.HasPrefix(path, "/api/clusters"):
		return "clusters:manage"
	case strings.HasPrefix(path, "/api/apply"):
		return "apply:write"
	case strings.HasPrefix(path, "/api/ai-diagnosis"):
		return "diagnosis:write"
	default:
		return ""
	}
}

func authUserJSON(user *store.AuthUser) json.RawMessage {
	if user == nil {
		return json.RawMessage(`null`)
	}
	payload, _ := json.Marshal(user)
	return payload
}

package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrSessionNotFound    = errors.New("session not found")
	ErrUserInactive       = errors.New("user inactive")
)

const defaultSessionTTL = 7 * 24 * time.Hour

type AuthStore struct {
	pool *pgxpool.Pool
}

type AuthUser struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	IsActive    bool     `json:"isActive"`
}

type authSeedUser struct {
	ID          string
	Username    string
	Email       string
	Role        string
	Password    string
	Permissions []string
}

var defaultAuthUsers = []authSeedUser{
	{
		ID:       "admin",
		Username: "admin",
		Email:    "admin@k8s-agent.com",
		Role:     "admin",
		Password: "admin123",
		Permissions: []string{
			"dashboard:read", "nodes:read", "pods:read", "workloads:read", "services:read",
			"ingresses:read", "configmaps:read", "secrets:read", "storage:read", "events:read",
			"audit:read", "settings:read", "settings:write", "clusters:manage",
			"nodes:write", "pods:write", "workloads:write", "services:write",
			"ingresses:write", "configmaps:write", "diagnosis:read", "diagnosis:write",
			"apply:write",
		},
	},
	{
		ID:       "operator",
		Username: "operator",
		Email:    "operator@k8s-agent.com",
		Role:     "operator",
		Password: "operator123",
		Permissions: []string{
			"dashboard:read", "nodes:read", "pods:read", "workloads:read", "services:read",
			"ingresses:read", "configmaps:read", "secrets:read", "storage:read", "events:read",
			"audit:read", "settings:read", "diagnosis:read", "diagnosis:write",
			"nodes:write", "pods:write", "workloads:write", "services:write",
			"ingresses:write", "configmaps:write",
		},
	},
	{
		ID:       "viewer",
		Username: "viewer",
		Email:    "viewer@k8s-agent.com",
		Role:     "viewer",
		Password: "viewer123",
		Permissions: []string{
			"dashboard:read", "nodes:read", "pods:read", "workloads:read", "services:read",
			"ingresses:read", "configmaps:read", "secrets:read", "storage:read", "events:read",
			"audit:read", "settings:read", "diagnosis:read",
		},
	},
}

func NewAuthStore(pool *pgxpool.Pool) *AuthStore {
	return &AuthStore{pool: pool}
}

func (s *AuthStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS app_users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL,
			permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS auth_sessions (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
			expires_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `DELETE FROM auth_sessions WHERE expires_at <= NOW()`)
	if err != nil {
		return err
	}

	for _, user := range defaultAuthUsers {
		if err := s.ensureSeedUser(ctx, user); err != nil {
			return err
		}
	}

	return nil
}

func (s *AuthStore) Authenticate(ctx context.Context, username string, password string) (*AuthUser, string, error) {
	username = strings.TrimSpace(username)
	if username == "" || strings.TrimSpace(password) == "" {
		return nil, "", ErrInvalidCredentials
	}

	var (
		user         AuthUser
		passwordHash string
		rawPerms     []byte
	)
	err := s.pool.QueryRow(ctx, `
		SELECT id, username, email, role, permissions::text, is_active, password_hash
		FROM app_users
		WHERE username = $1
	`, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Role,
		&rawPerms,
		&user.IsActive,
		&passwordHash,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrInvalidCredentials
	}
	if err != nil {
		return nil, "", err
	}
	if !user.IsActive {
		return nil, "", ErrUserInactive
	}
	if err := json.Unmarshal(rawPerms, &user.Permissions); err != nil {
		return nil, "", err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, "", ErrInvalidCredentials
	}

	token, err := generateSessionToken()
	if err != nil {
		return nil, "", err
	}
	expiresAt := time.Now().Add(defaultSessionTTL)
	_, err = s.pool.Exec(ctx, `
		INSERT INTO auth_sessions (token, user_id, expires_at)
		VALUES ($1, $2, $3)
	`, token, user.ID, expiresAt)
	if err != nil {
		return nil, "", err
	}

	return &user, token, nil
}

func (s *AuthStore) UserByToken(ctx context.Context, token string) (*AuthUser, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrSessionNotFound
	}

	var (
		user     AuthUser
		rawPerms []byte
		expires  time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.username, u.email, u.role, u.permissions::text, u.is_active, sess.expires_at
		FROM auth_sessions sess
		JOIN app_users u ON u.id = sess.user_id
		WHERE sess.token = $1
	`, token).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Role,
		&rawPerms,
		&user.IsActive,
		&expires,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, err
	}

	if expires.Before(time.Now()) {
		_ = s.DeleteSession(ctx, token)
		return nil, ErrSessionNotFound
	}
	if !user.IsActive {
		return nil, ErrUserInactive
	}
	if err := json.Unmarshal(rawPerms, &user.Permissions); err != nil {
		return nil, err
	}

	_, _ = s.pool.Exec(ctx, `UPDATE auth_sessions SET last_used_at = NOW() WHERE token = $1`, token)
	return &user, nil
}

func (s *AuthStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM auth_sessions WHERE token = $1`, strings.TrimSpace(token))
	return err
}

func (s *AuthStore) ensureSeedUser(ctx context.Context, seed authSeedUser) error {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM app_users WHERE id = $1)`, seed.ID).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(seed.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	rawPermissions, err := json.Marshal(seed.Permissions)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO app_users (id, username, email, password_hash, role, permissions, is_active)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)
	`, seed.ID, seed.Username, seed.Email, string(hash), seed.Role, rawPermissions)
	return err
}

func generateSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}


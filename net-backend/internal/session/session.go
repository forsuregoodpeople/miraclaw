package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/net-backend/internal/integrations/redis"
)

type SessionData struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type ISession interface {
	Create(ctx context.Context, data SessionData) (string, error)
	Delete(ctx context.Context, sessionID string) error
	GetCookieName() string
	GetExpiration() int
}

type Session struct {
	client     *redis.Client
	expiration time.Duration
	cookieName string
}

func NewSession(client *redis.Client, expirationHours int) *Session {
	return &Session{
		client:     client,
		expiration: time.Duration(expirationHours) * time.Hour,
		cookieName: "session_id",
	}
}

func (s *Session) Create(ctx context.Context, data SessionData) (string, error) {
	sessionID, err := generateSecureSessionID()
	if err != nil {
		return "", fmt.Errorf("failed to generate session ID: %w", err)
	}
	key := fmt.Sprintf("session:%s", sessionID)

	dataJSON, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to marshal session data: %w", err)
	}

	if err := s.client.Set(ctx, key, dataJSON, s.expiration); err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	return sessionID, nil
}

func generateSecureSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *Session) Get(ctx context.Context, sessionID string) (*SessionData, error) {
	key := fmt.Sprintf("session:%s", sessionID)

	dataStr, err := s.client.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("session not found or expired")
	}

	var data SessionData
	if err := json.Unmarshal([]byte(dataStr), &data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	return &data, nil
}

func (s *Session) Delete(ctx context.Context, sessionID string) error {
	key := fmt.Sprintf("session:%s", sessionID)
	return s.client.Del(ctx, key)
}

func (s *Session) GetCookieName() string {
	return s.cookieName
}

func (s *Session) GetExpiration() int {
	return int(s.expiration.Seconds())
}

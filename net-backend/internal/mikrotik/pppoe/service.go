package pppoe

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-routeros/routeros"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

var ErrProfileAlreadyExists = errors.New("profile already exists")
var ErrSecretAlreadyExists = errors.New("secret already exists")
var ErrSecretNotFound = errors.New("secret not found")
var ErrMikrotikItemNotFound = errors.New("mikrotik item not found")

type Service interface {
	Create(ctx context.Context, secret *Secret, routerID int) (*Secret, error)
	FindAll(ctx context.Context, routerID int) ([]Secret, error)
	FindById(ctx context.Context, id int) (*Secret, error)
	Update(ctx context.Context, secret *Secret) error
	Delete(ctx context.Context, id int) error
	DisconnectSession(ctx context.Context, routerID int, sessionName string) error
	BlockSecret(ctx context.Context, id int) error
	UnblockSecret(ctx context.Context, id int) error
	GetProfiles(ctx context.Context, routerID int) ([]Profile, error)
	CreateProfile(ctx context.Context, routerID int, profile *Profile) error
	UpdateProfile(ctx context.Context, routerID int, profileName string, profile *Profile) error
	DeleteProfile(ctx context.Context, routerID int, profileName string) error
	GetProfileUsage(ctx context.Context, routerID int) (map[string]int, error)
	SyncSecrets(ctx context.Context, routerID int) error
}

type service struct {
	repo           Repository
	routerRepo     mikrotik.RouterRepository
	connectionPool *mikrotik.ConnectionPool
}

func NewService(
	repo Repository,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
) Service {
	return &service{
		repo:           repo,
		routerRepo:     routerRepo,
		connectionPool: connectionPool,
	}
}

// fetchMikrotikID retrieves the .id from MikroTik for a given secret name
func (s *service) fetchMikrotikID(ctx context.Context, routerID int, name string) (string, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return "", fmt.Errorf("failed to find router: %w", err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return "", fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	// Query MikroTik for the secret by name
	reply, err := conn.Run("/ppp/secret/print",
		fmt.Sprintf("?name=%s", name),
		"=.proplist=.id,name")
	if err != nil {
		return "", fmt.Errorf("failed to fetch secret from MikroTik: %w", err)
	}

	for _, re := range reply.Re {
		if re.Map["name"] == name {
			return re.Map[".id"], nil
		}
	}

	return "", ErrMikrotikItemNotFound
}

// isMikrotikNotFoundError checks if error is "no such item" or similar
func isMikrotikNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "no such item") ||
		strings.Contains(errStr, "not found") ||
		strings.Contains(errStr, "no such command") ||
		strings.Contains(errStr, "ambiguous value")
}

func (s *service) Create(ctx context.Context, secret *Secret, routerID int) (*Secret, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	// Don't allow PPPoE operations on inactive routers
	if !router.IsActive {
		return nil, fmt.Errorf("cannot create PPPoE secret on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	args := []string{"/ppp/secret/add",
		fmt.Sprintf("=name=%s", secret.Name),
		fmt.Sprintf("=password=%s", secret.Password),
		fmt.Sprintf("=profile=%s", secret.Profile),
		fmt.Sprintf("=service=%s", secret.Service),
		fmt.Sprintf("=disabled=%v", secret.Disabled),
	}
	args = appendSecretOptionals(args, secret)
	reply, err := conn.Run(args...)
	if err != nil {
		return nil, fmt.Errorf("failed to create PPPoE secret on router %d: %w", routerID, err)
	}

	secret.RouterID = routerID
	secret.SyncStatus = "pending"

	// Save to database first to get the ID
	err = s.repo.Create(ctx, secret)
	if err != nil {
		if strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key") {
			return nil, ErrSecretAlreadyExists
		}
		return nil, fmt.Errorf("failed to save PPPoE secret: %w", err)
	}

	// Now fetch the MikroTik .id and update
	mikrotikID, err := s.fetchMikrotikID(ctx, routerID, secret.Name)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component":   "pppoe_service",
			"action":      "create",
			"secret_id":   secret.ID,
			"secret_name": secret.Name,
			"error":       err.Error(),
		}).Warn("Failed to fetch MikroTik ID after creation")
		// Don't fail - the secret was created, just not synced
	} else {
		secret.MikrotikID = mikrotikID
		secret.SyncStatus = "synced"
		now := time.Now()
		secret.LastSyncedAt = &now
		err = s.repo.UpdateMikrotikID(ctx, secret.ID, mikrotikID)
		if err != nil {
			logger.Log.WithError(err).Warn("Failed to update MikroTik ID in database")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "pppoe_service",
		"action":      "create",
		"secret_id":   secret.ID,
		"secret_name": secret.Name,
		"mikrotik_id": secret.MikrotikID,
		"response":    reply,
	}).Info("PPPoE secret created on router")

	return secret, nil
}

func (s *service) FindAll(ctx context.Context, routerID int) ([]Secret, error) {
	return s.repo.FindAll(ctx, routerID)
}

func (s *service) FindById(ctx context.Context, id int) (*Secret, error) {
	return s.repo.FindById(ctx, id)
}

func (s *service) Update(ctx context.Context, secret *Secret) error {
	secretRouter, err := s.repo.FindById(ctx, secret.ID)
	if err != nil {
		return fmt.Errorf("failed to find PPPoE secret: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, secretRouter.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	// Don't allow PPPoE operations on inactive routers
	if !router.IsActive {
		return fmt.Errorf("cannot update PPPoE secret on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(secretRouter.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(secretRouter.RouterID, conn)

	// Determine which ID to use for MikroTik
	mikrotikID := secretRouter.MikrotikID
	if mikrotikID == "" {
		// Try to fetch it
		mikrotikID, err = s.fetchMikrotikID(ctx, secretRouter.RouterID, secretRouter.Name)
		if err != nil {
			if errors.Is(err, ErrMikrotikItemNotFound) {
				// Secret doesn't exist on MikroTik anymore, recreate it
				logger.Log.WithFields(logrus.Fields{
					"component":   "pppoe_service",
					"secret_id":   secret.ID,
					"secret_name": secretRouter.Name,
				}).Warn("Secret not found on MikroTik, recreating")

				// Create new secret on MikroTik
				args := []string{"/ppp/secret/add",
					fmt.Sprintf("=name=%s", secret.Name),
					fmt.Sprintf("=password=%s", secret.Password),
					fmt.Sprintf("=profile=%s", secret.Profile),
					fmt.Sprintf("=service=%s", secret.Service),
					fmt.Sprintf("=disabled=%v", secret.Disabled),
				}
				args = appendSecretOptionals(args, secret)
				_, err = conn.Run(args...)
				if err != nil {
					return fmt.Errorf("failed to recreate PPPoE secret: %w", err)
				}

				// Fetch the new MikroTik ID
				mikrotikID, _ = s.fetchMikrotikID(ctx, secretRouter.RouterID, secret.Name)
				if mikrotikID != "" {
					secret.MikrotikID = mikrotikID
					s.repo.UpdateMikrotikID(ctx, secret.ID, mikrotikID)
				}
				return s.repo.Update(ctx, secret)
			}
			return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
		}
		// Update the database with the fetched ID
		secret.MikrotikID = mikrotikID
		s.repo.UpdateMikrotikID(ctx, secret.ID, mikrotikID)
	}

	args := []string{"/ppp/secret/set",
		fmt.Sprintf("=.id=%s", mikrotikID),
		fmt.Sprintf("=name=%s", secret.Name),
		fmt.Sprintf("=password=%s", secret.Password),
		fmt.Sprintf("=profile=%s", secret.Profile),
		fmt.Sprintf("=service=%s", secret.Service),
		fmt.Sprintf("=disabled=%v", secret.Disabled),
	}
	args = appendSecretOptionals(args, secret)
	reply, err := conn.Run(args...)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			// Mark as not found in database
			s.repo.UpdateSyncStatus(ctx, secret.ID, "not_found")
			return fmt.Errorf("PPPoE secret not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to update PPPoE secret on router: %w", err)
	}

	now := time.Now()
	secret.LastSyncedAt = &now
	secret.SyncStatus = "synced"

	logger.Log.WithFields(logrus.Fields{
		"component":   "pppoe_service",
		"action":      "update",
		"secret_id":   secret.ID,
		"secret_name": secretRouter.Name,
		"mikrotik_id": mikrotikID,
		"response":    reply,
	}).Info("PPPoE secret updated on router")

	err = s.repo.Update(ctx, secret)
	if err != nil {
		return fmt.Errorf("failed to update PPPoE secret: %w", err)
	}

	return nil
}

func (s *service) Delete(ctx context.Context, id int) error {
	secret, err := s.repo.FindById(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find PPPoE secret: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, secret.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	// Don't allow PPPoE operations on inactive routers
	if !router.IsActive {
		return fmt.Errorf("cannot delete PPPoE secret on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(secret.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(secret.RouterID, conn)

	// Determine which ID to use for MikroTik
	mikrotikID := secret.MikrotikID
	if mikrotikID == "" {
		// Try to fetch it by name
		mikrotikID, err = s.fetchMikrotikID(ctx, secret.RouterID, secret.Name)
		if err != nil {
			if errors.Is(err, ErrMikrotikItemNotFound) {
				// Already deleted on MikroTik, just delete from database
				logger.Log.WithFields(logrus.Fields{
					"component":   "pppoe_service",
					"secret_id":   secret.ID,
					"secret_name": secret.Name,
				}).Warn("Secret already deleted on MikroTik, removing from database")
				return s.repo.Delete(ctx, id)
			}
			return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
		}
	}

	reply, err := conn.Run("/ppp/secret/remove", fmt.Sprintf("=.id=%s", mikrotikID))
	if err != nil {
		if isMikrotikNotFoundError(err) {
			// Already deleted on MikroTik, just delete from database
			logger.Log.WithFields(logrus.Fields{
				"component":   "pppoe_service",
				"secret_id":   secret.ID,
				"secret_name": secret.Name,
				"mikrotik_id": mikrotikID,
			}).Warn("Secret not found on MikroTik during delete, removing from database")
			return s.repo.Delete(ctx, id)
		}
		return fmt.Errorf("failed to delete PPPoE secret on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "pppoe_service",
		"action":      "delete",
		"secret_id":   secret.ID,
		"secret_name": secret.Name,
		"mikrotik_id": mikrotikID,
		"response":    reply,
	}).Info("PPPoE secret deleted on router")

	err = s.repo.Delete(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to delete PPPoE secret: %w", err)
	}

	return nil
}

func (s *service) DisconnectSession(ctx context.Context, routerID int, sessionName string) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	// Don't allow PPPoE operations on inactive routers
	if !router.IsActive {
		return fmt.Errorf("cannot disconnect session on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	// First, find the active session by name to get the .id
	reply, err := conn.Run("/ppp/active/print",
		fmt.Sprintf("?name=%s", sessionName),
		"=.proplist=.id,name")
	if err != nil {
		return fmt.Errorf("failed to find active session: %w", err)
	}

	var sessionID string
	for _, re := range reply.Re {
		if re.Map["name"] == sessionName {
			sessionID = re.Map[".id"]
			break
		}
	}

	if sessionID == "" {
		return fmt.Errorf("active session not found for user: %s", sessionName)
	}

	// Disconnect using the .id
	reply, err = conn.Run("/ppp/active/remove", fmt.Sprintf("=.id=%s", sessionID))
	if err != nil {
		if isMikrotikNotFoundError(err) {
			return fmt.Errorf("session already disconnected: %s", sessionName)
		}
		return fmt.Errorf("failed to disconnect PPPoE session: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":    "pppoe_service",
		"action":       "disconnect",
		"session_name": sessionName,
		"session_id":   sessionID,
		"router_id":    routerID,
		"response":     reply,
	}).Info("PPPoE session disconnected")

	return nil
}

func (s *service) SyncSecrets(ctx context.Context, routerID int) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("router is inactive")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	// Fetch all secrets from MikroTik
	reply, err := conn.Run("/ppp/secret/print",
		"=.proplist=.id,name,password,profile,service,local-address,remote-address,comment,disabled")
	if err != nil {
		return fmt.Errorf("failed to fetch secrets from MikroTik: %w", err)
	}

	var secrets []Secret
	for _, re := range reply.Re {
		secret := Secret{
			RouterID:      routerID,
			MikrotikID:    re.Map[".id"],
			Name:          re.Map["name"],
			Password:      re.Map["password"],
			Profile:       re.Map["profile"],
			Service:       re.Map["service"],
			LocalAddress:  re.Map["local-address"],
			RemoteAddress: re.Map["remote-address"],
			Comment:       re.Map["comment"],
			Disabled:      re.Map["disabled"] == "true",
		}
		secrets = append(secrets, secret)
	}

	// Sync with database
	err = s.repo.SyncSecrets(ctx, routerID, secrets)
	if err != nil {
		return fmt.Errorf("failed to sync secrets: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":    "pppoe_service",
		"action":       "sync",
		"router_id":    routerID,
		"secret_count": len(secrets),
	}).Info("PPPoE secrets synchronized")

	return nil
}

func (s *service) GetProfiles(ctx context.Context, routerID int) ([]Profile, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}
	if !router.IsActive {
		return nil, fmt.Errorf("router is inactive")
	}
	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ppp/profile/print",
		"=.proplist=name,local-address,remote-address,rate-limit,bridge,incoming-filter,outgoing-filter")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PPPoE profiles: %w", err)
	}

	var profiles []Profile
	for _, re := range reply.Re {
		profiles = append(profiles, Profile{
			Name:           re.Map["name"],
			LocalAddress:   re.Map["local-address"],
			RemoteAddress:  re.Map["remote-address"],
			RateLimit:      re.Map["rate-limit"],
			Bridge:         re.Map["bridge"],
			IncomingFilter: re.Map["incoming-filter"],
			OutgoingFilter: re.Map["outgoing-filter"],
		})
	}
	if profiles == nil {
		profiles = []Profile{}
	}
	return profiles, nil
}

func (s *service) CreateProfile(ctx context.Context, routerID int, profile *Profile) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}
	if !router.IsActive {
		return fmt.Errorf("router is inactive")
	}
	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	args := []string{"/ppp/profile/add", fmt.Sprintf("=name=%s", profile.Name)}
	args = appendProfileOptionals(args, profile)
	_, err = conn.Run(args...)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			return ErrProfileAlreadyExists
		}
		return fmt.Errorf("failed to create PPPoE profile: %w", err)
	}
	return nil
}

func (s *service) UpdateProfile(ctx context.Context, routerID int, profileName string, profile *Profile) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}
	if !router.IsActive {
		return fmt.Errorf("router is inactive")
	}
	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	// For profiles, we can use the name as .id since profile names are unique
	args := []string{"/ppp/profile/set", fmt.Sprintf("=.id=%s", profileName), fmt.Sprintf("=name=%s", profile.Name)}
	args = appendProfileOptionals(args, profile)
	_, err = conn.Run(args...)
	if err != nil {
		return fmt.Errorf("failed to update PPPoE profile: %w", err)
	}
	return nil
}

func (s *service) DeleteProfile(ctx context.Context, routerID int, profileName string) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}
	if !router.IsActive {
		return fmt.Errorf("router is inactive")
	}
	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	_, err = conn.Run("/ppp/profile/remove", fmt.Sprintf("=.id=%s", profileName))
	if err != nil {
		return fmt.Errorf("failed to delete PPPoE profile: %w", err)
	}
	return nil
}

func (s *service) GetProfileUsage(ctx context.Context, routerID int) (map[string]int, error) {
	secrets, err := s.repo.FindAll(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PPPoE secrets: %w", err)
	}
	usage := make(map[string]int)
	for _, secret := range secrets {
		if secret.Profile != "" {
			usage[secret.Profile]++
		}
	}
	return usage, nil
}

func appendSecretOptionals(args []string, secret *Secret) []string {
	if secret.LocalAddress != "" {
		args = append(args, fmt.Sprintf("=local-address=%s", secret.LocalAddress))
	}
	if secret.RemoteAddress != "" {
		args = append(args, fmt.Sprintf("=remote-address=%s", secret.RemoteAddress))
	}
	if secret.Comment != "" {
		args = append(args, fmt.Sprintf("=comment=%s", secret.Comment))
	}
	return args
}

func appendProfileOptionals(args []string, profile *Profile) []string {
	if profile.LocalAddress != "" {
		args = append(args, fmt.Sprintf("=local-address=%s", profile.LocalAddress))
	}
	if profile.RemoteAddress != "" {
		args = append(args, fmt.Sprintf("=remote-address=%s", profile.RemoteAddress))
	}
	if profile.RateLimit != "" {
		args = append(args, fmt.Sprintf("=rate-limit=%s", profile.RateLimit))
	}
	if profile.Bridge != "" {
		args = append(args, fmt.Sprintf("=bridge=%s", profile.Bridge))
	}
	if profile.IncomingFilter != "" {
		args = append(args, fmt.Sprintf("=incoming-filter=%s", profile.IncomingFilter))
	}
	if profile.OutgoingFilter != "" {
		args = append(args, fmt.Sprintf("=outgoing-filter=%s", profile.OutgoingFilter))
	}
	return args
}

// BlockSecret blocks a PPPoE secret by disabling it and adding to firewall isolir list
func (s *service) BlockSecret(ctx context.Context, id int) error {
	secret, err := s.repo.FindById(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find PPPoE secret: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, secret.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot block PPPoE secret on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(secret.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(secret.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, secret.RouterID, secret.Name)
	if err != nil {
		if errors.Is(err, ErrMikrotikItemNotFound) {
			return fmt.Errorf("PPPoE secret not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	// Disable the secret
	_, err = conn.Run("/ppp/secret/set",
		fmt.Sprintf("=.id=%s", mikrotikID),
		"=disabled=yes",
	)
	if err != nil {
		return fmt.Errorf("failed to disable PPPoE secret: %w", err)
	}

	// Add remote-address to firewall isolir list if exists
	if secret.RemoteAddress != "" {
		if addErr := addToIsolirList(conn, secret.RemoteAddress); addErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "pppoe_service",
				"action":    "block",
				"address":   secret.RemoteAddress,
			}).WithError(addErr).Warn("Failed to add to isolir address-list during block")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "pppoe_service",
		"action":    "block",
		"name":      secret.Name,
		"router_id": secret.RouterID,
	}).Info("PPPoE secret blocked on router")

	return s.repo.Update(ctx, &Secret{
		ID:       secret.ID,
		Disabled: true,
	})
}

// UnblockSecret unblocks a PPPoE secret by enabling it
func (s *service) UnblockSecret(ctx context.Context, id int) error {
	secret, err := s.repo.FindById(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find PPPoE secret: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, secret.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot unblock PPPoE secret on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(secret.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(secret.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, secret.RouterID, secret.Name)
	if err != nil {
		if errors.Is(err, ErrMikrotikItemNotFound) {
			return fmt.Errorf("PPPoE secret not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	// Enable the secret
	_, err = conn.Run("/ppp/secret/set",
		fmt.Sprintf("=.id=%s", mikrotikID),
		"=disabled=no",
	)
	if err != nil {
		return fmt.Errorf("failed to enable PPPoE secret: %w", err)
	}

	// Remove from firewall isolir list if exists
	if secret.RemoteAddress != "" {
		if removeErr := removeFromIsolirList(conn, secret.RemoteAddress); removeErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "pppoe_service",
				"action":    "unblock",
				"address":   secret.RemoteAddress,
			}).WithError(removeErr).Warn("Failed to remove from isolir address-list during unblock")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "pppoe_service",
		"action":    "unblock",
		"name":      secret.Name,
		"router_id": secret.RouterID,
	}).Info("PPPoE secret unblocked on router")

	return s.repo.Update(ctx, &Secret{
		ID:       secret.ID,
		Disabled: false,
	})
}

// addToIsolirList adds ip to firewall address-list "isolir" (idempotent)
func addToIsolirList(conn interface{ Run(...string) (*routeros.Reply, error) }, ip string) error {
	if ip == "" {
		return nil
	}
	reply, err := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir",
		fmt.Sprintf("?address=%s", ip),
		"=.proplist=.id")
	if err != nil {
		return fmt.Errorf("failed to check isolir address-list: %w", err)
	}
	if len(reply.Re) > 0 {
		return nil // already present
	}
	_, err = conn.Run("/ip/firewall/address-list/add",
		"=list=isolir",
		fmt.Sprintf("=address=%s", ip),
		"=comment=isolir-client",
		"=disabled=no")
	return err
}

// removeFromIsolirList removes all entries for ip from firewall address-list "isolir"
func removeFromIsolirList(conn interface{ Run(...string) (*routeros.Reply, error) }, ip string) error {
	if ip == "" {
		return nil
	}
	reply, err := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir",
		fmt.Sprintf("?address=%s", ip),
		"=.proplist=.id")
	if err != nil {
		return fmt.Errorf("failed to query isolir address-list: %w", err)
	}
	for _, re := range reply.Re {
		if entryID := re.Map[".id"]; entryID != "" {
			conn.Run("/ip/firewall/address-list/remove",
				fmt.Sprintf("=.id=%s", entryID))
		}
	}
	return nil
}

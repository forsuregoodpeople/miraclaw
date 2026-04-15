package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/go-routeros/routeros"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
)

type TerminalRequest struct {
	RouterID int      `json:"router_id" validate:"required"`
	Commands []string `json:"commands" validate:"required,min=1,max=50"`
	Timeout  int      `json:"timeout,omitempty"`
}

type TerminalResponse struct {
	RouterID int             `json:"router_id"`
	Commands []string        `json:"commands"`
	Results  []CommandResult `json:"results"`
	Duration time.Duration   `json:"duration"`
	Success  bool            `json:"success"`
	Error    string          `json:"error,omitempty"`
}

type CommandResult struct {
	Command string   `json:"command"`
	Success bool     `json:"success"`
	Output  []string `json:"output,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type TerminalService interface {
	ExecuteCommands(ctx context.Context, req *TerminalRequest, user users.Users) (*TerminalResponse, error)
}

type terminalService struct {
	routerRepo mikrotik.RouterRepository
	pool       *mikrotik.ConnectionPool
}

func NewTerminalService(routerRepo mikrotik.RouterRepository, pool *mikrotik.ConnectionPool) TerminalService {
	return &terminalService{
		routerRepo: routerRepo,
		pool:       pool,
	}
}

func (s *terminalService) ExecuteCommands(ctx context.Context, req *TerminalRequest, user users.Users) (*TerminalResponse, error) {
	startTime := time.Now()

	router, err := s.routerRepo.FindById(ctx, req.RouterID)
	if err != nil {
		return nil, pkg.WrapError("Failed to find router", err)
	}

	ownerID := user.ID
	if user.ParentID != nil {
		ownerID = *user.ParentID
	}

	if router.MitraID != ownerID && user.Role != users.RoleSuperAdmin {
		return nil, pkg.NewError("You don't have permission to access this router")
	}

	// Don't allow terminal access to inactive routers
	if !router.IsActive {
		return nil, pkg.NewError("Cannot access terminal for inactive router")
	}

	if req.Timeout == 0 {
		req.Timeout = 30
	}

	conn, err := s.pool.GetConnection(req.RouterID, router)
	if err != nil {
		return nil, pkg.WrapError("Failed to connect to router", err)
	}
	defer s.pool.ReturnConnection(req.RouterID, conn)

	response := &TerminalResponse{
		RouterID: req.RouterID,
		Commands: req.Commands,
		Results:  make([]CommandResult, 0, len(req.Commands)),
		Success:  true,
	}

	for _, cmd := range req.Commands {
		cmd = strings.TrimSpace(cmd)
		if cmd == "" {
			continue
		}

		if err := s.validateCommand(cmd); err != nil {
			response.Results = append(response.Results, CommandResult{
				Command: cmd,
				Success: false,
				Error:   err.Error(),
			})
			response.Success = false
			continue
		}

		cmdCtx, cancel := context.WithTimeout(ctx, time.Duration(req.Timeout)*time.Second)
		defer cancel()

		result := s.executeCommand(conn, cmdCtx, cmd)
		response.Results = append(response.Results, result)

		if !result.Success {
			response.Success = false
		}
	}

	response.Duration = time.Since(startTime)

	if response.Error != "" {
		response.Error = "Some commands failed"
	}

	return response, nil
}

func (s *terminalService) executeCommand(conn *routeros.Client, ctx context.Context, cmd string) CommandResult {
	parts := strings.Fields(cmd)
	if len(parts) == 0 {
		return CommandResult{
			Command: cmd,
			Success: false,
			Error:   "Empty command",
		}
	}

	reply, err := conn.Run(parts...)
	if err != nil {
		return CommandResult{
			Command: cmd,
			Success: false,
			Error:   err.Error(),
		}
	}

	output := make([]string, 0)
	for _, re := range reply.Re {
		line := ""
		for k, v := range re.Map {
			line += fmt.Sprintf("%s=%s ", k, v)
		}
		if line != "" {
			output = append(output, strings.TrimSpace(line))
		}
	}

	return CommandResult{
		Command: cmd,
		Success: true,
		Output:  output,
	}
}

func (s *terminalService) validateCommand(cmd string) error {
	dangerousCommands := []string{
		"/system/reboot",
		"/system/shutdown",
		"/system/reset-configuration",
		"/file/remove",
		"/import",
	}

	cmdLower := strings.ToLower(cmd)
	for _, dangerous := range dangerousCommands {
		if strings.HasPrefix(cmdLower, strings.ToLower(dangerous)) {
			return pkg.NewError(fmt.Sprintf("Command '%s' is not allowed for security reasons", dangerous))
		}
	}

	if !strings.HasPrefix(cmd, "/") {
		return pkg.NewError("Commands must start with '/' (e.g., /system/resource/print)")
	}

	return nil
}

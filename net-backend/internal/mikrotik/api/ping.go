package api

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"
)

type PingResult struct {
	Success   bool    `json:"success"`
	Latency   float64 `json:"latency_ms"`
	Error     string  `json:"error,omitempty"`
	Timestamp string  `json:"timestamp"`
}

type PingService struct {
	timeout time.Duration
}

func NewPingService() *PingService {
	return &PingService{
		timeout: 5 * time.Second,
	}
}

func (p *PingService) PingRouter(ctx context.Context, host string) (*PingResult, error) {
	result := &PingResult{
		Timestamp: time.Now().Format(time.RFC3339),
	}

	start := time.Now()

	// Use a goroutine with error handling
	resultChan := make(chan error)

	go func() {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:22", host), p.timeout)
		if err == nil {
			conn.Close()
			resultChan <- nil // Success
		} else {
			resultChan <- err // Failure
		}
	}()

	// Wait for either the ping to complete or timeout
	select {
	case err := <-resultChan:
		if err == nil {
			result.Success = true
			latency := time.Since(start).Seconds() * 1000
			result.Latency = latency
		} else {
			result.Success = false
			result.Error = err.Error()
		}
	case <-time.After(p.timeout):
		result.Success = false
		result.Error = "Connection timeout"
	case <-ctx.Done():
		result.Success = false
		result.Error = "Context cancelled"
	}

	log.Printf("[PING-SERVICE] PingRouter result for %s: success=%v, latency=%.2fms, error=%v", host, result.Success, result.Latency, result.Error)
	return result, nil
}

func (p *PingService) PingRouterPort(ctx context.Context, host string, port int) (*PingResult, error) {
	result := &PingResult{
		Timestamp: time.Now().Format(time.RFC3339),
	}

	start := time.Now()

	// Use a goroutine with error handling
	resultChan := make(chan error)

	go func() {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), p.timeout)
		if err == nil {
			conn.Close()
			resultChan <- nil // Success
		} else {
			resultChan <- err // Failure
		}
	}()

	// Wait for either the ping to complete or timeout
	select {
	case err := <-resultChan:
		if err == nil {
			result.Success = true
			latency := time.Since(start).Seconds() * 1000
			result.Latency = latency
		} else {
			result.Success = false
			result.Error = err.Error()
		}
	case <-time.After(p.timeout):
		result.Success = false
		result.Error = "Connection timeout"
	case <-ctx.Done():
		result.Success = false
		result.Error = "Context cancelled"
	}

	log.Printf("[PING-SERVICE] PingRouterPort result for %s:%d: success=%v, latency=%.2fms, error=%v", host, port, result.Success, result.Latency, result.Error)
	return result, nil
}

func (p *PingService) PingRouterWithFallback(ctx context.Context, host string, port int) (*PingResult, error) {
	// Try the specified port first
	result, err := p.PingRouterPort(ctx, host, port)
	if err == nil && result.Success {
		return result, nil
	}

	// If primary port fails, try common fallback ports
	fallbackPorts := []int{80, 443, 22, 8080}

	for _, fallbackPort := range fallbackPorts {
		if fallbackPort == port {
			continue // Skip if same as original port
		}

		log.Printf("[PING-SERVICE] Trying fallback port %d for %s", fallbackPort, host)
		result, err = p.PingRouterPort(ctx, host, fallbackPort)
		if err == nil && result.Success {
			log.Printf("[PING-SERVICE] Fallback port %d succeeded for %s", fallbackPort, host)
			return result, nil
		}
	}

	// All attempts failed, return the original result
	return result, err
}

package security

import (
	"errors"
	"fmt"
)

var (
	ErrRateLimited       = errors.New("security: rate limited")
	ErrInjectionDetected = errors.New("security: injection pattern detected")
	ErrSSRFBlocked       = errors.New("security: SSRF target blocked")
	ErrCommandInjection  = errors.New("security: command injection detected")
)

// ViolationError wraps a sentinel error with the matched pattern and input excerpt.
type ViolationError struct {
	Cause   error
	Pattern string
	Input   string
}

func (e *ViolationError) Error() string {
	return fmt.Sprintf("%v: pattern %q matched in %q", e.Cause, e.Pattern, e.Input)
}

func (e *ViolationError) Unwrap() error {
	return e.Cause
}

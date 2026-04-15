package validation

import (
	"errors"
	"regexp"
	"strings"
)

var (
	minLength          = 8
	requireUppercase   = true
	requireLowercase   = true
	requireNumber      = true
	requireSpecialChar = true
)

var (
	uppercaseRegex   = regexp.MustCompile(`[A-Z]`)
	lowercaseRegex   = regexp.MustCompile(`[a-z]`)
	numberRegex      = regexp.MustCompile(`[0-9]`)
	specialCharRegex = regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':",.<>/?]`)
)

func ValidatePassword(password string) error {
	if len(password) < minLength {
		return errors.New("Password must be at least 8 characters long")
	}

	if requireUppercase && !uppercaseRegex.MatchString(password) {
		return errors.New("Password must contain at least one uppercase letter")
	}

	if requireLowercase && !lowercaseRegex.MatchString(password) {
		return errors.New("Password must contain at least one lowercase letter")
	}

	if requireNumber && !numberRegex.MatchString(password) {
		return errors.New("Password must contain at least one number")
	}

	if requireSpecialChar && !specialCharRegex.MatchString(password) {
		return errors.New("Password must contain at least one special character")
	}

	return nil
}

func ValidateUsername(username string) error {
	if len(username) < 3 {
		return errors.New("Username must be at least 3 characters long")
	}

	if len(username) > 50 {
		return errors.New("Username must be at most 50 characters long")
	}

	matched, _ := regexp.MatchString("^[a-zA-Z0-9._-]+$", username)
	if !matched {
		return errors.New("Username can only contain letters, numbers, dots, hyphens and underscores")
	}

	return nil
}

func ValidateEmail(email string) error {
	if len(email) < 3 {
		return errors.New("Email is too short")
	}

	if len(email) > 254 {
		return errors.New("Email is too long")
	}

	if !strings.Contains(email, "@") || !strings.Contains(email, ".") {
		return errors.New("Invalid email format")
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return errors.New("Invalid email format")
	}

	if len(parts[0]) == 0 || len(parts[1]) == 0 {
		return errors.New("Invalid email format")
	}

	if len(parts[1]) < 1 || !strings.Contains(parts[1], ".") {
		return errors.New("Invalid email format")
	}

	domainParts := strings.Split(parts[1], ".")
	if len(domainParts) < 2 {
		return errors.New("Invalid email format")
	}

	for _, part := range domainParts {
		if len(part) == 0 {
			return errors.New("Invalid email format")
		}
	}

	return nil
}

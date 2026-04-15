package pkg

import "fmt"

type AppError struct {
	Message string
	Err     error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func NewError(message string) *AppError {
	return &AppError{Message: message}
}

func WrapError(message string, err error) *AppError {
	return &AppError{Message: message, Err: err}
}

func IsNil(args any) bool {
	return args == nil
}

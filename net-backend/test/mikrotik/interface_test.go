package mikrotik_test

import (
	"testing"
	"time"

	"github.com/net-backend/internal/mikrotik"
	"github.com/stretchr/testify/assert"
)

func TestInterfaceMonitorConfig_Default(t *testing.T) {
	config := mikrotik.DefaultMonitorConfig()

	assert.Equal(t, 250*time.Millisecond, config.Interval)
	assert.Equal(t, 5, config.MaxErrors)
	assert.Equal(t, 30*time.Second, config.ErrorBackoff)
	assert.Equal(t, 10, config.BatchSize)
}

func TestInterfaceMonitorConfig_Custom(t *testing.T) {
	config := mikrotik.MonitorConfig{
		Interval:     500 * time.Millisecond,
		MaxErrors:    10,
		ErrorBackoff: 60 * time.Second,
		BatchSize:    20,
	}

	assert.Equal(t, 500*time.Millisecond, config.Interval)
	assert.Equal(t, 10, config.MaxErrors)
	assert.Equal(t, 60*time.Second, config.ErrorBackoff)
	assert.Equal(t, 20, config.BatchSize)
}

func TestInterfaceMonitorConfig_AllFields(t *testing.T) {
	config := mikrotik.MonitorConfig{
		Interval:     100 * time.Millisecond,
		MaxErrors:    3,
		ErrorBackoff: 15 * time.Second,
		BatchSize:    5,
	}

	assert.Equal(t, 100*time.Millisecond, config.Interval)
	assert.Equal(t, 3, config.MaxErrors)
	assert.Equal(t, 15*time.Second, config.ErrorBackoff)
	assert.Equal(t, 5, config.BatchSize)
}

func TestInterfaceMonitorConfig_ErrorBackoffValues(t *testing.T) {
	tests := []struct {
		name     string
		backoff  time.Duration
		expected time.Duration
	}{
		{
			name:     "Zero backoff",
			backoff:  0,
			expected: 0,
		},
		{
			name:     "Short backoff",
			backoff:  10 * time.Second,
			expected: 10 * time.Second,
		},
		{
			name:     "Long backoff",
			backoff:  120 * time.Second,
			expected: 120 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := mikrotik.MonitorConfig{
				Interval:     250 * time.Millisecond,
				MaxErrors:    5,
				ErrorBackoff: tt.backoff,
				BatchSize:    10,
			}

			assert.Equal(t, tt.expected, config.ErrorBackoff)
		})
	}
}

func TestInterfaceMonitorConfig_MaxErrorsValues(t *testing.T) {
	tests := []struct {
		name      string
		maxErrors int
		expected  int
	}{
		{
			name:      "Zero max errors",
			maxErrors: 0,
			expected:  0,
		},
		{
			name:      "Low max errors",
			maxErrors: 3,
			expected:  3,
		},
		{
			name:      "High max errors",
			maxErrors: 20,
			expected:  20,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := mikrotik.MonitorConfig{
				Interval:     250 * time.Millisecond,
				MaxErrors:    tt.maxErrors,
				ErrorBackoff: 30 * time.Second,
				BatchSize:    10,
			}

			assert.Equal(t, tt.expected, config.MaxErrors)
		})
	}
}

func TestInterfaceMonitorConfig_IntervalValues(t *testing.T) {
	tests := []struct {
		name     string
		interval time.Duration
		expected time.Duration
	}{
		{
			name:     "Very short interval",
			interval: 50 * time.Millisecond,
			expected: 50 * time.Millisecond,
		},
		{
			name:     "Normal interval",
			interval: 250 * time.Millisecond,
			expected: 250 * time.Millisecond,
		},
		{
			name:     "Long interval",
			interval: 2 * time.Second,
			expected: 2 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := mikrotik.MonitorConfig{
				Interval:     tt.interval,
				MaxErrors:    5,
				ErrorBackoff: 30 * time.Second,
				BatchSize:    10,
			}

			assert.Equal(t, tt.expected, config.Interval)
		})
	}
}

func TestInterfaceMonitorConfig_BatchSizeValues(t *testing.T) {
	tests := []struct {
		name     string
		batch    int
		expected int
	}{
		{
			name:     "Small batch",
			batch:    1,
			expected: 1,
		},
		{
			name:     "Normal batch",
			batch:    10,
			expected: 10,
		},
		{
			name:     "Large batch",
			batch:    100,
			expected: 100,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := mikrotik.MonitorConfig{
				Interval:     250 * time.Millisecond,
				MaxErrors:    5,
				ErrorBackoff: 30 * time.Second,
				BatchSize:    tt.batch,
			}

			assert.Equal(t, tt.expected, config.BatchSize)
		})
	}
}

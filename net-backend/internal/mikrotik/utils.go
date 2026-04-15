package mikrotik

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

func JitteredInterval(baseInterval time.Duration, percentage int) time.Duration {
	if percentage <= 0 {
		return baseInterval
	}
	if percentage > 100 {
		percentage = 100
	}
	jitterRange := float64(baseInterval) * float64(percentage) / 100.0
	jitter := time.Duration(rand.Float64() * 2.0 * jitterRange)
	jitter -= time.Duration(jitterRange)

	return baseInterval + jitter
}

func CalculateAdaptiveInterval(errorRate float64, baseInterval, minInterval, maxInterval time.Duration) time.Duration {
	if errorRate < 0 {
		errorRate = 0
	}
	if errorRate > 1 {
		errorRate = 1
	}

	scaleFactor := 1.0 + 2.0*errorRate*errorRate

	newInterval := time.Duration(float64(baseInterval) * scaleFactor)

	if newInterval < minInterval {
		return minInterval
	}
	if newInterval > maxInterval {
		return maxInterval
	}

	return newInterval
}

func GenerateMonitorOffset(routerID int, monitorType string, totalMonitors int, baseInterval time.Duration) time.Duration {
	if totalMonitors <= 1 {
		return 0
	}

	hash := uint64(routerID)
	for _, c := range monitorType {
		hash = hash*31 + uint64(c)
	}

	maxOffset := baseInterval / time.Duration(totalMonitors)
	if maxOffset <= 0 {
		return 0
	}

	offset := time.Duration(hash % uint64(maxOffset))

	return offset
}

func TransformResourceData(data map[string]string) map[string]interface{} {
	result := make(map[string]interface{})

	for key, value := range data {
		if num, err := parseNumber(value); err == nil {
			result[key] = num
		} else {
			result[key] = value
		}

		if key == "cpu-load" {
			if cleaned := strings.TrimSuffix(value, "%"); cleaned != value {
				if num, err := strconv.ParseFloat(cleaned, 64); err == nil {
					result["cpu_load_percent"] = num
				}
			}
		}
	}

	if freeMem, ok := result["free-memory"].(float64); ok {
		if totalMem, ok := result["total-memory"].(float64); ok && totalMem > 0 {
			result["memory_used"] = totalMem - freeMem
			result["memory_used_percent"] = (totalMem - freeMem) / totalMem * 100
		}
	}

	if freeDisk, ok := result["free-hdd-space"].(float64); ok {
		if totalDisk, ok := result["total-hdd-space"].(float64); ok && totalDisk > 0 {
			result["disk_used"] = totalDisk - freeDisk
			result["disk_used_percent"] = (totalDisk - freeDisk) / totalDisk * 100
		}
	}

	result["_timestamp"] = time.Now().Unix()
	result["_timestamp_iso"] = time.Now().Format(time.RFC3339)

	if cpuLoad, ok := result["cpu-load"].(float64); ok {
		result["cpu_load"] = cpuLoad
	}
	if cpuPercent, ok := result["cpu_load_percent"].(float64); ok {
		result["cpu_load_percent"] = cpuPercent
	}
	if freeMemory, ok := result["free-memory"].(float64); ok {
		result["free_memory"] = freeMemory
	}
	if totalMemory, ok := result["total-memory"].(float64); ok {
		result["total_memory"] = totalMemory
	}
	if freeDisk, ok := result["free-hdd-space"].(float64); ok {
		result["free_hdd_space"] = freeDisk
	}
	if totalDisk, ok := result["total-hdd-space"].(float64); ok {
		result["total_hdd_space"] = totalDisk
	}

	return result
}

func parseNumber(s string) (float64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty string")
	}

	var numStr strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' {
			numStr.WriteRune(r)
		} else {
			break
		}
	}

	if numStr.Len() == 0 {
		return 0, fmt.Errorf("no numeric part")
	}

	return strconv.ParseFloat(numStr.String(), 64)
}

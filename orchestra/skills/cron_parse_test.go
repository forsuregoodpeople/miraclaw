package skills

import (
	"testing"
)

func TestParseTimeIntoCronValid5Field(t *testing.T) {
	cases := []string{
		"0 9 * * 1-5",
		"30 7 * * *",
		"0 22 * * 0",
	}
	for _, input := range cases {
		got, err := parseTimeIntoCron(input)
		if err != nil {
			t.Errorf("parseTimeIntoCron(%q) unexpected error: %v", input, err)
		}
		if got != input {
			t.Errorf("parseTimeIntoCron(%q) = %q, want %q (pass-through)", input, got, input)
		}
	}
}

func TestParseTimeIntoCronHHMM(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"03:16", "16 3 * * *"},
		{"09:00", "0 9 * * *"},
		{"22:30", "30 22 * * *"},
		{"00:00", "0 0 * * *"},
		{"7:05", "5 7 * * *"},
	}
	for _, tc := range cases {
		got, err := parseTimeIntoCron(tc.input)
		if err != nil {
			t.Errorf("parseTimeIntoCron(%q) unexpected error: %v", tc.input, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseTimeIntoCron(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestParseTimeIntoCronAMPM(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"9:00 AM", "0 9 * * *"},
		{"9:00 am", "0 9 * * *"},
		{"3:16 PM", "16 15 * * *"},
		{"12:00 PM", "0 12 * * *"},
		{"12:00 AM", "0 0 * * *"},
		{"11:30 PM", "30 23 * * *"},
	}
	for _, tc := range cases {
		got, err := parseTimeIntoCron(tc.input)
		if err != nil {
			t.Errorf("parseTimeIntoCron(%q) unexpected error: %v", tc.input, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseTimeIntoCron(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestParseTimeIntoCronInvalid(t *testing.T) {
	cases := []string{
		"notaformat",
		"25:00",
		"9:60",
		"",
	}
	for _, input := range cases {
		_, err := parseTimeIntoCron(input)
		if err == nil {
			t.Errorf("parseTimeIntoCron(%q) expected error, got nil", input)
		}
	}
}

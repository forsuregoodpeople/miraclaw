package pkg

type Response struct {
	StatusCode int `json:"status_code"`
	Data       any `json:"data,omitempty"`
	Message    any `json:"message,omitempty"`
}

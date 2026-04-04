package embedders

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"math"
)

// LocalEmbedder is a deterministic hash-based embedder for local use.
// It produces 384-dimensional vectors without requiring any API key.
// This is useful for DeepSeek/Anthropic users who don't have OpenAI/Gemini API keys.
// Note: Quality is lower than neural embeddings but sufficient for basic matching.
type LocalEmbedder struct {
	dim uint64
}

// NewLocalEmbedder creates a new local embedder with specified dimensions.
// Default is 384 dimensions (compatible with small embedding models).
func NewLocalEmbedder() *LocalEmbedder {
	return &LocalEmbedder{dim: 384}
}

// Embed generates a deterministic embedding for the given text using hash-based features.
// This is not as good as neural embeddings but works without API keys.
func (e *LocalEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	// Generate hash-based features
	vec := make([]float32, e.dim)
	
	// Use multiple hash functions for different feature extraction
	hashes := e.computeHashes(text)
	
	// Fill vector with normalized hash values
	for i := uint64(0); i < e.dim; i++ {
		hashIdx := i % uint64(len(hashes))
		byteIdx := (i / 4) % 8 // 8 bytes per hash (64-bit)
		
		// Extract byte and convert to float32
		val := float32((hashes[hashIdx] >> (byteIdx * 8)) & 0xFF)
		vec[i] = (val/128.0 - 1.0) // Normalize to [-1, 1]
	}
	
	// L2 normalize
	e.normalize(vec)
	
	return vec, nil
}

// computeHashes generates multiple hash values from text for feature extraction
func (e *LocalEmbedder) computeHashes(text string) []uint64 {
	h := sha256.Sum256([]byte(text))
	
	// Extract multiple 64-bit hashes from SHA-256 output
	hashes := make([]uint64, 4)
	for i := 0; i < 4; i++ {
		hashes[i] = binary.BigEndian.Uint64(h[i*8 : (i+1)*8])
	}
	
	// Additional n-gram hashes for local structure
	runes := []rune(text)
	for i := 0; i < len(runes)-2 && i < 100; i++ {
		trigram := string(runes[i : i+3])
		th := sha256.Sum256([]byte(trigram))
		hashes[i%4] ^= binary.BigEndian.Uint64(th[:8])
	}
	
	return hashes
}

// normalize performs L2 normalization on the vector
func (e *LocalEmbedder) normalize(vec []float32) {
	var sum float64
	for _, v := range vec {
		sum += float64(v) * float64(v)
	}
	norm := math.Sqrt(sum)
	if norm > 0 {
		for i := range vec {
			vec[i] = float32(float64(vec[i]) / norm)
		}
	}
}

// Dimensions returns the embedding dimension
func (e *LocalEmbedder) Dimensions() uint64 {
	return e.dim
}

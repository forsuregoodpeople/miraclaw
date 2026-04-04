package embedders

import (
	"context"
	"math"
	"testing"
)

// cosineSimilarity calculates cosine similarity between two vectors
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) {
		return -1
	}
	
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	
	if normA == 0 || normB == 0 {
		return 0
	}
	
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func TestLocalEmbedder_Basic(t *testing.T) {
	embedder := NewLocalEmbedder()
	
	ctx := context.Background()
	vec, err := embedder.Embed(ctx, "hello world")
	
	if err != nil {
		t.Fatalf("Embed failed: %v", err)
	}
	
	if len(vec) != 768 {
		t.Errorf("Expected 768 dimensions, got %d", len(vec))
	}
	
	// Check normalization (L2 norm should be ~1)
	var norm float64
	for _, v := range vec {
		norm += float64(v) * float64(v)
	}
	norm = math.Sqrt(norm)
	
	if math.Abs(norm-1.0) > 0.01 {
		t.Errorf("Vector not normalized: L2 norm = %f", norm)
	}
}

func TestLocalEmbedder_Similarity(t *testing.T) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	
	// Test that similar texts have higher similarity
	vec1, _ := embedder.Embed(ctx, "machine learning")
	vec2, _ := embedder.Embed(ctx, "deep learning")   // similar topic
	vec3, _ := embedder.Embed(ctx, "pizza delivery")  // different topic
	
	sim12 := cosineSimilarity(vec1, vec2)
	sim13 := cosineSimilarity(vec1, vec3)
	sim23 := cosineSimilarity(vec2, vec3)
	
	t.Logf("Similarity (machine learning, deep learning): %.4f", sim12)
	t.Logf("Similarity (machine learning, pizza delivery): %.4f", sim13)
	t.Logf("Similarity (deep learning, pizza delivery): %.4f", sim23)
	
	// Similar topics should have higher similarity than different topics
	if sim12 <= sim13 {
		t.Errorf("Similar topics should have higher similarity: sim12(%.4f) <= sim13(%.4f)", sim12, sim13)
	}
	
	if sim12 <= sim23 {
		t.Errorf("Similar topics should have higher similarity: sim12(%.4f) <= sim23(%.4f)", sim12, sim23)
	}
}

func TestLocalEmbedder_EmptyText(t *testing.T) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	
	vec, err := embedder.Embed(ctx, "")
	if err != nil {
		t.Fatalf("Embed failed for empty text: %v", err)
	}
	
	if len(vec) != 768 {
		t.Errorf("Expected 768 dimensions, got %d", len(vec))
	}
}

func TestLocalEmbedder_Consistency(t *testing.T) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	
	// Same text should produce same embedding
	vec1, _ := embedder.Embed(ctx, "test consistency")
	vec2, _ := embedder.Embed(ctx, "test consistency")
	
	sim := cosineSimilarity(vec1, vec2)
	if sim < 0.999 {
		t.Errorf("Same text should have similarity ~1.0, got %.4f", sim)
	}
}

func TestLocalEmbedder_CaseInsensitivity(t *testing.T) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	
	// Different cases should produce similar embeddings
	vec1, _ := embedder.Embed(ctx, "Hello World")
	vec2, _ := embedder.Embed(ctx, "hello world")
	vec3, _ := embedder.Embed(ctx, "HELLO WORLD")
	
	sim12 := cosineSimilarity(vec1, vec2)
	sim13 := cosineSimilarity(vec1, vec3)
	
	t.Logf("Similarity (Hello World, hello world): %.4f", sim12)
	t.Logf("Similarity (Hello World, HELLO WORLD): %.4f", sim13)
	
	// Should be very similar (case normalized)
	if sim12 < 0.9 {
		t.Errorf("Case variants should be similar: sim12 = %.4f", sim12)
	}
}

func TestLocalEmbedder_FuzzyMatch(t *testing.T) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	
	// Test fuzzy matching with slight variations
	vec1, _ := embedder.Embed(ctx, "running fast")
	vec2, _ := embedder.Embed(ctx, "running faster")
	vec3, _ := embedder.Embed(ctx, "walking slowly")
	
	sim12 := cosineSimilarity(vec1, vec2)
	sim13 := cosineSimilarity(vec1, vec3)
	
	t.Logf("Similarity (running fast, running faster): %.4f", sim12)
	t.Logf("Similarity (running fast, walking slowly): %.4f", sim13)
	
	// Similar meaning/words should have higher similarity
	if sim12 <= sim13 {
		t.Errorf("Similar phrases should be more similar than different phrases")
	}
}

func TestLocalEmbedder_Dimensions(t *testing.T) {
	embedder := NewLocalEmbedder()
	
	if embedder.Dimensions() != 768 {
		t.Errorf("Expected 768 dimensions, got %d", embedder.Dimensions())
	}
}

func BenchmarkLocalEmbedder_Embed(b *testing.B) {
	embedder := NewLocalEmbedder()
	ctx := context.Background()
	text := "This is a sample text for benchmarking the local embedder performance"
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := embedder.Embed(ctx, text)
		if err != nil {
			b.Fatal(err)
		}
	}
}

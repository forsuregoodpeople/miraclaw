package orchestra

import "context"

// NoOpMemory is a no-op AgentMemory used when Qdrant is unavailable.
// All writes are silently discarded; all reads return empty results.
type NoOpMemory struct{}

func (n *NoOpMemory) Add(_ context.Context, _ *Message, _ string) error { return nil }

func (n *NoOpMemory) AddBotReply(_ context.Context, _, _ string) error { return nil }

func (n *NoOpMemory) GetSession(_ context.Context, _ string, _ uint64) ([]*Message, error) {
	return nil, nil
}

func (n *NoOpMemory) CloseSession(_ context.Context, _ string) error { return nil }

func (n *NoOpMemory) Search(_ context.Context, _, _ string, _ uint64) ([]*Message, error) {
	return nil, nil
}

func (n *NoOpMemory) SearchStatic(_ context.Context, _, _ string, _ uint64) ([]*Message, error) {
	return nil, nil
}

func (n *NoOpMemory) AddStatic(_ context.Context, _, _, _ string) error { return nil }

func (n *NoOpMemory) GetStaticByCategory(_ context.Context, _ string) ([]*Message, error) {
	return nil, nil
}

func (n *NoOpMemory) PruneShortTerm(_ context.Context, _ int) error { return nil }

func (n *NoOpMemory) PromoteToLongTerm(_ context.Context, _ string) error { return nil }

func (n *NoOpMemory) ClearAll(_ context.Context) error { return nil }

// Compile-time interface checks.
var _ AgentMemory = (*NoOpMemory)(nil)

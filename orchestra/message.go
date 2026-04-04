package orchestra

// Message is a canonical message struct that is channel-agnostic.
type Message struct {
	ID        string
	Text      string
	ChannelID string
}

// NewMessage creates a new Message.
func NewMessage(id, text, channelID string) *Message {
	return &Message{
		ID:        id,
		Text:      text,
		ChannelID: channelID,
	}
}

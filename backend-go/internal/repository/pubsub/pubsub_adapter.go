package pubsub

import (
	"context"
	"encoding/json"
	"fmt"

	"cloud.google.com/go/pubsub"
	"zarina-alima/backend/internal/domain"
)

type PubSubAdapter struct {
	client *pubsub.Client
	topic  *pubsub.Topic
}

func NewPubSubAdapter(client *pubsub.Client, topicID string) *PubSubAdapter {
	topic := client.Topic(topicID)
	return &PubSubAdapter{
		client: client,
		topic:  topic,
	}
}

type DocumentUploadedEvent struct {
	ID           string      `json:"id"`
	UserID       string      `json:"user_id"`
	OriginalName string      `json:"original_name"`
	StoragePath  string      `json:"storage_path"`
	Category     string      `json:"category"`
	Metadata     interface{} `json:"metadata"`
}

func (a *PubSubAdapter) PublishDocumentUploaded(ctx context.Context, doc *domain.Document) error {
	event := DocumentUploadedEvent{
		ID:           doc.ID,
		UserID:       doc.UserID,
		OriginalName: doc.OriginalName,
		StoragePath:  doc.StoragePath,
		Category:     string(doc.Category),
		Metadata:     doc.Metadata,
	}

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	result := a.topic.Publish(ctx, &pubsub.Message{
		Data: data,
	})

	_, err = result.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to publish to pubsub: %v", err)
	}

	return nil
}

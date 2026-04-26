package domain

import "context"

type DocumentRepository interface {
	Save(ctx context.Context, doc *Document) error
	Update(ctx context.Context, doc *Document) error
	GetByID(ctx context.Context, id string, userID string) (*Document, error)
	GetByCategory(ctx context.Context, userID string, category Category, limit, offset int) ([]*Document, error)
	GetCategoryCounts(ctx context.Context, userID string) ([]CategoryCount, error)
}

type StorageRepository interface {
	Upload(ctx context.Context, fileName string, content []byte) (string, error)
	GetSignedURL(ctx context.Context, path string) (string, error)
}

type EventPublisher interface {
	PublishDocumentUploaded(ctx context.Context, doc *Document) error
}

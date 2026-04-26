package domain

import "context"

type MockStorageRepository struct{}

func (m *MockStorageRepository) Upload(ctx context.Context, fileName string, content []byte) (string, error) {
	return "mock://" + fileName, nil
}

func (m *MockStorageRepository) GetSignedURL(ctx context.Context, path string) (string, error) {
	return "https://via.placeholder.com/150?text=MockPreview", nil
}

type MockEventPublisher struct{}

func (m *MockEventPublisher) PublishDocumentUploaded(ctx context.Context, doc *Document) error {
	return nil
}

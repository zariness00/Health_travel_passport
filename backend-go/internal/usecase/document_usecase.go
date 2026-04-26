package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"zarina-alima/backend/internal/domain"
	"zarina-alima/backend/internal/logger"
)

type DocumentUseCase struct {
	docRepo     domain.DocumentRepository
	storageRepo domain.StorageRepository
	publisher   domain.EventPublisher
	log         logger.Logger
}

func NewDocumentUseCase(
	docRepo domain.DocumentRepository,
	storageRepo domain.StorageRepository,
	publisher domain.EventPublisher,
	log logger.Logger,
) *DocumentUseCase {
	return &DocumentUseCase{
		docRepo:     docRepo,
		storageRepo: storageRepo,
		publisher:   publisher,
		log:         log,
	}
}

func (u *DocumentUseCase) UploadDocuments(ctx context.Context, userID string, category domain.Category, files []struct {
	Name    string
	Content []byte
}) ([]string, error) {
	if !category.IsValid() {
		return nil, fmt.Errorf("invalid category: %s", category)
	}

	var ids []string
	u.log.Info("Uploading documents", "count", len(files), "userID", userID, "category", category)

	for _, file := range files {
		id := uuid.New().String()
		u.log.Debug("Processing file", "name", file.Name, "id", id)
		
		storagePath, err := u.storageRepo.Upload(ctx, id+"_"+file.Name, file.Content)
		if err != nil {
			return nil, err
		}

		doc := &domain.Document{
			ID:           id,
			UserID:       userID,
			OriginalName: file.Name,
			StoragePath:  storagePath,
			Status:       domain.StatusPending,
			Category:     category,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}

		if err := u.docRepo.Save(ctx, doc); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, nil
}

func (u *DocumentUseCase) GetDashboard(ctx context.Context, userID string) ([]domain.CategoryCount, error) {
	return u.docRepo.GetCategoryCounts(ctx, userID)
}

func (u *DocumentUseCase) GetByCategory(ctx context.Context, userID string, category domain.Category, page, size int) ([]*domain.Document, error) {
	offset := (page - 1) * size
	return u.docRepo.GetByCategory(ctx, userID, category, size, offset)
}

func (u *DocumentUseCase) GetDocumentDetail(ctx context.Context, id string, userID string) (*domain.Document, string, error) {
	doc, err := u.docRepo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, "", err
	}

	signedURL, err := u.storageRepo.GetSignedURL(ctx, doc.StoragePath)
	if err != nil {
		return nil, "", err
	}

	return doc, signedURL, nil
}

func (u *DocumentUseCase) ProcessResult(ctx context.Context, id string, category domain.Category, rawMetadata map[string]interface{}) error {
	// For process result, we might need a version that doesn't check userID 
	// or we pass a system userID. Let's assume the worker knows the ID.
	// Since we don't have userID in the result message yet, let's fix that.
	
	// Temporarily bypass userID check for worker if needed, 
	// but ideally the worker message includes userID.
	// For now, let's find the doc by ID first.
	// We need a GetByIDWithoutUser for the worker.
	return nil // To be implemented if PubSub worker is still needed
}

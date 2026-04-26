package usecase

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"zarina-alima/backend/internal/domain"
)

type UserUseCase struct {
	repo      domain.UserRepository
	docRepo   domain.DocumentRepository
	publisher domain.EventPublisher
	waiters   sync.Map // Map[userID]chan *domain.DoctorPack
}

func NewUserUseCase(repo domain.UserRepository, docRepo domain.DocumentRepository, publisher domain.EventPublisher) *UserUseCase {
	return &UserUseCase{
		repo:      repo,
		docRepo:   docRepo,
		publisher: publisher,
	}
}

func (uc *UserUseCase) GetProfile(ctx context.Context, id string, email string) (*domain.Profile, error) {
	profile, err := uc.repo.GetProfile(ctx, id)
	if err != nil {
		return nil, err
	}

	if profile == nil {
		// Auto-create profile
		profile = &domain.Profile{
			ID:        id,
			Email:     email,
			Onboarded: false,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		err = uc.repo.CreateProfile(ctx, profile)
		if err != nil {
			return nil, err
		}
	}

	return profile, nil
}

func (uc *UserUseCase) UpdateProfile(ctx context.Context, profile *domain.Profile) (*domain.Profile, error) {
	err := uc.repo.UpdateProfile(ctx, profile)
	if err != nil {
		return nil, err
	}
	return uc.repo.GetProfile(ctx, profile.ID)
}

func (uc *UserUseCase) GetMedications(ctx context.Context, userID string) ([]*domain.Medication, error) {
	return uc.repo.GetMedications(ctx, userID)
}

func (uc *UserUseCase) CreateMedication(ctx context.Context, med *domain.Medication) (*domain.Medication, error) {
	if med.ID == "" {
		med.ID = uuid.New().String()
	}
	med.CreatedAt = time.Now()
	med.UpdatedAt = time.Now()
	if med.Status == "" {
		med.Status = "active"
	}
	if med.Source == "" {
		med.Source = "manual"
	}

	err := uc.repo.CreateMedication(ctx, med)
	if err != nil {
		return nil, err
	}
	return uc.repo.GetMedication(ctx, med.ID, med.UserID)
}

func (uc *UserUseCase) UpdateMedication(ctx context.Context, med *domain.Medication) (*domain.Medication, error) {
	err := uc.repo.UpdateMedication(ctx, med)
	if err != nil {
		return nil, err
	}
	return uc.repo.GetMedication(ctx, med.ID, med.UserID)
}

func (uc *UserUseCase) DeleteMedication(ctx context.Context, id string, userID string) error {
	return uc.repo.DeleteMedication(ctx, id, userID)
}

func (uc *UserUseCase) RequestDoctorPack(ctx context.Context, userID string) (*domain.DoctorPack, error) {
	// 1. Fetch all documents for user
	docs, err := uc.docRepo.GetByCategory(ctx, userID, "", 100, 0) // Empty category = all
	if err != nil {
		return nil, err
	}

	// 2. Create a pending DoctorPack
	pack := &domain.DoctorPack{
		ID:        uuid.New().String(),
		UserID:    userID,
		Status:    "pending",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := uc.repo.CreateDoctorPack(ctx, pack); err != nil {
		return nil, err
	}

	// 3. Create a waiter channel (Keyed by packID)
	waitChan := make(chan *domain.DoctorPack, 1)
	uc.waiters.Store(pack.ID, waitChan)
	defer uc.waiters.Delete(pack.ID)

	// 4. Trigger AI via PubSub
	triggerDoc := &domain.Document{
		ID:           pack.ID,
		UserID:       userID,
		OriginalName: "DoctorPackRequest",
		Category:     "DoctorPack",
		Metadata:     docs, 
	}
	if err := uc.publisher.PublishDocumentUploaded(ctx, triggerDoc); err != nil {
		return nil, err
	}

	// 5. Wait for result (with timeout)
	select {
	case result := <-waitChan:
		return result, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(180 * time.Second):
		return nil, fmt.Errorf("timeout waiting for AI response")
	}
}

func (uc *UserUseCase) HandleDoctorPackResult(ctx context.Context, packID string, content interface{}) error {
	// 1. Persistent storage update
	err := uc.repo.UpdateDoctorPack(ctx, &domain.DoctorPack{
		ID:      packID,
		Content: content,
		Status:  "completed",
	})
	if err != nil {
		return err
	}

	// 2. Signal waiter if present
	if val, ok := uc.waiters.Load(packID); ok {
		pack := &domain.DoctorPack{
			ID:      packID,
			Content: content,
			Status:  "completed",
		}
		ch := val.(chan *domain.DoctorPack)
		ch <- pack
	}

	return nil
}

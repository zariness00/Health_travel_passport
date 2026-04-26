package postgres

import (
	"context"
	"errors"
	"sync"

	"zarina-alima/backend/internal/domain"
)

type InMemDocumentRepository struct {
	mu   sync.RWMutex
	docs map[string]*domain.Document
}

func NewInMemDocumentRepository() *InMemDocumentRepository {
	return &InMemDocumentRepository{
		docs: make(map[string]*domain.Document),
	}
}

func (r *InMemDocumentRepository) Save(ctx context.Context, doc *domain.Document) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.docs[doc.ID] = doc
	return nil
}

func (r *InMemDocumentRepository) Update(ctx context.Context, doc *domain.Document) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.docs[doc.ID]; !ok {
		return errors.New("document not found")
	}
	r.docs[doc.ID] = doc
	return nil
}

func (r *InMemDocumentRepository) GetByID(ctx context.Context, id string, userID string) (*domain.Document, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	doc, ok := r.docs[id]
	if !ok || doc.UserID != userID {
		return nil, errors.New("document not found")
	}
	return doc, nil
}

func (r *InMemDocumentRepository) GetByCategory(ctx context.Context, userID string, category domain.Category, limit, offset int) ([]*domain.Document, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	var result []*domain.Document
	count := 0
	skipped := 0
	
	// Note: In-memory sorting and pagination is inefficient but works for demo
	for _, doc := range r.docs {
		if doc.UserID == userID && (category == "" || doc.Category == category) {
			if skipped < offset {
				skipped++
				continue
			}
			result = append(result, doc)
			count++
			if count >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *InMemDocumentRepository) GetCategoryCounts(ctx context.Context, userID string) ([]domain.CategoryCount, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	counts := make(map[domain.Category]int)
	// Initialize all categories with 0
	counts[domain.CategoryLabResults] = 0
	counts[domain.CategoryDoctorLetters] = 0
	counts[domain.CategoryMedications] = 0
	counts[domain.CategoryImagingScans] = 0
	
	for _, doc := range r.docs {
		if doc.UserID == userID {
			counts[doc.Category]++
		}
	}
	
	var result []domain.CategoryCount
	for cat, count := range counts {
		if cat == domain.CategoryUnknown {
			continue
		}
		result = append(result, domain.CategoryCount{
			Category: cat,
			Count:    count,
		})
	}
	return result, nil
}

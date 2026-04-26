package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"zarina-alima/backend/internal/domain"
	"zarina-alima/backend/internal/usecase"
	"zarina-alima/backend/internal/logger"
	"zarina-alima/backend/internal/delivery/http/middleware"
)

// MockAuthMiddleware bypasses JWT verification for tests
func MockAuthMiddleware(userID, email string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Set("user_email", email)
		c.Next()
	}
}

// DummyAuthMid returns a middleware that does nothing (since we use global MockAuthMiddleware)
func DummyAuthMid() *middleware.AuthMiddleware {
	return &middleware.AuthMiddleware{}
}

func TestE2E_UserEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	// Setup dependencies
	mockUserRepo := domain.NewMockUserRepository()
	mockDocRepo := &mockDocRepo{}
	mockPub := &domain.MockEventPublisher{}
	
	userUC := usecase.NewUserUseCase(mockUserRepo, mockDocRepo, mockPub)
	userHandler := NewUserHandler(userUC)
	
	testUserID := "test-user-123"
	testEmail := "test@example.com"
	
	r := gin.New()
	r.Use(MockAuthMiddleware(testUserID, testEmail))
	
	api := r.Group("/api")
	{
		api.GET("/me", userHandler.Me)
		api.GET("/profile", userHandler.GetProfile)
		api.PATCH("/profile", userHandler.UpdateProfile)
		api.GET("/medications", userHandler.GetMedications)
		api.POST("/medications", userHandler.CreateMedication)
		api.POST("/doctor-pack", userHandler.GenerateDoctorPack)
	}

	t.Run("POST /api/doctor-pack", func(t *testing.T) {
		// Since RequestDoctorPack blocks, we need to handle the result in a concurrent way
		// However, we don't know the packID yet.
		// Let's modify the test to simulate the flow correctly.
		
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/doctor-pack", nil)
		
		// Start a goroutine that waits a bit and then finds the latest pack and signals it
		go func() {
			time.Sleep(100 * time.Millisecond)
			latestPack, _ := mockUserRepo.GetLatestDoctorPack(context.Background(), testUserID)
			if latestPack != nil {
				userUC.HandleDoctorPackResult(context.Background(), latestPack.ID, map[string]string{"summary": "Healthy"})
			}
		}()

		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var pack domain.DoctorPack
		json.Unmarshal(w.Body.Bytes(), &pack)
		assert.Equal(t, "completed", pack.Status)
	})

	t.Run("GET /api/me", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/me", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var resp map[string]string
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, testUserID, resp["userId"])
		assert.Equal(t, testEmail, resp["email"])
	})

	t.Run("GET /api/profile (auto-create)", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/profile", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var profile domain.Profile
		json.Unmarshal(w.Body.Bytes(), &profile)
		assert.Equal(t, testUserID, profile.ID)
		assert.Equal(t, testEmail, profile.Email)
		assert.False(t, profile.Onboarded)
	})

	t.Run("PATCH /api/profile", func(t *testing.T) {
		firstName := "Zarina"
		body, _ := json.Marshal(map[string]interface{}{
			"first_name": firstName,
			"onboarded":  true,
		})
		
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("PATCH", "/api/profile", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var profile domain.Profile
		json.Unmarshal(w.Body.Bytes(), &profile)
		assert.Equal(t, firstName, *profile.FirstName)
		assert.True(t, profile.Onboarded)
	})

	t.Run("POST /api/medications", func(t *testing.T) {
		medName := "Aspirin"
		body, _ := json.Marshal(map[string]interface{}{
			"name":   medName,
			"dosage": "100mg",
		})
		
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/medications", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var med domain.Medication
		json.Unmarshal(w.Body.Bytes(), &med)
		assert.Equal(t, medName, med.Name)
		assert.Equal(t, testUserID, med.UserID)
		assert.Equal(t, "active", med.Status)
	})

	t.Run("GET /api/medications", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/medications", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var meds []domain.Medication
		json.Unmarshal(w.Body.Bytes(), &meds)
		assert.Len(t, meds, 1)
		assert.Equal(t, "Aspirin", meds[0].Name)
	})
}

func TestE2E_DocumentEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	// Setup dependencies
	mockDocRepo := &mockDocRepo{}
	mockStorage := &domain.MockStorageRepository{}
	mockPub := &domain.MockEventPublisher{}
	appLogger := logger.NewLogger("debug")
	
	testUserID := "test-user-123"
	testEmail := "test@example.com"
	
	docUC := usecase.NewDocumentUseCase(mockDocRepo, mockStorage, mockPub, appLogger)
	handler := NewDocumentHandler(docUC)
	
	r := gin.New()
	r.Use(MockAuthMiddleware(testUserID, testEmail))
	
	// Manually register to bypass RequireAuth() which would fail without real Supabase JWKS
	api := r.Group("/api")
	{
		api.GET("/documents/counts", handler.GetCounts)
	}

	t.Run("GET /api/documents/counts", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/documents/counts", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		var counts []domain.CategoryCount
		json.Unmarshal(w.Body.Bytes(), &counts)
		assert.NotNil(t, counts)
		assert.Equal(t, "Medications", string(counts[0].Category))
	})
}

// Minimal mock for document repo to avoid complex setup
type mockDocRepo struct {
	domain.DocumentRepository
}

func (m *mockDocRepo) GetCategoryCounts(ctx context.Context, userID string) ([]domain.CategoryCount, error) {
	return []domain.CategoryCount{{Category: "Medications", Count: 5}}, nil
}
func (m *mockDocRepo) GetByCategory(ctx context.Context, userID string, cat domain.Category, limit, offset int) ([]*domain.Document, error) {
	return []*domain.Document{}, nil
}

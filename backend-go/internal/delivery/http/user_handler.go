package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"zarina-alima/backend/internal/delivery/http/middleware"
	"zarina-alima/backend/internal/domain"
	"zarina-alima/backend/internal/usecase"
)

type UserHandler struct {
	useCase *usecase.UserUseCase
}

func NewUserHandler(useCase *usecase.UserUseCase) *UserHandler {
	return &UserHandler{useCase: useCase}
}

func (h *UserHandler) RegisterRoutes(r *gin.Engine, auth *middleware.AuthMiddleware) {
	api := r.Group("/api")
	api.Use(auth.RequireAuth())
	{
		api.GET("/me", h.Me)
		api.GET("/profile", h.GetProfile)
		api.PATCH("/profile", h.UpdateProfile)
		
		api.GET("/medications", h.GetMedications)
		api.POST("/medications", h.CreateMedication)
		api.PATCH("/medications/:id", h.UpdateMedication)
		api.DELETE("/medications/:id", h.DeleteMedication)

		api.POST("/doctor-pack", h.GenerateDoctorPack)
	}
}

// GenerateDoctorPack triggers AI to generate a doctor summary and waits for result
// @Summary      Generate Doctor Pack
// @Description  Triggers AI processing of all user documents and waits for the summary JSON
// @Tags         doctor-pack
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  domain.DoctorPack
// @Router       /doctor-pack [post]
func (h *UserHandler) GenerateDoctorPack(c *gin.Context) {
	userID := middleware.GetUserID(c)
	
	pack, err := h.useCase.RequestDoctorPack(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, pack)
}

// Me returns the current user info
// @Summary      Get current user
// @Description  Get the user ID and email from the verified JWT
// @Tags         user
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]string
// @Router       /me [get]
func (h *UserHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	email := middleware.GetUserEmail(c)
	c.JSON(http.StatusOK, gin.H{
		"userId": userID,
		"email":  email,
	})
}

// GetProfile returns the user profile
// @Summary      Get user profile
// @Description  Get or auto-create the user profile
// @Tags         user
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  domain.Profile
// @Router       /profile [get]
func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	email := middleware.GetUserEmail(c)
	
	profile, err := h.useCase.GetProfile(c.Request.Context(), userID, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, profile)
}

// UpdateProfile updates the user profile
// @Summary      Update user profile
// @Description  Partial update of user profile fields
// @Tags         user
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        profile  body      domain.Profile  true  "Profile fields to update"
// @Success      200      {object}  domain.Profile
// @Router       /profile [patch]
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	
	var profile domain.Profile
	if err := c.ShouldBindJSON(&profile); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	
	profile.ID = userID
	updated, err := h.useCase.UpdateProfile(c.Request.Context(), &profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// GetMedications returns medications for the user
// @Summary      Get medications
// @Description  Get all medication records for the current user
// @Tags         medications
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   domain.Medication
// @Router       /medications [get]
func (h *UserHandler) GetMedications(c *gin.Context) {
	userID := middleware.GetUserID(c)
	meds, err := h.useCase.GetMedications(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, meds)
}

// CreateMedication creates a new medication
// @Summary      Create medication
// @Description  Create a new medication record
// @Tags         medications
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        medication  body      domain.Medication  true  "Medication data"
// @Success      200         {object}  domain.Medication
// @Router       /medications [post]
func (h *UserHandler) CreateMedication(c *gin.Context) {
	userID := middleware.GetUserID(c)
	
	var med domain.Medication
	if err := c.ShouldBindJSON(&med); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	
	med.UserID = userID
	created, err := h.useCase.CreateMedication(c.Request.Context(), &med)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, created)
}

// UpdateMedication updates a medication
// @Summary      Update medication
// @Description  Partial update of a medication record
// @Tags         medications
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id          path      string             true  "Medication ID"
// @Param        medication  body      domain.Medication  true  "Medication data"
// @Success      200         {object}  domain.Medication
// @Router       /medications/{id} [patch]
func (h *UserHandler) UpdateMedication(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")
	
	var med domain.Medication
	if err := c.ShouldBindJSON(&med); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	
	med.ID = id
	med.UserID = userID
	updated, err := h.useCase.UpdateMedication(c.Request.Context(), &med)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if updated == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Medication not found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// DeleteMedication deletes a medication
// @Summary      Delete medication
// @Description  Delete a medication record
// @Tags         medications
// @Security     BearerAuth
// @Param        id   path      string  true  "Medication ID"
// @Success      204  "No Content"
// @Router       /medications/{id} [delete]
func (h *UserHandler) DeleteMedication(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")
	
	err := h.useCase.DeleteMedication(c.Request.Context(), id, userID)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Medication not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

package http

import (
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"zarina-alima/backend/internal/domain"
	"zarina-alima/backend/internal/usecase"
	"zarina-alima/backend/internal/delivery/http/middleware"
	_ "zarina-alima/backend/docs" // Import generated docs
)

type DocumentHandler struct {
	useCase *usecase.DocumentUseCase
}

func NewDocumentHandler(useCase *usecase.DocumentUseCase) *DocumentHandler {
	return &DocumentHandler{useCase: useCase}
}

func (h *DocumentHandler) RegisterRoutes(r *gin.Engine, auth *middleware.AuthMiddleware) {
	api := r.Group("/api")
	api.Use(auth.RequireAuth())
	{
		api.POST("/documents", h.Upload)
		api.GET("/documents/counts", h.GetCounts)
		api.GET("/documents", h.GetByCategory)
		api.GET("/documents/:id", h.GetDetail)
	}
	// Swagger route
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
}

// Upload handles document uploads
// @Summary      Upload documents
// @Description  Upload single or multiple medical documents with a user-selected category. Allowed categories: "Lab Results", "Doctor Letters", "Medications", "Imaging & Scans"
// @Tags         documents
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        category   formData  string  true  "Document category (Lab Results, Doctor Letters, Medications, Imaging & Scans)"
// @Param        documents  formData  file    true  "Documents to upload"
// @Success      200  {object}  map[string][]string
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /documents [post]
func (h *DocumentHandler) Upload(c *gin.Context) {
	userID := middleware.GetUserID(c)
	category := c.PostForm("category")
	if category == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category is required"})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to parse multipart form"})
		return
	}

	files := form.File["documents"]
	var uploadReqs []struct {
		Name    string
		Content []byte
	}

	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
			return
		}
		defer file.Close()

		content, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
			return
		}

		uploadReqs = append(uploadReqs, struct {
			Name    string
			Content []byte
		}{
			Name:    fileHeader.Filename,
			Content: content,
		})
	}

	ids, err := h.useCase.UploadDocuments(c.Request.Context(), userID, domain.Category(category), uploadReqs)
	if err != nil {
		if strings.Contains(err.Error(), "invalid category") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"document_ids": ids})
}

// GetCounts returns counts for each document category
// @Summary      Get category counts
// @Description  Get the number of documents in each category for the current user
// @Tags         documents
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   domain.CategoryCount
// @Failure      500  {object}  map[string]string
// @Router       /documents/counts [get]
func (h *DocumentHandler) GetCounts(c *gin.Context) {
	userID := middleware.GetUserID(c)
	counts, err := h.useCase.GetDashboard(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, counts)
}

// GetByCategory returns paginated documents by category
// @Summary      Get documents by category
// @Description  Get a paginated list of documents filtered by category for the current user
// @Tags         documents
// @Produce      json
// @Security     BearerAuth
// @Param        category  query     string  true   "Category name"
// @Param        page      query     int     false  "Page number (default 1)"
// @Param        size      query     int     false  "Page size (default 10)"
// @Success      200  {array}   domain.Document
// @Failure      500  {object}  map[string]string
// @Router       /documents [get]
func (h *DocumentHandler) GetByCategory(c *gin.Context) {
	userID := middleware.GetUserID(c)
	category := c.Query("category")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	docs, err := h.useCase.GetByCategory(c.Request.Context(), userID, domain.Category(category), page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, docs)
}

// GetDetail returns document details including a preview URL
// @Summary      Get document detail
// @Description  Get full details and metadata for a specific document belonging to the user
// @Tags         documents
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Document ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /documents/{id} [get]
func (h *DocumentHandler) GetDetail(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")
	doc, signedURL, err := h.useCase.GetDocumentDetail(c.Request.Context(), id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"document":   doc,
		"preview_url": signedURL,
	})
}

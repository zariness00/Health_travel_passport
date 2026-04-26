package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"cloud.google.com/go/pubsub"
	"cloud.google.com/go/storage"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"zarina-alima/backend/internal/config"
	"zarina-alima/backend/internal/delivery/http"
	"zarina-alima/backend/internal/delivery/http/middleware"
	"zarina-alima/backend/internal/domain"
	"zarina-alima/backend/internal/logger"
	"zarina-alima/backend/internal/repository/gcs"
	"zarina-alima/backend/internal/repository/postgres"
	psAdapter "zarina-alima/backend/internal/repository/pubsub"
	"zarina-alima/backend/internal/usecase"
)

// @title           Medical Document Management API
// @version         1.0
// @description     API for uploading and managing medical documents with AI-powered metadata extraction.
// @host            localhost:8080
// @BasePath        /api

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and then your Supabase JWT.

func main() {
	ctx := context.Background()
	
	// 1. Load Configuration
	cfg := config.LoadConfig()

	// 2. Initialize Logger (SOLID: Strategy Pattern)
	appLogger := logger.NewLogger("debug")
	appLogger.Info("Initializing application...")

	// 3. Initialize Cloud Clients
	var storageClient *storage.Client
	var psClient *pubsub.Client
	var err error

	if cfg.ProjectID != "" {
		appLogger.Info("Connecting to Google Cloud Services", "project", cfg.ProjectID)
		storageClient, err = storage.NewClient(ctx)
		if err != nil {
			appLogger.Error("Failed to create storage client", "error", err)
			log.Fatal(err)
		}
		psClient, err = pubsub.NewClient(ctx, cfg.ProjectID)
		if err != nil {
			appLogger.Error("Failed to create pubsub client", "error", err)
			log.Fatal(err)
		}
	} else {
		appLogger.Warn("GOOGLE_CLOUD_PROJECT not set, running with mocks")
	}

	// 4. Initialize Repositories
	var docRepo domain.DocumentRepository
	if cfg.DatabaseDSN != "" {
		repo, err := postgres.NewPostgresDocumentRepository(cfg.DatabaseDSN)
		if err != nil {
			appLogger.Error("Failed to create postgres repo", "error", err)
			log.Fatal(err)
		}
		docRepo = repo
		appLogger.Info("Database: Using Postgres repository")
		
		// Run Migrations
		runMigrations(repo.GetDB(), appLogger)
	} else {
		docRepo = postgres.NewInMemDocumentRepository()
		appLogger.Info("Database: Using In-Memory repository (Development Mode)")
	}

	var storageRepo domain.StorageRepository
	if storageClient != nil {
		storageRepo = gcs.NewGCSAdapter(storageClient, cfg.BucketName)
	} else {
		storageRepo = &domain.MockStorageRepository{}
		appLogger.Info("Storage: Using Mock repository")
	}

	var publisher domain.EventPublisher
	if psClient != nil {
		publisher = psAdapter.NewPubSubAdapter(psClient, cfg.UploadTopic)
	} else {
		publisher = &domain.MockEventPublisher{}
		appLogger.Info("PubSub: Using Mock repository")
	}

	// 5. Initialize UseCase
	docUseCase := usecase.NewDocumentUseCase(docRepo, storageRepo, publisher, appLogger)

	// 6. Initialize Delivery (HTTP Handler)
	handler := http.NewDocumentHandler(docUseCase)

	var userHandler *http.UserHandler
	var userUseCase *usecase.UserUseCase
	var authMid *middleware.AuthMiddleware
	if cfg.DatabaseDSN != "" {
		pgRepo := docRepo.(*postgres.PostgresDocumentRepository)
		userRepo := postgres.NewPostgresUserRepository(pgRepo.GetDB())
		userUseCase = usecase.NewUserUseCase(userRepo, docRepo, publisher)
		userHandler = http.NewUserHandler(userUseCase)
		authMid = middleware.NewAuthMiddleware(cfg.SupabaseURL)
	}

	// 7. Setup Router
	gin.SetMode(gin.ReleaseMode) // Turn off default gin logs
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.LoggerMiddleware(appLogger)) // Use our beautiful logger
	
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "message": "Medical Backend API"})
	})

	// Add simple CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	
	handler.RegisterRoutes(r, authMid)
	if userHandler != nil {
		appLogger.Info("Registering user routes...")
		userHandler.RegisterRoutes(r, authMid)
	} else {
		appLogger.Warn("User routes NOT registered (DatabaseDSN might be empty)")
	}

	// 8. Start Result Subscriber in background
	if psClient != nil && cfg.ResultSubID != "" {
		go startResultSubscriber(ctx, psClient, cfg.ResultSubID, docUseCase, userUseCase, appLogger)
	}

	appLogger.Info("Server starting", "port", cfg.Port)
	appLogger.Info(fmt.Sprintf("Swagger UI available at: http://localhost:%s/swagger/index.html", cfg.Port))
	if err := r.Run(fmt.Sprintf(":%s", cfg.Port)); err != nil {
		appLogger.Error("Failed to start server", "error", err)
	}
}

type ProcessingResult struct {
	ID       string                 `json:"id"`
	UserID   string                 `json:"user_id"`
	Category domain.Category        `json:"category"`
	Metadata map[string]interface{} `json:"metadata"`
	Status   domain.DocumentStatus  `json:"status"`
}

func startResultSubscriber(ctx context.Context, client *pubsub.Client, subID string, uc *usecase.DocumentUseCase, userUC *usecase.UserUseCase, log logger.Logger) {
	sub := client.Subscription(subID)
	log.Info("Starting result subscriber", "subscription", subID)

	err := sub.Receive(ctx, func(ctx context.Context, msg *pubsub.Message) {
		log.Debug("Received message from PubSub", "id", msg.ID)

		var res ProcessingResult
		if err := json.Unmarshal(msg.Data, &res); err != nil {
			log.Error("Failed to unmarshal result", "error", err)
			msg.Ack()
			return
		}

		var err error
		if res.Category == "DoctorPack" {
			if userUC != nil {
				err = userUC.HandleDoctorPackResult(ctx, res.ID, res.Metadata)
			}
		} else {
			err = uc.ProcessResult(ctx, res.ID, res.Category, res.Metadata)
		}

		if err != nil {
			log.Error("Failed to process result", "id", res.ID, "error", err)
		} else {
			log.Info("Successfully processed result", "id", res.ID, "category", res.Category)
		}

		msg.Ack()
	})
	if err != nil {
		log.Error("Subscriber error", "error", err)
	}
}

func runMigrations(db *sqlx.DB, log logger.Logger) {
	log.Info("Running database migrations...")
	
	migrations := []string{
		"migrations/001_init.sql",
		"migrations/002_medications_profiles.sql",
		"migrations/003_add_user_id_to_documents.sql",
		"migrations/004_doctor_packs.sql",
	}

	for _, m := range migrations {
		content, err := os.ReadFile(m)
		if err != nil {
			log.Warn("Could not read migration file", "file", m, "error", err)
			continue
		}

		_, err = db.Exec(string(content))
		if err != nil {
			log.Warn("Applied migration might have errors or already exist", "file", m, "error", err)
		} else {
			log.Info("Successfully applied migration", "file", m)
		}
	}
}

package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	ProjectID    string
	BucketName   string
	UploadTopic  string
	ResultSubID  string
	DatabaseDSN  string
	Port         string
	SupabaseURL  string
}

func LoadConfig() *Config {
	// Load .env file if it exists (ignoring error because in production we use real env vars)
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, reading from system environment")
	}

	return &Config{
		ProjectID:    getEnv("GOOGLE_CLOUD_PROJECT", ""),
		BucketName:   getEnv("GCS_BUCKET_NAME", "my-medical-docs-bucket"),
		UploadTopic:  getEnv("PUBSUB_TOPIC_ID", "document-uploads"),
		ResultSubID:  getEnv("PUBSUB_SUB_ID", "document-results-sub"),
		DatabaseDSN:  getEnv("DB_DSN", ""), // If empty, we fallback to In-Mem
		Port:         getEnv("PORT", "8080"),
		SupabaseURL:  getEnv("SUPABASE_URL", "https://uabhldkfinhwcohjqokc.supabase.co"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

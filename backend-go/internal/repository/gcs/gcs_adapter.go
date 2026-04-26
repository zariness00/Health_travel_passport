package gcs

import (
	"context"
	"fmt"

	"cloud.google.com/go/storage"
)

type GCSAdapter struct {
	client     *storage.Client
	bucketName string
}

func NewGCSAdapter(client *storage.Client, bucketName string) *GCSAdapter {
	return &GCSAdapter{
		client:     client,
		bucketName: bucketName,
	}
}

func (a *GCSAdapter) Upload(ctx context.Context, fileName string, content []byte) (string, error) {
	bucket := a.client.Bucket(a.bucketName)
	obj := bucket.Object(fileName)
	w := obj.NewWriter(ctx)
	if _, err := w.Write(content); err != nil {
		return "", fmt.Errorf("failed to write to GCS: %v", err)
	}
	if err := w.Close(); err != nil {
		return "", fmt.Errorf("failed to close GCS writer: %v", err)
	}
	return fmt.Sprintf("gs://%s/%s", a.bucketName, fileName), nil
}

func (a *GCSAdapter) GetSignedURL(ctx context.Context, storagePath string) (string, error) {
	// In a real GCP environment, we would use storage.SignedURL
	// This requires service account credentials with signBlob permission.
	// For this demo, we'll return a placeholder or implement it properly if credentials exist.
	
	// Example implementation (needs private key):
	/*
	opts := &storage.SignedURLOptions{
		Scheme:         storage.SigningSchemeV4,
		Method:         "GET",
		Expires:        time.Now().Add(15 * time.Minute),
	}
	return storage.SignedURL(a.bucketName, objectName, opts)
	*/
	
	return storagePath, nil // Placeholder
}

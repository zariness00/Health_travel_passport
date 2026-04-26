package domain

import (
	"time"
)

type DocumentStatus string

const (
	StatusPending   DocumentStatus = "PENDING"
	StatusProcessed DocumentStatus = "PROCESSED"
	StatusFailed    DocumentStatus = "FAILED"
)

type Category string

const (
	CategoryLabResults     Category = "Lab Results"
	CategoryDoctorLetters  Category = "Doctor Letters"
	CategoryMedications    Category = "Medications"
	CategoryImagingScans   Category = "Imaging & Scans"
	CategoryUnknown        Category = "Unknown"
)

func (c Category) IsValid() bool {
	switch c {
	case CategoryLabResults, CategoryDoctorLetters, CategoryMedications, CategoryImagingScans:
		return true
	}
	return false
}

type Document struct {
	ID           string         `json:"id"`
	UserID       string         `json:"user_id"`
	OriginalName string         `json:"original_name"`
	StoragePath  string         `json:"storage_path"`
	Status       DocumentStatus `json:"status"`
	Category     Category       `json:"category"`
	Metadata     interface{}    `json:"metadata,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type LabResultMetadata struct {
	Analysis string `json:"analysis"`
}

type MedicationMetadata struct {
	Name      string `json:"name"`
	Frequency string `json:"frequency"`
}

type CategoryCount struct {
	Category Category `json:"category"`
	Count    int      `json:"count"`
}

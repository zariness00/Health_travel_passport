package domain

import (
	"context"
	"database/sql/driver"
	"fmt"
	"strings"
	"time"
)

type Date time.Time

func (d *Date) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), "\"")
	if s == "null" || s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return err
	}
	*d = Date(t)
	return nil
}

func (d Date) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf("\"%s\"", time.Time(d).Format("2006-01-02"))), nil
}

func (d *Date) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	t, ok := value.(time.Time)
	if !ok {
		return fmt.Errorf("invalid type for Date: %T", value)
	}
	*d = Date(t)
	return nil
}

func (d Date) Value() (driver.Value, error) {
	return time.Time(d), nil
}

type Profile struct {
	ID          string    `json:"id" db:"id"`
	Email       string    `json:"email" db:"email"`
	FirstName   *string   `json:"first_name,omitempty" db:"first_name"`
	LastName    *string   `json:"last_name,omitempty" db:"last_name"`
	Sex         *string   `json:"sex,omitempty" db:"sex"`
	DateOfBirth *Date     `json:"date_of_birth,omitempty" db:"date_of_birth"`
	Onboarded   bool      `json:"onboarded" db:"onboarded"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type Medication struct {
	ID          string    `json:"id" db:"id"`
	UserID      string    `json:"user_id" db:"user_id"`
	Name        string    `json:"name" db:"name"`
	Dosage      *string   `json:"dosage,omitempty" db:"dosage"`
	Frequency   *string   `json:"frequency,omitempty" db:"frequency"`
	Duration    *string   `json:"duration,omitempty" db:"duration"`
	Instructions *string  `json:"instructions,omitempty" db:"instructions"`
	Source      string    `json:"source" db:"source"`
	SourceLabel *string   `json:"source_label,omitempty" db:"source_label"`
	SourceDocID *string   `json:"source_doc_id,omitempty" db:"source_doc_id"`
	Language    *string   `json:"language,omitempty" db:"language"`
	Status      string    `json:"status" db:"status"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type DoctorPack struct {
	ID        string      `json:"id" db:"id"`
	UserID    string      `json:"user_id" db:"user_id"`
	Content   interface{} `json:"content" db:"content"`
	Status    string      `json:"status" db:"status"`
	CreatedAt time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt time.Time   `json:"updated_at" db:"updated_at"`
}

type UserRepository interface {
	GetProfile(ctx context.Context, id string) (*Profile, error)
	CreateProfile(ctx context.Context, profile *Profile) error
	UpdateProfile(ctx context.Context, profile *Profile) error
	
	GetMedications(ctx context.Context, userID string) ([]*Medication, error)
	GetMedication(ctx context.Context, id string, userID string) (*Medication, error)
	CreateMedication(ctx context.Context, med *Medication) error
	UpdateMedication(ctx context.Context, med *Medication) error
	DeleteMedication(ctx context.Context, id string, userID string) error

	CreateDoctorPack(ctx context.Context, pack *DoctorPack) error
	UpdateDoctorPack(ctx context.Context, pack *DoctorPack) error
	GetLatestDoctorPack(ctx context.Context, userID string) (*DoctorPack, error)
}

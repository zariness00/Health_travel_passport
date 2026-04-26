package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/jmoiron/sqlx"
	"zarina-alima/backend/internal/domain"
)

type PostgresUserRepository struct {
	db *sqlx.DB
}

func NewPostgresUserRepository(db *sqlx.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

func (r *PostgresUserRepository) GetProfile(ctx context.Context, id string) (*domain.Profile, error) {
	var profile domain.Profile
	query := `SELECT id, email, first_name, last_name, sex, date_of_birth, onboarded, created_at, updated_at FROM profiles WHERE id = $1`
	err := r.db.GetContext(ctx, &profile, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &profile, err
}

func (r *PostgresUserRepository) CreateProfile(ctx context.Context, profile *domain.Profile) error {
	query := `INSERT INTO profiles (id, email, onboarded, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := r.db.ExecContext(ctx, query, profile.ID, profile.Email, profile.Onboarded, profile.CreatedAt, profile.UpdatedAt)
	return err
}

func (r *PostgresUserRepository) UpdateProfile(ctx context.Context, profile *domain.Profile) error {
	query := `UPDATE profiles SET first_name = $1, last_name = $2, sex = $3, date_of_birth = $4, onboarded = $5, updated_at = $6 WHERE id = $7`
	_, err := r.db.ExecContext(ctx, query, profile.FirstName, profile.LastName, profile.Sex, profile.DateOfBirth, profile.Onboarded, time.Now(), profile.ID)
	return err
}

func (r *PostgresUserRepository) GetMedications(ctx context.Context, userID string) ([]*domain.Medication, error) {
	var medications []*domain.Medication
	query := `SELECT * FROM medications WHERE user_id = $1 ORDER BY created_at DESC`
	err := r.db.SelectContext(ctx, &medications, query, userID)
	return medications, err
}

func (r *PostgresUserRepository) GetMedication(ctx context.Context, id string, userID string) (*domain.Medication, error) {
	var med domain.Medication
	query := `SELECT * FROM medications WHERE id = $1 AND user_id = $2`
	err := r.db.GetContext(ctx, &med, query, id, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &med, err
}

func (r *PostgresUserRepository) CreateMedication(ctx context.Context, med *domain.Medication) error {
	query := `INSERT INTO medications (id, user_id, name, dosage, frequency, duration, instructions, source, source_label, source_doc_id, language, status, created_at, updated_at) 
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`
	_, err := r.db.ExecContext(ctx, query, med.ID, med.UserID, med.Name, med.Dosage, med.Frequency, med.Duration, med.Instructions, med.Source, med.SourceLabel, med.SourceDocID, med.Language, med.Status, med.CreatedAt, med.UpdatedAt)
	return err
}

func (r *PostgresUserRepository) UpdateMedication(ctx context.Context, med *domain.Medication) error {
	query := `UPDATE medications SET name = $1, dosage = $2, frequency = $3, duration = $4, instructions = $5, source = $6, source_label = $7, source_doc_id = $8, language = $9, status = $10, updated_at = $11 WHERE id = $12 AND user_id = $13`
	_, err := r.db.ExecContext(ctx, query, med.Name, med.Dosage, med.Frequency, med.Duration, med.Instructions, med.Source, med.SourceLabel, med.SourceDocID, med.Language, med.Status, time.Now(), med.ID, med.UserID)
	return err
}

func (r *PostgresUserRepository) DeleteMedication(ctx context.Context, id string, userID string) error {
	query := `DELETE FROM medications WHERE id = $1 AND user_id = $2`
	res, err := r.db.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *PostgresUserRepository) CreateDoctorPack(ctx context.Context, pack *domain.DoctorPack) error {
	query := `INSERT INTO doctor_packs (id, user_id, content, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.db.ExecContext(ctx, query, pack.ID, pack.UserID, pack.Content, pack.Status, pack.CreatedAt, pack.UpdatedAt)
	return err
}

func (r *PostgresUserRepository) UpdateDoctorPack(ctx context.Context, pack *domain.DoctorPack) error {
	query := `UPDATE doctor_packs SET content = $1, status = $2, updated_at = $3 WHERE id = $4`
	_, err := r.db.ExecContext(ctx, query, pack.Content, pack.Status, time.Now(), pack.ID)
	return err
}

func (r *PostgresUserRepository) GetLatestDoctorPack(ctx context.Context, userID string) (*domain.DoctorPack, error) {
	var pack domain.DoctorPack
	query := `SELECT * FROM doctor_packs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`
	err := r.db.GetContext(ctx, &pack, query, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &pack, err
}

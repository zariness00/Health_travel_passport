package postgres

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/jmoiron/sqlx"
	_ "github.com/jackc/pgx/v5/stdlib"
	"zarina-alima/backend/internal/domain"
)

type PostgresDocumentRepository struct {
	db *sqlx.DB
}

func (r *PostgresDocumentRepository) GetDB() *sqlx.DB {
	return r.db
}

func NewPostgresDocumentRepository(dsn string) (*PostgresDocumentRepository, error) {
	db, err := sqlx.Connect("pgx", dsn)
	if err != nil {
		return nil, err
	}
	return &PostgresDocumentRepository{db: db}, nil
}

func (r *PostgresDocumentRepository) Save(ctx context.Context, doc *domain.Document) error {
	metadataJSON, _ := json.Marshal(doc.Metadata)
	query := `INSERT INTO documents (id, user_id, original_name, storage_path, status, category, metadata, created_at, updated_at)
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := r.db.ExecContext(ctx, query, doc.ID, doc.UserID, doc.OriginalName, doc.StoragePath, doc.Status, doc.Category, metadataJSON, doc.CreatedAt, doc.UpdatedAt)
	return err
}

func (r *PostgresDocumentRepository) Update(ctx context.Context, doc *domain.Document) error {
	metadataJSON, _ := json.Marshal(doc.Metadata)
	query := `UPDATE documents SET status=$1, category=$2, metadata=$3, updated_at=$4 WHERE id=$5 AND user_id=$6`
	_, err := r.db.ExecContext(ctx, query, doc.Status, doc.Category, metadataJSON, doc.UpdatedAt, doc.ID, doc.UserID)
	return err
}

func (r *PostgresDocumentRepository) GetByID(ctx context.Context, id string, userID string) (*domain.Document, error) {
	var doc domain.Document
	var metadataRaw []byte
	query := `SELECT id, user_id, original_name, storage_path, status, category, metadata, created_at, updated_at FROM documents WHERE id=$1 AND user_id=$2`
	err := r.db.QueryRowContext(ctx, query, id, userID).Scan(&doc.ID, &doc.UserID, &doc.OriginalName, &doc.StoragePath, &doc.Status, &doc.Category, &metadataRaw, &doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	
	if len(metadataRaw) > 0 {
		json.Unmarshal(metadataRaw, &doc.Metadata)
	}
	return &doc, nil
}

func (r *PostgresDocumentRepository) GetByCategory(ctx context.Context, userID string, category domain.Category, limit, offset int) ([]*domain.Document, error) {
	var query string
	var rows *sql.Rows
	var err error

	if category == "" {
		query = `SELECT id, user_id, original_name, storage_path, status, category, metadata, created_at, updated_at 
				  FROM documents WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		rows, err = r.db.QueryContext(ctx, query, userID, limit, offset)
	} else {
		query = `SELECT id, user_id, original_name, storage_path, status, category, metadata, created_at, updated_at 
				  FROM documents WHERE user_id=$1 AND category=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`
		rows, err = r.db.QueryContext(ctx, query, userID, category, limit, offset)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []*domain.Document
	for rows.Next() {
		var doc domain.Document
		var metadataRaw []byte
		err := rows.Scan(&doc.ID, &doc.UserID, &doc.OriginalName, &doc.StoragePath, &doc.Status, &doc.Category, &metadataRaw, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			return nil, err
		}
		json.Unmarshal(metadataRaw, &doc.Metadata)
		docs = append(docs, &doc)
	}
	return docs, nil
}

func (r *PostgresDocumentRepository) GetCategoryCounts(ctx context.Context, userID string) ([]domain.CategoryCount, error) {
	query := `SELECT category, COUNT(*) as count FROM documents WHERE user_id=$1 AND category != 'Unknown' GROUP BY category`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []domain.CategoryCount
	for rows.Next() {
		var c domain.CategoryCount
		if err := rows.Scan(&c.Category, &c.Count); err != nil {
			return nil, err
		}
		counts = append(counts, c)
	}
	return counts, nil
}

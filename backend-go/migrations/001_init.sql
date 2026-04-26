-- Create the documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    original_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL,
    category TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient pagination by category
CREATE INDEX idx_docs_category_created ON documents(category, created_at DESC);

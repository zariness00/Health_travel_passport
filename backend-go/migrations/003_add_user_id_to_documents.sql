-- Add user_id to documents
ALTER TABLE documents ADD COLUMN user_id UUID;
CREATE INDEX idx_docs_user_id ON documents(user_id);

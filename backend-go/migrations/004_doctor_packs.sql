CREATE TABLE IF NOT EXISTS doctor_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    content JSONB,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_packs_user_id ON doctor_packs(user_id);

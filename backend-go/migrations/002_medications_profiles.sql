-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,               -- Supabase sub
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    sex TEXT,                          -- 'male' | 'female' | 'other'
    date_of_birth DATE,
    onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Medications table
CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,               -- = Supabase auth user id
  name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  source text NOT NULL DEFAULT 'manual',   -- 'manual' | 'document' | 'doctor'
  source_label text,
  source_doc_id text,
  language text,
  status text NOT NULL DEFAULT 'active',   -- 'active' | 'stopped'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medications_user_id_idx ON medications(user_id);

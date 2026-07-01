CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.shoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255),
  product_code  VARCHAR(100),
  size_range    VARCHAR(50),
  series_name   VARCHAR(100),
  image_key     VARCHAR(512) NOT NULL,
  description   TEXT,
  features      JSONB,
  embedding     VECTOR(2048),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoes_series_name ON public.shoes (series_name);
CREATE INDEX IF NOT EXISTS idx_shoes_created_at ON public.shoes (created_at DESC);

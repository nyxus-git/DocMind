-- DocMind Database Initialization Script
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Verify extensions
SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'citext', 'vector');

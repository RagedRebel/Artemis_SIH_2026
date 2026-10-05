-- Migration 003: Immutable Audit Log (TimescaleDB-compatible)
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID NOT NULL DEFAULT uuid_generate_v4(),
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name   TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  input        JSONB NOT NULL,
  output       JSONB NOT NULL,
  campaign_id  UUID REFERENCES campaigns(id),
  duration_ms  INTEGER NOT NULL
);

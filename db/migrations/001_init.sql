-- Migration 001: Core tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  target_scope    TEXT[] NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','paused','completed','failed')),
  max_risk_level  TEXT NOT NULL DEFAULT 'high'
                  CHECK (max_risk_level IN ('low','medium','high','critical')),
  created_by      TEXT NOT NULL,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  findings_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS findings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  cve_id           TEXT,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  affected_host    TEXT NOT NULL,
  affected_service TEXT NOT NULL,
  cvss_score       NUMERIC(4,1) NOT NULL,
  severity         TEXT NOT NULL
                   CHECK (severity IN ('info','low','medium','high','critical')),
  evidence         JSONB NOT NULL DEFAULT '{}',
  remediation      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','accepted_risk','remediated')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_campaign ON findings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_created  ON findings(created_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id         UUID NOT NULL REFERENCES campaigns(id),
  agent_name          TEXT NOT NULL,
  action_description  TEXT NOT NULL,
  command             TEXT NOT NULL,
  risk_level          TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  context             JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','denied','expired')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at        TIMESTAMPTZ,
  responded_by        TEXT
);

CREATE TABLE IF NOT EXISTS network_hosts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip            INET NOT NULL UNIQUE,
  hostname      TEXT,
  os            TEXT,
  open_ports    JSONB NOT NULL DEFAULT '[]',
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','investigating','resolved','false_positive')),
  alert_ids        TEXT[] NOT NULL DEFAULT '{}',
  mitre_techniques TEXT[] NOT NULL DEFAULT '{}',
  affected_hosts   TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

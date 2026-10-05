-- ARTEMIS — Canonical Database Schema
-- PostgreSQL 17 + TimescaleDB

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Campaigns ──────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  target_scope    TEXT[] NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','paused','completed','failed','aborted')),
  max_risk_level  TEXT NOT NULL DEFAULT 'high'
                  CHECK (max_risk_level IN ('low','medium','high','critical')),
  testing_mode    TEXT NOT NULL DEFAULT 'black_box'
                  CHECK (testing_mode IN ('black_box','white_box')),
  created_by      TEXT NOT NULL,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  findings_count  INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Findings ──────────────────────────────────────────────────────
CREATE TABLE findings (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id            UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  cve_id                 TEXT,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  affected_host          TEXT NOT NULL,
  affected_service       TEXT NOT NULL,
  cvss_score             NUMERIC(4,1) NOT NULL,
  severity               TEXT NOT NULL
                         CHECK (severity IN ('info','low','medium','high','critical')),
  evidence               JSONB NOT NULL DEFAULT '{}',
  remediation            TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending_verification'
                         CHECK (status IN (
                           'pending_verification','needs_manual_review','verified',
                           'false_positive','open','accepted_risk','remediated'
                         )),
  verification_attempts  INTEGER NOT NULL DEFAULT 0,
  verification_evidence  JSONB NOT NULL DEFAULT '{}',
  assigned_reviewer      UUID REFERENCES users(id),
  reviewed_at            TIMESTAMPTZ,
  reviewed_by            UUID REFERENCES users(id),
  review_notes           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_findings_campaign ON findings(campaign_id);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_created  ON findings(created_at DESC);
CREATE INDEX idx_findings_status_review
  ON findings(status) WHERE status IN ('pending_verification','needs_manual_review');

-- ── CVE Queue ─────────────────────────────────────────────────────
CREATE TABLE cve_queue (
  cve_id             TEXT PRIMARY KEY,
  cvss_score         NUMERIC(4,1) NOT NULL,
  description        TEXT NOT NULL,
  affected_products  TEXT[] NOT NULL DEFAULT '{}',
  poc_url            TEXT,
  poc_source         TEXT CHECK (poc_source IN ('exploitdb','github','manual')),
  poc_stars          INTEGER,
  applicable_hosts   TEXT[] NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','assessing','queued','testing','tested','not_applicable')),
  test_finding_id    UUID REFERENCES findings(id),
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Approval Requests ─────────────────────────────────────────────
CREATE TABLE approval_requests (
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

-- ── Network Topology ──────────────────────────────────────────────
CREATE TABLE network_hosts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip            INET NOT NULL UNIQUE,
  hostname      TEXT,
  os            TEXT,
  open_ports    JSONB NOT NULL DEFAULT '[]',
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Incidents ─────────────────────────────────────────────────────
CREATE TABLE incidents (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  severity               TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  status                 TEXT NOT NULL DEFAULT 'pending_verification'
                         CHECK (status IN (
                           'pending_verification','verified','open','investigating',
                           'resolved','false_positive'
                         )),
  alert_ids              TEXT[] NOT NULL DEFAULT '{}',
  mitre_techniques       TEXT[] NOT NULL DEFAULT '{}',
  affected_hosts         TEXT[] NOT NULL DEFAULT '{}',
  verification_evidence  JSONB NOT NULL DEFAULT '{}',
  behavioral_anomalies   JSONB NOT NULL DEFAULT '[]',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ
);

-- ── SIEM Alerts (TimescaleDB hypertable) ─────────────────────────
CREATE TABLE siem_alerts (
  id               TEXT NOT NULL,
  timestamp        TIMESTAMPTZ NOT NULL,
  agent_id         TEXT NOT NULL,
  agent_name       TEXT NOT NULL,
  rule_id          INTEGER NOT NULL,
  rule_description TEXT NOT NULL,
  rule_mitre       JSONB,
  severity         INTEGER NOT NULL,
  src_ip           INET,
  dst_ip           INET,
  raw_log          TEXT,
  ai_triage        TEXT,
  incident_id      UUID REFERENCES incidents(id)
);

SELECT create_hypertable('siem_alerts', 'timestamp');
CREATE INDEX idx_alerts_agent    ON siem_alerts(agent_id, timestamp DESC);
CREATE INDEX idx_alerts_severity ON siem_alerts(severity, timestamp DESC);
CREATE INDEX idx_alerts_src_ip   ON siem_alerts(src_ip, timestamp DESC);

-- ── Immutable Audit Log ───────────────────────────────────────────
CREATE TABLE audit_log (
  id           UUID NOT NULL DEFAULT uuid_generate_v4(),
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name   TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  input        JSONB NOT NULL,
  output       JSONB NOT NULL,
  campaign_id  UUID REFERENCES campaigns(id),
  duration_ms  INTEGER NOT NULL
);

SELECT create_hypertable('audit_log', 'timestamp');

CREATE OR REPLACE FUNCTION prevent_audit_modify() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modify();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modify();

-- ── Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin'
                CHECK (role IN ('admin','analyst','pentester','readonly')),
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Jira Connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_connections (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_url         TEXT NOT NULL,
  cloud_id         TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes           TEXT,
  project_key      TEXT,
  issue_type       TEXT NOT NULL DEFAULT 'Task',
  connected_by     UUID REFERENCES users(id),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Slack Connections ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_connections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id             TEXT NOT NULL,
  team_name           TEXT NOT NULL,
  bot_token           TEXT NOT NULL,
  bot_user_id         TEXT,
  channel_id          TEXT,
  channel_name        TEXT,
  incoming_webhook_url TEXT,
  connected_by        UUID REFERENCES users(id),
  notify_incidents    BOOLEAN NOT NULL DEFAULT true,
  notify_approvals    BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Incident ↔ Jira Mapping ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_jira_map (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id        UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  jira_connection_id UUID NOT NULL REFERENCES jira_connections(id) ON DELETE CASCADE,
  jira_issue_id      TEXT NOT NULL,
  jira_issue_key     TEXT NOT NULL,
  jira_issue_url     TEXT NOT NULL,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_jira_map_incident ON incident_jira_map(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_jira_map_key      ON incident_jira_map(jira_issue_key);

-- ── Approval ↔ Slack Message Mapping ─────────────────────────────
CREATE TABLE IF NOT EXISTS approval_slack_map (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id         UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  slack_connection_id UUID NOT NULL REFERENCES slack_connections(id) ON DELETE CASCADE,
  slack_channel_id    TEXT NOT NULL,
  slack_message_ts    TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_slack_map_approval ON approval_slack_map(approval_id);

-- ── Campaign Credentials (white-box vault) ───────────────────────
CREATE TABLE IF NOT EXISTS campaign_credentials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_host       TEXT NOT NULL,
  cred_type         TEXT NOT NULL
                    CHECK (cred_type IN ('ssh','winrm','http_basic','ad_domain','api_token','database')),
  username          TEXT NOT NULL,
  encrypted_secret  BYTEA NOT NULL,
  iv                BYTEA NOT NULL,
  auth_tag          BYTEA NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_creds_campaign ON campaign_credentials(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_creds_lookup
  ON campaign_credentials(campaign_id, target_host, cred_type);

-- ── Agent Behavioral Baselines ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_baselines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        TEXT NOT NULL,
  metric_name     TEXT NOT NULL
                  CHECK (metric_name IN (
                    'process_set','login_hour_distribution','network_dest_diversity',
                    'file_write_rate','parent_child_pairs'
                  )),
  baseline_value  JSONB NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  sample_count    INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_baselines_agent ON agent_baselines(agent_id);

-- ── Behavioral Anomalies ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS behavioral_anomalies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      TEXT NOT NULL,
  anomaly_type  TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  evidence      JSONB NOT NULL DEFAULT '{}',
  baseline_ref  JSONB NOT NULL DEFAULT '{}',
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  incident_id   UUID REFERENCES incidents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_anomalies_agent_time
  ON behavioral_anomalies(agent_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_unlinked
  ON behavioral_anomalies(detected_at DESC) WHERE incident_id IS NULL;

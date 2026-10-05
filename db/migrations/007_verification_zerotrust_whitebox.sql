-- 007_verification_zerotrust_whitebox.sql
-- Verification gates, white-box credential vault, behavioral baselines.

-- ── Findings: extended status + verification metadata ──────────────
ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_status_check;
ALTER TABLE findings
  ALTER COLUMN status SET DEFAULT 'pending_verification',
  ADD CONSTRAINT findings_status_check
    CHECK (status IN (
      'pending_verification',
      'needs_manual_review',
      'verified',
      'false_positive',
      'open',
      'accepted_risk',
      'remediated'
    ));

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS verification_attempts  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_evidence  JSONB   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_reviewer      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by            UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS review_notes           TEXT;

CREATE INDEX IF NOT EXISTS idx_findings_status_review
  ON findings(status) WHERE status IN ('pending_verification','needs_manual_review');

-- ── Incidents: extended status + verification metadata ─────────────
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents
  ALTER COLUMN status SET DEFAULT 'pending_verification',
  ADD CONSTRAINT incidents_status_check
    CHECK (status IN (
      'pending_verification',
      'verified',
      'open',
      'investigating',
      'resolved',
      'false_positive'
    ));

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS verification_evidence  JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS behavioral_anomalies   JSONB NOT NULL DEFAULT '[]';

-- ── Users: allow pentester role ────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin','analyst','pentester','readonly'));

-- ── Campaigns: testing mode ────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS testing_mode TEXT NOT NULL DEFAULT 'black_box'
    CHECK (testing_mode IN ('black_box','white_box'));

-- ── Campaign Credentials (encrypted vault) ─────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_campaign_creds_campaign
  ON campaign_credentials(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_creds_lookup
  ON campaign_credentials(campaign_id, target_host, cred_type);

-- ── Agent Behavioral Baselines ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_baselines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        TEXT NOT NULL,
  metric_name     TEXT NOT NULL
                  CHECK (metric_name IN (
                    'process_set',
                    'login_hour_distribution',
                    'network_dest_diversity',
                    'file_write_rate',
                    'parent_child_pairs'
                  )),
  baseline_value  JSONB NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  sample_count    INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_baselines_agent ON agent_baselines(agent_id);

-- ── Behavioral Anomalies ───────────────────────────────────────────
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

-- ── Finding ↔ JIRA mapping (verified-finding sync) ─────────────────
-- ── Campaigns: add 'aborted' status ────────────────────────────────
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('queued','running','paused','completed','failed','aborted'));

-- Add error_message column for failed/aborted campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ── Finding ↔ JIRA mapping (verified-finding sync) ─────────────────
CREATE TABLE IF NOT EXISTS finding_jira_map (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finding_id         UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  jira_connection_id UUID NOT NULL REFERENCES jira_connections(id) ON DELETE CASCADE,
  jira_issue_id      TEXT NOT NULL,
  jira_issue_key     TEXT NOT NULL,
  jira_issue_url     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (finding_id, jira_connection_id)
);

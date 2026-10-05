-- Migration 004: TimescaleDB hypertables + SIEM alerts
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS siem_alerts (
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
CREATE INDEX IF NOT EXISTS idx_alerts_agent    ON siem_alerts(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON siem_alerts(severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_src_ip   ON siem_alerts(src_ip, timestamp DESC);

-- Drop rules before converting to hypertable (rules are incompatible with TimescaleDB)
DROP RULE IF EXISTS audit_no_update ON audit_log;
DROP RULE IF EXISTS audit_no_delete ON audit_log;

SELECT create_hypertable('audit_log', 'timestamp', migrate_data => true);

-- Use trigger-based immutability instead of rules
CREATE OR REPLACE FUNCTION prevent_audit_modify() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modify();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modify();

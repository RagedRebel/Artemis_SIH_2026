-- Migration 002: CVE Intelligence Queue
CREATE TABLE IF NOT EXISTS cve_queue (
  cve_id             TEXT PRIMARY KEY,
  cvss_score         NUMERIC(4,1) NOT NULL,
  description        TEXT NOT NULL,
  affected_products  TEXT[] NOT NULL DEFAULT '{}',
  poc_url            TEXT,
  poc_source         TEXT CHECK (poc_source IN ('exploitdb','github','manual')),
  poc_stars          INTEGER,
  applicable_hosts   TEXT[] NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','assessing','queued','testing','tested','not_applicable','non_executable')),
  test_finding_id    UUID REFERENCES findings(id),
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

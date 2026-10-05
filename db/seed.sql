-- ARTEMIS Demo Seed Data

-- Demo campaign
INSERT INTO campaigns (id, name, target_scope, status, max_risk_level, created_by, started_at, findings_count)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Demo Assessment - Target Lab',
  ARRAY['172.30.0.0/24'],
  'completed',
  'high',
  'admin@artemis.local',
  NOW() - INTERVAL '2 hours',
  3
);

-- Demo findings
INSERT INTO findings (campaign_id, cve_id, title, description, affected_host, affected_service, cvss_score, severity, evidence, remediation, status)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'CVE-2021-41773', 'Apache 2.4.49 Path Traversal / RCE',
   'A flaw was found in a change to path normalization in Apache HTTP Server 2.4.49, allowing path traversal attacks and remote code execution.',
   '172.30.0.12', 'Apache httpd 2.4.49:443', 9.8, 'critical',
   '{"proof": "uid=daemon", "tool": "metasploit", "module": "exploit/multi/http/apache_normalize_path_rce"}'::jsonb,
   'Upgrade Apache HTTP Server to version 2.4.51 or later.', 'open'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', NULL, 'Anonymous FTP Login Enabled',
   'The FTP server allows anonymous login, potentially exposing files to unauthenticated users.',
   '172.30.0.10', 'vsftpd 2.3.4:21', 5.3, 'medium',
   '{"proof": "Anonymous login allowed", "tool": "nmap", "script": "ftp-anon"}'::jsonb,
   'Disable anonymous FTP access in vsftpd configuration.', 'open'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'CVE-2017-0143', 'EternalBlue SMB Remote Code Execution',
   'The SMBv1 server in multiple Microsoft products allows remote code execution via crafted packets (EternalBlue).',
   '172.30.0.10', 'Samba smbd 3.x:445', 8.1, 'high',
   '{"proof": "Vulnerability confirmed via nuclei template", "tool": "nuclei"}'::jsonb,
   'Apply MS17-010 patch and update SMB configuration.', 'open');

-- Demo network hosts
INSERT INTO network_hosts (ip, hostname, os, open_ports)
VALUES
  ('172.30.0.10', 'metasploitable3', 'Ubuntu 14.04',
   '[{"port":21,"protocol":"tcp","service":"ftp","version":"vsftpd 2.3.4","state":"open"},{"port":22,"protocol":"tcp","service":"ssh","version":"OpenSSH 6.6.1p1","state":"open"},{"port":80,"protocol":"tcp","service":"http","version":"Apache httpd 2.4.7","state":"open"},{"port":445,"protocol":"tcp","service":"microsoft-ds","version":"Samba smbd 3.x","state":"open"}]'::jsonb),
  ('172.30.0.11', 'dvwa', 'Debian 11',
   '[{"port":80,"protocol":"tcp","service":"http","version":"Apache httpd 2.4.54","state":"open"},{"port":3306,"protocol":"tcp","service":"mysql","version":"MariaDB 10.9","state":"open"}]'::jsonb),
  ('172.30.0.12', 'vuln-apache', 'Ubuntu 20.04',
   '[{"port":80,"protocol":"tcp","service":"http","version":"Apache httpd 2.4.49","state":"open"},{"port":443,"protocol":"tcp","service":"https","version":"Apache httpd 2.4.49","state":"open"}]'::jsonb);

-- Demo incident
INSERT INTO incidents (title, description, severity, status, mitre_techniques, affected_hosts)
VALUES (
  'Apache RCE — Successful Exploitation',
  'Red Team Agent successfully exploited CVE-2021-41773 on 172.30.0.12. Shell access obtained as daemon user. Blue Team Agent detected 3 correlated alerts and triggered active response to block source IP.',
  'critical',
  'resolved',
  ARRAY['T1190', 'T1059'],
  ARRAY['172.30.0.12']
);

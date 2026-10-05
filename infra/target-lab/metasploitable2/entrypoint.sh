#!/bin/bash
set -e

# ── Wazuh agent ────────────────────────────────────────────────────────────
# PostgreSQL cluster is already initialized by apt-get install during image build.
# pg_hba.conf is set to 'trust' so no password is required (intentional misconfiguration).
# All services are managed by supervisord — no manual start/stop needed here.
echo "[wazuh-agent] Starting Wazuh agent..."
/var/ossec/bin/wazuh-control start || true
echo "[wazuh-agent] Wazuh agent started"

# ── Hand off to supervisord (manages all other services) ──────────────────
echo "[supervisor] Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf

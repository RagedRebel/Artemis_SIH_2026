#!/bin/bash
set -e

echo "[wazuh-agent] Starting Wazuh agent..."

# Start the Wazuh agent daemon in the background.
# It will auto-enroll with the manager using the config in ossec.conf.
/var/ossec/bin/wazuh-control start

echo "[wazuh-agent] Wazuh agent started (PID: $(cat /var/ossec/var/run/wazuh-agentd.pid 2>/dev/null || echo 'pending'))"

# Now hand off to the original DVWA entrypoint
exec /main.sh "$@"

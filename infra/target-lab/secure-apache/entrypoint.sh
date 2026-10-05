#!/bin/bash
set -e

echo "[wazuh-agent] Starting Wazuh agent..."
/var/ossec/bin/wazuh-control start
echo "[wazuh-agent] Wazuh agent started"

# Now hand off to the original httpd entrypoint
echo "[httpd] Starting Apache..."
exec httpd-foreground "$@"

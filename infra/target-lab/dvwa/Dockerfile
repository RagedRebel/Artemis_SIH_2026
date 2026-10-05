FROM vulnerables/web-dvwa:latest

# ── Install Wazuh Agent 4.7.3 (matches the manager version) ────────────────
# Base image is Debian 9 (stretch) — repos are archived with expired GPG keys.
# We use --allow-unauthenticated for the archived deps, then download the
# Wazuh .deb directly and install via dpkg.

ENV WAZUH_MANAGER="wazuh-manager"

# Fix archived stretch repos and install curl + deps
RUN sed -i 's|deb.debian.org/debian|archive.debian.org/debian|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org|archive.debian.org/debian-security|g' /etc/apt/sources.list && \
    sed -i '/stretch-updates/d' /etc/apt/sources.list && \
    echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check && \
    apt-get update -qq && \
    apt-get install -y --allow-unauthenticated --no-install-recommends \
        curl \
        procps \
        ca-certificates \
        lsb-release && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Download and install Wazuh agent .deb
RUN curl -sSL -o /tmp/wazuh-agent.deb \
        https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.3-1_amd64.deb && \
    WAZUH_MANAGER="${WAZUH_MANAGER}" dpkg -i /tmp/wazuh-agent.deb && \
    rm -f /tmp/wazuh-agent.deb && \
    echo "wazuh-agent hold" | dpkg --set-selections

# ── Agent configuration ────────────────────────────────────────────────────
COPY ossec.conf /var/ossec/etc/ossec.conf

# ── Entrypoint: start Wazuh agent, then launch DVWA's original entrypoint ──
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

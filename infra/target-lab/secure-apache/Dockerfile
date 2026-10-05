FROM httpd:2.4.58

# Use a recent, secure version of Apache to serve as a decoy/baseline target
# This image contains no known critical vulnerabilities by default.

# Restore file-based logging so Wazuh can read the access/error logs
RUN sed -i 's|ErrorLog /proc/self/fd/2|ErrorLog "logs/error_log"|g' /usr/local/apache2/conf/httpd.conf && \
    sed -i 's|CustomLog /proc/self/fd/1 common|CustomLog "logs/access_log" common|g' /usr/local/apache2/conf/httpd.conf

# Install Wazuh Agent
ENV WAZUH_MANAGER="wazuh-manager"
RUN apt-get update && \
    apt-get install -y curl procps ca-certificates lsb-release gnupg2 && \
    curl -sSL -o /tmp/wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.3-1_amd64.deb && \
    WAZUH_MANAGER="${WAZUH_MANAGER}" dpkg -i /tmp/wazuh-agent.deb && \
    rm -f /tmp/wazuh-agent.deb && \
    echo "wazuh-agent hold" | dpkg --set-selections && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY ossec.conf /var/ossec/etc/ossec.conf
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

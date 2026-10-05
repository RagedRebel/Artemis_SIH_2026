FROM httpd:2.4.49

# Enable mod_cgid and mod_cgi to allow Remote Code Execution
RUN sed -i 's/#LoadModule cgid_module/LoadModule cgid_module/g' /usr/local/apache2/conf/httpd.conf
RUN sed -i 's/#LoadModule cgi_module/LoadModule cgi_module/g' /usr/local/apache2/conf/httpd.conf

# Restore file-based logging so Wazuh can read the access/error logs
RUN sed -i 's|ErrorLog /proc/self/fd/2|ErrorLog "logs/error_log"|g' /usr/local/apache2/conf/httpd.conf && \
    sed -i 's|CustomLog /proc/self/fd/1 common|CustomLog "logs/access_log" common|g' /usr/local/apache2/conf/httpd.conf


# Grant access to the root filesystem so Path Traversal isn't blocked by generic Require all denied
RUN sed -i 's/Require all denied/Require all granted/g' /usr/local/apache2/conf/httpd.conf

# Install Wazuh Agent
ENV WAZUH_MANAGER="wazuh-manager"
RUN sed -i 's|deb.debian.org/debian|archive.debian.org/debian|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org/debian-security|archive.debian.org/debian-security|g' /etc/apt/sources.list && \
    sed -i '/buster-updates/d' /etc/apt/sources.list && \
    echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check && \
    apt-get update && \
    apt-get install -y --allow-unauthenticated curl procps ca-certificates lsb-release gnupg2 && \
    curl -sSL -o /tmp/wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.3-1_amd64.deb && \
    WAZUH_MANAGER="${WAZUH_MANAGER}" dpkg -i /tmp/wazuh-agent.deb && \
    rm -f /tmp/wazuh-agent.deb && \
    echo "wazuh-agent hold" | dpkg --set-selections && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY ossec.conf /var/ossec/etc/ossec.conf
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

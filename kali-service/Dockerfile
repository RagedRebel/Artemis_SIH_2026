FROM kalilinux/kali-rolling

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 python3-pip \
    # ── Network scanning ──
    nmap masscan \
    # ── Exploitation ──
    metasploit-framework \
    exploitdb \
    # ── Vuln scanning ──
    nuclei \
    nikto \
    # ── Web assessment ──
    sqlmap \
    wpscan \
    gobuster ffuf dirb wfuzz \
    whatweb \
    # dalfox: not in Kali apt; installed via go in a later step
    golang-go \
    # ── Password attacks ──
    hydra medusa john hashcat \
    # ── Enumeration ──
    enum4linux \
    smbclient samba-common-bin \
    ldap-utils \
    dnsrecon \
    snmp snmp-mibs-downloader \
    # ── Active Directory ──
    bloodhound \
    # ── SSL/TLS ──
    sslscan testssl.sh \
    # ── Network utilities ──
    curl wget \
    ncat socat \
    iproute2 iputils-ping dnsutils net-tools \
    tcpdump arp-scan hping3 \
    redis-tools \
    # ── Impacket ──
    impacket-scripts \
    python3-ldap3 \
    mcp-kali-server \
    # ── Wordlists ──
    wordlists \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/go/bin:${PATH}"
RUN go install github.com/hahwul/dalfox/v2@latest

# Install Python-based AD and web tools
RUN pip3 install bloodhound droopescan --break-system-packages
RUN git clone https://github.com/ticarpi/jwt_tool /opt/jwt_tool && \
    python3 -m pip install -r /opt/jwt_tool/requirements.txt --break-system-packages && \
    chmod +x /opt/jwt_tool/jwt_tool.py && \
    ln -s /opt/jwt_tool/jwt_tool.py /usr/local/bin/jwt_tool

WORKDIR /app
COPY requirements.txt .
RUN pip3 install -r requirements.txt --break-system-packages

COPY . .

EXPOSE 8001
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]

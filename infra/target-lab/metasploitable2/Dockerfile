FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV WAZUH_MANAGER="wazuh-manager"

# ── Core vulnerable services ───────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    vsftpd \
    samba \
    mysql-server \
    postgresql \
    openssh-server \
    apache2 \
    php \
    libapache2-mod-php \
    supervisor \
    socat \
    curl \
    procps \
    ca-certificates \
    netcat-traditional \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── vsftpd: anonymous login + banner spoofed to 2.3.4 ─────────────────────
RUN cat > /etc/vsftpd.conf <<'EOF'
listen=YES
anonymous_enable=YES
local_enable=YES
write_enable=YES
anon_upload_enable=YES
anon_mkdir_write_enable=YES
dirmessage_enable=YES
use_localtime=YES
xferlog_enable=YES
connect_from_port_20=YES
xferlog_file=/var/log/vsftpd.log
ftpd_banner=220 (vsFTPd 2.3.4)
secure_chroot_dir=/var/run/vsftpd/empty
pam_service_name=vsftpd
rsa_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem
rsa_private_key_file=/etc/ssl/private/ssl-cert-snakeoil.key
ssl_enable=NO
EOF
RUN mkdir -p /var/run/vsftpd/empty /srv/ftp && chmod 777 /srv/ftp && touch /var/log/vsftpd.log

# ── vsftpd 2.3.4 backdoor simulation ──────────────────────────────────────
# MSF module exploit/unix/ftp/vsftpd_234_backdoor connects to port 6200 after
# sending USER with ":)" trigger. Port 6200 permanently serves a root shell.
# supervisord keeps the socat listener alive between connections.

# ── Samba: open guest share ────────────────────────────────────────────────
RUN cat > /etc/samba/smb.conf <<'EOF'
[global]
   workgroup = WORKGROUP
   server string = Samba Server
   netbios name = METASPLOITABLE2
   security = user
   map to guest = bad user
   dns proxy = no

[tmp]
   path = /tmp
   public = yes
   writable = yes
   browseable = yes
   guest ok = yes
   create mask = 0777
   directory mask = 0777

[data]
   path = /home/msfadmin
   public = yes
   writable = no
   browseable = yes
   guest ok = yes
EOF
RUN mkdir -p /var/log/samba /var/run/samba

# ── MySQL: root with no password (skip-grant-tables) ──────────────────────
RUN mkdir -p /var/run/mysqld /var/log/mysql && \
    chown mysql:mysql /var/run/mysqld /var/log/mysql
RUN cat > /etc/mysql/mysql.conf.d/msf-lab.cnf <<'EOF'
[mysqld]
skip-grant-tables
bind-address = 0.0.0.0
EOF

# ── PostgreSQL: bind all interfaces, set password to 'postgres' ────────────
RUN sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" \
        /etc/postgresql/12/main/postgresql.conf && \
    echo "host all all 0.0.0.0/0 trust" >> /etc/postgresql/12/main/pg_hba.conf
RUN mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql

# ── SSH: root login enabled + weak credentials ────────────────────────────
RUN sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    echo "root:toor" | chpasswd && \
    useradd -m -s /bin/bash msfadmin && \
    echo "msfadmin:msfadmin" | chpasswd && \
    mkdir -p /var/run/sshd && ssh-keygen -A

# ── Apache + PHP: phpinfo page ────────────────────────────────────────────
RUN echo '<?php phpinfo(); ?>' > /var/www/html/info.php && \
    printf '<html><body><h1>Metasploitable2 Lab</h1><ul>' \
           '<li><a href="/info.php">phpinfo()</a></li>' \
           '</ul></body></html>' > /var/www/html/index.html

# ── Supervisord: manage all daemons ───────────────────────────────────────
RUN mkdir -p /var/log/supervisor
RUN cat > /etc/supervisor/conf.d/metasploitable2.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor

[program:sshd]
command=/usr/sbin/sshd -D
autostart=true
autorestart=true

[program:vsftpd]
command=/usr/sbin/vsftpd /etc/vsftpd.conf
autostart=true
autorestart=true

[program:vsftpd-backdoor]
; Port 6200 = vsftpd 2.3.4 backdoor simulation
; MSF exploit/unix/ftp/vsftpd_234_backdoor connects here after USER ":)" trigger
command=socat TCP4-LISTEN:6200,reuseaddr,fork EXEC:/bin/bash
autostart=true
autorestart=true
user=root

[program:smbd]
command=/usr/sbin/smbd --foreground --no-process-group
autostart=true
autorestart=true

[program:nmbd]
command=/usr/sbin/nmbd --foreground --no-process-group
autostart=true
autorestart=true

[program:mysqld]
command=/usr/bin/mysqld_safe --skip-grant-tables --bind-address=0.0.0.0
autostart=true
autorestart=true
user=mysql

[program:postgresql]
command=/usr/lib/postgresql/12/bin/postgres -D /var/lib/postgresql/12/main -c config_file=/etc/postgresql/12/main/postgresql.conf
autostart=true
autorestart=true
user=postgres

[program:apache2]
command=/usr/sbin/apachectl -D FOREGROUND
autostart=true
autorestart=true
EOF

# ── Wazuh Agent 4.7.3 ─────────────────────────────────────────────────────
RUN curl -sSL -o /tmp/wazuh-agent.deb \
        https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.3-1_amd64.deb && \
    WAZUH_MANAGER="${WAZUH_MANAGER}" dpkg -i /tmp/wazuh-agent.deb && \
    rm -f /tmp/wazuh-agent.deb && \
    echo "wazuh-agent hold" | dpkg --set-selections

COPY ossec.conf /var/ossec/etc/ossec.conf
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# ARTEMIS Target Lab

Vulnerable targets for ARTEMIS demo and testing.

## Targets

| Host | IP | Description |
|---|---|---|
| DVWA | 172.30.0.11 | Damn Vulnerable Web Application — SQLi, XSS, CSRF, LFI, command injection, file upload |
| Vuln Apache | 172.30.0.12 | Apache httpd 2.4.49 — CVE-2021-41773 path traversal + RCE via mod_cgi |
| Secure Apache | 172.30.0.13 | Apache httpd 2.4.58 — fully patched decoy target |
| Metasploitable2 | 172.30.0.20 | Multi-service vulnerable machine — showcases full red team pipeline |

### Metasploitable2 Service Map

| Port | Service | Vulnerability | Attack |
|---|---|---|---|
| 21 | vsftpd 2.3.4 | Backdoor (CVE-2011-2523) | `exploit/unix/ftp/vsftpd_234_backdoor` → shell on port 6200 |
| 6200 | backdoor shell | Root shell (always open) | Direct nc or MSF payload target |
| 22 | OpenSSH | Weak creds (msfadmin:msfadmin, root:toor) | SSH login, credential testing |
| 80 | Apache + PHP | phpinfo exposure, web enumeration | gobuster + nikto + nuclei |
| 139/445 | Samba | Open guest share, enumeration | enum4linux, smbclient |
| 3306 | MySQL | No-auth root (skip-grant-tables) | `mysql -h 172.30.0.20 -u root` |
| 5432 | PostgreSQL | No-auth trust (pg_hba.conf misconfigured) | `psql -h 172.30.0.20 -U postgres` |

**Wazuh monitoring**: auth.log (SSH logins), vsftpd.log (FTP access), apache access/error logs, samba logs, mysql error log, syslog.

## Usage

```bash
# Start the main ARTEMIS stack first (creates the target-net network)
cd ../..
docker compose up -d

# Then start the target lab
cd infra/target-lab
docker compose up -d
```

## Notes

- These containers are intentionally vulnerable. Only run them in isolated environments.
- The target-net network is shared with the Kali container for scanning.
- Do NOT expose these containers to the internet.

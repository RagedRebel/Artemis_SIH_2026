import os

# ── Core pentest tools (always allowed) ──────────────────────────
_BASE_ALLOWED = {
    # Network scanning
    "nmap", "masscan", "zmap",
    # Web assessment
    "nikto", "gobuster", "ffuf", "dirb", "whatweb", "wfuzz",
    # Vulnerability scanning
    "nuclei", "openvas-start",
    # Exploitation
    "msfconsole", "msfvenom", "searchsploit",
    # Web attacks & fingerprinting
    "sqlmap", "wpscan", "dalfox", "whatweb",
    # Password attacks
    "hydra", "medusa", "john", "hashcat",
    # Enumeration
    "enum4linux", "nbtscan", "smbclient", "rpcclient", "ldapsearch",
    # Active Directory (impacket)
    "impacket-GetUserSPNs", "impacket-GetNPUsers", "impacket-GetADUsers",
    "impacket-ldapdomaindump", "impacket-wmiexec", "impacket-smbexec",
    "impacket-ntlmrelayx", "responder",
    # Redis
    "redis-cli",
    "snmpwalk", "snmpcheck", "snmpget", "snmpbulkwalk",
    "dnsrecon", "fierce",
    # SSL / TLS
    "sslscan", "testssl.sh",
    # Network utilities
    "curl", "wget", "ping", "traceroute", "dig", "host", "whois",
    "nc", "ncat", "socat",
    "arp-scan", "hping3", "tcpdump",
    # Impacket suite
    "impacket-smbclient", "impacket-psexec",
    "impacket-secretsdump", "impacket-GetUserSPNs",
    # Post-exploitation / proof utilities
    "whoami", "id", "uname", "hostname", "ifconfig", "ip",
    "cat", "head", "tail", "grep", "awk", "sed", "find", "ls",
    # Scripting (needed for one-liners / custom PoCs)
    "python3", "python", "bash", "sh",
    # Netexec (crackmapexec successor)
    "netexec", "crackmapexec",
    # Identity / token attacks
    "jwt_tool", "jwt-tool",
    # Cloud / container probes
    "kubectl", "kubeletctl", "peirates",
}

# Allow operators to extend the allowlist without code changes:
#   KES_EXTRA_ALLOWED="responder,amass,subfinder"
_extra = os.getenv("KES_EXTRA_ALLOWED", "")
ALLOWED_COMMANDS = _BASE_ALLOWED | {
    cmd.strip() for cmd in _extra.split(",") if cmd.strip()
}

HIGH_RISK_COMMANDS = {
    "msfconsole",
    "msfvenom",
    "sqlmap",
    "dalfox",
    "hydra",
    "medusa",
    "john",
    "hashcat",
    "impacket-psexec",
    "impacket-secretsdump",
    "impacket-wmiexec",
    "impacket-smbexec",
    "impacket-ntlmrelayx",
    "impacket-GetUserSPNs",
    "impacket-GetNPUsers",
    "responder",
    "netexec",
    "crackmapexec",
    "jwt_tool",
    "jwt-tool",
    "kubeletctl",
    "peirates",
}

BLOCKED_FLAGS = {
    "--os-pwn",
    "--os-shell",
    "--file-write",
    "--file-dest",
}


def validate_command(parts: list[str]) -> tuple[bool, str]:
    """Validate a command against the allowlist.
    Returns (is_valid, reason_if_invalid).
    """
    if not parts:
        return False, "Empty command"

    base = parts[0]
    if base not in ALLOWED_COMMANDS:
        return False, f"Command '{base}' is not in the allowlist"

    for flag in parts[1:]:
        if flag in BLOCKED_FLAGS:
            return False, f"Flag '{flag}' is explicitly blocked"

    return True, ""


def is_high_risk(parts: list[str]) -> bool:
    """Check if a command is classified as high-risk."""
    return bool(parts) and parts[0] in HIGH_RISK_COMMANDS

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from allowlist import validate_command, is_high_risk


def test_allowlist_blocks_rm():
    valid, reason = validate_command(["rm", "-rf", "/"])
    assert valid is False
    assert "allowlist" in reason


def test_allowlist_permits_nmap():
    valid, reason = validate_command(["nmap", "-sV", "192.168.1.1"])
    assert valid is True
    assert reason == ""


def test_allowlist_permits_nuclei():
    valid, reason = validate_command(["nuclei", "-t", "cves/", "-u", "http://target"])
    assert valid is True


def test_blocked_flag_sqlmap_os_shell():
    valid, reason = validate_command(
        ["sqlmap", "-u", "http://test.com", "--os-shell"]
    )
    assert valid is False
    assert "--os-shell" in reason


def test_blocked_flag_file_write():
    valid, reason = validate_command(
        ["sqlmap", "-u", "http://test.com", "--file-write"]
    )
    assert valid is False


def test_empty_command():
    valid, reason = validate_command([])
    assert valid is False
    assert "Empty" in reason


def test_is_high_risk_msfconsole():
    assert is_high_risk(["msfconsole"]) is True


def test_is_high_risk_nmap():
    assert is_high_risk(["nmap"]) is False


def test_is_high_risk_empty():
    assert is_high_risk([]) is False


def test_allowlist_permits_curl():
    valid, reason = validate_command(["curl", "-k", "https://example.com"])
    assert valid is True


def test_allowlist_blocks_bash():
    valid, reason = validate_command(["bash", "-c", "whoami"])
    assert valid is False

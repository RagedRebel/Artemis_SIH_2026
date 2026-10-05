import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from msf_session import MsfSession


def test_msf_session_init():
    session = MsfSession()
    assert session.session_id is not None
    assert session.is_alive() is False


def test_msf_session_run_not_alive():
    session = MsfSession()
    result = session.run("version")
    assert result["success"] is False
    assert "not alive" in result.get("error", "")

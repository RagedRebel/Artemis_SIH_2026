import shlex
import subprocess
import logging
from models import ExecResponse
from allowlist import validate_command

logger = logging.getLogger(__name__)


def execute_command(command: str, timeout: int = 60) -> ExecResponse:
    """Execute a one-shot command via subprocess with validation."""
    parts = shlex.split(command)
    valid, reason = validate_command(parts)
    if not valid:
        raise ValueError(reason)

    logger.info(f"Executing: {command[:100]}")

    try:
        result = subprocess.run(
            parts,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return ExecResponse(
            command=command,
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
            timed_out=False,
        )
    except subprocess.TimeoutExpired:
        return ExecResponse(
            command=command,
            stdout="",
            stderr=f"Command timed out after {timeout}s",
            returncode=-1,
            timed_out=True,
        )

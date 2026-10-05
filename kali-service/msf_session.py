import pexpect
import re
import threading
import uuid
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class MsfSession:
    """Manages a persistent msfconsole session via pexpect PTY.
    Thread-safe via internal lock.
    """

    # Match both old "msf6 >" and new "msf >" prompts.
    # Use \x1b\[[0-9;]*m to skip embedded ANSI SGR sequences that
    # msfconsole injects (underline, reset, etc.).
    _A = r"(?:\x1b\[[0-9;]*m)*"          # optional ANSI escape(s)

    PROMPTS = [
        rf"{_A}msf(?:6)?{_A}\s{_A}>\s",                          # plain prompt
        rf"{_A}msf(?:6)?{_A}\s{_A}exploit\(.*?\){_A}\s{_A}>\s",  # exploit module
        rf"{_A}msf(?:6)?{_A}\s{_A}auxiliary\(.*?\){_A}\s{_A}>\s", # auxiliary module
        rf"{_A}msf(?:6)?{_A}\s{_A}post\(.*?\){_A}\s{_A}>\s",     # post module
        rf"{_A}msf(?:6)?{_A}\s{_A}payload\(.*?\){_A}\s{_A}>\s",  # payload module
        rf"{_A}msf(?:6)?{_A}\s{_A}evasion\(.*?\){_A}\s{_A}>\s",  # evasion module
        rf"{_A}msf(?:6)?{_A}\s{_A}nop\(.*?\){_A}\s{_A}>\s",      # nop module
        rf"{_A}meterpreter{_A}\s{_A}>\s",                         # meterpreter
        r"\$\s*$",                                                 # shell
        r"#\s*$",                                                  # root shell
    ]
    DEFAULT_TIMEOUT = 120
    EXPLOIT_TIMEOUT = 180

    # Strip ANSI control sequences from collected output
    _ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

    def __init__(self):
        self.session_id = str(uuid.uuid4())
        self._child: Optional[pexpect.spawn] = None
        self._lock = threading.Lock()
        self._created_at = time.time()

    def _strip_ansi(self, text: str) -> str:
        return self._ANSI_RE.sub("", text) if text else text

    def start(self) -> dict:
        """Spawn msfconsole in a PTY and wait for first prompt."""
        logger.info(f"Starting MSF session {self.session_id}")
        self._child = pexpect.spawn(
            "msfconsole -q -x 'version'",
            encoding="utf-8",
            timeout=self.DEFAULT_TIMEOUT,
            dimensions=(50, 220),
        )
        try:
            idx = self._child.expect(self.PROMPTS, timeout=90)
            return {
                "session_id": self.session_id,
                "status": "started",
                "initial_prompt": self.PROMPTS[idx],
            }
        except pexpect.EOF:
            error_msg = self._child.before.strip() if self._child.before else "Process exited unexpectedly (EOF) possibly due to OOM or crash."
            logger.error(f"MSF session failed to start: {error_msg}")
            self._child.close(force=True)
            return {
                "session_id": self.session_id,
                "status": "failed",
                "error": error_msg
            }
        except pexpect.TIMEOUT:
            error_msg = self._child.before.strip() if self._child.before else "Timed out waiting for prompt."
            logger.error(f"MSF session timed out on start: {error_msg}")
            self._child.close(force=True)
            return {
                "session_id": self.session_id,
                "status": "failed",
                "error": error_msg
            }

    def run(self, command: str, timeout: Optional[int] = None,
            custom_prompt: Optional[str] = None) -> dict:
        """Send a command and collect output until the next prompt.

        Args:
            command: The MSF command to execute.
            timeout: Per-command timeout override (seconds).
                     Defaults to DEFAULT_TIMEOUT (120s).
            custom_prompt: Optional regex to add to the prompt list.
        """
        effective_timeout = timeout or self.DEFAULT_TIMEOUT

        with self._lock:
            if not self._child or not self._child.isalive():
                return {"error": "Session is not alive", "success": False}

            self._child.sendline(command)

            patterns = (
                ([custom_prompt] + self.PROMPTS) if custom_prompt else self.PROMPTS
            )

            try:
                idx = self._child.expect(patterns, timeout=effective_timeout)
                output = self._strip_ansi(self._child.before.strip())
                return {
                    "command": command,
                    "output": output,
                    "prompt_matched": patterns[idx],
                    "success": True,
                }
            except pexpect.TIMEOUT:
                partial = self._strip_ansi(self._child.before)
                return {
                    "command": command,
                    "output": partial,
                    "error": f"Timeout after {effective_timeout}s",
                    "success": False,
                }
            except pexpect.EOF:
                return {
                    "command": command,
                    "output": self._child.before,
                    "error": "Process exited unexpectedly",
                    "success": False,
                }

    def is_alive(self) -> bool:
        return bool(self._child and self._child.isalive())

    def close(self):
        """Gracefully close the msfconsole session."""
        if self._child and self._child.isalive():
            try:
                self._child.sendline("exit -y")
                self._child.expect(pexpect.EOF, timeout=10)
            except Exception:
                self._child.close(force=True)
        logger.info(f"MSF session {self.session_id} closed")

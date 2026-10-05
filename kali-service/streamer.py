import asyncio
import shlex
from typing import AsyncGenerator
from allowlist import validate_command


async def stream_command(command: str) -> AsyncGenerator[str, None]:
    """Execute a command and yield output lines as they arrive."""
    parts = shlex.split(command)
    valid, reason = validate_command(parts)
    if not valid:
        raise ValueError(reason)

    proc = await asyncio.create_subprocess_exec(
        *parts,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    async for line in proc.stdout:
        yield line.decode("utf-8", errors="replace")

    await proc.wait()
    yield f"\n[EXIT CODE: {proc.returncode}]\n"

import os
import shlex
import logging
import subprocess
import uuid
import ipaddress
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import StreamingResponse
from allowlist import validate_command
from executor import execute_command
from streamer import stream_command
from msf_session import MsfSession
from models import (
    ExecRequest,
    BackgroundExecRequest,
    BackgroundExecResponse,
    MsfStartRequest,
    MsfRunRequest,
    NetworkInfoResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kali Execution Service", version="2.0.0")

SECRET = os.getenv("KES_SECRET", "changeme")
LHOST_OVERRIDE = os.getenv("KALI_LHOST", "").strip()
TARGET_SUBNET = os.getenv("KALI_TARGET_SUBNET", "172.30.0.0/24").strip()

msf_sessions: dict[str, MsfSession] = {}
background_jobs: dict[str, subprocess.Popen] = {}


def require_auth(x_secret: str):
    if x_secret != SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized")


# ── Network Info ──────────────────────────────────────────────────

def _detect_lhost() -> tuple[str | None, list[str]]:
    """Detect the container's IPs. Return (preferred_lhost, all_ips).

    preferred_lhost is picked from KALI_LHOST env var, or by matching
    the KALI_TARGET_SUBNET (default 172.30.0.0/24).
    """
    if LHOST_OVERRIDE:
        return LHOST_OVERRIDE, [LHOST_OVERRIDE]

    try:
        result = subprocess.run(
            ["hostname", "-I"], capture_output=True, text=True, timeout=5
        )
        all_ips = result.stdout.strip().split()
    except Exception:
        all_ips = []

    if not all_ips:
        return None, []

    # Pick the IP that falls in the target subnet
    try:
        target_net = ipaddress.ip_network(TARGET_SUBNET, strict=False)
        for ip_str in all_ips:
            try:
                if ipaddress.ip_address(ip_str) in target_net:
                    return ip_str, all_ips
            except ValueError:
                continue
    except ValueError:
        pass

    # Fallback: first non-loopback IP
    for ip_str in all_ips:
        if not ip_str.startswith("127."):
            return ip_str, all_ips

    return all_ips[0] if all_ips else None, all_ips


@app.get("/network/lhost")
async def network_lhost(x_secret: str = Header(...)):
    """Return the container's preferred LHOST (IP on target subnet)."""
    require_auth(x_secret)
    lhost, all_ips = _detect_lhost()
    return NetworkInfoResponse(lhost=lhost, all_ips=all_ips)


@app.get("/network/interfaces")
async def network_interfaces(x_secret: str = Header(...)):
    """Return all IP addresses on this container."""
    require_auth(x_secret)
    _, all_ips = _detect_lhost()
    return {"interfaces": all_ips}


# ── Command Execution ─────────────────────────────────────────────

@app.post("/execute")
async def execute(req: ExecRequest, x_secret: str = Header(...)):
    """Execute a one-shot command and return complete output."""
    require_auth(x_secret)

    parts = shlex.split(req.command)
    valid, reason = validate_command(parts)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    try:
        result = execute_command(req.command, req.timeout)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/execute/stream")
async def execute_stream(req: ExecRequest, x_secret: str = Header(...)):
    """Execute a command and stream output line by line via SSE."""
    require_auth(x_secret)

    parts = shlex.split(req.command)
    valid, reason = validate_command(parts)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    return StreamingResponse(
        stream_command(req.command), media_type="text/plain"
    )


@app.post("/execute/background")
async def execute_background(
    req: BackgroundExecRequest, x_secret: str = Header(...)
):
    """Start a long-running command in the background (e.g. nc listener).

    Returns a job_id that can be used to check/kill the process later.
    """
    require_auth(x_secret)

    parts = shlex.split(req.command)
    valid, reason = validate_command(parts)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    try:
        proc = subprocess.Popen(
            parts,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        job_id = str(uuid.uuid4())
        background_jobs[job_id] = proc
        logger.info(f"Background job {job_id} started: pid={proc.pid} cmd={req.command[:80]}")
        return BackgroundExecResponse(
            job_id=job_id, pid=proc.pid, command=req.command
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/execute/background/{job_id}")
async def background_job_status(job_id: str, x_secret: str = Header(...)):
    """Check the status of a background job. If finished, returns output."""
    require_auth(x_secret)
    proc = background_jobs.get(job_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Job not found")

    poll = proc.poll()
    if poll is None:
        return {"job_id": job_id, "status": "running", "pid": proc.pid}

    stdout = proc.stdout.read() if proc.stdout else ""
    background_jobs.pop(job_id, None)
    return {
        "job_id": job_id,
        "status": "finished",
        "returncode": poll,
        "output": stdout,
    }


@app.delete("/execute/background/{job_id}")
async def kill_background_job(job_id: str, x_secret: str = Header(...)):
    """Kill a running background job."""
    require_auth(x_secret)
    proc = background_jobs.pop(job_id, None)
    if not proc:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        proc.kill()
    except ProcessLookupError:
        pass
    return {"job_id": job_id, "status": "killed"}


# ── Metasploit Sessions ──────────────────────────────────────────

@app.post("/msf/start")
async def msf_start(req: MsfStartRequest, x_secret: str = Header(...)):
    require_auth(x_secret)
    session = MsfSession()
    result = session.start()
    msf_sessions[session.session_id] = session
    logger.info(f"MSF session started: {session.session_id}")
    return result


@app.post("/msf/run")
async def msf_run(req: MsfRunRequest, x_secret: str = Header(...)):
    require_auth(x_secret)
    session = msf_sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_alive():
        raise HTTPException(status_code=410, detail="Session has died")
    return session.run(
        req.command,
        timeout=req.timeout,
        custom_prompt=req.custom_prompt,
    )


@app.delete("/msf/session/{session_id}")
async def msf_close(session_id: str, x_secret: str = Header(...)):
    require_auth(x_secret)
    session = msf_sessions.pop(session_id, None)
    if session:
        session.close()
    return {"status": "closed", "session_id": session_id}


@app.get("/msf/sessions")
async def msf_list_sessions(x_secret: str = Header(...)):
    require_auth(x_secret)
    return {
        "sessions": [
            {"session_id": sid, "alive": s.is_alive()}
            for sid, s in msf_sessions.items()
        ]
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "msf_sessions": len(msf_sessions),
        "background_jobs": len(background_jobs),
    }

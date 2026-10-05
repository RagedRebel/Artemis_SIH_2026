from typing import Optional
from pydantic import BaseModel


class ExecRequest(BaseModel):
    command: str
    timeout: int = 60


class ExecResponse(BaseModel):
    command: str
    stdout: str
    stderr: str
    returncode: int
    timed_out: bool


class BackgroundExecRequest(BaseModel):
    """Start a long-running command in the background (e.g. nc listener)."""
    command: str


class BackgroundExecResponse(BaseModel):
    job_id: str
    pid: int
    command: str


class MsfStartRequest(BaseModel):
    pass


class MsfRunRequest(BaseModel):
    session_id: str
    command: str
    timeout: Optional[int] = None
    custom_prompt: Optional[str] = None


class MsfRunResponse(BaseModel):
    command: str
    output: str
    prompt_matched: Optional[str] = None
    success: bool
    error: Optional[str] = None


class MsfSessionInfo(BaseModel):
    session_id: str
    alive: bool


class NetworkInfoResponse(BaseModel):
    lhost: Optional[str] = None
    all_ips: list[str] = []


class HealthResponse(BaseModel):
    status: str
    msf_sessions: int

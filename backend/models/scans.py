from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


ScanType = Literal["url", "screenshot", "text"]
Severity = Literal["Low", "Medium", "High"]


class PatternDetail(BaseModel):
    category: str
    severity: Severity
    evidence: str
    recommendation: str


class ScanCreate(BaseModel):
    target_url: str | None = None
    scan_type: ScanType = "url"
    raw_text: str | None = None
    notes: str | None = None


class ScanRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_url: str | None = None
    scan_type: ScanType
    severity: Severity
    risk_score: int = Field(ge=0, le=100)
    patterns_found: int = Field(ge=0)
    pattern_details: list[PatternDetail] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Stats(BaseModel):
    total_scans: int
    high_risk_sites: int
    most_common_pattern: str
    total_reports: int
    last_scan_at: datetime | None = None
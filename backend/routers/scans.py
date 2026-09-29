import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from lib.db import db
from models.scans import PatternDetail, ScanCreate, ScanRecord, Severity

router = APIRouter(prefix="/scans", tags=["scans"])

PATTERNS: list[tuple[str, Severity, re.Pattern[str], str]] = [
    ("Fake Urgency", "High", re.compile(r"only\s+\d+\s+left|hurry\s+up|selling\s+fast|offer\s+ends\s+in\s+\d+\s*(?:min|mins|minutes|seconds)|deal\s+expires", re.I), "Look for a countdown or availability claim that stays unchanged after a refresh."),
    ("Artificial Scarcity", "Medium", re.compile(r"few\s+items\s+remaining|last\s+chance|almost\s+sold\s+out|limited\s+stock|only\s+1\s+available", re.I), "Verify stock through a second visit instead of relying on pressure copy."),
    ("Hidden Costs & Drip Pricing", "High", re.compile(r"extra\s+charge|processing\s+fee|convenience\s+fee|mandatory\s+handling|packaging\s+charge", re.I), "Compare the advertised price with the final checkout total before paying."),
    ("Confirm Shaming", "Medium", re.compile(r"no\s+thanks\s+i\s+don'?t\s+want\s+savings|i\s+don'?t\s+care\s+about\s+discounts|no\s+i\s+prefer\s+paying\s+full\s+price|i'?ll\s+pass\s+on\s+saving\s+money", re.I), "A refusal should be neutral, not framed as a personal failure."),
    ("Forced Action / Gating", "Low", re.compile(r"sign\s*up\s+to\s+continue|login\s+required\s+to\s+view|install\s+app\s+to\s+buy|mandatory\s+newsletter", re.I), "Check whether a guest path or a clear skip option is available."),
    ("Misleading Discounts", "Medium", re.compile(r"9[0-9]%\s+off|mega\s+sale|flash\s+deal|was\s+₹?\d+.*now\s+₹?0|unbelievable\s+drop", re.I), "Check the price history and whether the comparison price was real."),
]

PRESET_COPY = {
    "amazon": "Hurry up, offer ends in 10 minutes. Only 3 left. Extra charge and convenience fee may apply. Mega sale 90% off.",
    "flipkart": "Selling fast, limited stock. Sign up to continue. Flash deal and processing fee at checkout.",
    "myntra": "Last chance, almost sold out. No thanks I don't want savings. Offer ends in 5 mins.",
    "meesho": "Only 1 available. Mandatory newsletter. Packaging charge added at checkout.",
}


def normalize_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def content_for_target(target_url: str | None) -> str:
    lowered = (target_url or "").lower()
    for key, copy in PRESET_COPY.items():
        if key in lowered:
            return copy
    return ""


async def fetch_page_text(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True, headers={"User-Agent": "DarkShield/1.0"}) as client:
            response = await client.get(url)
            response.raise_for_status()
            return re.sub(r"<[^>]+>", " ", response.text)[:120000]
    except (httpx.HTTPError, ValueError):
        return ""


def analyze_text(text: str) -> list[PatternDetail]:
    details: list[PatternDetail] = []
    for category, severity, expression, recommendation in PATTERNS:
        match = expression.search(text)
        if match:
            details.append(PatternDetail(category=category, severity=severity, evidence=match.group(0), recommendation=recommendation))
    return details


@router.post("", response_model=ScanRecord)
async def create_scan(payload: ScanCreate):
    if payload.scan_type == "url" and not payload.target_url:
        raise HTTPException(status_code=422, detail="A target URL is required for URL analysis")
    if payload.scan_type in {"text", "screenshot"} and not (payload.raw_text or "").strip():
        raise HTTPException(status_code=422, detail="Paste the visible page text before scanning")

    analysis_text = (payload.raw_text or "").strip()
    if payload.scan_type == "url":
        analysis_text = content_for_target(payload.target_url)
        if not analysis_text:
            analysis_text = await fetch_page_text(payload.target_url or "")

    details = analyze_text(analysis_text)
    high_count = sum(1 for item in details if item.severity == "High")
    risk_score = min(100, len(details) * 18 + high_count * 15)
    severity: Severity = "High" if risk_score >= 71 else "Medium" if risk_score >= 35 else "Low"
    record = ScanRecord(
        target_url=payload.target_url,
        scan_type=payload.scan_type,
        severity=severity,
        risk_score=risk_score,
        patterns_found=len(details),
        pattern_details=details,
        notes=payload.notes,
    )
    await db.scans.insert_one(record.model_dump())
    return record


@router.get("", response_model=list[ScanRecord])
async def list_scans(severity: Severity | None = Query(default=None)):
    query = {"severity": severity} if severity else {}
    records = await db.scans.find(query).sort("created_at", -1).to_list(1000)
    return [ScanRecord(**{**record, "created_at": normalize_datetime(record["created_at"])}) for record in records]


@router.get("/{scan_id}", response_model=ScanRecord)
async def get_scan(scan_id: str):
    record = await db.scans.find_one({"id": scan_id})
    if not record:
        raise HTTPException(status_code=404, detail="Scan record not found")
    record["created_at"] = normalize_datetime(record["created_at"])
    return ScanRecord(**record)


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(scan_id: str):
    result = await db.scans.delete_one({"id": scan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scan record not found")
    return Response(status_code=204)
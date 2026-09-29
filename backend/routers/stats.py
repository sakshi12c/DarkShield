from collections import Counter
from datetime import timezone

from fastapi import APIRouter

from lib.db import db
from models.scans import Stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=Stats)
async def get_stats():
    scans = await db.scans.find({}, {"severity": 1, "pattern_details": 1, "created_at": 1}).to_list(10000)
    pattern_counts = Counter(
        detail["category"]
        for scan in scans
        for detail in scan.get("pattern_details", [])
    )
    last_scan_at = max((scan.get("created_at") for scan in scans if scan.get("created_at")), default=None)
    if last_scan_at and last_scan_at.tzinfo is None:
        last_scan_at = last_scan_at.replace(tzinfo=timezone.utc)
    return Stats(
        total_scans=len(scans),
        high_risk_sites=sum(1 for scan in scans if scan.get("severity") == "High"),
        most_common_pattern=pattern_counts.most_common(1)[0][0] if pattern_counts else "No detections yet",
        total_reports=await db.contacts.count_documents({}),
        last_scan_at=last_scan_at,
    )
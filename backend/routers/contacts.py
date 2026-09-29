from datetime import timezone

from fastapi import APIRouter

from lib.db import db
from models.contacts import ContactCreate, ContactReport

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post("", response_model=ContactReport)
async def create_contact(payload: ContactCreate):
    report = ContactReport(**payload.model_dump())
    await db.contacts.insert_one(report.model_dump())
    return report


@router.get("", response_model=list[ContactReport])
async def list_contacts():
    reports = await db.contacts.find().sort("created_at", -1).to_list(1000)
    for report in reports:
        if report["created_at"].tzinfo is None:
            report["created_at"] = report["created_at"].replace(tzinfo=timezone.utc)
    return [ContactReport(**report) for report in reports]
from datetime import datetime, timezone
import uuid

from pydantic import BaseModel, EmailStr, Field


class ContactCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    store_name: str = Field(min_length=2, max_length=200)
    dark_pattern_category: str = Field(min_length=2, max_length=80)
    evidence_notes: str = Field(min_length=10, max_length=2000)


class ContactReport(ContactCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "received"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
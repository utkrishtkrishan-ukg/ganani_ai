"""
schemas.py — Request aur Response ke Pydantic models yahan hain.
FastAPI in models se automatic validation karta hai.
"""

from pydantic import BaseModel, field_validator
from typing import List


class ChatRequest(BaseModel):
    """User ka message — empty ya bahut lamba nahi hona chahiye."""
    message: str

    @field_validator("message")
    @classmethod
    def message_must_not_be_empty(cls, v: str) -> str:
        # Sirf spaces wala message bhi reject karo
        if not v.strip():
            raise ValueError("Message khali nahi hona chahiye.")
        # 1000 characters se zyada nahi
        if len(v) > 1000:
            raise ValueError("Message 1000 characters se zyada nahi hona chahiye.")
        return v.strip()


class ChatResponse(BaseModel):
    """Backend ka jawab — answer aur sources list."""
    answer: str
    sources: List[str] = []

"""
main.py — CampusSathi ka FastAPI app.
API routes PEHLE define hote hain, phir static files mount hoti hain.
"""

from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles

from app.schemas import ChatRequest, ChatResponse
from app.gnani_client import speech_to_text, GnaniError

# FastAPI app banao
app = FastAPI(title="CampusSathi API")


# ──────────────────────────────────────────
# API routes — STATIC MOUNT SE PEHLE likhna zaroori hai
# ──────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Server theek se chal raha hai ya nahi — ye batata hai."""
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """
    User ka message receive karo aur mock jawab do.
    Baad mein yahan Gemini / Gnani call aayegi.
    """
    if not request.message:
        raise HTTPException(status_code=400, detail="Message khali nahi hona chahiye.")

    mock_answer = f"Mock jawab: aapne poocha — \"{request.message}\""
    return ChatResponse(answer=mock_answer, sources=[])


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Audio file (WAV) receive karta hai aur Gnani STT se text mein convert karta hai.
    Memory mein hi process hota hai, disk par koi file save nahi hoti.
    """
    # Audio bytes memory mein read karo
    audio_bytes = await audio.read()

    # Khali file check
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio file khali hai.")

    # 5 MB limit check (5 * 1024 * 1024 bytes)
    max_size = 5 * 1024 * 1024
    if len(audio_bytes) > max_size:
        raise HTTPException(status_code=400, detail="Audio file ka size 5 MB se kam hona chahiye.")

    try:
        # Gnani STT call karo (memory se direct bytes pass karo)
        result = speech_to_text(
            audio_bytes=audio_bytes,
            filename="audio.wav",
            model="prisma-v3.0",
            language_code="indic-auto",
        )
    except GnaniError:
        # Safe 502 error — secrets ya raw response print nahi karte
        raise HTTPException(
            status_code=502,
            detail="Gnani STT service se connect nahi ho paaya, thodi der baad try karein.",
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Audio process karne mein koi samasya aayi.",
        )

    # Transcript nikaalo
    raw_transcript = result.get("transcript", "")
    transcript = raw_transcript.strip() if isinstance(raw_transcript, str) else ""

    # Agar transcript khali hai toh 422 return karo
    if not transcript:
        raise HTTPException(status_code=422, detail="Awaaz samajh nahi aayi, dobara bolein.")

    # detected_language_code check karo agar present hai
    detected_lang = result.get("detected_language_code", None)

    return {
        "transcript": transcript,
        "language": detected_lang,
    }


# ──────────────────────────────────────────
# Static files mount — frontend/ folder serve karo
# "/" par mount karo taaki index.html seedha khule
# ──────────────────────────────────────────

_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"

app.mount(
    "/",
    StaticFiles(directory=str(_frontend_dir), html=True),
    name="frontend",
)

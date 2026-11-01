"""
gnani_client.py — Gnani.ai ke TTS aur STT APIs se baat karta hai.
Sirf verified endpoints use ho rahe hain — kuch bhi nahi badla.
"""

import requests
from app.config import GNANI_API_KEY, GNANI_BASE_URL


# --- Custom error class ---
class GnaniError(Exception):
    """Jab API se 200 nahi aata toh ye error uthao."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"GnaniError {status_code}: {message}")


# --- Text to Speech ---
def text_to_speech(
    text: str,
    voice: str = "Nalini",
    language: str = "hi-IN",
) -> bytes:
    """
    Text ko WAV audio mein badalta hai.
    text     : Jo bolna hai (Hindi mein)
    voice    : Kaun bole (default: Nalini)
    language : Kaunsi bhasha (default: hi-IN)
    Returns  : WAV audio bytes
    """
    url = f"{GNANI_BASE_URL}/api/v1/tts/inference"

    headers = {
        "X-API-Key-ID": GNANI_API_KEY,   # Key header mein, body mein nahi
        "Content-Type": "application/json",
    }

    body = {
        "text": text,
        "voice": voice,
        "model": "timbre-v2.5",          # Verified model name — mat badlna
        "language": language,
        "speed": 1.0,
        "audio_config": {
            "sample_rate": 48000,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }

    # 60 second timeout — slow network ke liye
    response = requests.post(url, headers=headers, json=body, timeout=60)

    if response.status_code != 200:
        raise GnaniError(response.status_code, response.text)

    return response.content  # Binary WAV data


# --- Speech to Text ---
def speech_to_text(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    model: str = "prisma-v3.0",
    language_code: str = "indic-auto",
) -> dict:
    """
    WAV audio ko text mein badalta hai.
    audio_bytes   : WAV file ke bytes
    filename      : File ka naam (multipart ke liye)
    model         : STT model (default: prisma-v3.0)
    language_code : Bhasha detect karna (default: indic-auto)
    Returns       : {"transcript": "...", ...}
    """
    url = f"{GNANI_BASE_URL}/stt/v3"

    headers = {
        "X-API-Key-ID": GNANI_API_KEY,   # Sirf header mein key — log mein print mat karna
    }

    # Multipart form data — file + extra fields
    files = {
        "audio_file": (filename, audio_bytes, "audio/wav"),
    }
    data = {
        "model": model,
        "language_code": language_code,
    }

    response = requests.post(
        url, headers=headers, files=files, data=data, timeout=60
    )

    if response.status_code != 200:
        raise GnaniError(response.status_code, response.text)

    return response.json()  # {"transcript": "...", ...}

"""
config.py — .env file se API key aur base URL load karta hai.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# backend/ folder mein .env file dhundo — chahe kahin se bhi run karo
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# API key environment se uthao
GNANI_API_KEY: str = os.getenv("GNANI_API_KEY", "")
GNANI_BASE_URL: str = os.getenv("GNANI_BASE_URL", "https://api.vachana.ai")

# Agar key nahi mili toh clearly batao — production mein ye crash karna better hai
if not GNANI_API_KEY:
    raise EnvironmentError(
        "GNANI_API_KEY environment variable set nahi hai. "
        "Apni .env file mein GNANI_API_KEY=your_key_here add karo."
    )

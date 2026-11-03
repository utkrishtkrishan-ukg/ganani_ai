
from app.gnani_client import text_to_speech, speech_to_text


test_sentence = "नमस्ते, मैं कैंपस साथी हूँ। आपकी कैसे मदद करूँ?"
print("TTS chal raha hai...")

audio_bytes = text_to_speech(test_sentence)

# WAV file save karo
output_file = "output.wav"
with open(output_file, "wb") as f:
    f.write(audio_bytes)

print(f"Audio saved: {output_file}  ({len(audio_bytes)} bytes)")

# --- Step 2: Wohi audio wapas text mein badlo ---
print("STT chal raha hai...")

result = speech_to_text(audio_bytes, filename=output_file)

transcript = result.get("transcript", "(transcript nahi mila)")
# Windows terminal Hindi print karne ke liye encoding fix
print(f"Transcript: {transcript}".encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
# Safe fallback — file mein bhi likh do
with open("transcript.txt", "w", encoding="utf-8") as f:
    f.write(transcript)
print("(Transcript transcript.txt mein bhi save hua)")

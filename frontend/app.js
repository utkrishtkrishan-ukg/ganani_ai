// =====================================================
// CampusSathi — app.js
// Vanilla JS: Chat + Voice recording & transcription
// =====================================================

// ---- DOM elements pakdo ----
const chatMessages    = document.getElementById('chatMessages');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const micBtn          = document.getElementById('micBtn');
const newChatBtn      = document.getElementById('newChatBtn');
const chipsSection    = document.getElementById('chipsSection');
const chips           = document.querySelectorAll('.chip');

// Voice UI elements
const voiceBar        = document.getElementById('voiceBar');
const voiceDot        = document.getElementById('voiceDot');
const voiceStatusText = document.getElementById('voiceStatusText');
const voiceTimer      = document.getElementById('voiceTimer');
const voiceLangBadge  = document.getElementById('voiceLangBadge');

// ---- Chat history array ----
let chatHistory = [];

// ---- Voice recording state variables ----
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordingStartTime = 0;
let recordTimerInterval = null;
let maxDurationTimeout = null;
let isRecording = false;

// =====================================================
// encodeWav(audioBuffer) — 16-bit PCM Mono WAV Encoder
// Browser ke OfflineAudioContext resampled buffer ko
// standard 44-byte WAV header ke sath binary Blob banata hai.
// =====================================================
function encodeWav(audioBuffer) {
  // Mono channel audio samples (Float32Array between -1.0 and 1.0)
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate; // 16000 Hz
  const numSamples = channelData.length;
  const bytesPerSample = 2; // 16-bit PCM = 2 bytes
  const blockAlign = 1 * bytesPerSample; // 1 channel * 2 bytes = 2
  const byteRate = sampleRate * blockAlign; // 16000 * 2 = 32000 bytes/sec
  const dataSize = numSamples * bytesPerSample;

  // 44 bytes header + raw audio data
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // String ko ASCII codes mein DataView par likho
  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // --- 44-byte standard RIFF/WAVE header ---
  writeString(0, 'RIFF');                     // ChunkID
  view.setUint32(4, 36 + dataSize, true);     // ChunkSize (Total file size - 8)
  writeString(8, 'WAVE');                     // Format
  writeString(12, 'fmt ');                    // Subchunk1ID
  view.setUint32(16, 16, true);               // Subchunk1Size (16 bytes for PCM)
  view.setUint16(20, 1, true);                // AudioFormat (1 = PCM linear)
  view.setUint16(22, 1, true);                // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);       // SampleRate (16000)
  view.setUint32(28, byteRate, true);         // ByteRate
  view.setUint16(32, blockAlign, true);       // BlockAlign
  view.setUint16(34, 16, true);               // BitsPerSample (16 bits)
  writeString(36, 'data');                    // Subchunk2ID
  view.setUint32(40, dataSize, true);         // Subchunk2Size (Audio data byte length)

  // Float32 [-1.0, 1.0] ko 16-bit signed PCM integers [-32768, 32767] mein convert karo
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, channelData[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// =====================================================
// convertBlobTo16kHzWav(blob)
// Recorded webm/ogg audio ko 16 kHz, Mono, 16-bit WAV mein convert karta hai
// =====================================================
async function convertBlobTo16kHzWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();

  // Browser AudioContext se decode karo
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // 16000 Hz Mono par resample karne ke liye OfflineAudioContext banao
  const targetSampleRate = 16000;
  const targetChannels = 1;
  const totalFrames = Math.max(1, Math.ceil(decodedBuffer.duration * targetSampleRate));

  const offlineCtx = new OfflineAudioContext(targetChannels, totalFrames, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  // Resampled mono buffer render karo
  const resampledBuffer = await offlineCtx.startRendering();

  // Primary audio context ko close karo
  if (audioCtx.state !== 'closed') {
    await audioCtx.close();
  }

  // Ab WAV file binary format mein encode karo
  return encodeWav(resampledBuffer);
}

// =====================================================
// cleanupRecordingStream() — Mic tracks band karo
// Browser ka mic recording indicator turant off karne ke liye
// =====================================================
function cleanupRecordingStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

// =====================================================
// startRecording() — Mic permission lo aur record shuru karo
// =====================================================
async function startRecording() {
  try {
    // Microphone access request karo
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    // Friendly Hinglish error messages
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      addMessage('Microphone permission nahi mili. Kripya browser settings mein mic allow karein.', 'bot');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      addMessage('Koi microphone device nahi mila. Kripya mic connect karein.', 'bot');
    } else {
      addMessage('Microphone shuru karne mein problem aayi: ' + err.message, 'bot');
    }
    return;
  }

  // MediaRecorder initialize karo
  audioChunks = [];
  try {
    mediaRecorder = new MediaRecorder(mediaStream);
  } catch (e) {
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  // Jab recording stop ho: WAV convert karo aur backend bhejo
  mediaRecorder.onstop = handleRecordingStop;

  // Recording start
  mediaRecorder.start(200); // 200ms slice chunks
  isRecording = true;
  recordingStartTime = Date.now();

  // UI update: pulsing red button aur voice bar dikhao
  micBtn.classList.add('recording');
  micBtn.setAttribute('aria-pressed', 'true');
  micBtn.textContent = '⏹️';
  micBtn.title = 'Recording roko (Stop)';

  voiceBar.style.display = 'flex';
  voiceDot.style.background = 'var(--color-danger)';
  voiceStatusText.textContent = 'Recording ho rahi hai... (Boliye)';
  voiceTimer.style.display = 'inline-block';
  voiceTimer.textContent = '0s / 28s';

  // Seconds counter timer chalao
  clearInterval(recordTimerInterval);
  recordTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    voiceTimer.textContent = `${elapsed}s / 28s`;
  }, 1000);

  // 28 second par automatic stop (Gnani 30s limit ke andar rakhne ke liye)
  clearTimeout(maxDurationTimeout);
  maxDurationTimeout = setTimeout(() => {
    if (isRecording) {
      stopRecording();
    }
  }, 28000);
}

// =====================================================
// stopRecording() — Recording roko
// =====================================================
function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  clearInterval(recordTimerInterval);
  clearTimeout(maxDurationTimeout);

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // Mic tracks band karo taaki indicator turant band ho
  cleanupRecordingStream();

  // Mic button UI reset
  micBtn.classList.remove('recording');
  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.textContent = '🎤';
  micBtn.title = 'Boliye (Mic)';
}

// =====================================================
// handleRecordingStop() — Audio processing & Transcribe API call
// =====================================================
async function handleRecordingStop() {
  const durationMs = Date.now() - recordingStartTime;

  // 1 second se kam recording ko reject karo
  if (durationMs < 1000) {
    voiceBar.style.display = 'none';
    addMessage('Recording bahut chhoti thi (kam se kam 1 second bolein).', 'bot');
    return;
  }

  // Processing state: "Sun raha hoon..." status aur mic disabled
  micBtn.disabled = true;
  voiceBar.style.display = 'flex';
  voiceDot.style.background = 'var(--color-primary)';
  voiceStatusText.textContent = 'Sun raha hoon...';
  voiceTimer.style.display = 'none';

  try {
    // 1. Browser mein recorded blob banao
    const rawBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });

    // 2. 16 kHz Mono 16-bit WAV mein convert karo (manual 44-byte header)
    const wavBlob = await convertBlobTo16kHzWav(rawBlob);

    // 3. /api/transcribe ko multipart FormData ke sath bhejo
    const formData = new FormData();
    formData.append('audio', wavBlob, 'audio.wav');

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let detailMsg = 'Awaaz transcribe nahi ho paayi, kripya dobara try karein.';
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) {
          detailMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch (_) {}
      throw new Error(detailMsg);
    }

    const data = await response.json();
    // data format: { transcript: "...", language: "hi-IN" | null }

    if (data.transcript) {
      // Transcript input field mein dalo (auto-send nahi karte)
      userInput.value = data.transcript;
      userInput.focus();

      // Detected language label show karo
      if (data.language) {
        voiceLangBadge.textContent = `Bhasha: ${data.language}`;
        voiceLangBadge.style.display = 'inline-block';
      } else {
        voiceLangBadge.style.display = 'none';
      }

      voiceStatusText.textContent = 'Awaaz pehchaan li! Review karein aur Send dabayein.';
      // 4 second baad voice bar hide karo
      setTimeout(() => {
        if (!isRecording) voiceBar.style.display = 'none';
      }, 4000);
    } else {
      addMessage('Awaaz samajh nahi aayi, dobara bolein.', 'bot');
      voiceBar.style.display = 'none';
    }

  } catch (err) {
    voiceBar.style.display = 'none';
    addMessage(err.message || 'Server se connect nahi ho paaya.', 'bot');
  } finally {
    micBtn.disabled = false;
  }
}

// =====================================================
// Mic button click handler — toggle recording
// =====================================================
micBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// =====================================================
// getReply(userText) — Backend se real jawab lao
// =====================================================
async function getReply(userText) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userText }),
  });

  if (!response.ok) {
    let detail = 'Server error';
    try {
      const errData = await response.json();
      if (Array.isArray(errData.detail)) {
        detail = errData.detail.map((e) => e.msg).join(', ');
      } else {
        detail = errData.detail || detail;
      }
    } catch (_) {}
    throw new Error(`${response.status}: ${detail}`);
  }

  const data = await response.json();
  return { answer: data.answer, sources: data.sources || [] };
}

// =====================================================
// addMessage(text, sender, sources) — bubble banao aur add karo
// =====================================================
function addMessage(text, sender, sources = []) {
  chipsSection.style.display = 'none';
  chatHistory.push({ text, sender });

  const msgDiv = document.createElement('div');
  msgDiv.classList.add('msg', `msg--${sender}`);

  const bubble = document.createElement('div');
  bubble.classList.add('msg__bubble');
  bubble.textContent = text;
  msgDiv.appendChild(bubble);

  if (sender === 'bot') {
    const meta = document.createElement('div');
    meta.classList.add('msg__meta');

    const listenBtn = document.createElement('button');
    listenBtn.classList.add('btn--listen');
    listenBtn.textContent = '🔊 Listen';
    listenBtn.setAttribute('aria-label', 'Is jawab ko suno');
    listenBtn.addEventListener('click', () => {
      alert('Coming soon! Yahan Gnani TTS se audio chalega.');
    });

    const sourcesSpan = document.createElement('span');
    if (sources.length > 0) {
      sourcesSpan.textContent = '· Sources: ' + sources.join(', ');
    } else {
      sourcesSpan.style.display = 'none';
    }

    meta.appendChild(listenBtn);
    meta.appendChild(sourcesSpan);
    msgDiv.appendChild(meta);
  }

  chatMessages.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv;
}

// =====================================================
// showTyping() & hideTyping()
// =====================================================
function showTyping() {
  const indicator = document.createElement('div');
  indicator.classList.add('typing-indicator');
  indicator.id = 'typingIndicator';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.classList.add('typing-dot');
    indicator.appendChild(dot);
  }

  chatMessages.appendChild(indicator);
  scrollToBottom();
  return indicator;
}

function hideTyping() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// =====================================================
// handleSend() — user message bhejo
// =====================================================
async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  sendBtn.disabled = true;

  addMessage(text, 'user');
  showTyping();

  try {
    const { answer, sources } = await getReply(text);
    hideTyping();
    addMessage(answer, 'bot', sources);
  } catch (err) {
    hideTyping();
    const isNetworkErr = err instanceof TypeError;
    const errMsg = isNetworkErr
      ? 'Server se connect nahi ho paaya, thodi der baad try karein. 🙏'
      : `Kuch gadbad ho gayi: ${err.message}`;
    addMessage(errMsg, 'bot');
  }

  sendBtn.disabled = false;
  userInput.focus();
}

// =====================================================
// handleNewChat() — chat clear karo
// =====================================================
function handleNewChat() {
  chatHistory = [];
  chatMessages.innerHTML = '';
  chipsSection.style.display = '';
  userInput.value = '';
  voiceBar.style.display = 'none';
  voiceLangBadge.style.display = 'none';
  if (isRecording) {
    stopRecording();
  }
  userInput.focus();
}

sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    userInput.value = chip.dataset.text;
    handleSend();
  });
});

newChatBtn.addEventListener('click', handleNewChat);

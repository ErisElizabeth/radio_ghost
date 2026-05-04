const recordBtn = document.querySelector("#recordBtn");
const importBtn = document.querySelector("#importBtn");
const fileInput = document.querySelector("#fileInput");
const stopBtn = document.querySelector("#stopBtn");
const playBtn = document.querySelector("#playBtn");
const exportWavBtn = document.querySelector("#exportWavBtn");
const exportMp3Btn = document.querySelector("#exportMp3Btn");
const player = document.querySelector("#player");
const statusText = document.querySelector("#status");
const timer = document.querySelector("#timer");
const canvas = document.querySelector("#meter");
const canvasContext = canvas.getContext("2d");

let mediaRecorder;
let audioChunks = [];
let currentBlob;
let currentFileName = "radio-ghost";
let recordingStartedAt = 0;
let timerFrame;
let audioContext;
let analyser;
let meterFrame;
let sourceNode;
let inputStream;
let currentObjectUrl;
let activeRecordingMimeType = "";

function setStatus(message) {
  statusText.textContent = message;
}

function setPlayerBlob(blob, fileName = "radio-ghost") {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentBlob = blob;
  currentFileName = fileName.replace(/\.[^/.]+$/, "") || "radio-ghost";
  currentObjectUrl = URL.createObjectURL(blob);
  player.src = currentObjectUrl;
  player.load();
  playBtn.disabled = false;
  exportWavBtn.disabled = false;
  exportMp3Btn.disabled = false;
}

function setExportDisabled(isDisabled) {
  exportWavBtn.disabled = isDisabled;
  exportMp3Btn.disabled = isDisabled;
}

function formatDuration(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function updateTimer() {
  timer.textContent = formatDuration(Date.now() - recordingStartedAt);
  timerFrame = requestAnimationFrame(updateTimer);
}

function drawIdleMeter() {
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  canvasContext.fillStyle = "#09090d";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  canvasContext.strokeStyle = "rgba(242, 237, 247, 0.14)";
  canvasContext.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 38) {
    canvasContext.beginPath();
    canvasContext.moveTo(x, 0);
    canvasContext.lineTo(x, canvas.height);
    canvasContext.stroke();
  }
}

function drawMeter() {
  if (!analyser) {
    drawIdleMeter();
    return;
  }

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);

  canvasContext.fillStyle = "#09090d";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  canvasContext.lineWidth = 3;
  canvasContext.strokeStyle = "#68d6c8";
  canvasContext.beginPath();

  const sliceWidth = canvas.width / data.length;
  let x = 0;

  data.forEach((value, index) => {
    const y = (value / 255) * canvas.height;
    if (index === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }
    x += sliceWidth;
  });

  canvasContext.stroke();
  meterFrame = requestAnimationFrame(drawMeter);
}

function getSupportedMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/wav"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function audioBufferToWavBytes(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_value, index) =>
    audioBuffer.getChannelData(index)
  );

  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex]));
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, pcmValue, true);
      offset += bytesPerSample;
    }
  }

  return new Uint8Array(buffer);
}

function audioBufferToMp3Bytes(audioBuffer) {
  const channelCount = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const bitRate = 128;
  const encoder = new lamejs.Mp3Encoder(channelCount, sampleRate, bitRate);
  const samplesPerFrame = 1152;
  const mp3Chunks = [];
  const channels = Array.from({ length: channelCount }, (_value, index) =>
    audioBuffer.getChannelData(index)
  ).map((channel) => {
    const pcm = new Int16Array(channel.length);

    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index]));
      pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm;
  });

  for (let start = 0; start < audioBuffer.length; start += samplesPerFrame) {
    const left = channels[0].subarray(start, start + samplesPerFrame);
    const chunk =
      channelCount === 2
        ? encoder.encodeBuffer(left, channels[1].subarray(start, start + samplesPerFrame))
        : encoder.encodeBuffer(left);

    if (chunk.length > 0) {
      mp3Chunks.push(chunk);
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) {
    mp3Chunks.push(finalChunk);
  }

  const totalLength = mp3Chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  mp3Chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });

  return bytes;
}

async function blobToAudioBuffer(blob) {
  const encodedBuffer = await blob.arrayBuffer();
  const decoder = new AudioContext();

  try {
    return await decoder.decodeAudioData(encodedBuffer.slice(0));
  } finally {
    await decoder.close();
  }
}

function downloadBytes(bytes, extension, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${currentFileName || "radio-ghost"}-export.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function startRecording() {
  inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedMimeType();
  activeRecordingMimeType = mimeType || "audio/webm";

  audioChunks = [];
  currentBlob = null;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  player.removeAttribute("src");
  player.load();

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode = audioContext.createMediaStreamSource(inputStream);
  sourceNode.connect(analyser);

  mediaRecorder = new MediaRecorder(inputStream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener("stop", finalizeRecording);
  mediaRecorder.addEventListener("error", (event) => {
    setStatus(`Recording error: ${event.error?.message || "Unknown recorder error"}`);
    resetRecordingControls();
  });

  mediaRecorder.start(250);
  recordingStartedAt = Date.now();
  recordBtn.disabled = true;
  importBtn.disabled = true;
  stopBtn.disabled = false;
  playBtn.disabled = true;
  setExportDisabled(true);
  setStatus("Recording...");
  updateTimer();
  drawMeter();
}

function resetRecordingControls() {
  cancelAnimationFrame(timerFrame);
  cancelAnimationFrame(meterFrame);
  recordBtn.disabled = false;
  importBtn.disabled = false;
  stopBtn.disabled = true;

  if (inputStream) {
    inputStream.getTracks().forEach((track) => track.stop());
  }

  if (sourceNode) {
    sourceNode.disconnect();
  }

  if (audioContext) {
    audioContext.close();
  }

  analyser = null;
  inputStream = null;
  sourceNode = null;
  audioContext = null;
  drawIdleMeter();
}

function finalizeRecording() {
  timer.textContent = formatDuration(Date.now() - recordingStartedAt);
  resetRecordingControls();

  if (audioChunks.length > 0) {
    const blob = new Blob(audioChunks, { type: activeRecordingMimeType });
    setPlayerBlob(blob, "radio-ghost-recording");
    setStatus("Recording ready");
  } else {
    setStatus("Recording stopped, but no audio was captured");
  }
}

function importAudio() {
  if (!fileInput) {
    setStatus("Import needs the updated index.html file");
    return;
  }

  fileInput.value = "";
  fileInput.click();
}

function handleImportedFile() {
  if (!fileInput) {
    return;
  }

  const file = fileInput.files[0];
  if (!file) {
    return;
  }

  setPlayerBlob(file, file.name);
  timer.textContent = "00:00.0";
  setStatus(`Imported ${file.name}`);
}

function stopRecording() {
  setStatus("Stop clicked");

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    stopBtn.disabled = true;
    recordBtn.disabled = false;
    importBtn.disabled = false;
    setStatus("No active recording to stop");
    return;
  }

  stopBtn.disabled = true;
  setStatus("Stopping recording...");

  try {
    mediaRecorder.requestData();
  } catch (_error) {
    // Some browsers do not allow requestData during shutdown; stop still finalizes.
  }

  mediaRecorder.stop();
}

async function exportAudio(extension) {
  if (!currentBlob) {
    return;
  }

  setExportDisabled(true);
  setStatus(`Preparing ${extension.toUpperCase()} export...`);

  try {
    const audioBuffer = await blobToAudioBuffer(currentBlob);
    const bytes =
      extension === "mp3" ? audioBufferToMp3Bytes(audioBuffer) : audioBufferToWavBytes(audioBuffer);
    const mimeType = extension === "mp3" ? "audio/mpeg" : "audio/wav";

    downloadBytes(bytes, extension, mimeType);
    setStatus(`Downloaded ${extension.toUpperCase()} export`);
  } catch (error) {
    setStatus(`${extension.toUpperCase()} export failed: ${error.message}`);
  } finally {
    setExportDisabled(false);
  }
}

recordBtn.addEventListener("click", async () => {
  try {
    await startRecording();
  } catch (error) {
    setStatus(`Microphone error: ${error.message}`);
    recordBtn.disabled = false;
    importBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

importBtn.addEventListener("click", importAudio);
stopBtn.addEventListener("click", stopRecording);
stopBtn.onclick = stopRecording;
playBtn.addEventListener("click", () => player.play());
exportWavBtn.addEventListener("click", () => exportAudio("wav"));
exportMp3Btn.addEventListener("click", () => exportAudio("mp3"));

if (fileInput) {
  fileInput.addEventListener("change", handleImportedFile);
} else {
  setStatus("Ready to record. Upload the updated index.html to enable Import.");
}

drawIdleMeter();

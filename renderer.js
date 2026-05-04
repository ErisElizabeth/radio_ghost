const ui = {
  importCommand: document.querySelector("#importCommand"),
  exportMenuItem: document.querySelector("#exportMenuItem"),
  exportWavCommand: document.querySelector("#exportWavCommand"),
  exportMp3Command: document.querySelector("#exportMp3Command"),
  feminizeCommand: document.querySelector("#feminizeCommand"),
  recordButton: document.querySelector("#recordButton"),
  stopButton: document.querySelector("#stopButton"),
  playButton: document.querySelector("#playButton"),
  fileInput: document.querySelector("#fileInput"),
  player: document.querySelector("#audioPlayer"),
  status: document.querySelector("#status"),
  timer: document.querySelector("#timer"),
  meter: document.querySelector("#meter")
};

const meterContext = ui.meter.getContext("2d");

const state = {
  recorder: null,
  chunks: [],
  blob: null,
  fileName: "radio-ghost",
  objectUrl: null,
  startedAt: 0,
  timerFrame: null,
  meterFrame: null,
  audioContext: null,
  analyser: null,
  sourceNode: null,
  inputStream: null,
  recordingMimeType: "audio/webm"
};

let exportMenuCloseTimer = null;

function setStatus(message) {
  ui.status.textContent = message;
}

function setExportReady(isReady) {
  ui.exportWavCommand.disabled = !isReady;
  ui.exportMp3Command.disabled = !isReady;
}

function setVoiceReady(isReady) {
  ui.feminizeCommand.disabled = !isReady;
}

function setRecordingControls(isRecording) {
  ui.recordButton.disabled = isRecording;
  ui.importCommand.disabled = isRecording;
  ui.stopButton.disabled = !isRecording && ui.player.paused;
  ui.playButton.disabled = isRecording || !state.blob;
  ui.recordButton.classList.toggle("is-recording", isRecording);
  setExportReady(!isRecording && Boolean(state.blob));
  setVoiceReady(!isRecording && Boolean(state.blob));
}

function setCurrentBlob(blob, fileName) {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.blob = blob;
  state.fileName = fileName.replace(/\.[^/.]+$/, "") || "radio-ghost";
  state.objectUrl = URL.createObjectURL(blob);

  ui.player.src = state.objectUrl;
  ui.player.load();
  ui.playButton.disabled = false;
  setExportReady(true);
  setVoiceReady(true);
}

function formatDuration(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function updateTimer() {
  ui.timer.textContent = formatDuration(Date.now() - state.startedAt);
  state.timerFrame = requestAnimationFrame(updateTimer);
}

function drawIdleMeter() {
  meterContext.clearRect(0, 0, ui.meter.width, ui.meter.height);
  meterContext.fillStyle = "#09090d";
  meterContext.fillRect(0, 0, ui.meter.width, ui.meter.height);
  meterContext.strokeStyle = "rgba(242, 237, 247, 0.14)";
  meterContext.lineWidth = 1;

  for (let x = 0; x < ui.meter.width; x += 38) {
    meterContext.beginPath();
    meterContext.moveTo(x, 0);
    meterContext.lineTo(x, ui.meter.height);
    meterContext.stroke();
  }
}

function drawLiveMeter() {
  if (!state.analyser) {
    drawIdleMeter();
    return;
  }

  const data = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteTimeDomainData(data);

  meterContext.fillStyle = "#09090d";
  meterContext.fillRect(0, 0, ui.meter.width, ui.meter.height);
  meterContext.lineWidth = 3;
  meterContext.strokeStyle = "#68d6c8";
  meterContext.beginPath();

  const sliceWidth = ui.meter.width / data.length;
  let x = 0;

  data.forEach((value, index) => {
    const y = (value / 255) * ui.meter.height;
    if (index === 0) {
      meterContext.moveTo(x, y);
    } else {
      meterContext.lineTo(x, y);
    }
    x += sliceWidth;
  });

  meterContext.stroke();
  state.meterFrame = requestAnimationFrame(drawLiveMeter);
}

function getRecordingMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/wav"];
  return options.find((option) => MediaRecorder.isTypeSupported(option)) || "";
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
  const chunks = [];
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
      chunks.push(chunk);
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) {
    chunks.push(finalChunk);
  }

  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });

  return bytes;
}

async function blobToAudioBuffer(blob) {
  const encodedBuffer = await blob.arrayBuffer();
  const context = new AudioContext();

  try {
    return await context.decodeAudioData(encodedBuffer.slice(0));
  } finally {
    await context.close();
  }
}

async function renderFeminineVoicePass(audioBuffer) {
  const context = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const source = context.createBufferSource();
  const highPass = context.createBiquadFilter();
  const lowShelf = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const air = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();

  source.buffer = audioBuffer;

  highPass.type = "highpass";
  highPass.frequency.value = 120;
  highPass.Q.value = 0.7;

  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 220;
  lowShelf.gain.value = -3;

  presence.type = "peaking";
  presence.frequency.value = 2600;
  presence.Q.value = 0.85;
  presence.gain.value = 3;

  air.type = "highshelf";
  air.frequency.value = 6200;
  air.gain.value = 4;

  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;

  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(presence)
    .connect(air)
    .connect(compressor)
    .connect(context.destination);
  source.start();

  return context.startRendering();
}

function downloadBytes(bytes, extension, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${state.fileName}-export.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function cleanupRecording() {
  cancelAnimationFrame(state.timerFrame);
  cancelAnimationFrame(state.meterFrame);

  if (state.inputStream) {
    state.inputStream.getTracks().forEach((track) => track.stop());
  }

  if (state.sourceNode) {
    state.sourceNode.disconnect();
  }

  if (state.audioContext) {
    state.audioContext.close();
  }

  state.inputStream = null;
  state.sourceNode = null;
  state.audioContext = null;
  state.analyser = null;
  drawIdleMeter();
}

function finishRecording() {
  ui.timer.textContent = formatDuration(Date.now() - state.startedAt);
  cleanupRecording();

  if (state.chunks.length === 0) {
    setStatus("Recording stopped, but no audio was captured");
    setRecordingControls(false);
    return;
  }

  const blob = new Blob(state.chunks, { type: state.recordingMimeType });
  setCurrentBlob(blob, "radio-ghost-recording");
  setStatus("Recording ready");
  setRecordingControls(false);
}

async function startRecording() {
  state.inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getRecordingMimeType();

  state.chunks = [];
  state.blob = null;
  state.recordingMimeType = mimeType || "audio/webm";

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  ui.player.removeAttribute("src");
  ui.player.load();

  state.audioContext = new AudioContext();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 2048;
  state.sourceNode = state.audioContext.createMediaStreamSource(state.inputStream);
  state.sourceNode.connect(state.analyser);

  state.recorder = new MediaRecorder(state.inputStream, mimeType ? { mimeType } : undefined);
  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      state.chunks.push(event.data);
    }
  });
  state.recorder.addEventListener("stop", finishRecording);
  state.recorder.addEventListener("error", (event) => {
    setStatus(`Recording error: ${event.error?.message || "Unknown recorder error"}`);
    cleanupRecording();
    setRecordingControls(false);
  });

  state.recorder.start(250);
  state.startedAt = Date.now();
  setRecordingControls(true);
  setStatus("Recording...");
  updateTimer();
  drawLiveMeter();
}

function stopRecording() {
  if (!state.recorder || state.recorder.state === "inactive") {
    stopPlayback();
    return;
  }

  ui.stopButton.disabled = true;
  setStatus("Stopping recording...");

  try {
    state.recorder.requestData();
  } catch (_error) {
    // Some browsers do not allow requestData while stopping.
  }

  state.recorder.stop();
}

function stopPlayback() {
  if (ui.player.paused) {
    setStatus("No active playback to stop");
    setRecordingControls(false);
    return;
  }

  ui.player.pause();
  ui.player.currentTime = 0;
  ui.playButton.classList.remove("is-playing");
  ui.stopButton.disabled = true;
  setStatus("Playback stopped");
}

function importAudio() {
  ui.fileInput.value = "";
  ui.fileInput.click();
}

function handleFileImport() {
  const file = ui.fileInput.files[0];
  if (!file) {
    return;
  }

  setCurrentBlob(file, file.name);
  ui.timer.textContent = "00:00.0";
  setStatus(`Imported ${file.name}`);
}

async function exportAudio(extension) {
  if (!state.blob) {
    return;
  }

  setExportReady(false);
  setStatus(`Preparing ${extension.toUpperCase()} export...`);

  try {
    const audioBuffer = await blobToAudioBuffer(state.blob);
    const bytes =
      extension === "mp3" ? audioBufferToMp3Bytes(audioBuffer) : audioBufferToWavBytes(audioBuffer);
    const mimeType = extension === "mp3" ? "audio/mpeg" : "audio/wav";

    downloadBytes(bytes, extension, mimeType);
    setStatus(`Downloaded ${extension.toUpperCase()} export`);
  } catch (error) {
    setStatus(`${extension.toUpperCase()} export failed: ${error.message}`);
  } finally {
    setExportReady(Boolean(state.blob));
  }
}

async function feminizeVoice() {
  if (!state.blob) {
    return;
  }

  setExportReady(false);
  setVoiceReady(false);
  ui.recordButton.disabled = true;
  ui.importCommand.disabled = true;
  ui.playButton.disabled = true;
  setStatus("Applying feminine voice pass...");

  try {
    const audioBuffer = await blobToAudioBuffer(state.blob);
    const processedBuffer = await renderFeminineVoicePass(audioBuffer);
    const wavBytes = audioBufferToWavBytes(processedBuffer);
    const processedBlob = new Blob([wavBytes], { type: "audio/wav" });

    setCurrentBlob(processedBlob, `${state.fileName}-feminine-pass`);
    setStatus("Feminine voice pass ready");
  } catch (error) {
    setStatus(`Feminine voice pass failed: ${error.message}`);
  } finally {
    ui.recordButton.disabled = false;
    ui.importCommand.disabled = false;
    ui.playButton.disabled = !state.blob;
    setExportReady(Boolean(state.blob));
    setVoiceReady(Boolean(state.blob));
  }
}

function wireEvents() {
  ui.importCommand.addEventListener("click", importAudio);
  ui.exportWavCommand.addEventListener("click", () => exportAudio("wav"));
  ui.exportMp3Command.addEventListener("click", () => exportAudio("mp3"));
  ui.feminizeCommand.addEventListener("click", feminizeVoice);
  ui.fileInput.addEventListener("change", handleFileImport);
  ui.exportMenuItem.addEventListener("mouseenter", () => {
    clearTimeout(exportMenuCloseTimer);
    ui.exportMenuItem.classList.add("is-open");
  });
  ui.exportMenuItem.addEventListener("mouseleave", () => {
    exportMenuCloseTimer = setTimeout(() => {
      ui.exportMenuItem.classList.remove("is-open");
    }, 1500);
  });

  ui.recordButton.addEventListener("click", async () => {
    try {
      await startRecording();
    } catch (error) {
      setStatus(`Microphone error: ${error.message}`);
      cleanupRecording();
      setRecordingControls(false);
    }
  });

  ui.stopButton.addEventListener("click", stopRecording);
  ui.playButton.addEventListener("click", () => ui.player.play());
  ui.player.addEventListener("play", () => {
    ui.playButton.classList.add("is-playing");
    ui.stopButton.disabled = false;
  });
  ui.player.addEventListener("pause", () => {
    ui.playButton.classList.remove("is-playing");
    if (!state.recorder || state.recorder.state === "inactive") {
      ui.stopButton.disabled = true;
    }
  });
  ui.player.addEventListener("ended", () => {
    ui.playButton.classList.remove("is-playing");
    ui.stopButton.disabled = true;
  });
}

function boot() {
  setRecordingControls(false);
  drawIdleMeter();
  wireEvents();
}

boot();

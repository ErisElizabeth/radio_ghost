const ui = {
  importCommand: document.querySelector("#importCommand"),
  exportMenuItem: document.querySelector("#exportMenuItem"),
  exportWavCommand: document.querySelector("#exportWavCommand"),
  exportMp3Command: document.querySelector("#exportMp3Command"),
  cleanLowsCommand: document.querySelector("#cleanLowsCommand"),
  brightenCommand: document.querySelector("#brightenCommand"),
  airCommand: document.querySelector("#airCommand"),
  compressCommand: document.querySelector("#compressCommand"),
  pitchToFemaleFloorCommand: document.querySelector("#pitchToFemaleFloorCommand"),
  analyzeCommand: document.querySelector("#analyzeCommand"),
  recordButton: document.querySelector("#recordButton"),
  stopButton: document.querySelector("#stopButton"),
  playButton: document.querySelector("#playButton"),
  fileInput: document.querySelector("#fileInput"),
  player: document.querySelector("#audioPlayer"),
  status: document.querySelector("#status"),
  timer: document.querySelector("#timer"),
  meter: document.querySelector("#meter"),
  analysisPanel: document.querySelector("#analysisPanel"),
  peakAmplitude: document.querySelector("#peakAmplitude"),
  rmsAmplitude: document.querySelector("#rmsAmplitude"),
  pitchValue: document.querySelector("#pitchValue"),
  wavelengthValue: document.querySelector("#wavelengthValue"),
  vowelDurationValue: document.querySelector("#vowelDurationValue"),
  pitchRangeValue: document.querySelector("#pitchRangeValue")
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
  ui.cleanLowsCommand.disabled = !isReady;
  ui.brightenCommand.disabled = !isReady;
  ui.airCommand.disabled = !isReady;
  ui.compressCommand.disabled = !isReady;
  ui.pitchToFemaleFloorCommand.disabled = !isReady;
  ui.analyzeCommand.disabled = !isReady;
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
  ui.analysisPanel.hidden = true;
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

function connectNodesInOrder(nodes, destination) {
  for (let index = 0; index < nodes.length - 1; index += 1) {
    nodes[index].connect(nodes[index + 1]);
  }

  nodes[nodes.length - 1].connect(destination);
}

async function renderFilterPass(audioBuffer, buildChain) {
  const context = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  const chain = buildChain(context);

  if (chain.length === 0) {
    source.connect(context.destination);
  } else {
    source.connect(chain[0]);
    connectNodesInOrder(chain, context.destination);
  }

  source.start();
  return context.startRendering();
}

async function renderPitchShiftPass(audioBuffer, playbackRate) {
  const renderedLength = Math.max(1, Math.ceil(audioBuffer.length / playbackRate));
  const context = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    renderedLength,
    audioBuffer.sampleRate
  );
  const source = context.createBufferSource();

  source.buffer = audioBuffer;
  source.playbackRate.value = playbackRate;
  source.connect(context.destination);
  source.start();

  return context.startRendering();
}

function buildCleanLowsPass(context) {
  const highPass = context.createBiquadFilter();
  const lowShelf = context.createBiquadFilter();

  highPass.type = "highpass";
  highPass.frequency.value = 120;
  highPass.Q.value = 0.7;

  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 220;
  lowShelf.gain.value = -3;

  return [highPass, lowShelf];
}

function buildBrightenPass(context) {
  const presence = context.createBiquadFilter();

  presence.type = "peaking";
  presence.frequency.value = 2600;
  presence.Q.value = 0.85;
  presence.gain.value = 3;

  return [presence];
}

function buildAirPass(context) {
  const air = context.createBiquadFilter();

  air.type = "highshelf";
  air.frequency.value = 6200;
  air.gain.value = 4;

  return [air];
}

function buildCompressionPass(context) {
  const compressor = context.createDynamicsCompressor();

  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;

  return [compressor];
}

function getAnalysisSamples(audioBuffer) {
  const length = audioBuffer.length;
  const samples = new Float32Array(length);

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
      samples[sampleIndex] += channel[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }

  return samples;
}

function analyzeAmplitude(samples) {
  let peak = 0;
  let sumSquares = 0;

  samples.forEach((sample) => {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
  });

  return {
    peak,
    rms: Math.sqrt(sumSquares / samples.length)
  };
}

function estimatePitch(samples, sampleRate) {
  const minimumFrequency = 70;
  const maximumFrequency = 420;
  const minimumLag = Math.floor(sampleRate / maximumFrequency);
  const maximumLag = Math.floor(sampleRate / minimumFrequency);
  const windowSize = Math.min(samples.length, sampleRate * 2);
  const start = Math.max(0, Math.floor((samples.length - windowSize) / 2));
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;

    for (let index = 0; index < windowSize - lag; index += 1) {
      const first = samples[start + index];
      const second = samples[start + index + lag];
      correlation += first * second;
      energyA += first * first;
      energyB += second * second;
    }

    const normalized = correlation / Math.sqrt(energyA * energyB || 1);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestCorrelation < 0.32 || bestLag === 0) {
    return null;
  }

  return sampleRate / bestLag;
}

function estimateVowelDuration(samples, sampleRate) {
  const frameSize = Math.floor(sampleRate * 0.03);
  const hopSize = Math.floor(sampleRate * 0.015);
  let previousWasVowel = false;
  let segmentFrames = 0;
  const segmentDurations = [];

  for (let start = 0; start + frameSize < samples.length; start += hopSize) {
    let sumSquares = 0;
    let zeroCrossings = 0;

    for (let index = 0; index < frameSize; index += 1) {
      const current = samples[start + index];
      const previous = index > 0 ? samples[start + index - 1] : current;
      sumSquares += current * current;

      if ((current >= 0 && previous < 0) || (current < 0 && previous >= 0)) {
        zeroCrossings += 1;
      }
    }

    const rms = Math.sqrt(sumSquares / frameSize);
    const zeroCrossingRate = zeroCrossings / frameSize;
    const isVowelLike = rms > 0.025 && zeroCrossingRate > 0.015 && zeroCrossingRate < 0.16;

    if (isVowelLike) {
      segmentFrames += 1;
      previousWasVowel = true;
    } else if (previousWasVowel) {
      if (segmentFrames >= 2) {
        segmentDurations.push((segmentFrames * hopSize * 1000) / sampleRate);
      }
      segmentFrames = 0;
      previousWasVowel = false;
    }
  }

  if (segmentFrames >= 2) {
    segmentDurations.push((segmentFrames * hopSize * 1000) / sampleRate);
  }

  if (segmentDurations.length === 0) {
    return null;
  }

  const totalDuration = segmentDurations.reduce((total, duration) => total + duration, 0);
  return {
    averageMs: Math.round(totalDuration / segmentDurations.length),
    count: segmentDurations.length,
    totalMs: Math.round(totalDuration)
  };
}

function formatAmplitude(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPitch(frequency) {
  return frequency ? `${frequency.toFixed(1)} Hz` : "Unclear";
}

function formatWavelength(frequency) {
  if (!frequency) {
    return "Unclear";
  }

  const speedOfSoundMetersPerSecond = 343;
  const meters = speedOfSoundMetersPerSecond / frequency;
  return `${meters.toFixed(2)} m`;
}

function formatVowelDuration(result) {
  return result ? `${result.averageMs} ms avg (${result.count})` : "Unclear";
}

function classifyPitchRange(frequency) {
  if (!frequency) {
    return "Unclear";
  }

  if (frequency >= 165 && frequency <= 180) {
    return "Typically neutral";
  }

  if (frequency >= 85 && frequency < 165) {
    return "Typically male";
  }

  if (frequency > 180 && frequency <= 255) {
    return "Typically female";
  }

  return "Outside typical range";
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

async function applyVoicePass(label, buildChain, fileSuffix) {
  if (!state.blob) {
    return;
  }

  setExportReady(false);
  setVoiceReady(false);
  ui.recordButton.disabled = true;
  ui.importCommand.disabled = true;
  ui.playButton.disabled = true;
  setStatus(`Applying ${label}...`);

  try {
    const audioBuffer = await blobToAudioBuffer(state.blob);
    const processedBuffer = await renderFilterPass(audioBuffer, buildChain);
    const wavBytes = audioBufferToWavBytes(processedBuffer);
    const processedBlob = new Blob([wavBytes], { type: "audio/wav" });

    setCurrentBlob(processedBlob, `${state.fileName}-${fileSuffix}`);
    await updateAnalysisForCurrentClip(`${label} ready`);
  } catch (error) {
    setStatus(`${label} failed: ${error.message}`);
  } finally {
    ui.recordButton.disabled = false;
    ui.importCommand.disabled = false;
    ui.playButton.disabled = !state.blob;
    setExportReady(Boolean(state.blob));
    setVoiceReady(Boolean(state.blob));
  }
}

async function pitchToFemaleFloor() {
  if (!state.blob) {
    return;
  }

  setExportReady(false);
  setVoiceReady(false);
  ui.recordButton.disabled = true;
  ui.importCommand.disabled = true;
  ui.playButton.disabled = true;
  setStatus("Analyzing pitch for 165 Hz pass...");

  try {
    const audioBuffer = await blobToAudioBuffer(state.blob);
    const samples = getAnalysisSamples(audioBuffer);
    const pitch = estimatePitch(samples, audioBuffer.sampleRate);

    if (!pitch) {
      setStatus("Pitch to 165 Hz failed: pitch unclear");
      return;
    }

    if (pitch >= 165 && pitch <= 255) {
      setStatus("Pitch already in typical female range");
      return;
    }

    const playbackRate = 165 / pitch;
    const processedBuffer = await renderPitchShiftPass(audioBuffer, playbackRate);
    const wavBytes = audioBufferToWavBytes(processedBuffer);
    const processedBlob = new Blob([wavBytes], { type: "audio/wav" });

    setCurrentBlob(processedBlob, `${state.fileName}-pitch-165hz`);
    await updateAnalysisForCurrentClip(`Pitch shifted from ${pitch.toFixed(1)} Hz toward 165 Hz`);
  } catch (error) {
    setStatus(`Pitch to 165 Hz failed: ${error.message}`);
  } finally {
    ui.recordButton.disabled = false;
    ui.importCommand.disabled = false;
    ui.playButton.disabled = !state.blob;
    setExportReady(Boolean(state.blob));
    setVoiceReady(Boolean(state.blob));
  }
}

async function updateAnalysisForCurrentClip(successMessage = "Analysis ready") {
  if (!state.blob) {
    return;
  }

  const audioBuffer = await blobToAudioBuffer(state.blob);
  const samples = getAnalysisSamples(audioBuffer);
  const amplitude = analyzeAmplitude(samples);
  const pitch = estimatePitch(samples, audioBuffer.sampleRate);
  const vowelDuration = estimateVowelDuration(samples, audioBuffer.sampleRate);

  ui.peakAmplitude.textContent = formatAmplitude(amplitude.peak);
  ui.rmsAmplitude.textContent = formatAmplitude(amplitude.rms);
  ui.pitchValue.textContent = formatPitch(pitch);
  ui.wavelengthValue.textContent = formatWavelength(pitch);
  ui.vowelDurationValue.textContent = formatVowelDuration(vowelDuration);
  ui.pitchRangeValue.textContent = classifyPitchRange(pitch);
  ui.analysisPanel.hidden = false;
  setStatus(successMessage);
}

async function analyzeVoice() {
  if (!state.blob) {
    return;
  }

  setVoiceReady(false);
  setStatus("Analyzing audio...");

  try {
    await updateAnalysisForCurrentClip("Analysis ready");
  } catch (error) {
    setStatus(`Analysis failed: ${error.message}`);
  } finally {
    setVoiceReady(Boolean(state.blob));
  }
}

function wireEvents() {
  ui.importCommand.addEventListener("click", importAudio);
  ui.exportWavCommand.addEventListener("click", () => exportAudio("wav"));
  ui.exportMp3Command.addEventListener("click", () => exportAudio("mp3"));
  ui.cleanLowsCommand.addEventListener("click", () =>
    applyVoicePass("Clean lows pass", buildCleanLowsPass, "clean-lows")
  );
  ui.brightenCommand.addEventListener("click", () =>
    applyVoicePass("Brighten presence pass", buildBrightenPass, "bright-presence")
  );
  ui.airCommand.addEventListener("click", () => applyVoicePass("Air pass", buildAirPass, "air"));
  ui.compressCommand.addEventListener("click", () =>
    applyVoicePass("Compression pass", buildCompressionPass, "compressed")
  );
  ui.pitchToFemaleFloorCommand.addEventListener("click", pitchToFemaleFloor);
  ui.analyzeCommand.addEventListener("click", analyzeVoice);
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

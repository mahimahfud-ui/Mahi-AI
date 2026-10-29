(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const overlay = $("voiceOverlay");
  const stage = $("voiceStage");
  const status = $("voiceStatus");
  const transcript = $("voiceTranscript");
  const interim = $("voiceInterim");
  const micButton = $("voiceMicButton");
  const endButton = $("voiceEndButton");
  const voiceButton = $("voiceModeButton");
  const fallbackButton = $("voiceBasicFallback");
  if (!overlay || !voiceButton || !micButton || !endButton) return;

  let active = false;
  let connecting = false;
  let micPaused = false;
  let setupComplete = false;
  let socket = null;
  let stream = null;
  let audioContext = null;
  let sourceNode = null;
  let processor = null;
  let silentGain = null;
  let nextPlayTime = 0;
  let playbackSources = new Set();
  let userText = "";
  let assistantText = "";
  let bypassOnce = false;

  function setStatus(message, state) {
    if (status) status.textContent = message || "";
    if (stage) stage.dataset.state = state || "idle";
    micButton.classList.toggle("is-listening", state === "listening");
    micButton.classList.toggle("is-recording", state === "speaking");
    micButton.setAttribute("aria-label", micPaused ? "Resume microphone" : "Pause microphone");
    micButton.title = micPaused ? "Resume microphone" : "Pause microphone";
  }

  function showFallback(show) {
    if (fallbackButton) { fallbackButton.hidden = !show; fallbackButton.style.display = show ? "inline-flex" : "none"; }
  }

  function renderTranscript() {
    if (transcript) transcript.textContent = userText.trim()
      ? "You: " + userText.trim().slice(-900)
      : "Speak naturally. MahiCloud listens continuously and replies in the language you use.";
    if (interim) interim.textContent = assistantText.trim()
      ? "MahiCloud: " + assistantText.trim().slice(-900)
      : "";
  }

  function stopPlayback() {
    for (const node of playbackSources) {
      try { node.stop(0); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    }
    playbackSources.clear();
    if (audioContext) nextPlayTime = audioContext.currentTime;
  }

  function base64Bytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function playPcm(base64) {
    if (!audioContext || audioContext.state === "closed") return;
    const bytes = base64Bytes(base64);
    const count = Math.floor(bytes.byteLength / 2);
    if (!count) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const buffer = audioContext.createBuffer(1, count, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const node = audioContext.createBufferSource();
    node.buffer = buffer;
    node.connect(audioContext.destination);
    if (nextPlayTime < audioContext.currentTime + 0.025) nextPlayTime = audioContext.currentTime + 0.035;
    node.start(nextPlayTime);
    nextPlayTime += buffer.duration;
    playbackSources.add(node);
    node.onended = () => {
      playbackSources.delete(node);
      try { node.disconnect(); } catch (_) {}
      if (active && !playbackSources.size && socket && socket.readyState === WebSocket.OPEN) {
        setStatus("Listening… speak naturally", "listening");
      }
    };
    setStatus("MahiCloud is speaking… you can interrupt at any time", "speaking");
  }

  function encodePcm(samples, sourceRate) {
    const ratio = sourceRate / 16000;
    const count = Math.max(1, Math.floor(samples.length / ratio));
    const bytes = new Uint8Array(count * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < count; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(left + 1, samples.length - 1);
      const fraction = pos - left;
      const sample = Math.max(-1, Math.min(1, samples[left] * (1 - fraction) + samples[right] * fraction));
      view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function handleMessage(message) {
    if (message.error) {
      setStatus("Live Voice reported an error. Retry or use basic voice.", "error");
      showFallback(true);
      return;
    }
    if (message.setupComplete) {
      setupComplete = true;
      setStatus(micPaused ? "Microphone paused" : "Listening… speak naturally", micPaused ? "paused" : "listening");
      if (transcript) transcript.textContent = "Live connection ready. Speak in Bangla, English, or mix both naturally.";
      return;
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      stopPlayback();
      assistantText = "";
      renderTranscript();
      setStatus("Listening to you…", "listening");
    }
    if (content.inputTranscription && content.inputTranscription.text) {
      userText = (userText + " " + content.inputTranscription.text).trim().slice(-4000);
      renderTranscript();
    }
    if (content.outputTranscription && content.outputTranscription.text) {
      assistantText = (assistantText + " " + content.outputTranscription.text).trim().slice(-4000);
      renderTranscript();
    }
    const parts = content.modelTurn && content.modelTurn.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) playPcm(part.inlineData.data);
        if (part.text) {
          assistantText = (assistantText + " " + part.text).trim().slice(-4000);
          renderTranscript();
        }
      }
    }
    if (content.turnComplete && !playbackSources.size) setStatus("Listening… speak naturally", "listening");
  }

  function releaseResources() {
    stopPlayback();
    if (socket) {
      try { socket.onclose = null; socket.close(1000, "Voice session ended"); } catch (_) {}
    }
    socket = null;
    if (processor) {
      processor.onaudioprocess = null;
      try { processor.disconnect(); } catch (_) {}
    }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
    if (silentGain) { try { silentGain.disconnect(); } catch (_) {} }
    if (stream) {
      try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
    }
    processor = null;
    sourceNode = null;
    silentGain = null;
    stream = null;
    if (audioContext && audioContext.state !== "closed") {
      try { void audioContext.close(); } catch (_) {}
    }
    audioContext = null;
    nextPlayTime = 0;
  }

  async function startLiveVoice() {
    if (active || connecting) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" ||
        (typeof window.AudioContext !== "function" && typeof window.webkitAudioContext !== "function")) {
      setStatus("Live audio is not supported here. Try basic voice in Chrome or Safari.", "error");
      showFallback(true);
      return;
    }
    active = true;
    connecting = true;
    micPaused = false;
    setupComplete = false;
    userText = "";
    assistantText = "";
    showFallback(false);
    overlay.hidden = false;
    setStatus("Connecting to secure Live Voice…", "thinking");
    if (transcript) transcript.textContent = "Connecting to MahiCloud Live Voice. Your audio is sent to Google Gemini Live for real-time replies.";
    if (interim) interim.textContent = "";
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    try {
      audioContext = new AudioContextConstructor();
      await audioContext.resume();
      if (!active) return;
      if (typeof window.MahiCloudRequestLiveVoiceToken !== "function") throw new Error("MahiCloud is still loading. Please close voice mode and try again.");
      const tokenPayload = await window.MahiCloudRequestLiveVoiceToken();
      if (!active) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      if (!active) { stream.getTracks().forEach((track) => track.stop()); stream = null; return; }
      sourceNode = audioContext.createMediaStreamSource(stream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      const url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(tokenPayload.token);
      socket = new WebSocket(url);
      const thisSocket = socket;
      socket.onopen = () => {
        if (!active || thisSocket !== socket) return;
        socket.send(JSON.stringify({
          setup: {
            model: "models/gemini-3.8-live",
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: "You are MahiCloud, a warm real-time voice assistant. Automatically detect the user's language. Reply naturally in Bangla when the user speaks Bangla, in English when they speak English, and match mixed Bangla-English naturally. Keep spoken replies conversational and concise unless asked for detail. The user may interrupt at any time; stop speaking and listen to the new request." }] },
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }));
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string" || thisSocket !== socket) return;
        try { handleMessage(JSON.parse(event.data)); } catch (_) {}
      };
      socket.onerror = () => {
        if (!active) return;
        setStatus("Live Voice connection failed. Check API access or use basic voice.", "error");
        showFallback(true);
      };
      socket.onclose = (event) => {
        if (!active) return;
        if (event.code !== 1000) {
          setStatus("Live Voice disconnected. Please reconnect or use basic voice.", "error");
          showFallback(true);
        }
      };
      processor.onaudioprocess = (event) => {
        if (!active || micPaused || !setupComplete || !socket || socket.readyState !== WebSocket.OPEN) return;
        const samples = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (let i = 0; i < samples.length; i += 4) energy += samples[i] * samples[i];
        const rms = Math.sqrt(energy / Math.max(1, Math.ceil(samples.length / 4)));
        if (rms > 0.055 && playbackSources.size) stopPlayback();
        socket.send(JSON.stringify({ realtimeInput: { audio: { data: encodePcm(samples, audioContext.sampleRate), mimeType: "audio/pcm;rate=16000" } } }));
      };
      connecting = false;
    } catch (error) {
      connecting = false;
      if (!active) { releaseResources(); return; }
      setStatus(error && error.message ? error.message : "Could not start Live Voice.", "error");
      showFallback(true);
      active = false;
      releaseResources();
    }
  }

  function closeLiveVoice() {
    active = false;
    connecting = false;
    releaseResources();
    overlay.hidden = true;
    showFallback(false);
    if (voiceButton) voiceButton.focus();
  }

  function toggleMic() {
    if (!active) return;
    if (!stream) { void startLiveVoice(); return; }
    micPaused = !micPaused;
    stream.getAudioTracks().forEach((track) => { track.enabled = !micPaused; });
    setStatus(micPaused ? "Microphone paused" : "Listening… speak naturally", micPaused ? "paused" : "listening");
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("#voiceModeButton, #voiceMicButton, #voiceEndButton, [data-voice-close]")
      : null;
    if (!target) return;
    if (bypassOnce && target.id === "voiceModeButton") { bypassOnce = false; return; }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (target.id === "voiceModeButton") void startLiveVoice();
    else if (target.id === "voiceMicButton") toggleMic();
    else closeLiveVoice();
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("#voiceBasicFallback") : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeLiveVoice();
    bypassOnce = true;
    voiceButton.click();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeLiveVoice();
    }
  }, true);
})();
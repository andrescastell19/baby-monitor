const SIGNALING_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const SIGNALING_SERVER = `${SIGNALING_PROTOCOL}//${window.location.host}`;
const DEVICE_ID = `web-monitor-${Date.now()}`;
let CAMERA_DEVICE_ID = null;

let ws = null;
let pc = null;
let remoteStream = null;
let isMuted = false;
let alerts = [];
let signalingConnected = false;
let pendingCandidates = [];
let remoteDescriptionSet = false;
let audioContext = null;
let analyser = null;
let audioCheckInterval = null;
let lastSoundAlert = 0;
let motionCheckInterval = null;
let lastMotionAlert = 0;
let prevFrameData = null;
let motionCanvas = null;
let motionCtx = null;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const remoteVideo = document.getElementById('remoteVideo');
const videoOverlay = document.getElementById('videoOverlay');
const connectionStatus = document.getElementById('connectionStatus');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');
const streamStatus = document.getElementById('streamStatus');
const streamResolution = document.getElementById('streamResolution');
const alertCount = document.getElementById('alertCount');
const alertsList = document.getElementById('alertsList');
const pairingSection = document.getElementById('pairingSection');
const btnConnect = document.getElementById('btnConnect');
const btnMute = document.getElementById('btnMute');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnFullscreen = document.getElementById('btnFullscreen');

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

function connectSignaling() {
  setStatus('connecting', 'Conectando...');
  ws = new WebSocket(SIGNALING_SERVER);

  ws.onopen = () => {
    console.log('Connected to signaling server');
    setStatus('connected', 'Conectado al servidor');
    signalingConnected = true;
    register();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleSignalingMessage(message);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  };

  ws.onclose = () => {
    setStatus('disconnected', 'Desconectado');
    signalingConnected = false;
    CAMERA_DEVICE_ID = null;
    setTimeout(connectSignaling, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    setStatus('disconnected', 'Error de conexion');
  };
}

function register() {
  ws.send(JSON.stringify({
    type: 'register',
    deviceId: DEVICE_ID,
    role: 'monitor'
  }));
}

function createPeerConnection() {
  pc = new RTCPeerConnection(iceServers);
  remoteDescriptionSet = false;
  pendingCandidates = [];

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate:', event.candidate.candidate?.substring(0, 60));
      sendSignaling({
        type: 'candidate',
        deviceId: DEVICE_ID,
        targetDeviceId: CAMERA_DEVICE_ID,
        payload: {
          type: 'candidate',
          candidate: event.candidate
        }
      });
    } else {
      console.log('ICE gathering complete');
    }
  };

  pc.ontrack = (event) => {
    console.log('Remote track received:', event.track.kind, event.track.id);
    remoteStream = event.streams[0];

    if (remoteVideo.srcObject !== remoteStream) {
      remoteVideo.srcObject = remoteStream;
      startAudioDetection(remoteStream);
      startMotionDetection(remoteStream);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    switch (pc.connectionState) {
      case 'connected':
        streamStatus.textContent = 'Conectado';
        videoOverlay.classList.add('hidden');
        remoteVideo.play().catch(() => {});
        break;
      case 'disconnected':
        streamStatus.textContent = 'Desconectado';
        break;
      case 'failed':
        streamStatus.textContent = 'Conexion fallida';
        break;
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      videoOverlay.classList.add('hidden');
      streamStatus.textContent = 'Recibiendo transmisión';
      remoteVideo.play().catch(() => {});
    }
  };
}

function sendSignaling(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function handleSignalingMessage(message) {
  console.log('Message:', message.type, message);

  switch (message.type) {
    case 'camera-online':
      CAMERA_DEVICE_ID = message.deviceId;
      console.log('Camera is online:', CAMERA_DEVICE_ID);
      document.getElementById('waitingSubtext').textContent = 'Cámara detectada. Esperando stream...';
      document.getElementById('streamStatus').textContent = 'Cámara conectada - Esperando video...';
      break;

    case 'camera-offline':
      CAMERA_DEVICE_ID = null;
      console.log('Camera went offline');
      document.getElementById('waitingSubtext').textContent = 'Cámara desconectada. Esperando reconexión...';
      document.getElementById('streamStatus').textContent = 'Cámara desconectada';
      if (audioCheckInterval) { clearInterval(audioCheckInterval); audioCheckInterval = null; }
      if (motionCheckInterval) { clearInterval(motionCheckInterval); motionCheckInterval = null; }
      if (audioContext) { audioContext.close(); audioContext = null; }
      prevFrameData = null;
      break;

    case 'offer':
      if (message.payload?.sdp) {
        CAMERA_DEVICE_ID = message.deviceId;
        console.log('Received offer from:', CAMERA_DEVICE_ID);
        handleOffer(message);
      }
      break;

    case 'answer':
      if (message.payload?.sdp && pc && remoteDescriptionSet) {
        pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp));
      }
      break;

    case 'candidate':
      if (message.payload?.candidate) {
        if (pc && remoteDescriptionSet) {
          console.log('Adding ICE candidate directly');
          pc.addIceCandidate(new RTCIceCandidate(message.payload.candidate));
        } else {
          console.log('Queuing ICE candidate (remoteDescription not set yet)');
          pendingCandidates.push(message.payload.candidate);
        }
      }
      break;

    case 'alert':
      addAlert(message.payload);
      break;
  }
}

async function handleOffer(message) {
  if (!CAMERA_DEVICE_ID) {
    CAMERA_DEVICE_ID = message.deviceId;
  }

  if (pc) {
    pc.close();
    pc = null;
  }
  pendingCandidates = [];
  remoteDescriptionSet = false;

  createPeerConnection();

  try {
    console.log('Setting remote description...');
    await pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp));
    remoteDescriptionSet = true;
    console.log('Remote description set, now flushing', pendingCandidates.length, 'queued candidates');

    for (const candidate of pendingCandidates) {
      console.log('Flushing queued candidate');
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    pendingCandidates = [];

    console.log('Creating answer...');
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('Answer created, sending to camera:', message.deviceId);

    sendSignaling({
      type: 'answer',
      deviceId: DEVICE_ID,
      targetDeviceId: message.deviceId,
      payload: {
        type: 'answer',
        sdp: answer
      }
    });
    console.log('Answer sent');
  } catch (err) {
    console.error('Error handling offer:', err);
  }
}

function addAlert(alertData) {
  const alert = {
    id: Date.now(),
    type: alertData.type || 'sound',
    message: alertData.message || 'Alerta detectada',
    confidence: alertData.confidence,
    timestamp: Date.now(),
    read: false
  };
  alerts.unshift(alert);
  renderAlerts();
  playAlertSound();
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

function startAudioDetection(stream) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    audioCheckInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;

      if (average > 80) {
        const now = Date.now();
        if (now - lastSoundAlert > 3000) {
          lastSoundAlert = now;
          sendSignaling({
            type: 'alert',
            deviceId: DEVICE_ID,
            payload: {
              type: 'sound',
              message: `Sonido fuerte detectado (${Math.round(average)}%)`,
              confidence: Math.min(100, Math.round(average))
            }
          });
        }
      }
    }, 500);
  } catch (e) {
    console.error('Audio detection error:', e);
  }
}

function startMotionDetection(stream) {
  try {
    motionCanvas = document.createElement('canvas');
    motionCanvas.width = 160;
    motionCanvas.height = 120;
    motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });

    const tempVideo = document.createElement('video');
    tempVideo.srcObject = stream;
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.play().catch(() => {});

    motionCheckInterval = setInterval(() => {
      if (tempVideo.readyState < 2) return;

      motionCtx.drawImage(tempVideo, 0, 0, 160, 120);
      const currentFrame = motionCtx.getImageData(0, 0, 160, 120);

      if (prevFrameData) {
        let diffPixels = 0;
        const totalPixels = currentFrame.data.length / 4;
        const step = 16;

        for (let i = 0; i < currentFrame.data.length; i += step * 4) {
          const rDiff = Math.abs(currentFrame.data[i] - prevFrameData.data[i]);
          const gDiff = Math.abs(currentFrame.data[i + 1] - prevFrameData.data[i + 1]);
          const bDiff = Math.abs(currentFrame.data[i + 2] - prevFrameData.data[i + 2]);
          if (rDiff + gDiff + bDiff > 60) diffPixels++;
        }

        const sampledPixels = totalPixels / step;
        const changePercent = (diffPixels / sampledPixels) * 100;

        console.log('Motion:', changePercent.toFixed(1) + '%');

        if (changePercent > 15) {
          const now = Date.now();
          if (now - lastMotionAlert > 3000) {
            lastMotionAlert = now;
            sendSignaling({
              type: 'alert',
              deviceId: DEVICE_ID,
              payload: {
                type: 'motion',
                message: `Movimiento detectado (${Math.round(changePercent)}%)`,
                confidence: Math.min(100, Math.round(changePercent))
              }
            });
          }
        }
      }

      prevFrameData = currentFrame;
    }, 1500);
  } catch (e) {
    console.error('Motion detection error:', e);
  }
}

function renderAlerts() {
  const unread = alerts.filter(a => !a.read).length;
  alertCount.textContent = unread;

  if (alerts.length === 0) {
    alertsList.innerHTML = '<div class="no-alerts">No hay alertas</div>';
    return;
  }

  alertsList.innerHTML = alerts.map(alert => `
    <div class="alert-item ${alert.read ? 'read' : ''}" data-id="${alert.id}">
      <div class="alert-dot ${alert.type}"></div>
      <div class="alert-content">
        <div class="alert-type">${alert.type === 'sound' ? '🔊 Sonido detectado' : '👋 Movimiento detectado'}</div>
        <div class="alert-time">${new Date(alert.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  `).join('');

  alertsList.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const alert = alerts.find(a => a.id === id);
      if (alert) {
        alert.read = true;
        renderAlerts();
      }
    });
  });
}

function toggleMute() {
  isMuted = !isMuted;
  if (remoteStream) {
    remoteStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
  }
  btnMute.classList.toggle('active', isMuted);
  btnMute.querySelector('.btn-label').textContent = isMuted ? 'Unmute' : 'Sonido';
  btnMute.querySelector('.btn-icon').textContent = isMuted ? '🔇' : '🔊';
}

function takeScreenshot() {
  if (!remoteStream) return;
  const canvas = document.createElement('canvas');
  const video = document.createElement('video');
  video.srcObject = remoteStream;
  video.play();
  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `baby-monitor-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

btnConnect.addEventListener('click', () => {
  pairingSection.classList.add('hidden');
  connectSignaling();
});

btnMute.addEventListener('click', toggleMute);
btnScreenshot.addEventListener('click', takeScreenshot);
btnFullscreen.addEventListener('click', toggleFullscreen);

renderAlerts();
connectSignaling();

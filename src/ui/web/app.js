const SIGNALING_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const SIGNALING_SERVER = `${SIGNALING_PROTOCOL}//${window.location.host}`;
const DEVICE_ID = `web-monitor-${Date.now()}`;
let CAMERA_DEVICE_ID = null;

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 2,
};

let ws = null;
let pc = null;
let pendingCandidates = [];
let remoteDescriptionSet = false;
let isMuted = false;
let alerts = [];
let signalingConnected = false;
let keepAliveInterval = null;

const remoteVideo = document.getElementById('remoteVideo');
const videoOverlay = document.getElementById('videoOverlay');
const connectionStatus = document.getElementById('connectionStatus');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');
const streamStatus = document.getElementById('streamStatus');
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
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendSignaling({ type: 'ping', deviceId: DEVICE_ID });
      }
    }, 20000);
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
    closePeerConnection();
    if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
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
    role: 'monitor',
    platform: 'web'
  }));
}

function sendSignaling(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function closePeerConnection() {
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  pendingCandidates = [];
  remoteDescriptionSet = false;
}

function createPeerConnection() {
  closePeerConnection();
  pc = new RTCPeerConnection(ICE_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignaling({
        type: 'candidate',
        deviceId: DEVICE_ID,
        targetDeviceId: CAMERA_DEVICE_ID,
        payload: event.candidate.toJSON(),
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      streamStatus.textContent = 'WebRTC conectado - Recibiendo video';
    } else if (pc.iceConnectionState === 'disconnected') {
      streamStatus.textContent = 'WebRTC desconectado - Reconectando...';
    } else if (pc.iceConnectionState === 'failed') {
      streamStatus.textContent = 'WebRTC fallido';
      closePeerConnection();
    }
  };

  pc.ontrack = (event) => {
    console.log('Remote track received:', event.track.kind);
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      if (!videoOverlay.classList.contains('hidden')) {
        videoOverlay.classList.add('hidden');
        streamStatus.textContent = 'Recibiendo transmisión WebRTC';
      }
    }
  };

  return pc;
}

function handleSignalingMessage(message) {
  switch (message.type) {
    case 'camera-online':
      CAMERA_DEVICE_ID = message.deviceId;
      console.log('Camera is online:', CAMERA_DEVICE_ID);
      document.getElementById('waitingSubtext').textContent = 'Cámara detectada. Esperando offer WebRTC...';
      document.getElementById('streamStatus').textContent = 'Cámara conectada - Esperando video...';
      break;

    case 'camera-offline':
      CAMERA_DEVICE_ID = null;
      console.log('Camera went offline');
      document.getElementById('waitingSubtext').textContent = 'Cámara desconectada. Esperando reconexión...';
      document.getElementById('streamStatus').textContent = 'Cámara desconectada';
      closePeerConnection();
      remoteVideo.srcObject = null;
      videoOverlay.classList.remove('hidden');
      break;

    case 'offer':
      handleOffer(message);
      break;

    case 'answer':
      handleAnswer(message);
      break;

    case 'candidate':
      handleCandidate(message);
      break;

    case 'frame':
      if (message.payload) {
        if (!videoOverlay.classList.contains('hidden') && CAMERA_DEVICE_ID) {
          videoOverlay.classList.add('hidden');
          streamStatus.textContent = 'Recibiendo transmisión';
        }
      }
      break;

    case 'alert':
      addAlert(message.payload);
      break;

    case 'ping':
      sendSignaling({ type: 'pong', deviceId: DEVICE_ID });
      break;

    case 'pong':
      break;
  }
}

async function handleOffer(message) {
  const sdp = message.payload;
  if (!sdp) return;

  console.log('Received offer from:', message.deviceId);
  CAMERA_DEVICE_ID = message.deviceId;

  const conn = createPeerConnection();

  try {
    await conn.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescriptionSet = true;

    for (const c of pendingCandidates) {
      try {
        await conn.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('Failed to add pending ICE candidate:', e);
      }
    }
    pendingCandidates = [];

    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);

    sendSignaling({
      type: 'answer',
      deviceId: DEVICE_ID,
      targetDeviceId: CAMERA_DEVICE_ID,
      payload: conn.localDescription.toJSON(),
    });

    console.log('Answer sent to camera');
    document.getElementById('waitingSubtext').textContent = 'Conexión WebRTC establecida. Esperando video...';
    document.getElementById('streamStatus').textContent = 'WebRTC conectado - Esperando video...';
  } catch (err) {
    console.error('Error handling offer:', err);
  }
}

async function handleAnswer(message) {
  const sdp = message.payload;
  if (!sdp || !pc) return;

  try {
    remoteDescriptionSet = false;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescriptionSet = true;

    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('Failed to add pending ICE candidate:', e);
      }
    }
    pendingCandidates = [];
  } catch (err) {
    console.error('Error handling answer:', err);
  }
}

async function handleCandidate(message) {
  const candidate = message.payload;
  if (!candidate) return;

  if (!remoteDescriptionSet || !pc) {
    pendingCandidates.push(candidate);
    return;
  }

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.warn('Failed to add ICE candidate:', e);
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
        <div class="alert-type">${alert.type === 'sound' ? 'Sonido detectado' : 'Movimiento detectado'}</div>
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

function takeScreenshot() {
  if (!remoteVideo.srcObject) return;
  const canvas = document.createElement('canvas');
  canvas.width = remoteVideo.videoWidth || 640;
  canvas.height = remoteVideo.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
  const link = document.createElement('a');
  link.download = `baby-monitor-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
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

btnMute.addEventListener('click', () => {
  isMuted = !isMuted;
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
  }
  btnMute.classList.toggle('active', isMuted);
  btnMute.querySelector('.btn-label').textContent = isMuted ? 'Unmute' : 'Sonido';
});
btnScreenshot.addEventListener('click', takeScreenshot);
btnFullscreen.addEventListener('click', toggleFullscreen);

renderAlerts();

const SIGNALING_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const SIGNALING_SERVER = `${SIGNALING_PROTOCOL}//${window.location.host}`;
const DEVICE_ID = `web-monitor-${Date.now()}`;
let CAMERA_DEVICE_ID = null;

let ws = null;
let remoteStream = null;
let isMuted = false;
let alerts = [];
let signalingConnected = false;
let audioContext = null;
let analyser = null;
let audioCheckInterval = null;
let lastSoundAlert = 0;
let motionCheckInterval = null;
let lastMotionAlert = 0;
let prevFrameData = null;
let motionCanvas = null;
let motionCtx = null;
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

let lastFrameTime = 0;

function handleSignalingMessage(message) {
  switch (message.type) {
    case 'camera-online':
      CAMERA_DEVICE_ID = message.deviceId;
      console.log('Camera is online:', CAMERA_DEVICE_ID);
      document.getElementById('waitingSubtext').textContent = 'Cámara detectada. Esperando video...';
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

    case 'frame':
      if (message.payload) {
        lastFrameTime = Date.now();
        const img = new Image();
        img.onload = () => {
          const canvas = remoteVideo.tagName === 'CANVAS' ? remoteVideo : document.getElementById('remoteVideo');
          if (canvas.tagName === 'CANVAS') {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            remoteVideo.src = img.src;
          }
          if (!videoOverlay.classList.contains('hidden') && CAMERA_DEVICE_ID) {
            videoOverlay.classList.add('hidden');
            streamStatus.textContent = 'Recibiendo transmisión';
          }
        };
        img.src = 'data:image/jpeg;base64,' + message.payload;
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
  if (!CAMERA_DEVICE_ID) return;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  const sourceCanvas = document.getElementById('remoteVideo');
  if (sourceCanvas && sourceCanvas.tagName === 'CANVAS') {
    ctx.drawImage(sourceCanvas, 0, 0);
  }
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
  btnMute.classList.toggle('active', isMuted);
  btnMute.querySelector('.btn-label').textContent = isMuted ? 'Unmute' : 'Sonido';
});
btnScreenshot.addEventListener('click', takeScreenshot);
btnFullscreen.addEventListener('click', toggleFullscreen);

renderAlerts();

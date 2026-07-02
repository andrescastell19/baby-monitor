const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8888;
const WEB_DIR = path.join(__dirname, '..', '..', 'ui', 'web');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function handleRequest(req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  let filePath = path.join(WEB_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(handleRequest);

const devices = new Map();

function handleWsConnection(ws) {
  console.log('New client connected');

  ws.isAlive = true;
  ws.lastPong = Date.now();

  ws.on('pong', () => {
    ws.isAlive = true;
    ws.lastPong = Date.now();
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      const senderEntry = Array.from(devices.entries()).find(([_, d]) => d.ws === ws);
      if (senderEntry) {
        senderEntry[1].lastPong = Date.now();
        ws.isAlive = true;
      }

      switch (message.type) {
        case 'register': {
          devices.set(message.deviceId, { ws, role: message.role, platform: message.platform || 'android', lastPong: Date.now() });
          console.log(`Device registered: ${message.deviceId} (${message.role}, ${message.platform || 'android'})`);
          console.log('All devices:', Array.from(devices.entries()).map(([id, d]) => ({ id, role: d.role, platform: d.platform })));

          if (message.role === 'camera') {
            broadcastToMonitors({ type: 'camera-online', deviceId: message.deviceId });
            for (const [id, device] of devices) {
              if (device.role === 'monitor') {
                ws.send(JSON.stringify({ type: 'monitor-online', deviceId: id, platform: device.platform }));
              }
            }
          }

          if (message.role === 'monitor') {
            for (const [id, device] of devices) {
              if (device.role === 'camera') {
                ws.send(JSON.stringify({ type: 'camera-online', deviceId: id }));
              }
            }
            broadcastToCameras({ type: 'monitor-online', deviceId: message.deviceId, platform: message.platform || 'android' });
          }
          break;
        }

        case 'offer':
        case 'answer':
        case 'candidate': {
          let target = devices.get(message.targetDeviceId);
          if (!target) {
            let neededRole;
            if (message.type === 'offer') {
              neededRole = 'monitor';
            } else if (message.type === 'answer') {
              neededRole = 'camera';
            } else {
              const sender = devices.get(message.deviceId);
              neededRole = sender?.role === 'camera' ? 'monitor' : 'camera';
            }
            for (const [id, device] of devices) {
              if (device.role === neededRole) {
                target = device;
                break;
              }
            }
          }
          if (target) {
            target.ws.send(JSON.stringify({
              type: message.type,
              deviceId: message.deviceId,
              payload: message.payload
            }));
          } else {
            console.log(`No target for ${message.type} from ${message.deviceId}`);
          }
          break;
        }

        case 'frame': {
          const monitorCount = Array.from(devices.values()).filter(d => d.role === 'monitor' && d.platform === 'web').length;
          console.log(`Frame from ${message.deviceId} → relaying to ${monitorCount} web monitor(s)`);
          for (const [id, device] of devices) {
            if (device.role === 'monitor' && device.platform === 'web') {
              try { device.ws.send(JSON.stringify({ type: 'frame', deviceId: message.deviceId, payload: message.payload })); } catch (e) {}
            }
          }
          break;
        }

        case 'alert': {
          console.log(`Alert from ${message.deviceId}: ${message.payload?.type} - ${message.payload?.message}`);
          broadcastToMonitors({ type: 'alert', deviceId: message.deviceId, payload: message.payload });
          break;
        }

        case 'renegotiate': {
          let target = devices.get(message.targetDeviceId);
          if (!target) {
            for (const [id, device] of devices) {
              if (device.ws !== ws) {
                target = device;
                break;
              }
            }
          }
          if (target) {
            target.ws.send(JSON.stringify({ type: 'renegotiate', deviceId: message.deviceId }));
          }
          break;
        }

        case 'ping': {
          let target = devices.get(message.targetDeviceId);
          if (target) {
            target.ws.send(JSON.stringify({ type: 'pong', deviceId: message.deviceId }));
          } else {
            for (const [id, device] of devices) {
              if (device.ws !== ws) {
                try { device.ws.send(JSON.stringify({ type: 'pong', deviceId: message.deviceId })); } catch (e) {}
              }
            }
          }
          break;
        }

        case 'pong': {
          const deviceEntry = Array.from(devices.entries()).find(([_, d]) => d.ws === ws);
          if (deviceEntry) {
            deviceEntry[1].lastPong = Date.now();
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    for (const [id, device] of devices) {
      if (device.ws === ws) {
        const role = device.role;
        devices.delete(id);
        console.log(`WebSocket closed: ${id} (${role})`);
        if (role === 'camera') {
          broadcastToMonitors({ type: 'camera-offline', deviceId: id });
        }
        if (role === 'monitor') {
          broadcastToCameras({ type: 'monitor-offline', deviceId: id });
        }
        break;
      }
    }
  });
}

function broadcastToMonitors(message) {
  for (const [id, device] of devices) {
    if (device.role === 'monitor') {
      try { device.ws.send(JSON.stringify(message)); } catch (e) {}
    }
  }
}

function broadcastToCameras(message) {
  for (const [id, device] of devices) {
    if (device.role === 'camera') {
      try { device.ws.send(JSON.stringify(message)); } catch (e) {}
    }
  }
}

const wss = new WebSocketServer({ server });
wss.on('connection', handleWsConnection);

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('Terminating stale connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });

  const now = Date.now();
  for (const [id, device] of devices) {
    if (now - device.lastPong > 30000) {
      console.log(`Device ${id} timed out (no pong in 30s)`);
      devices.delete(id);
      if (device.role === 'camera') {
        broadcastToMonitors({ type: 'camera-offline', deviceId: id });
      }
      if (device.role === 'monitor') {
        broadcastToCameras({ type: 'monitor-offline', deviceId: id });
      }
    }
  }
}, 15000);

wss.on('close', () => clearInterval(heartbeatInterval));

server.listen(PORT, () => {
  console.log('');
  console.log('=== Baby Monitor Signaling Server ===');
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Health:    http://localhost:${PORT}/health`);
  console.log('=====================================');
  console.log('');
});

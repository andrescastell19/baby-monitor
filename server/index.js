const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8888;
const WEB_DIR = path.join(__dirname, '..', 'web');

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

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'register': {
          devices.set(message.deviceId, { ws, role: message.role });
          console.log(`Device registered: ${message.deviceId} (${message.role})`);
          console.log('All devices:', Array.from(devices.entries()).map(([id, d]) => ({ id, role: d.role })));

          if (message.role === 'camera') {
            broadcastToMonitors({ type: 'camera-online', deviceId: message.deviceId });
          }

          if (message.role === 'monitor') {
            for (const [id, device] of devices) {
              if (device.role === 'camera') {
                ws.send(JSON.stringify({ type: 'camera-online', deviceId: id }));
              }
            }
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

        case 'alert': {
          broadcastToMonitors({ type: 'alert', deviceId: message.deviceId, payload: message.payload });
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

const wss = new WebSocketServer({ server });
wss.on('connection', handleWsConnection);

server.listen(PORT, () => {
  console.log('');
  console.log('=== Baby Monitor Signaling Server ===');
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Health:    http://localhost:${PORT}/health`);
  console.log('=====================================');
  console.log('');
});

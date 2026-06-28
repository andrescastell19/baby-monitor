const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const WEB_DIR = path.join(__dirname, '..', 'web');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(WEB_DIR, req.url === '/' ? 'index.html' : req.url);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const devices = new Map();

function broadcastToMonitors(message) {
  for (const [id, device] of devices) {
    if (device.role === 'monitor') {
      try {
        device.ws.send(JSON.stringify(message));
      } catch (e) {
        console.log('Error sending to monitor:', id);
      }
    }
  }
}

function broadcastToCameras(message) {
  for (const [id, device] of devices) {
    if (device.role === 'camera') {
      try {
        device.ws.send(JSON.stringify(message));
      } catch (e) {
        console.log('Error sending to camera:', id);
      }
    }
  }
}

function listDevices() {
  const list = [];
  for (const [id, device] of devices) {
    list.push({ id, role: device.role });
  }
  return list;
}

console.log(`Baby Monitor server running on http://localhost:${PORT}`);
console.log(`Web dashboard: http://localhost:${PORT}`);
console.log(`Signaling WebSocket: ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message.type, 'from', message.deviceId);

      switch (message.type) {
        case 'register': {
          devices.set(message.deviceId, { ws, role: message.role });
          console.log(`Device registered: ${message.deviceId} (${message.role})`);
          console.log('All devices:', listDevices());

          if (message.role === 'camera') {
            broadcastToMonitors({
              type: 'camera-online',
              deviceId: message.deviceId,
            });
          }

          if (message.role === 'monitor') {
            for (const [id, device] of devices) {
              if (device.role === 'camera') {
                ws.send(JSON.stringify({
                  type: 'camera-online',
                  deviceId: id,
                }));
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
            const neededRole = message.type === 'offer' ? 'monitor' : 'camera';
            for (const [id, device] of devices) {
              if (device.role === neededRole) {
                target = device;
                console.log(`Fallback: routing ${message.type} to ${id} (${neededRole})`);
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
            console.log(`Forwarded ${message.type} from ${message.deviceId} to ${target ? 'found' : 'not found'}`);
          } else {
            console.log(`No target found for ${message.type}`);
          }
          break;
        }

        case 'alert': {
          broadcastToMonitors({
            type: 'alert',
            deviceId: message.deviceId,
            payload: message.payload
          });
          break;
        }

        case 'list-devices': {
          ws.send(JSON.stringify({
            type: 'device-list',
            devices: listDevices()
          }));
          break;
        }

        case 'disconnect': {
          const device = devices.get(message.deviceId);
          if (device) {
            const role = device.role;
            devices.delete(message.deviceId);
            console.log(`Device disconnected: ${message.deviceId}`);

            if (role === 'camera') {
              broadcastToMonitors({
                type: 'camera-offline',
                deviceId: message.deviceId,
              });
            }
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
          broadcastToMonitors({
            type: 'camera-offline',
            deviceId: id,
          });
        }
        break;
      }
    }
  });
});

server.listen(PORT);

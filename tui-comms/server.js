import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Bonjour } from 'bonjour-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const MAX_HISTORY = 100;

// Ephemeral in-memory ring buffer
const messageHistory = [];

function pushHistory(msg) {
  messageHistory.push(msg);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift();
  }
}

// Network interface discovery
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  let primarySubnet = '127.0.0.1/32';

  for (const [name, netList] of Object.entries(interfaces)) {
    for (const net of netList || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address,
          netmask: net.netmask,
          mac: net.mac
        });
        // Derive rough CIDR
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
          const parts = net.address.split('.');
          primarySubnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        }
      }
    }
  }

  return {
    addresses,
    primaryIp: addresses[0]?.address || '127.0.0.1',
    primarySubnet
  };
}

const networkInfo = getNetworkInfo();

// Fallout-style RobCo handle generator
const ROLE_PREFIXES = [
  'OVERSEER',
  'VAULT-GUARD',
  'SECURITY-CHIEF',
  'CHIEF-ENGINEER',
  'VAULT-SCIENTIST',
  'TECH-SPEC',
  'VAULT-RESIDENT',
  'MAINTENANCE',
  'COMM-OFFICER',
  'DWELLER'
];

let nodeCounter = 1;
const connectedClients = new Map();

function generateNodeId(remoteIp) {
  const cleanIp = (remoteIp || '').replace(/^.*:/, ''); // strip IPv6 prefix if any
  let suffix = '01';
  if (cleanIp && cleanIp.includes('.')) {
    const octets = cleanIp.split('.');
    suffix = octets[3] || String(nodeCounter);
  } else {
    suffix = String(100 + (nodeCounter % 899));
  }

  // Pick role based on counter or IP
  const role = ROLE_PREFIXES[(nodeCounter - 1) % ROLE_PREFIXES.length];
  nodeCounter++;
  return `${role}-${suffix}`;
}

// MIME types dictionary for static file server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav'
};

// HTTP Static Asset Server
const server = http.createServer((req, res) => {
  // CORS & Security headers for LAN access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Simple status API
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      system: 'ROBCO VAULT-COM OS v1.0',
      status: 'ONLINE',
      uptime: process.uptime(),
      activeNodes: connectedClients.size,
      subnet: networkInfo.primarySubnet,
      serverTime: Date.now()
    }));
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 NOT FOUND - ROBCO TERMINAL FILE MISSING');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

function getActiveNodesList() {
  const list = [];
  for (const client of connectedClients.values()) {
    list.push({
      nodeId: client.nodeId,
      ip: client.clientIp,
      connectedAt: client.connectedAt,
      isOverseer: client.isOverseer || false
    });
  }
  return list;
}

function broadcast(payload, filterFn = null) {
  const data = JSON.stringify(payload);
  let count = 0;
  for (const [ws, info] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      if (!filterFn || filterFn(ws, info)) {
        ws.send(data);
        count++;
      }
    }
  }
  console.log(`[BROADCAST] ${payload.type} from ${payload.senderId || 'SYS'} -> sent to ${count}/${connectedClients.size} node(s)`);
}

wss.on('connection', (ws, req) => {
  const remoteIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
    .toString()
    .replace(/^.*:/, '');

  const nodeId = generateNodeId(remoteIp);
  const clientInfo = {
    id: `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    nodeId,
    clientIp: remoteIp,
    connectedAt: Date.now(),
    isOverseer: connectedClients.size === 0 // First connected node is default Overseer
  };

  connectedClients.set(ws, clientInfo);
  console.log(`[+] NODE CONNECTED: ${clientInfo.nodeId} from ${clientInfo.clientIp} (Active nodes: ${connectedClients.size})`);

  // Send WELCOME handshake to this client
  const welcomePayload = {
    type: 'WELCOME',
    nodeId: clientInfo.nodeId,
    clientIp: clientInfo.clientIp,
    subnet: networkInfo.primarySubnet,
    serverTime: Date.now(),
    isOverseer: clientInfo.isOverseer,
    history: messageHistory,
    activeNodes: getActiveNodesList()
  };
  ws.send(JSON.stringify(welcomePayload));

  // Announce new node to all others
  const joinTransmission = {
    type: 'TRANSMISSION',
    id: `sys_${Date.now()}`,
    senderId: 'SYSTEM',
    content: `[+] NODE INITIALIZED: ${clientInfo.nodeId} (${clientInfo.clientIp})`,
    timestamp: Date.now(),
    level: 'SYSTEM'
  };
  pushHistory(joinTransmission);
  broadcast(joinTransmission, (targetWs) => targetWs !== ws);

  // Broadcast updated active nodes
  broadcast({
    type: 'NODE_ROSTER',
    nodes: getActiveNodesList()
  });

  // Handle incoming messages from this client
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'BROADCAST': {
          const text = (msg.content || '').trim();
          if (!text) return;

          const transmission = {
            type: 'TRANSMISSION',
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            senderId: clientInfo.nodeId,
            content: text,
            timestamp: Date.now(),
            level: 'INFO'
          };
          pushHistory(transmission);
          broadcast(transmission);
          break;
        }

        case 'RELAY': {
          // Direct / encrypted message between nodes
          const targetNodeId = (msg.targetNodeId || '').trim();
          const content = (msg.content || '').trim();
          if (!targetNodeId || !content) return;

          let targetFound = false;
          const relayPayload = {
            type: 'RELAY_MESSAGE',
            id: `relay_${Date.now()}`,
            fromNodeId: clientInfo.nodeId,
            toNodeId: targetNodeId,
            content: content,
            timestamp: Date.now()
          };

          for (const [targetWs, targetInfo] of connectedClients.entries()) {
            if (targetInfo.nodeId.toLowerCase() === targetNodeId.toLowerCase()) {
              targetFound = true;
              if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(relayPayload));
              }
            }
          }

          // Echo back to sender as confirmation
          if (targetFound) {
            ws.send(JSON.stringify(relayPayload));
          } else {
            ws.send(JSON.stringify({
              type: 'TRANSMISSION',
              id: `err_${Date.now()}`,
              senderId: 'ROBCO-ROUTER',
              content: `[!] RELAY ERROR: Target node "${targetNodeId}" not reachable on local subnet.`,
              timestamp: Date.now(),
              level: 'ERROR'
            }));
          }
          break;
        }

        case 'ALERT_RED': {
          const reason = (msg.reason || 'UNSPECIFIED VAULT EMERGENCY').trim();
          const alertPayload = {
            type: 'ALERT_TRIGGERED',
            originNodeId: clientInfo.nodeId,
            reason: reason,
            timestamp: Date.now()
          };
          const alertTransmission = {
            type: 'TRANSMISSION',
            id: `alert_${Date.now()}`,
            senderId: 'EMERGENCY-BROADCAST',
            content: `*** RED ALERT PULSE INITIATED BY ${clientInfo.nodeId}: ${reason} ***`,
            timestamp: Date.now(),
            level: 'ALERT'
          };
          pushHistory(alertTransmission);
          broadcast(alertPayload);
          broadcast(alertTransmission);
          break;
        }

        case 'ALERT_CLEAR': {
          const clearPayload = {
            type: 'ALERT_CLEARED',
            originNodeId: clientInfo.nodeId,
            timestamp: Date.now()
          };
          const clearTransmission = {
            type: 'TRANSMISSION',
            id: `clear_${Date.now()}`,
            senderId: 'SYSTEM',
            content: `[i] Red alert state cleared by ${clientInfo.nodeId}. Terminal returning to green phosphor.`,
            timestamp: Date.now(),
            level: 'SYSTEM'
          };
          pushHistory(clearTransmission);
          broadcast(clearPayload);
          broadcast(clearTransmission);
          break;
        }

        case 'QUERY_NODES': {
          ws.send(JSON.stringify({
            type: 'NODE_ROSTER',
            nodes: getActiveNodesList()
          }));
          break;
        }

        case 'PING': {
          ws.send(JSON.stringify({
            type: 'PONG',
            t: msg.t || Date.now(),
            serverTime: Date.now()
          }));
          break;
        }

        case 'SET_HANDLE': {
          // Allow client to request custom handle
          const newHandle = (msg.handle || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          if (newHandle && newHandle.length >= 3 && newHandle.length <= 20) {
            const oldHandle = clientInfo.nodeId;
            clientInfo.nodeId = newHandle;
            const renameTransmission = {
              type: 'TRANSMISSION',
              id: `rename_${Date.now()}`,
              senderId: 'SYSTEM',
              content: `[i] IDENTIFIER REASSIGNED: ${oldHandle} -> ${newHandle}`,
              timestamp: Date.now(),
              level: 'SYSTEM'
            };
            pushHistory(renameTransmission);
            broadcast(renameTransmission);
            broadcast({
              type: 'NODE_ROSTER',
              nodes: getActiveNodesList()
            });
            ws.send(JSON.stringify({
              type: 'HANDLE_CONFIRMED',
              nodeId: newHandle
            }));
          }
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e.message);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`[-] NODE DISCONNECTED: ${clientInfo.nodeId} (Active nodes: ${connectedClients.size})`);
    const leaveTransmission = {
      type: 'TRANSMISSION',
      id: `sys_leave_${Date.now()}`,
      senderId: 'SYSTEM',
      content: `[-] NODE TERMINATED: ${clientInfo.nodeId}`,
      timestamp: Date.now(),
      level: 'SYSTEM'
    };
    pushHistory(leaveTransmission);
    broadcast(leaveTransmission);
    broadcast({
      type: 'NODE_ROSTER',
      nodes: getActiveNodesList()
    });
  });

  ws.on('error', (err) => {
    console.warn(`WebSocket error on ${clientInfo.nodeId}:`, err.message);
  });
});

// mDNS Broadcast advertisement (vaultcom.local)
let bonjourInstance = null;
try {
  bonjourInstance = new Bonjour();
  bonjourInstance.publish({
    name: 'Vault-Com Terminal Network',
    type: 'http',
    port: PORT,
    txt: { app: 'vault-com', version: '1.0' },
    host: 'vaultcom.local'
  });
  console.log(`[mDNS] Service advertised: vaultcom.local:${PORT}`);
} catch (err) {
  console.warn('[mDNS] Bonjour advertisement skipped:', err.message);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[!] SHUTTING DOWN ROBCO OVERSEER NETWORK...');
  if (bonjourInstance) {
    bonjourInstance.unpublishAll(() => {
      bonjourInstance.destroy();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
=====================================================
   ROBCO INDUSTRIES UNIFIED OPERATING SYSTEM v1.0
   VAULT-COM LOCAL NETWORK OVERSEER TERMINAL
=====================================================
 Subnet IP: http://${networkInfo.primaryIp}:${PORT}
 Localhost: http://localhost:${PORT}
 mDNS URL:  http://vaultcom.local:${PORT}
 Subnet:    ${networkInfo.primarySubnet}
 Bound to:  0.0.0.0:${PORT} (LAN Only)
=====================================================
`);
});

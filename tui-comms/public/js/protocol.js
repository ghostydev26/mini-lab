/**
 * ============================================================================
 * ROBCO NETWORK CLIENT PROTOCOL (protocol.js)
 * Manages WebSocket lifecycle, ping/pong latency, and message routing
 * ============================================================================
 */

class VaultProtocol {
  constructor() {
    this.ws = null;
    this.nodeId = 'CONNECTING...';
    this.clientIp = '127.0.0.1';
    this.subnet = 'UNKNOWN';
    this.isOverseer = false;
    this.latency = 0;
    this.lastPingTime = 0;
    this.pingInterval = null;
    this.reconnectTimeout = null;

    // Event callbacks
    this.onWelcome = null;
    this.onTransmission = null;
    this.onRelay = null;
    this.onAlert = null;
    this.onAlertClear = null;
    this.onRoster = null;
    this.onLatencyUpdate = null;
    this.onStatusChange = null;
  }

  connect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    let host = window.location.host;
    if (!host || window.location.protocol === 'file:') {
      host = '127.0.0.1:8080';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${host}`;
    this.wsUrl = wsUrl;

    if (this.onStatusChange) this.onStatusChange('CONNECTING');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[VAULT-COM] Connected to host: ${wsUrl}`);
        if (this.onStatusChange) this.onStatusChange('ONLINE');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (e) => {
        console.warn(`[VAULT-COM] Disconnected (code: ${e.code}). Reconnecting...`);
        if (this.onStatusChange) this.onStatusChange('OFFLINE');
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[VAULT-COM] WebSocket error:', err);
        if (this.onStatusChange) this.onStatusChange('ERROR');
      };
    } catch (e) {
      console.error('[VAULT-COM] Failed to create WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 2500);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = performance.now();
        this.ws.send(JSON.stringify({ type: 'PING', t: this.lastPingTime }));
      }
    }, 4000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  handleMessage(raw) {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'WELCOME':
          this.nodeId = msg.nodeId;
          this.clientIp = msg.clientIp;
          this.subnet = msg.subnet;
          this.isOverseer = msg.isOverseer;
          if (this.onWelcome) this.onWelcome(msg);
          break;

        case 'TRANSMISSION':
          if (this.onTransmission) this.onTransmission(msg);
          break;

        case 'RELAY_MESSAGE':
          if (this.onRelay) this.onRelay(msg);
          break;

        case 'ALERT_TRIGGERED':
          if (this.onAlert) this.onAlert(msg);
          break;

        case 'ALERT_CLEARED':
          if (this.onAlertClear) this.onAlertClear(msg);
          break;

        case 'NODE_ROSTER':
          if (this.onRoster) this.onRoster(msg.nodes || []);
          break;

        case 'HANDLE_CONFIRMED':
          this.nodeId = msg.nodeId;
          break;

        case 'PONG':
          if (this.lastPingTime > 0) {
            this.latency = Math.round(performance.now() - this.lastPingTime);
            if (this.onLatencyUpdate) this.onLatencyUpdate(this.latency);
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('VaultProtocol parse error:', err);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  sendBroadcast(content) {
    return this.send({ type: 'BROADCAST', content });
  }

  sendRelay(targetNodeId, content) {
    return this.send({ type: 'RELAY', targetNodeId, content });
  }

  sendAlertRed(reason) {
    return this.send({ type: 'ALERT_RED', reason });
  }

  sendAlertClear() {
    return this.send({ type: 'ALERT_CLEAR' });
  }

  sendQueryNodes() {
    return this.send({ type: 'QUERY_NODES' });
  }

  sendSetHandle(handle) {
    return this.send({ type: 'SET_HANDLE', handle });
  }
}

// Global protocol singleton
window.vaultProtocol = new VaultProtocol();

/**
 * ============================================================================
 * ROBCO OVERSEER TERMINAL - APPLICATION CONTROLLER (app.js)
 * Master state machine, DOM event handlers, and slash command dispatcher
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const crtContainer = document.getElementById('crt-container');
  const crtScreen = document.getElementById('crt-screen');
  const feedLogs = document.getElementById('feed-logs');
  const rosterList = document.getElementById('roster-list');
  const cmdInput = document.getElementById('cmd-input');

  // Status Bar Elements
  const statusVal = document.getElementById('stat-status');
  const nodeVal = document.getElementById('stat-node');
  const subnetVal = document.getElementById('stat-subnet');
  const countVal = document.getElementById('stat-count');
  const latencyVal = document.getElementById('stat-latency');
  const audioToggleBtn = document.getElementById('btn-audio');

  // Hacking Minigame Overlay Elements
  const hackOverlay = document.getElementById('hack-overlay');
  const hackLeftCol = document.getElementById('hack-col-left');
  const hackRightCol = document.getElementById('hack-col-right');
  const hackAttempts = document.getElementById('hack-attempts');
  const hackLog = document.getElementById('hack-terminal-log');
  const hackSelectedWord = document.getElementById('hack-selected-word');
  const hackCloseBtn = document.getElementById('hack-btn-close');

  // RobCo Field Manual Overlay Elements
  const guideOverlay = document.getElementById('guide-overlay');
  const btnGuide = document.getElementById('btn-guide');
  const guideBtnClose = document.getElementById('guide-btn-close');
  const guideBtnBottomClose = document.getElementById('guide-btn-bottom-close');

  const openGuide = () => {
    window.robcoAudio.playKeyClick();
    guideOverlay.classList.add('active');
  };

  const closeGuide = () => {
    window.robcoAudio.playKeyClick();
    guideOverlay.classList.remove('active');
    cmdInput.focus();
  };

  if (btnGuide) btnGuide.addEventListener('click', openGuide);
  if (guideBtnClose) guideBtnClose.addEventListener('click', closeGuide);
  if (guideBtnBottomClose) guideBtnBottomClose.addEventListener('click', closeGuide);

  // Initialize Hacking Game
  window.robcoHackGame.init({
    overlay: hackOverlay,
    leftCol: hackLeftCol,
    rightCol: hackRightCol,
    attemptsEl: hackAttempts,
    logEl: hackLog,
    selectedWordEl: hackSelectedWord,
    closeBtn: hackCloseBtn
  });

  // User gesture listener to unlock Web Audio API
  const unlockAudio = () => {
    window.robcoAudio.ensureContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  // Update Audio Toggle Button State
  const updateAudioBtn = () => {
    if (window.robcoAudio.enabled) {
      audioToggleBtn.textContent = '[ AUDIO: ON ]';
      audioToggleBtn.classList.remove('audio-status-off');
      audioToggleBtn.classList.add('audio-status-on');
    } else {
      audioToggleBtn.textContent = '[ AUDIO: OFF ]';
      audioToggleBtn.classList.remove('audio-status-on');
      audioToggleBtn.classList.add('audio-status-off');
    }
  };
  updateAudioBtn();

  audioToggleBtn.addEventListener('click', () => {
    window.robcoAudio.toggleAudio();
    updateAudioBtn();
    window.robcoAudio.playKeyClick();
  });

  // Format Unix Timestamp to HH:MM:SS
  const formatTime = (ts) => {
    const d = new Date(ts);
    return [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
      String(d.getSeconds()).padStart(2, '0')
    ].join(':');
  };

  // Append a line to the terminal feed
  const appendLog = ({ senderId, content, timestamp, level = 'INFO' }) => {
    const entry = document.createElement('div');
    entry.className = `log-entry level-${level}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${formatTime(timestamp || Date.now())}]`;
    entry.appendChild(timeSpan);

    if (senderId) {
      const nodeSpan = document.createElement('span');
      nodeSpan.className = 'log-node';
      if (window.vaultProtocol && senderId === window.vaultProtocol.nodeId) {
        nodeSpan.classList.add('is-self');
      }
      nodeSpan.textContent = `<${senderId}>`;
      entry.appendChild(nodeSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'log-content';
    textSpan.textContent = content;
    entry.appendChild(textSpan);

    feedLogs.appendChild(entry);
    feedLogs.scrollTop = feedLogs.scrollHeight;
  };

  // Render Roster of Active Nodes
  const renderRoster = (nodes) => {
    rosterList.innerHTML = '';
    countVal.textContent = nodes.length;

    nodes.forEach(n => {
      const item = document.createElement('div');
      item.className = 'roster-item';
      if (window.vaultProtocol && n.nodeId === window.vaultProtocol.nodeId) {
        item.classList.add('is-self');
      }

      const idSpan = document.createElement('span');
      idSpan.className = 'roster-id';
      idSpan.textContent = (n.isOverseer ? '[*] ' : '') + n.nodeId;

      const ipSpan = document.createElement('span');
      ipSpan.className = 'roster-ip';
      ipSpan.textContent = `${n.ip} | ${formatTime(n.connectedAt)}`;

      item.appendChild(idSpan);
      item.appendChild(ipSpan);

      // Clicking node sets input to /relay
      item.addEventListener('click', () => {
        window.robcoAudio.playKeyClick();
        cmdInput.value = `/relay ${n.nodeId} `;
        cmdInput.focus();
      });

      rosterList.appendChild(item);
    });
  };

  // Protocol Callbacks
  window.vaultProtocol.onStatusChange = (status) => {
    if (status === 'ONLINE') {
      statusVal.style.color = 'var(--phosphor-bright)';
      statusVal.textContent = 'ONLINE';
    } else if (status === 'CONNECTING') {
      statusVal.style.color = '#ffff33';
      statusVal.textContent = 'CONNECTING...';
    } else {
      statusVal.style.color = '#ff4444';
      statusVal.textContent = 'OFFLINE (RECONNECTING)';
    }
  };

  window.vaultProtocol.onWelcome = (msg) => {
    nodeVal.textContent = msg.nodeId;
    subnetVal.textContent = msg.subnet;

    // Boot Welcome Banner
    appendLog({
      senderId: 'SYSTEM',
      content: `======================================================`,
      level: 'SYSTEM'
    });
    appendLog({
      senderId: 'SYSTEM',
      content: `ROBCO UNIFIED OPERATING SYSTEM (v1.0.4 - OVERSEER EDITION)`,
      level: 'SYSTEM'
    });
    appendLog({
      senderId: 'SYSTEM',
      content: `TERMINAL LINK ESTABLISHED: ${msg.nodeId} (${msg.clientIp})`,
      level: 'SYSTEM'
    });
    appendLog({
      senderId: 'SYSTEM',
      content: `TYPE /help FOR COMMANDS OR CLICK [ /GUIDE ] FOR SURVIVAL MANUAL.`,
      level: 'SYSTEM'
    });
    appendLog({
      senderId: 'SYSTEM',
      content: `======================================================`,
      level: 'SYSTEM'
    });

    // Replay in-memory ring buffer history
    if (msg.history && msg.history.length > 0) {
      msg.history.forEach(item => appendLog(item));
    }

    if (msg.activeNodes) {
      renderRoster(msg.activeNodes);
    }

    window.robcoAudio.playBootHum();
  };

  window.vaultProtocol.onTransmission = (msg) => {
    appendLog(msg);
    if (msg.level !== 'SYSTEM') {
      window.robcoAudio.playTeletypeChirp();
    }
  };

  window.vaultProtocol.onRelay = (msg) => {
    const isSender = window.vaultProtocol && msg.fromNodeId === window.vaultProtocol.nodeId;
    appendLog({
      senderId: isSender ? `RELAY TO ${msg.toNodeId}` : `RELAY FROM ${msg.fromNodeId}`,
      content: `[DIRECT] ${msg.content}`,
      timestamp: msg.timestamp,
      level: 'RELAY'
    });
    window.robcoAudio.playTeletypeChirp();
  };

  window.vaultProtocol.onAlert = (msg) => {
    crtContainer.classList.add('alert-red');
    crtScreen.classList.add('alert-red');
    window.robcoAudio.startRedAlertSiren();

    appendLog({
      senderId: 'EMERGENCY',
      content: `[!] RED ALERT PULSE INITIATED BY ${msg.originNodeId}: ${msg.reason}`,
      timestamp: msg.timestamp,
      level: 'ALERT'
    });
  };

  window.vaultProtocol.onAlertClear = (msg) => {
    crtContainer.classList.remove('alert-red');
    crtScreen.classList.remove('alert-red');
    window.robcoAudio.stopRedAlertSiren();

    appendLog({
      senderId: 'SYSTEM',
      content: `[i] Red alert state cleared by ${msg.originNodeId}. Return to green phosphor.`,
      timestamp: msg.timestamp,
      level: 'SYSTEM'
    });
  };

  let isExplicitWhoQuery = false;

  window.vaultProtocol.onRoster = (nodes) => {
    renderRoster(nodes);
    if (isExplicitWhoQuery) {
      isExplicitWhoQuery = false;
      if (nodes.length === 0) {
        appendLog({
          senderId: 'ROBCO-ROSTER',
          content: `NO ACTIVE VAULT TERMINALS FOUND ON SUBNET.`,
          level: 'SYSTEM'
        });
      } else {
        const listStr = nodes.map(n => {
          const isSelf = window.vaultProtocol && n.nodeId === window.vaultProtocol.nodeId;
          const selfTag = isSelf ? ' [THIS TERMINAL]' : '';
          const overseerTag = n.isOverseer ? '[*] ' : '    ';
          return `  ${overseerTag}${n.nodeId.padEnd(18)} IP: ${n.ip}${selfTag}`;
        }).join('\n');
        appendLog({
          senderId: 'ROBCO-ROSTER',
          content: `=== ACTIVE SUBNET NODES (${nodes.length}) ===\n${listStr}`,
          level: 'SYSTEM'
        });
      }
    }
  };

  window.vaultProtocol.onLatencyUpdate = (latency) => {
    latencyVal.textContent = `${latency}ms`;
  };

  // Slash Command Dispatcher
  const executeCommand = (rawText) => {
    const text = rawText.trim();
    if (!text) return;

    // Check if it's a slash command
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch (cmd) {
        case 'help': {
          appendLog({
            senderId: 'ROBCO-HELP',
            content: `--- OVERSEER COMMAND INDEX ---
  /who                     - List all connected Vault terminal nodes
  /relay <node-id> <msg>   - Send encrypted direct transmission
  /clear                   - Wipe local terminal display buffer
  /broadcast-red [reason]  - Trigger subnet-wide red alert klaxon
  /broadcast-clear         - Cancel emergency red alert state
  /hack                    - Open RobCo Termlink password decryption minigame
  /handle <name>           - Request node callsign reassignment
  /guide                   - Open Vault-Tec Overseer Field Manual
  /sound                   - Toggle mechanical keyclicks and teletype chirps
  /help                    - Display this instruction manual`,
            level: 'SYSTEM'
          });
          break;
        }

        case 'guide':
        case 'manual': {
          openGuide();
          break;
        }

        case 'who': {
          if (!window.vaultProtocol.ws || window.vaultProtocol.ws.readyState !== WebSocket.OPEN) {
            appendLog({
              senderId: 'SYSTEM',
              content: `[!] TERMINAL OFFLINE: Not connected to Vault-Com host (${window.vaultProtocol.wsUrl || 'ws://localhost:8080'}). Please refresh http://localhost:8080.`,
              level: 'ERROR'
            });
            break;
          }
          isExplicitWhoQuery = true;
          window.vaultProtocol.sendQueryNodes();
          appendLog({
            senderId: 'SYSTEM',
            content: `Polling active Vault-Tec terminal nodes on subnet...`,
            level: 'SYSTEM'
          });
          break;
        }

        case 'relay': {
          if (args.length < 2) {
            appendLog({
              senderId: 'SYSTEM',
              content: `USAGE: /relay <node-id> <message>`,
              level: 'ERROR'
            });
            return;
          }
          const targetNode = args[0];
          const relayContent = args.slice(1).join(' ');
          window.vaultProtocol.sendRelay(targetNode, relayContent);
          break;
        }

        case 'clear': {
          feedLogs.innerHTML = '';
          appendLog({
            senderId: 'SYSTEM',
            content: `TERMINAL DISPLAY BUFFER CLEARED.`,
            level: 'SYSTEM'
          });
          break;
        }

        case 'broadcast-red':
        case 'alert': {
          const reason = args.join(' ') || 'MANUAL RED ALERT PULSE';
          window.vaultProtocol.sendAlertRed(reason);
          break;
        }

        case 'broadcast-clear':
        case 'clear-alert': {
          window.vaultProtocol.sendAlertClear();
          break;
        }

        case 'hack': {
          window.robcoHackGame.start();
          break;
        }

        case 'handle': {
          if (!args[0]) {
            appendLog({
              senderId: 'SYSTEM',
              content: `USAGE: /handle <NEW_NAME>`,
              level: 'ERROR'
            });
            return;
          }
          window.vaultProtocol.sendSetHandle(args[0]);
          break;
        }

        case 'sound':
        case 'mute': {
          window.robcoAudio.toggleAudio();
          updateAudioBtn();
          appendLog({
            senderId: 'SYSTEM',
            content: `AUDIO SYNTHESIS: ${window.robcoAudio.enabled ? 'ACTIVE' : 'MUTED'}`,
            level: 'SYSTEM'
          });
          break;
        }

        default:
          appendLog({
            senderId: 'ROBCO-OS',
            content: `UNKNOWN COMMAND: "${cmd}". TYPE /help OR /guide.`,
            level: 'ERROR'
          });
          break;
      }
    } else {
      // Normal broadcast transmission
      if (!window.vaultProtocol.ws || window.vaultProtocol.ws.readyState !== WebSocket.OPEN) {
        appendLog({
          senderId: 'SYSTEM',
          content: `[!] TRANSMISSION FAILED: Terminal offline (${window.vaultProtocol.wsUrl || 'ws://localhost:8080'}). Check connection and refresh.`,
          level: 'ERROR'
        });
        return;
      }
      window.vaultProtocol.sendBroadcast(text);
    }
  };

  // Keyboard input handlers
  cmdInput.addEventListener('keydown', (e) => {
    // Mechanical key click
    window.robcoAudio.playKeyClick();

    if (e.key === 'Enter') {
      const val = cmdInput.value;
      if (val) {
        executeCommand(val);
        cmdInput.value = '';
      }
    }
  });

  // Global Escape key listener to dismiss overlays
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (guideOverlay && guideOverlay.classList.contains('active')) {
        closeGuide();
      }
      if (hackOverlay && hackOverlay.classList.contains('active')) {
        window.robcoHackGame.close();
        cmdInput.focus();
      }
    }
  });

  // Action Button Listeners
  document.getElementById('btn-who').addEventListener('click', () => {
    window.robcoAudio.playKeyClick();
    executeCommand('/who');
  });

  document.getElementById('btn-relay').addEventListener('click', () => {
    window.robcoAudio.playKeyClick();
    cmdInput.value = '/relay ';
    cmdInput.focus();
  });

  document.getElementById('btn-hack').addEventListener('click', () => {
    window.robcoAudio.playKeyClick();
    executeCommand('/hack');
  });

  document.getElementById('btn-alert').addEventListener('click', () => {
    window.robcoAudio.playKeyClick();
    if (crtScreen.classList.contains('alert-red')) {
      executeCommand('/broadcast-clear');
    } else {
      executeCommand('/broadcast-red SECURITY BREACH DETECTED');
    }
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    window.robcoAudio.playKeyClick();
    executeCommand('/clear');
  });

  const btnSend = document.getElementById('btn-send');
  if (btnSend) {
    btnSend.addEventListener('click', () => {
      window.robcoAudio.playKeyClick();
      const val = cmdInput.value;
      if (val) {
        executeCommand(val);
        cmdInput.value = '';
      }
      cmdInput.focus();
    });
  }

  // Touch device detection: avoid popping up virtual keyboard on background taps
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouchDevice) {
    document.addEventListener('click', (e) => {
      if (
        !hackOverlay.classList.contains('active') &&
        !guideOverlay.classList.contains('active') &&
        !e.target.closest('button') &&
        !e.target.closest('.roster-item') &&
        !e.target.closest('.guide-overlay') &&
        !e.target.closest('.prompt-panel')
      ) {
        cmdInput.focus();
      }
    });
  }

  // Connect WebSocket to host
  window.vaultProtocol.connect();
});

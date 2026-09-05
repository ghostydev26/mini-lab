import { WebSocket } from 'ws';

const PORT = 8080;
const URL = `ws://127.0.0.1:${PORT}`;

console.log('--- STARTING VAULT-COM PROTOCOL VERIFICATION SUITE ---');

let passedTests = 0;
let totalTests = 5;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  // Test 1: Connect Client A and receive WELCOME handshake
  const clientA = new WebSocket(URL);

  const clientAData = await new Promise((resolve, reject) => {
    clientA.on('open', () => {
      console.log('Client A connected.');
    });
    clientA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WELCOME') {
        resolve(msg);
      }
    });
    clientA.on('error', reject);
    setTimeout(() => reject(new Error('Timeout waiting for Client A WELCOME')), 3000);
  });

  assert(clientAData.type === 'WELCOME' && clientAData.nodeId, `Client A received WELCOME with nodeId: ${clientAData.nodeId}`);

  // Test 2: Connect Client B and verify node announcement
  const clientB = new WebSocket(URL);
  let clientBNodeId = '';

  const clientBData = await new Promise((resolve, reject) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WELCOME') {
        clientBNodeId = msg.nodeId;
        resolve(msg);
      }
    });
    clientB.on('error', reject);
    setTimeout(() => reject(new Error('Timeout waiting for Client B WELCOME')), 3000);
  });

  assert(clientBData.nodeId !== clientAData.nodeId, `Client B assigned unique nodeId: ${clientBData.nodeId}`);

  // Test 3: Client A broadcasts message; Client B must receive it
  const broadcastPromise = new Promise((resolve, reject) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'TRANSMISSION' && msg.content === 'REACTOR CORE NOMINAL') {
        resolve(msg);
      }
    });
    setTimeout(() => reject(new Error('Timeout waiting for broadcast message')), 3000);
  });

  clientA.send(JSON.stringify({
    type: 'BROADCAST',
    content: 'REACTOR CORE NOMINAL'
  }));

  const receivedBroadcast = await broadcastPromise;
  assert(receivedBroadcast.senderId === clientAData.nodeId, `Client B received broadcast from ${clientAData.nodeId}`);

  // Test 4: Client B sends private encrypted RELAY to Client A
  const relayPromise = new Promise((resolve, reject) => {
    clientA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'RELAY_MESSAGE' && msg.content === 'SECURITY OVERRIDE 994') {
        resolve(msg);
      }
    });
    setTimeout(() => reject(new Error('Timeout waiting for relay message')), 3000);
  });

  clientB.send(JSON.stringify({
    type: 'RELAY',
    targetNodeId: clientAData.nodeId,
    content: 'SECURITY OVERRIDE 994'
  }));

  const receivedRelay = await relayPromise;
  assert(receivedRelay.fromNodeId === clientBNodeId, `Client A received private relay from ${clientBNodeId}`);

  // Test 5: Client C connects and receives message history ring buffer
  const clientC = new WebSocket(URL);
  const clientCWelcome = await new Promise((resolve, reject) => {
    clientC.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WELCOME') {
        resolve(msg);
      }
    });
    setTimeout(() => reject(new Error('Timeout waiting for Client C WELCOME')), 3000);
  });

  const historyContents = clientCWelcome.history.map(h => h.content);
  assert(historyContents.includes('REACTOR CORE NOMINAL'), 'New Client C received ephemeral ring buffer history containing past broadcast');

  // Clean up
  clientA.close();
  clientB.close();
  clientC.close();

  console.log(`\n=========================================`);
  console.log(` ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log(`=========================================`);
  process.exit(0);
}

// Wait 500ms before starting tests
setTimeout(runTests, 500);

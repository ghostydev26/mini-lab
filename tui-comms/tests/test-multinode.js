import { WebSocket } from 'ws';

const URL = 'ws://127.0.0.1:8080';

async function testMultiNode() {
  console.log('Connecting PC Node...');
  const pc = new WebSocket(URL);
  
  const pcWelcome = await new Promise((res, rej) => {
    pc.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WELCOME') res(msg);
    });
    pc.on('error', rej);
  });
  console.log('PC connected as:', pcWelcome.nodeId);

  console.log('Connecting Phone Node...');
  const phone = new WebSocket(URL);

  const phoneWelcome = await new Promise((res, rej) => {
    phone.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'WELCOME') res(msg);
    });
    phone.on('error', rej);
  });
  console.log('Phone connected as:', phoneWelcome.nodeId);

  // Phone sends broadcast message
  console.log('Phone sending message...');
  const pcReceivedPromise = new Promise((res, rej) => {
    pc.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'TRANSMISSION' && msg.content === 'HELLO FROM PHONE') {
        res(msg);
      }
    });
    setTimeout(() => rej(new Error('PC TIMEOUT waiting for phone message')), 4000);
  });

  phone.send(JSON.stringify({
    type: 'BROADCAST',
    content: 'HELLO FROM PHONE'
  }));

  const pcReceived = await pcReceivedPromise;
  console.log('SUCCESS: PC received message:', pcReceived);

  // Test WHO query from PC
  console.log('PC querying nodes...');
  const rosterPromise = new Promise((res, rej) => {
    pc.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'NODE_ROSTER') {
        res(msg);
      }
    });
    setTimeout(() => rej(new Error('PC TIMEOUT waiting for roster')), 4000);
  });

  pc.send(JSON.stringify({ type: 'QUERY_NODES' }));
  const roster = await rosterPromise;
  console.log('SUCCESS: PC received roster:', roster.nodes.map(n => n.nodeId));

  pc.close();
  phone.close();
  process.exit(0);
}

testMultiNode().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

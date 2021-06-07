const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 9876 });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('received:', message);

    if (message === 'kill') {
      console.log('kill')
      throw new Error('end');
    }
  });

  ws.send('hi');
});

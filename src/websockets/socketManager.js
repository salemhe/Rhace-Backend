import { WebSocketServer } from 'ws';

const vendorSockets = new Map();
const userSockets = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer ({ server });

  wss.on('listening', () => {
    console.log('WebSocket server is listening');
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  wss.on('connection', (ws, req) => {
    console.log('New connection request:', req.url);

    try {
      const params = new URLSearchParams(req.url.replace('/?', ''));
      const userType = params.get('type');
      const userId = params.get('id');

      if (!userType || !userId) {
        console.log('Missing type or id in query parameters');
        ws.close(1008, 'Missing type or id');
        return;
      }

      console.log(`Connection type: ${userType}, id: ${userId}`);

        if (userType === 'vendor') {
          vendorSockets.set(userId, ws);
          console.log(`Vendor ${userId} connected`);

          ws.on('message', (message) => {
            console.log(`Received message from vendor ${userId}:`, message);
          });

          ws.on('close', (code, reason) => {
            vendorSockets.delete(userId);
            console.log(`Vendor ${userId} disconnected: code=${code}, reason=${reason}`);
          });

          ws.on('error', (err) => {
            console.error(`WebSocket error from vendor ${userId}:`, err);
          });
        } else if (userType === 'user') {
          userSockets.set(userId, ws);
          console.log(`User ${userId} connected`);

          ws.on('message', (message) => {
            console.log(`Received message from user ${userId}:`, message.toString());
          });

          ws.on('close', (code, reason) => {
            userSockets.delete(userId);
            console.log(`User ${userId} disconnected: code=${code}, reason=${reason}`);
          });

          ws.on('error', (err) => {
            console.error(`WebSocket error from user ${userId}:`, err);
          });
        } else {
          console.log(`Unknown userType: ${userType}, closing connection`);
          ws.close(1008, 'Unauthorized userType');
        }
    } catch (err) {
      console.error('Error in connection handler:', err);
      ws.close(1011, 'Internal server error');
    }
  });
}

function getVendorSocket(vendorId) {
  return vendorSockets.get(vendorId);
}

function getUserSocket(userId) {
  return userSockets.get(userId);
}

export { setupWebSocket, getVendorSocket, getUserSocket };

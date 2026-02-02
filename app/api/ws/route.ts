import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';

export function SOCKET(
  client: WebSocket,
  _request: IncomingMessage,
  server: WebSocketServer
) {
  console.log('Client connected, total:', server.clients.size);

  client.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Broadcast to all OTHER clients (MCP → browsers, or browser → others)
      server.clients.forEach((c) => {
        if (c !== client && c.readyState === 1) { // WebSocket.OPEN = 1
          c.send(JSON.stringify(message));
        }
      });
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  });

  client.on('close', () => {
    console.log('Client disconnected, remaining:', server.clients.size);
  });

  client.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

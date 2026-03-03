import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { GameStateManager } from './gameState';
import { handleClientMessage } from './messageHandler';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const TICK_RATE = 20; // 20 FPS
const TICK_INTERVAL = 1000 / TICK_RATE;
const MAX_PLAYERS = 10;

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });
const gameState = new GameStateManager();

export const clients = new Map<string, WebSocket>();

wss.on('connection', (ws: WebSocket) => {
  if (clients.size >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: 'server_full' }));
    ws.close();
    return;
  }

  const playerId = uuidv4();
  clients.set(playerId, ws);
  console.log(`Client connected: ${playerId}`);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(playerId, message, gameState, clients);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${playerId}`);
    gameState.removePlayer(playerId);
    clients.delete(playerId);
    // Broadcast player left
    broadcast({ type: 'player_left', playerId });
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${playerId}:`, err);
  });
});

export function broadcast(message: object): void {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Server tick loop - broadcast game state at fixed rate
setInterval(() => {
  if (clients.size > 0) {
    gameState.incrementTick();
    broadcast({
      type: 'game_state_update',
      state: gameState.getState()
    });
  }
}, TICK_INTERVAL);

httpServer.listen(PORT, () => {
  console.log(`Living Dead Beat server running on port ${PORT}`);
});

import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { GameStateManager } from './gameState';
import { handleClientMessage } from './messageHandler';

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 4041;
const HOST = process.env.WS_HOST || '0.0.0.0';
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
    if (!clients.has(playerId)) return;
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

export function broadcastVisibleGameState(): void {
  clients.forEach((client, playerId) => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify({
      type: 'game_state_update',
      state: gameState.getVisibleStateForPlayer(playerId),
    }));
  });
}

// Server tick loop - broadcast game state at fixed rate
setInterval(() => {
  if (clients.size > 0) {
    gameState.incrementTick();

    const expiredDeadPlayerIds = gameState.getExpiredDeadPlayerIds();
    for (const expiredPlayerId of expiredDeadPlayerIds) {
      const expiredClient = clients.get(expiredPlayerId);
      gameState.removePlayer(expiredPlayerId);
      if (expiredClient && expiredClient.readyState === WebSocket.OPEN) {
        try { expiredClient.close(4001, 'Death decision timeout'); } catch (_) { /* ignore */ }
      }
      clients.delete(expiredPlayerId);
      broadcast({ type: 'player_left', playerId: expiredPlayerId });
    }

    broadcastVisibleGameState();
  }
}, TICK_INTERVAL);

httpServer.listen(PORT, HOST, () => {
  console.log(`Living Dead Beat server running on ${HOST}:${PORT}`);
});

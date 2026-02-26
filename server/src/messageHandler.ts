import { WebSocket } from 'ws';
import { GameStateManager } from './gameState';
import { broadcast } from './index';
import { ClientToServerEvent } from '../../shared/src/types';

const CHAT_COOLDOWN_MS = 1000; // 1 second between chat messages
const NICKNAME_MAX_LENGTH = 20;
const CHAT_MAX_LENGTH = 200;
const ACTION_ANIMATION_DURATION_MS = 600;
const chatCooldowns = new Map<string, number>();
const NUM_SPRITE_VARIANTS = 4;

export function handleClientMessage(
  playerId: string,
  message: ClientToServerEvent,
  gameState: GameStateManager,
  clients: Map<string, WebSocket>
): void {
  const ws = clients.get(playerId);
  if (!ws) return;

  switch (message.type) {
    case 'player_join': {
      if (!message.nickname || typeof message.nickname !== 'string') return;
      const nickname = message.nickname.trim().slice(0, NICKNAME_MAX_LENGTH);
      if (!nickname) return;

      // Check if player already joined
      if (gameState.getPlayer(playerId)) return;

      const player = {
        id: playerId,
        nickname,
        x: Math.floor(Math.random() * 700) + 50,
        y: Math.floor(Math.random() * 500) + 50,
        action: 'idle' as const,
        spriteVariant: Math.floor(Math.random() * NUM_SPRITE_VARIANTS),
        lastActionTime: 0,
      };

      gameState.addPlayer(player);

      // Send join success to the joining player
      ws.send(JSON.stringify({
        type: 'join_success',
        playerId,
        state: gameState.getState(),
      }));

      // Broadcast to all others
      broadcast({ type: 'player_joined', player });
      console.log(`Player joined: ${nickname} (${playerId})`);
      break;
    }

    case 'player_move': {
      if (typeof message.x !== 'number' || typeof message.y !== 'number') return;
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      gameState.updatePlayerPosition(playerId, message.x, message.y);
      break;
    }

    case 'player_attack': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      const success = gameState.setPlayerAction(playerId, 'attack');
      if (success) {
        broadcast({ type: 'game_state_update', state: gameState.getState() });
        setTimeout(() => {
          const p = gameState.getPlayer(playerId);
          if (p) p.action = 'idle';
        }, ACTION_ANIMATION_DURATION_MS);
      }
      break;
    }

    case 'player_dodge': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      const success = gameState.setPlayerAction(playerId, 'dodge');
      if (success) {
        broadcast({ type: 'game_state_update', state: gameState.getState() });
        // Reset to idle after animation duration
        setTimeout(() => {
          const p = gameState.getPlayer(playerId);
          if (p) p.action = 'idle';
        }, ACTION_ANIMATION_DURATION_MS);
      }
      break;
    }

    case 'chat_message': {
      if (!message.text || typeof message.text !== 'string') return;
      const player = gameState.getPlayer(playerId);
      if (!player) return;

      // Rate limiting
      const now = Date.now();
      const lastChat = chatCooldowns.get(playerId) || 0;
      if (now - lastChat < CHAT_COOLDOWN_MS) return;
      chatCooldowns.set(playerId, now);

      const text = message.text.trim().slice(0, CHAT_MAX_LENGTH);
      if (!text) return;

      broadcast({
        type: 'chat_broadcast',
        playerId,
        nickname: player.nickname,
        text,
        timestamp: now,
      });
      break;
    }
  }
}

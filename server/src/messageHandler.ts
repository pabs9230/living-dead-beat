import { WebSocket } from 'ws';
import { GameStateManager } from './gameState';
import { broadcast, broadcastVisibleGameState } from './index';
import { AbilitySlot, ClientToServerEvent } from '../../shared/src/types';
import { CREEP_STATS, isCreepDesign, randomCreepDesign } from '../../shared/src/creepStats';
import { CREEP_KITS, createEmptyCooldowns } from '../../shared/src/abilityCatalog';

const CHAT_COOLDOWN_MS = 1000; // 1 second between chat messages
const NICKNAME_MAX_LENGTH = 20;
const CHAT_MAX_LENGTH = 200;
const ACTION_ANIMATION_DURATION_MS = 600;
const chatCooldowns = new Map<string, number>();
const NUM_SPRITE_VARIANTS = 4;

function castAndAnimate(gameState: GameStateManager, playerId: string, slot: AbilitySlot, x?: number, y?: number): boolean {
  const success = gameState.tryCastAbility(playerId, slot, x, y);
  if (!success) return false;
  broadcastVisibleGameState();
  const player = gameState.getPlayer(playerId);
  const castDuration = player?.castState?.castDurationMs ?? ACTION_ANIMATION_DURATION_MS;
  const resetDelay = Math.max(ACTION_ANIMATION_DURATION_MS, castDuration);
  setTimeout(() => {
    if (gameState.isBatUltimateChanneling(playerId)) return;
    const p = gameState.getPlayer(playerId);
    if (p && p.action !== 'move') {
      p.action = 'idle';
      p.castState = null;
      broadcastVisibleGameState();
    }
  }, resetDelay);
  return true;
}

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

      // Assign selected (or random) creep design and derive visual stats.
      const chosenDesign = isCreepDesign(message.creepDesign) ? message.creepDesign : randomCreepDesign();
      const stats = CREEP_STATS[chosenDesign];
      const kit = CREEP_KITS[chosenDesign];
      // Choose a safe spawn position from game state (avoids obstacles/players)
      const spawn = gameState.findSpawnPosition();
      const player = {
        id: playerId,
        nickname,
        x: spawn.x,
        y: spawn.y,
        action: 'idle' as const,
        spriteVariant: Math.floor(Math.random() * NUM_SPRITE_VARIANTS),
        design: chosenDesign,
        colorIdx: Math.floor(Math.random() * 4),
        maxHealth: stats.maxHealth,
        health: stats.maxHealth,
        statDamage: stats.damage,
        statSpeed: stats.speed,
        statDodge: stats.dodge,
        lastActionTime: 0,
        role: kit.role,
        activeCooldowns: createEmptyCooldowns(),
        activeStatuses: [],
        castState: null,
        isDead: false,
        deathStartedAtMs: 0,
        deathDeadlineMs: 0,
        pvpEnabled: false,
      };

      gameState.addPlayer(player);

      // Send join success to the joining player
      ws.send(JSON.stringify({
        type: 'join_success',
        playerId,
        state: gameState.getVisibleStateForPlayer(playerId),
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
      if (player.isDead) return;
      gameState.updatePlayerPosition(playerId, message.x, message.y);
      break;
    }

    case 'player_attack': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (player.isDead) return;
      castAndAnimate(gameState, playerId, 'basic', message.x, message.y);
      break;
    }

    case 'player_dodge': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (player.isDead) return;
      const tx = (message as any).x;
      const ty = (message as any).y;
      castAndAnimate(gameState, playerId, 'dodge', tx, ty);
      break;
    }

    case 'ability_cast': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (player.isDead) return;
      castAndAnimate(gameState, playerId, message.slot, message.x, message.y);
      break;
    }

    case 'ability_hold': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (player.isDead) return;
      if (message.slot !== 'ultimate') return;

      if (message.isHolding) {
        castAndAnimate(gameState, playerId, message.slot, message.x, message.y);
      } else {
        gameState.releaseHeldAbility(playerId, message.slot);
        broadcastVisibleGameState();
      }
      break;
    }

    case 'player_reenter': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (!player.isDead) return;
      const ok = gameState.reenterPlayer(playerId);
      if (ok) broadcastVisibleGameState();
      break;
    }

    case 'player_toggle_pvp': {
      const player = gameState.getPlayer(playerId);
      if (!player) return;
      if (typeof message.enabled !== 'boolean') return;
      player.pvpEnabled = message.enabled;
      broadcastVisibleGameState();
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

      const payload = {
        type: 'chat_broadcast' as const,
        playerId,
        nickname: player.nickname,
        text,
        timestamp: now,
      };

      clients.forEach((client, viewerId) => {
        if (client.readyState !== WebSocket.OPEN) return;
        const visible = gameState.getVisibleStateForPlayer(viewerId).players;
        if (!visible[playerId]) return;
        client.send(JSON.stringify(payload));
      });
      break;
    }
  }
}

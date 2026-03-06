import { LoginScreen } from './ui/loginScreen';
import { GameClient } from './network/gameClient';
import { GameRenderer } from './rendering/renderer';
import { InputHandler } from './input/inputHandler';
import { GameState, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/src/types';

// Read Vite environment variables when provided. Vite exposes variables prefixed
// with `VITE_` through `import.meta.env`. Use a full `VITE_WS_URL` if supplied,
// else fall back to `ws://<host>:<VITE_WS_PORT||4041>`.
const _env = (import.meta as any)?.env ?? {};
const WS_URL = _env.VITE_WS_URL ?? `ws://${window.location.hostname}:${_env.VITE_WS_PORT ?? 4041}`;

function main(): void {
  const loginScreen = new LoginScreen();
  
  loginScreen.onJoin((nickname: string) => {
    loginScreen.setLoading(true);
    loginScreen.setError('');

    const client = new GameClient(WS_URL);

    client.onConnected(() => {
      client.join(nickname);
    });

    client.onJoinSuccess((playerId, state) => {
      loginScreen.hide();
      showGame(playerId, client, state);
    });

    client.onServerFull(() => {
      loginScreen.setLoading(false);
      loginScreen.setError('Server is full (10/10 players). Please try again later.');
      client.disconnect();
    });

    client.onError(() => {
      loginScreen.setLoading(false);
      loginScreen.setError('Could not connect to server. Make sure the server is running.');
    });
  });
}

function showGame(playerId: string, client: GameClient, initialState: GameState): void {
  const gameScreen = document.getElementById('game-screen') as HTMLDivElement;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  gameScreen.style.display = 'flex';

  // Responsive canvas sizing: keep the canvas centered and not full-bleed.
  // The canvas logical resolution is clamped to the world size and a small
  // padding so it remains centered on larger screens and fits on small ones.
  function resizeCanvasToFit() {
    const padding = 48; // px margin around the canvas
    const maxW = Math.max(200, Math.min(window.innerWidth - padding, WORLD_WIDTH));
    const maxH = Math.max(160, Math.min(window.innerHeight - padding, WORLD_HEIGHT));
    const worldAspect = WORLD_WIDTH / WORLD_HEIGHT;
    let targetW = maxW;
    let targetH = Math.round(targetW / worldAspect);
    if (targetH > maxH) {
      targetH = maxH;
      targetW = Math.round(targetH * worldAspect);
    }
    // Set canvas logical resolution and CSS size so it is visually centered
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }

  resizeCanvasToFit();

  const scenarioName = 'Graves of Nihilia';
  const renderer = new GameRenderer(canvas, playerId, scenarioName);
  renderer.updateState(initialState);
  const inputHandler = new InputHandler(client, canvas, (cx, cy) => renderer.screenToWorld(cx, cy));
  const localPlayer = initialState.players[playerId];
  if (localPlayer) {
    inputHandler.setPosition(localPlayer.x, localPlayer.y);
  }
  inputHandler.updateObstacles(initialState.obstacles);

  client.onGameStateUpdate((state) => {
    renderer.updateState(state);
    inputHandler.updateObstacles(state.obstacles);
    // Inform input handler about local player's authoritative action
    const local = state.players[playerId];
    if (local) inputHandler.setLocalAction(local.action);
    const count = document.getElementById('player-count');
    if (count) count.textContent = String(Object.keys(state.players).length);
  });
  client.onChatMessage((playerId, nickname, text, _timestamp) => {
    addChatMessage(nickname, text);
    // show a chat bubble above the speaking player
    try { renderer.showChatBubble(playerId, text); } catch (err) { /* noop if unavailable */ }
  });

  // Chat UI
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatSend = document.getElementById('chat-send') as HTMLButtonElement;

  function sendChat(): void {
    const text = chatInput.value.trim();
    if (text) {
      client.sendChat(text);
      chatInput.value = '';
      chatInput.focus();
      chatInput.select();
    }
  }

  chatSend.addEventListener('click', sendChat);

  // Global Enter: open (focus) chat when pressed anywhere. If chat already focused,
  // the input handler below decides whether to send or blur.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const active = document.activeElement as HTMLElement | null;
    if (active === chatInput) return; // let chat input handler handle it
    e.preventDefault();
    e.stopPropagation();
    chatInput.focus();
    chatInput.select();
  });

  // When typing in chat: Enter with text sends and keeps chat open; Enter with empty text blurs (closes)
  chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const val = chatInput.value.trim();
      if (val) sendChat(); else chatInput.blur();
    } else {
      // stop propagation so game input doesn't react while typing
      e.stopPropagation();
    }
  });

  window.addEventListener('resize', () => {
    resizeCanvasToFit();
  });

  renderer.startRenderLoop();
}

function addChatMessage(nickname: string, text: string): void {
  const messages = document.getElementById('chat-messages')!;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="sender">${escapeHtml(nickname)}:</span> <span class="text">${escapeHtml(text)}</span>`;
  messages.appendChild(div);
  // Keep only last 50 messages
  while (messages.children.length > 50) {
    messages.removeChild(messages.firstChild!);
  }
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main();

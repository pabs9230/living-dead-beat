import { LoginScreen } from './ui/loginScreen';
import { GameClient } from './network/gameClient';
import { GameRenderer } from './rendering/renderer';
import { InputHandler } from './input/inputHandler';
import { GameState } from '../../shared/src/types';

const WS_URL = `ws://${window.location.hostname}:3001`;

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
  gameScreen.style.display = 'block';

  // Size canvas to window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const renderer = new GameRenderer(canvas, playerId);
  renderer.updateState(initialState);
  const inputHandler = new InputHandler(client, canvas);
  const localPlayer = initialState.players[playerId];
  if (localPlayer) {
    inputHandler.setPosition(localPlayer.x, localPlayer.y);
  }

  client.onGameStateUpdate((state) => {
    renderer.updateState(state);
    const count = document.getElementById('player-count');
    if (count) count.textContent = String(Object.keys(state.players).length);
  });

  client.onChatMessage((_playerId, nickname, text, _timestamp) => {
    addChatMessage(nickname, text);
  });

  // Chat UI
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatSend = document.getElementById('chat-send') as HTMLButtonElement;

  function sendChat(): void {
    const text = chatInput.value.trim();
    if (text) {
      client.sendChat(text);
      chatInput.value = '';
    }
  }

  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') sendChat();
    e.stopPropagation(); // Don't propagate to game input handler
  });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

import { ServerToClientEvent, ClientToServerEvent, GameState } from '../../../shared/src/types';

type ConnectedCallback = () => void;
type JoinSuccessCallback = (playerId: string, state: GameState) => void;
type GameStateCallback = (state: GameState) => void;
type ChatCallback = (playerId: string, nickname: string, text: string, timestamp: number) => void;
type ServerFullCallback = () => void;
type ErrorCallback = () => void;

export class GameClient {
  private ws: WebSocket;
  private connectedCb?: ConnectedCallback;
  private joinSuccessCb?: JoinSuccessCallback;
  private gameStateCb?: GameStateCallback;
  private chatCb?: ChatCallback;
  private serverFullCb?: ServerFullCallback;
  private errorCb?: ErrorCallback;

  constructor(url: string) {
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.connectedCb?.();
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerToClientEvent;
        this.handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    });

    this.ws.addEventListener('error', () => {
      this.errorCb?.();
    });
  }

  private handleMessage(msg: ServerToClientEvent): void {
    switch (msg.type) {
      case 'join_success':
        this.joinSuccessCb?.(msg.playerId, msg.state);
        break;
      case 'game_state_update':
        this.gameStateCb?.(msg.state);
        break;
      case 'chat_broadcast':
        this.chatCb?.(msg.playerId, msg.nickname, msg.text, msg.timestamp);
        break;
      case 'server_full':
        this.serverFullCb?.();
        break;
    }
  }

  join(nickname: string): void {
    this.send({ type: 'player_join', nickname });
  }

  sendMove(x: number, y: number): void {
    this.send({ type: 'player_move', x, y });
  }

  sendAttack(): void {
    this.send({ type: 'player_attack' });
  }

  sendDodge(): void {
    this.send({ type: 'player_dodge' });
  }

  sendChat(text: string): void {
    this.send({ type: 'chat_message', text });
  }

  disconnect(): void {
    this.ws.close();
  }

  private send(event: ClientToServerEvent): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  onConnected(cb: ConnectedCallback): void { this.connectedCb = cb; }
  onJoinSuccess(cb: JoinSuccessCallback): void { this.joinSuccessCb = cb; }
  onGameStateUpdate(cb: GameStateCallback): void { this.gameStateCb = cb; }
  onChatMessage(cb: ChatCallback): void { this.chatCb = cb; }
  onServerFull(cb: ServerFullCallback): void { this.serverFullCb = cb; }
  onError(cb: ErrorCallback): void { this.errorCb = cb; }
}

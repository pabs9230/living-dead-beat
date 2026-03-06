import { CreepsShowcase } from './creepsShowcase';

export class LoginScreen {
  private screen: HTMLDivElement;
  private nicknameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private errorMsg: HTMLDivElement;
  private joinCb?: (nickname: string) => void;
  private showcase?: CreepsShowcase;

  constructor() {
    this.screen = document.getElementById('login-screen') as HTMLDivElement;
    this.nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
    this.joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
    this.errorMsg = document.getElementById('error-msg') as HTMLDivElement;

    this.joinBtn.addEventListener('click', () => this.handleJoin());
    this.nicknameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleJoin();
    });
    // Avoid auto-focusing the nickname input on touch devices (prevents keyboard from popping up)
    const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    if (!isTouch) this.nicknameInput.focus();

    // start the creeps preview showcase (will no-op if container missing)
    this.showcase = new CreepsShowcase();
  }

  private handleJoin(): void {
    const nickname = this.nicknameInput.value.trim();
    if (!nickname) {
      this.setError('Please enter a nickname.');
      return;
    }
    this.joinCb?.(nickname);
  }

  onJoin(cb: (nickname: string) => void): void {
    this.joinCb = cb;
  }

  setLoading(loading: boolean): void {
    this.joinBtn.disabled = loading;
    this.joinBtn.textContent = loading ? 'Connecting...' : 'Enter the Night';
  }

  setError(msg: string): void {
    this.errorMsg.textContent = msg;
  }

  hide(): void {
    // stop preview animation and hide the screen
    this.showcase?.stop();
    this.screen.style.display = 'none';
  }
}

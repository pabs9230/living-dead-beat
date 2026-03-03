export class LoginScreen {
  private screen: HTMLDivElement;
  private nicknameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private errorMsg: HTMLDivElement;
  private joinCb?: (nickname: string) => void;

  constructor() {
    this.screen = document.getElementById('login-screen') as HTMLDivElement;
    this.nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
    this.joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
    this.errorMsg = document.getElementById('error-msg') as HTMLDivElement;

    this.joinBtn.addEventListener('click', () => this.handleJoin());
    this.nicknameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleJoin();
    });
    this.nicknameInput.focus();
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
    this.joinBtn.textContent = loading ? 'Connecting...' : 'Enter the Graveyard';
  }

  setError(msg: string): void {
    this.errorMsg.textContent = msg;
  }

  hide(): void {
    this.screen.style.display = 'none';
  }
}

import { CreepsShowcase } from './creepsShowcase';
import { CREEP_STATS, isCreepDesign } from '../../../shared/src/creepStats';
import { CreepDesign } from '../../../shared/src/types';

export class LoginScreen {
  private screen: HTMLDivElement;
  private nicknameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private selectedCreepEl: HTMLSpanElement;
  private statHpEl: HTMLSpanElement;
  private statDamageEl: HTMLSpanElement;
  private statSpeedEl: HTMLSpanElement;
  private statDodgeEl: HTMLSpanElement;
  private errorMsg: HTMLDivElement;
  private joinCb?: (nickname: string, creepDesign: CreepDesign) => void;
  private showcase?: CreepsShowcase;
  private selectedCreep: CreepDesign;

  constructor() {
    this.screen = document.getElementById('login-screen') as HTMLDivElement;
    this.nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
    this.joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
    this.selectedCreepEl = document.getElementById('selected-creep') as HTMLSpanElement;
    this.statHpEl = document.getElementById('creep-stat-hp') as HTMLSpanElement;
    this.statDamageEl = document.getElementById('creep-stat-dmg') as HTMLSpanElement;
    this.statSpeedEl = document.getElementById('creep-stat-spd') as HTMLSpanElement;
    this.statDodgeEl = document.getElementById('creep-stat-dodge') as HTMLSpanElement;
    this.errorMsg = document.getElementById('error-msg') as HTMLDivElement;
    this.selectedCreep = 'ghost';

    this.joinBtn.addEventListener('click', () => this.handleJoin());
    this.nicknameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleJoin();
    });
    // Avoid auto-focusing the nickname input on touch devices (prevents keyboard from popping up)
    const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    if (!isTouch) this.nicknameInput.focus();

    // start the creeps preview showcase (will no-op if container missing)
    this.showcase = new CreepsShowcase();
    this.showcase.onSelect((design: string) => {
      if (!isCreepDesign(design)) return;
      this.selectedCreep = design;
      this.applySelectedCreep();
    });
    this.applySelectedCreep();
  }

  private applySelectedCreep(): void {
    this.selectedCreepEl.textContent = this.selectedCreep;
    this.showcase?.setSelectedDesign(this.selectedCreep);
    const stats = CREEP_STATS[this.selectedCreep];
    this.statHpEl.textContent = String(stats.maxHealth);
    this.statDamageEl.textContent = String(stats.damage);
    this.statSpeedEl.textContent = String(stats.speed);
    this.statDodgeEl.textContent = String(stats.dodge);
  }

  private handleJoin(): void {
    const nickname = this.nicknameInput.value.trim();
    if (!nickname) {
      this.setError('Please enter a nickname.');
      return;
    }
    this.joinCb?.(nickname, this.selectedCreep);
  }

  onJoin(cb: (nickname: string, creepDesign: CreepDesign) => void): void {
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

type MoveVector = { x: number; y: number; magnitude: number };
export type AimVector = { x: number; y: number; magnitude: number };
export type TouchButtonBehavior = 'directional-tilt' | 'directional-release' | 'tap' | 'hold';

type AbilityButtonState = {
  status: 'ready' | 'cooling' | 'casting';
  text: string;
  fillRatio: number;
};

type TouchControlsCallbacks = {
  onMove: (vector: MoveVector) => void;
  onAttack: (vector: AimVector) => void;
  onDodge: (vector: AimVector) => void;
  onSkillPlaceholder: (slot: 1 | 2, vector: AimVector) => void;
  onSkillHoldStart?: (slot: 1 | 2, vector: AimVector) => void;
  onSkillHoldEnd?: (slot: 1 | 2) => void;
};

const ZERO_AIM: AimVector = { x: 0, y: 0, magnitude: 0 };
const TILT_TRIGGER_THRESHOLD = 0.36;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTouchDevice(): boolean {
  const uaMobile = /Android|iPhone|iPad|iPod|Mobi|Mobile/i.test(navigator.userAgent || '');
  return (
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
    ('ontouchstart' in window) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    uaMobile
  );
}

export class TouchControls {
  static isTouchDevice(): boolean {
    return getTouchDevice();
  }

  private root: HTMLDivElement;
  private leftPad: HTMLDivElement;
  private stick: HTMLDivElement;
  private toast: HTMLDivElement;
  private callbacks: TouchControlsCallbacks;
  private joystickPointerId: number | null = null;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private currentVector: MoveVector = { x: 0, y: 0, magnitude: 0 };
  private abilityButtons: Record<'basic' | 'dodge' | 'special' | 'ultimate', HTMLButtonElement>;
  private buttonBehaviors: Record<'basic' | 'dodge' | 'special' | 'ultimate', TouchButtonBehavior> = {
    basic: 'directional-tilt',
    dodge: 'directional-tilt',
    special: 'directional-release',
    ultimate: 'hold',
  };
  private destroyFns: Array<() => void> = [];
  private toastTimeout: number | null = null;

  constructor(parent: HTMLElement, callbacks: TouchControlsCallbacks) {
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';

    const leftZone = document.createElement('div');
    leftZone.className = 'touch-zone touch-zone-left';
    this.leftPad = document.createElement('div');
    this.leftPad.className = 'touch-joystick';
    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick';
    this.leftPad.appendChild(this.stick);
    leftZone.appendChild(this.leftPad);

    const rightZone = document.createElement('div');
    rightZone.className = 'touch-zone touch-zone-right';

    const dodgeBtn = this.createActionButton('touch-btn-dodge', 'Dodge', 'DOD');
    const attackBtn = this.createActionButton('touch-btn-attack', 'Attack', 'ATK');
    const skill1Btn = this.createActionButton('touch-btn-skill', 'Special', 'S1');
    const skill2Btn = this.createActionButton('touch-btn-skill', 'Ultimate', 'S2');

    this.abilityButtons = {
      basic: attackBtn,
      dodge: dodgeBtn,
      special: skill1Btn,
      ultimate: skill2Btn,
    };

    rightZone.appendChild(dodgeBtn);
    rightZone.appendChild(attackBtn);
    rightZone.appendChild(skill1Btn);
    rightZone.appendChild(skill2Btn);

    this.toast = document.createElement('div');
    this.toast.className = 'touch-toast';

    this.root.appendChild(leftZone);
    this.root.appendChild(rightZone);
    this.root.appendChild(this.toast);
    parent.appendChild(this.root);

    this.bindJoystick();
    this.bindAbilityButton('basic', attackBtn);
    this.bindAbilityButton('dodge', dodgeBtn);
    this.bindAbilityButton('special', skill1Btn);
    this.bindAbilityButton('ultimate', skill2Btn);

    this.setButtonBehavior('basic', 'directional-tilt');
    this.setButtonBehavior('dodge', 'directional-tilt');
    this.setButtonBehavior('special', 'directional-release');
    this.setButtonBehavior('ultimate', this.callbacks.onSkillHoldStart ? 'hold' : 'tap');

    this.updateAbilityState('basic', { status: 'ready', text: 'Ready', fillRatio: 0 });
    this.updateAbilityState('dodge', { status: 'ready', text: 'Ready', fillRatio: 0 });
    this.updateAbilityState('special', { status: 'ready', text: 'Ready', fillRatio: 0 });
    this.updateAbilityState('ultimate', { status: 'ready', text: 'Ready', fillRatio: 0 });
  }

  destroy(): void {
    for (const fn of this.destroyFns) fn();
    this.destroyFns = [];
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.root.remove();
  }

  setButtonBehavior(slot: 'basic' | 'dodge' | 'special' | 'ultimate', behavior: TouchButtonBehavior): void {
    this.buttonBehaviors[slot] = behavior;
    const button = this.abilityButtons[slot];
    button.classList.remove('mode-directional-tilt', 'mode-directional-release', 'mode-tap', 'mode-hold');
    button.classList.add(`mode-${behavior}`);
  }

  updateAbilityState(slot: 'basic' | 'dodge' | 'special' | 'ultimate', state: AbilityButtonState): void {
    const button = this.abilityButtons[slot];
    if (!button) return;

    const clampedFill = clamp(state.fillRatio, 0, 1);
    button.classList.remove('ready', 'cooling', 'casting');
    button.classList.add(state.status);
    button.classList.toggle('touch-btn-disabled', state.status !== 'ready');

    const fill = button.querySelector('.touch-btn-fill') as HTMLDivElement | null;
    const cooldown = button.querySelector('.touch-btn-cooldown') as HTMLDivElement | null;
    if (fill) fill.style.height = `${Math.round(clampedFill * 100)}%`;
    if (cooldown) cooldown.textContent = state.text;
  }

  showPlaceholder(slot: 1 | 2): void {
    this.toast.textContent = `Skill ${slot}: Proximamente`;
    this.toast.classList.add('visible');
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toast.classList.remove('visible');
      this.toastTimeout = null;
    }, 900);
  }

  private createActionButton(extraClass: string, label: string, shortLabel: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-btn ${extraClass}`;

    const fill = document.createElement('div');
    fill.className = 'touch-btn-fill';

    const slash = document.createElement('div');
    slash.className = 'touch-btn-slash';

    const key = document.createElement('div');
    key.className = 'touch-btn-key';
    key.textContent = shortLabel;

    const name = document.createElement('div');
    name.className = 'touch-btn-label';
    name.textContent = label;

    const cooldown = document.createElement('div');
    cooldown.className = 'touch-btn-cooldown';
    cooldown.textContent = 'Ready';

    const aim = document.createElement('div');
    aim.className = 'touch-btn-aim';

    button.appendChild(fill);
    button.appendChild(slash);
    button.appendChild(key);
    button.appendChild(name);
    button.appendChild(cooldown);
    button.appendChild(aim);

    return button;
  }

  private resetButtonAim(button: HTMLButtonElement): void {
    button.style.setProperty('--aim-x', '0px');
    button.style.setProperty('--aim-y', '0px');
    button.classList.remove('aiming');
  }

  private computeButtonVector(button: HTMLButtonElement, clientX: number, clientY: number): AimVector {
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(28, Math.min(rect.width, rect.height) * 0.54);
    const clampedDist = Math.min(radius, dist);

    let nx = 0;
    let ny = 0;
    if (dist > 0.001) {
      nx = dx / dist;
      ny = dy / dist;
    }

    const tx = nx * clampedDist;
    const ty = ny * clampedDist;
    button.style.setProperty('--aim-x', `${tx.toFixed(1)}px`);
    button.style.setProperty('--aim-y', `${ty.toFixed(1)}px`);
    button.classList.toggle('aiming', clampedDist > radius * 0.16);

    return {
      x: nx,
      y: ny,
      magnitude: clamp(clampedDist / radius, 0, 1),
    };
  }

  private emitActivate(slot: 'basic' | 'dodge' | 'special' | 'ultimate', vector: AimVector): void {
    if (slot === 'basic') {
      this.callbacks.onAttack(vector);
      return;
    }
    if (slot === 'dodge') {
      this.callbacks.onDodge(vector);
      return;
    }
    if (slot === 'special') {
      this.callbacks.onSkillPlaceholder(1, vector);
      return;
    }
    this.callbacks.onSkillPlaceholder(2, vector);
  }

  private emitHoldStart(slot: 'special' | 'ultimate', vector: AimVector): void {
    if (slot === 'special') {
      this.callbacks.onSkillHoldStart?.(1, vector);
      return;
    }
    this.callbacks.onSkillHoldStart?.(2, vector);
  }

  private emitHoldEnd(slot: 'special' | 'ultimate'): void {
    if (slot === 'special') {
      this.callbacks.onSkillHoldEnd?.(1);
      return;
    }
    this.callbacks.onSkillHoldEnd?.(2);
  }

  private bindAbilityButton(
    slot: 'basic' | 'dodge' | 'special' | 'ultimate',
    button: HTMLButtonElement
  ): void {
    let activePointerId: number | null = null;
    let currentVector: AimVector = ZERO_AIM;
    let tiltTriggered = false;
    let holdStarted = false;

    const pointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      activePointerId = e.pointerId;
      tiltTriggered = false;
      holdStarted = false;
      try { button.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      button.classList.add('pressed');
      currentVector = this.computeButtonVector(button, e.clientX, e.clientY);

      const behavior = this.buttonBehaviors[slot];
      if (behavior === 'tap') {
        this.emitActivate(slot, ZERO_AIM);
      } else if (behavior === 'hold' && (slot === 'special' || slot === 'ultimate')) {
        this.emitHoldStart(slot, ZERO_AIM);
        holdStarted = true;
      } else if (behavior === 'directional-tilt' && currentVector.magnitude >= TILT_TRIGGER_THRESHOLD) {
        this.emitActivate(slot, currentVector);
        tiltTriggered = true;
      }
    };

    const pointerMove = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();
      currentVector = this.computeButtonVector(button, e.clientX, e.clientY);

      const behavior = this.buttonBehaviors[slot];
      if (behavior === 'directional-tilt' && !tiltTriggered && currentVector.magnitude >= TILT_TRIGGER_THRESHOLD) {
        this.emitActivate(slot, currentVector);
        tiltTriggered = true;
      }
    };

    const release = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      try { button.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }

      const behavior = this.buttonBehaviors[slot];
      if (behavior === 'directional-release') {
        this.emitActivate(slot, currentVector);
      } else if (behavior === 'hold' && holdStarted && (slot === 'special' || slot === 'ultimate')) {
        this.emitHoldEnd(slot);
      }

      activePointerId = null;
      tiltTriggered = false;
      holdStarted = false;
      currentVector = ZERO_AIM;
      button.classList.remove('pressed');
      this.resetButtonAim(button);
    };

    button.addEventListener('pointerdown', pointerDown);
    button.addEventListener('pointermove', pointerMove);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    this.destroyFns.push(() => button.removeEventListener('pointerdown', pointerDown));
    this.destroyFns.push(() => button.removeEventListener('pointermove', pointerMove));
    this.destroyFns.push(() => button.removeEventListener('pointerup', release));
    this.destroyFns.push(() => button.removeEventListener('pointercancel', release));
    this.destroyFns.push(() => button.removeEventListener('lostpointercapture', release));
  }

  private bindJoystick(): void {
    const recalcCenter = () => {
      const rect = this.leftPad.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickPointerId !== null) return;
      recalcCenter();
      this.joystickPointerId = e.pointerId;
      try { this.leftPad.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this.updateJoystick(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      this.updateJoystick(e.clientX, e.clientY);
    };

    const finishPointer = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      try { this.leftPad.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this.joystickPointerId = null;
      this.currentVector = { x: 0, y: 0, magnitude: 0 };
      this.stick.style.transform = 'translate(0px, 0px)';
      this.callbacks.onMove(this.currentVector);
    };

    this.leftPad.addEventListener('pointerdown', onPointerDown);
    this.leftPad.addEventListener('pointermove', onPointerMove);
    this.leftPad.addEventListener('pointerup', finishPointer);
    this.leftPad.addEventListener('pointercancel', finishPointer);
    window.addEventListener('resize', recalcCenter);

    this.destroyFns.push(() => this.leftPad.removeEventListener('pointerdown', onPointerDown));
    this.destroyFns.push(() => this.leftPad.removeEventListener('pointermove', onPointerMove));
    this.destroyFns.push(() => this.leftPad.removeEventListener('pointerup', finishPointer));
    this.destroyFns.push(() => this.leftPad.removeEventListener('pointercancel', finishPointer));
    this.destroyFns.push(() => window.removeEventListener('resize', recalcCenter));

    recalcCenter();
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const radius = 44;
    const dx = clientX - this.joystickCenterX;
    const dy = clientY - this.joystickCenterY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(radius, dist);

    let nx = 0;
    let ny = 0;
    if (dist > 0.001) {
      nx = dx / dist;
      ny = dy / dist;
    }

    const translatedX = nx * clampedDist;
    const translatedY = ny * clampedDist;
    this.stick.style.transform = `translate(${translatedX}px, ${translatedY}px)`;

    const magnitude = clamp(clampedDist / radius, 0, 1);
    this.currentVector = { x: nx, y: ny, magnitude };
    this.callbacks.onMove(this.currentVector);
  }
}

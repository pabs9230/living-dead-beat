type MoveVector = { x: number; y: number; magnitude: number };

type TouchControlsCallbacks = {
  onMove: (vector: MoveVector) => void;
  onAttack: () => void;
  onDodge: () => void;
  onSkillPlaceholder: (slot: 1 | 2) => void;
  onSkillHoldStart?: (slot: 1 | 2) => void;
  onSkillHoldEnd?: (slot: 1 | 2) => void;
};

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

    const dodgeBtn = this.createActionButton('touch-btn-dodge', 'Dodge');
    const attackBtn = this.createActionButton('touch-btn-attack', 'Attack');
    const skill1Btn = this.createActionButton('touch-btn-skill', 'S1');
    const skill2Btn = this.createActionButton('touch-btn-skill', 'S2');

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
    this.bindButton(dodgeBtn, () => this.callbacks.onDodge());
    this.bindButton(attackBtn, () => this.callbacks.onAttack());
    this.bindButton(skill1Btn, () => this.callbacks.onSkillPlaceholder(1));
    this.bindButton(
      skill2Btn,
      () => {
        if (this.callbacks.onSkillHoldStart) {
          this.callbacks.onSkillHoldStart(2);
          return;
        }
        this.callbacks.onSkillPlaceholder(2);
      },
      () => {
        this.callbacks.onSkillHoldEnd?.(2);
      }
    );
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

  showPlaceholder(slot: 1 | 2): void {
    this.toast.textContent = `Skill ${slot}: Proximamente`;
    this.toast.classList.add('visible');
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toast.classList.remove('visible');
      this.toastTimeout = null;
    }, 900);
  }

  private createActionButton(extraClass: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-btn ${extraClass}`;
    button.textContent = label;
    return button;
  }

  private bindButton(button: HTMLButtonElement, onPress: () => void, onRelease?: () => void): void {
    let activePointerId: number | null = null;

    const handler = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      activePointerId = e.pointerId;
      try { button.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      onPress();
      button.classList.add('pressed');
    };

    const release = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      try { button.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      activePointerId = null;
      button.classList.remove('pressed');
      onRelease?.();
    };

    button.addEventListener('pointerdown', handler);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    this.destroyFns.push(() => button.removeEventListener('pointerdown', handler));
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

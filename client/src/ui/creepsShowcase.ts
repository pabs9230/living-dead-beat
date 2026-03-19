import { drawGhost, drawBat, drawCat, drawVampire, drawZombie, drawMedusa, drawSphynx } from '../rendering/sprites';

const SPRITE_COLORS: { body: string; outline: string; name: string }[] = [
  { body: '#8B0000', outline: '#3a0000', name: 'Crimson' },
  { body: '#B22222', outline: '#4a0000', name: 'Blood' },
  { body: '#7f1a1a', outline: '#2f0f0f', name: 'Gore' },
  { body: '#d9b7bb', outline: '#5a1e2a', name: 'Pallor' },
];

type Preview = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  design: string;
  name: string;
  colorIdx: number;
  displayW: number;
  displayH: number;
  dpr: number;
  wrapper: HTMLDivElement;
};

export class CreepsShowcase {
  private previews: Preview[] = [];
  private selectedDesign = 'ghost';
  private raf?: number;
  private resizeListener?: () => void;
  private selectCb?: (design: string) => void;

  constructor(containerId = 'creeps-showcase') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const designs = ['ghost','bat','cat','vampire','zombie','medusa','sphynx'];
    const displayNames: Record<string,string> = { ghost: 'Ghost', bat:'Bat', cat:'Cat', vampire:'Vampire', zombie:'Zombie', medusa:'Medusa', sphynx:'Sphynx' };

    for (let i = 0; i < designs.length; i++) {
      const d = designs[i];
      const wrapper = document.createElement('div');
      wrapper.className = 'creep';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('aria-label', `Select ${displayNames[d]} creep`);

      const canvas = document.createElement('canvas');
      // desired CSS display size for the preview
      const displaySize = 120;
      canvas.style.width = `${displaySize}px`;
      canvas.style.height = `${displaySize}px`;
      // set high-DPI backing store for crisp small details
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = displaySize * dpr;
      canvas.height = displaySize * dpr;
      canvas.className = 'creep-canvas';
      wrapper.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = displayNames[d];
      wrapper.appendChild(label);

      container.appendChild(wrapper);

      const ctx = canvas.getContext('2d')!;
      // scale drawing so 1 unit == 1 CSS pixel (avoid manual scaling in draw routines)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.previews.push({ canvas, ctx, design: d, name: displayNames[d], colorIdx: i % SPRITE_COLORS.length, displayW: displaySize, displayH: displaySize, dpr, wrapper });

      const select = () => {
        this.setSelectedDesign(d);
        this.selectCb?.(d);
      };

      wrapper.addEventListener('click', select);
      wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
    }

    // initial responsive sizing and attach resize listener
    this.updateSizes();
    this.resizeListener = () => this.updateSizes();
    window.addEventListener('resize', this.resizeListener);

    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = undefined;
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
  }

  private computeDisplaySize(containerW: number, containerH: number, count: number) {
    const gap = Math.max(4, Math.min(10, Math.round(window.innerHeight * 0.01)));
    const maxSize = 200;
    const minSize = window.innerHeight < 520 ? 46 : 54;
    const labelHeight = window.innerHeight < 560 ? 14 : 18;

    let bestSize = minSize;
    let bestCols = count;

    // Evaluate all column counts and keep the biggest sprite size that fits both axes.
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const widthBudget = Math.max(0, containerW - Math.max(0, (columns - 1) * gap) - 8);
      const heightBudget = Math.max(0, containerH - Math.max(0, (rows - 1) * gap) - rows * labelHeight - 6);
      const sizeByWidth = Math.floor(widthBudget / columns);
      const sizeByHeight = Math.floor(heightBudget / rows);
      const size = Math.min(maxSize, sizeByWidth, sizeByHeight);
      if (size >= bestSize) {
        bestSize = size;
        bestCols = columns;
      }
    }

    return {
      size: Math.max(minSize, Math.min(maxSize, bestSize)),
      columns: bestCols,
      gap,
    };
  }

  private updateSizes() {
    const container = document.getElementById('creeps-showcase');
    if (!container || this.previews.length === 0) return;
    const rect = container.getBoundingClientRect();
    const metrics = this.computeDisplaySize(rect.width, rect.height, this.previews.length);
    const displaySize = metrics.size;

    container.style.gap = `${metrics.gap}px`;

    for (const p of this.previews) {
      p.displayW = displaySize;
      p.displayH = displaySize;
      p.wrapper.style.width = `${displaySize}px`;
      p.wrapper.style.flexBasis = `${displaySize}px`;
      p.canvas.style.width = `${displaySize}px`;
      p.canvas.style.height = `${displaySize}px`;
      const dpi = p.dpr;
      p.canvas.width = Math.max(1, Math.floor(displaySize * dpi));
      p.canvas.height = Math.max(1, Math.floor(displaySize * dpi));
      // reset transform to map CSS pixels to drawing units
      p.ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    }
  }

  private loop(ts: number) {
    for (let i = 0; i < this.previews.length; i++) {
      const p = this.previews[i];
      this.drawPreview(p, ts, i);
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private drawPreview(p: Preview, time: number, idx: number) {
    const ctx = p.ctx;
    const w = p.displayW;
    const h = p.displayH;
    // clear in CSS pixel coordinates (context is already scaled)
    ctx.clearRect(0, 0, w, h);

    // subtle background + vignette
    ctx.fillStyle = 'rgba(10,0,0,0.18)';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.translate(w/2, h*0.62);
    const bob = Math.sin((time * 0.001) + idx * 0.56) * 6;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 26, 20, 7, 0, 0, Math.PI*2); ctx.fill();

    const colors = SPRITE_COLORS[p.colorIdx];
    const design = p.design;

    switch (design) {
      case 'ghost': drawGhost(ctx, bob, colors, time, false, idx); break;
      case 'bat': drawBat(ctx, bob, colors, time, false, idx); break;
      case 'cat': drawCat(ctx, bob, colors, time, false, idx); break;
      case 'vampire': drawVampire(ctx, bob, colors, time, false, idx); break;
      case 'zombie': drawZombie(ctx, bob, colors, time, false, idx); break;
      case 'medusa': drawMedusa(ctx, bob, colors, time, false, idx); break;
      case 'sphynx': drawSphynx(ctx, bob, colors, time, false, idx); break;
      default: drawGhost(ctx, bob, colors, time, false, idx); break;
    }

    ctx.restore();

    if (p.design === this.selectedDesign) {
      p.wrapper.classList.add('selected');
    } else {
      p.wrapper.classList.remove('selected');
    }
  }

  setSelectedDesign(design: string): void {
    this.selectedDesign = design;
  }

  onSelect(cb: (design: string) => void): void {
    this.selectCb = cb;
  }

}

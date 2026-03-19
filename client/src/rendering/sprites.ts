// Shared sprite draw helpers used by both the in-game renderer and the UI previews
export type SpriteCombatAction = 'idle' | 'move' | 'attack' | 'dodge' | 'special' | 'ultimate';

export interface SpriteAnimationState {
  action?: SpriteCombatAction;
  animFrame?: number;
  facingAngle?: number;
  castProgress?: number;
  castTargetOffsetX?: number;
  castTargetOffsetY?: number;
}

const BAT_SPECIAL_AREA_RADIUS = 1760;
const BAT_ULTIMATE_AREA_RADIUS = 220;

export function drawGhost(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  void colors; void time; void variant;
  ctx.save();
  ctx.translate(0, bob);

  // Classic floating sheet ghost with scalloped bottom and a 'D:' style face
  const topY = -34;
  const midY = -8;
  const baseW = 36;

  ctx.beginPath();
  ctx.moveTo(-baseW / 2, midY);
  ctx.quadraticCurveTo(-baseW / 2, topY - 8, 0, topY - 12);
  ctx.quadraticCurveTo(baseW / 2, topY - 8, baseW / 2, midY);
  // scalloped bottom
  ctx.quadraticCurveTo(baseW / 4, midY + 18, 0, midY + 12);
  ctx.quadraticCurveTo(-baseW / 4, midY + 18, -baseW / 2, midY);
  ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = isLocal ? 2 : 1.2; ctx.fill(); ctx.stroke();

  // Eyes (classic sheet ghost dots)
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-8, -14, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(8, -14, 2.6, 0, Math.PI * 2); ctx.fill();

  // Big 'D' mouth (emoticon-style)
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.rect(-10, -2, 4, 10); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-6, 3, 6.5, 6.5, 0, -Math.PI/2, Math.PI/2); ctx.fill();

  ctx.restore();
}

export function drawBat(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  void isLocal;
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.6 + Math.abs(Math.sin((time || 0) * 0.035 + variant)) * 0.4) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.018 + variant * 0.5) * 0.5) : 0;
  const ultimatePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.024 + variant * 0.8) * 0.5) : 0;
  const castProgress = Math.max(0, Math.min(1, anim?.castProgress ?? 0));
  const areaCenterX = 0;
  const areaCenterY = 0;
  const lunge = attackPulse * 6 + dodgePulse * 8;
  ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.4 - dodgePulse * 1.5);

  if (action === 'dodge') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(181,224,255,0.8)';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.2 + dodgePulse * 0.35;
    for (let i = 0; i < 3; i++) {
      const y = -7 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-30 - i * 7, y);
      ctx.lineTo(-9 - i * 5, y + (i - 1) * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (action === 'special') {
    ctx.save();
    const waveDrift = (time || 0) * 0.004;
    const outerRadius = BAT_SPECIAL_AREA_RADIUS;

    // Whole-area sonic field with moving rings to make affected zone obvious.
    const sonicGradient = ctx.createRadialGradient(areaCenterX, areaCenterY, outerRadius * 0.1, areaCenterX, areaCenterY, outerRadius);
    sonicGradient.addColorStop(0, 'rgba(150,246,255,0.02)');
    sonicGradient.addColorStop(0.6, 'rgba(110,214,255,0.045)');
    sonicGradient.addColorStop(1, 'rgba(80,190,255,0.09)');
    ctx.fillStyle = sonicGradient;
    ctx.beginPath();
    ctx.arc(areaCenterX, areaCenterY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = 'rgba(120,236,255,0.76)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(areaCenterX, areaCenterY, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 4; i++) {
      const t = (waveDrift * 0.8 + i * 0.22 + castProgress * 0.4) % 1;
      const r = outerRadius * (0.2 + t * 0.78);
      ctx.globalAlpha = 0.12 + (1 - t) * 0.2;
      ctx.strokeStyle = 'rgba(165,248,255,0.92)';
      ctx.lineWidth = 1.8 + (1 - t) * 1.4;
      ctx.beginPath();
      ctx.arc(areaCenterX, areaCenterY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.2 + specialPulse * 0.32;
    ctx.strokeStyle = 'rgba(132,232,255,0.88)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(0, -4, 19 + specialPulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -4, 28 + specialPulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (action === 'ultimate') {
    ctx.save();
    const bloodPulse = 0.5 + Math.sin((time || 0) * 0.01 + variant * 0.9) * 0.5;
    const auraRadius = BAT_ULTIMATE_AREA_RADIUS;

    // Blood-atmosphere filter over the full affected channel area.
    const bloodGradient = ctx.createRadialGradient(areaCenterX, areaCenterY, auraRadius * 0.22, areaCenterX, areaCenterY, auraRadius);
    bloodGradient.addColorStop(0, `rgba(120,6,22,${(0.26 + bloodPulse * 0.12).toFixed(3)})`);
    bloodGradient.addColorStop(0.7, `rgba(92,5,18,${(0.2 + bloodPulse * 0.09).toFixed(3)})`);
    bloodGradient.addColorStop(1, 'rgba(72,4,14,0.05)');
    ctx.fillStyle = bloodGradient;
    ctx.beginPath();
    ctx.arc(areaCenterX, areaCenterY, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const swirl = ((time || 0) * 0.002 + i * 0.31 + castProgress * 0.6) % 1;
      const r = auraRadius * (0.35 + swirl * 0.55);
      ctx.globalAlpha = 0.15 + (1 - swirl) * 0.2;
      ctx.strokeStyle = 'rgba(210,66,78,0.82)';
      ctx.lineWidth = 1.6 + (1 - swirl) * 1.2;
      ctx.beginPath();
      ctx.arc(areaCenterX, areaCenterY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([10, 8]);
    ctx.globalAlpha = 0.5 + ultimatePulse * 0.3;
    ctx.strokeStyle = 'rgba(255,96,108,0.9)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(areaCenterX, areaCenterY, auraRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.23 + ultimatePulse * 0.35;
    ctx.strokeStyle = 'rgba(224,86,104,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -2, 24 + ultimatePulse * 5, 11 + ultimatePulse * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Faster vertical wing flapping
  const phase = (time || 0) * 0.0032 + variant * 0.8;
  const lift = Math.sin(phase) * (0.95 + specialPulse * 0.45 + ultimatePulse * 0.38) + dodgePulse * 0.26;

  // Left wing - more bat-like with a scalloped edge
  const leftBaseX = -8, leftBaseY = -6;
  const leftTipX = -38, leftTipY = -6 - lift * 22;
  const leftMidX = -22, leftMidY = -12 - lift * 14;
  ctx.beginPath();
  ctx.moveTo(leftBaseX, leftBaseY);
  ctx.quadraticCurveTo(-18, -18 - lift * 10, leftMidX, leftMidY);
  ctx.quadraticCurveTo(-28, -8 - lift * 10, leftTipX, leftTipY);
  ctx.quadraticCurveTo(-26, -2 - lift * 6, -22, -6 - lift * 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Right wing (mirror horizontally)
  const rightBaseX = 8, rightBaseY = -6;
  const rightTipX = 38, rightTipY = -6 - lift * 22;
  const rightMidX = 22, rightMidY = -12 - lift * 14;
  ctx.beginPath();
  ctx.moveTo(rightBaseX, rightBaseY);
  ctx.quadraticCurveTo(18, -18 - lift * 10, rightMidX, rightMidY);
  ctx.quadraticCurveTo(28, -8 - lift * 10, rightTipX, rightTipY);
  ctx.quadraticCurveTo(26, -2 - lift * 6, 22, -6 - lift * 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Ears (pointed)
  ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-10, -22); ctx.lineTo(-2, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(10, -22); ctx.lineTo(2, -16); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Eyes (bright) and fangs
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-4, -10, 3, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4, -10, 3, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-4, -10, 1.4, 1.8, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4, -10, 1.4, 1.8, 0, 0, Math.PI*2); ctx.fill();

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.58 + ultimatePulse * 0.34;
    ctx.shadowBlur = 7 + ultimatePulse * 6;
    ctx.shadowColor = 'rgba(255,98,104,0.92)';
    ctx.fillStyle = 'rgba(255,126,126,0.95)';
    ctx.beginPath(); ctx.ellipse(-4, -10, 1.5 + ultimatePulse * 0.9, 1.8 + ultimatePulse * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, -10, 1.5 + ultimatePulse * 0.9, 1.8 + ultimatePulse * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Small fangs
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-3, 2); ctx.lineTo(-1, 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(1, 2); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill();

  if (action === 'attack') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.34 + attackPulse * 0.45;
    ctx.strokeStyle = 'rgba(255,188,166,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(7, -5);
    ctx.quadraticCurveTo(15 + attackPulse * 8, -7, 23 + attackPulse * 10, -5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawCat(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.6 + Math.abs(Math.sin((time || 0) * 0.035 + variant)) * 0.4) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.02 + variant * 0.7) * 0.5) : 0;
  const ragePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.028 + variant * 0.9) * 0.5) : 0;
  const lunge = attackPulse * 4.8 + dodgePulse * 6.4;
  ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.55 - dodgePulse * 1.4);

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.26 + ragePulse * 0.24;
    ctx.strokeStyle = 'rgba(229,70,84,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 24 + ragePulse * 3, 11 + ragePulse * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,172,122,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 30 + ragePulse * 4, 14 + ragePulse * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (action === 'dodge') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(192,222,255,0.82)';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.22 + dodgePulse * 0.38;
    for (let i = 0; i < 3; i++) {
      const y = -4 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-30 - i * 7, y);
      ctx.lineTo(-9 - i * 6, y + (i - 1) * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Layout for in-game cat
  const headR = 10;
  const bodyX = -8, bodyY = -2, bodyW = 20, bodyH = 14;

  // Tail (senoidal along its length) - sample a smooth sine-wave-shaped curve
  const phase = (time * 0.0015) + (variant * 0.43);
  const tailBaseX = bodyX + bodyW;
  const tailBaseY = Math.round(bodyY + bodyH * 0.36);
  const tailLen = 34 * (isLocal ? 1.05 : 1);
  const baseAngle = Math.sin(phase) * 0.6 + 0.28 + dodgePulse * 0.26; // main tail direction

  const dirX = Math.cos(baseAngle);
  const dirY = Math.sin(baseAngle);
  const perpX = Math.cos(baseAngle + Math.PI / 2);
  const perpY = Math.sin(baseAngle + Math.PI / 2);

  const segments = 10;
  const waveCount = 2.0; // number of sine cycles along the tail
  const amplitude = tailLen * (0.12 + specialPulse * 0.045 + ragePulse * 0.04);

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    const dist = s * tailLen;
    const baseX = tailBaseX + dirX * dist;
    const baseY = tailBaseY + dirY * dist;
    const taper = s; // amplitude grows toward the tip
    const offset = Math.sin(s * Math.PI * 2 * waveCount + phase * 1.2) * amplitude * taper;
    const x = baseX + perpX * offset;
    const y = baseY + perpY * offset;
    pts.push({ x, y });
  }

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(tailBaseX, tailBaseY);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = colors.outline; ctx.lineWidth = 6; ctx.stroke();

  ctx.beginPath(); ctx.moveTo(tailBaseX, tailBaseY);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = colors.body; ctx.lineWidth = 4; ctx.stroke();

  // Body
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);

  // Paws
  const pawY = bodyY + bodyH - 1;
  const pawXs = [-7, -3, 3, 7];
  ctx.fillStyle = '#efe0c8';
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1;
  for (const px of pawXs) {
    ctx.beginPath(); ctx.ellipse(px, pawY, 2.8, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  if (action === 'attack' || action === 'special') {
    const slashGlow = action === 'special' ? 'rgba(255,112,112,0.95)' : 'rgba(255,222,178,0.9)';
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.38 + attackPulse * 0.35 + specialPulse * 0.2;
    ctx.strokeStyle = slashGlow;
    ctx.lineWidth = action === 'special' ? 2.2 : 1.6;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(7, -2 + i * 2.3);
      ctx.quadraticCurveTo(15 + attackPulse * 6 + specialPulse * 5, -6 + i * 3, 23 + attackPulse * 9 + specialPulse * 8, -2 + i * 2.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Head and ears
  ctx.fillStyle = '#efe0c8';
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;
  ctx.beginPath(); ctx.arc(0, -12, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const earDrop = dodgePulse * 3.4;
  ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(-10, -24 + earDrop); ctx.lineTo(-2, -20 + earDrop * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(10, -24 + earDrop); ctx.lineTo(2, -20 + earDrop * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Eyes
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-3, -12, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, -12, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.62 + ragePulse * 0.28;
    ctx.shadowBlur = 7 + ragePulse * 7;
    ctx.shadowColor = 'rgba(255,96,96,0.92)';
    ctx.fillStyle = 'rgba(255,122,122,0.95)';
    ctx.beginPath(); ctx.ellipse(-3, -12, 1.5 + ragePulse * 0.8, 2.4 + ragePulse * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3, -12, 1.5 + ragePulse * 0.8, 2.4 + ragePulse * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Nose (small triangle) and whiskers
  ctx.fillStyle = '#d86969';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-2, -6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = colors.outline; ctx.lineWidth = 1;
  // Whiskers - left
  ctx.beginPath(); ctx.moveTo(-1, -7); ctx.lineTo(-12, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(-12, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1, -5); ctx.lineTo(-12, -3); ctx.stroke();
  // Whiskers - right
  ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(12, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(12, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(12, -3); ctx.stroke();

  ctx.restore();
}

export function drawVampire(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.6 + Math.abs(Math.sin((time || 0) * 0.03 + variant * 0.8)) * 0.4) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.018 + variant * 0.6) * 0.5) : 0;
  const ultimatePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.025 + variant * 0.9) * 0.5) : 0;
  const lunge = attackPulse * 4.8 + dodgePulse * 5.8;
  ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.45 - dodgePulse * 1.5);

  if (action === 'dodge') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(212,198,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.2 + dodgePulse * 0.34;
    for (let i = 0; i < 3; i++) {
      const y = -7 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-31 - i * 7, y);
      ctx.lineTo(-11 - i * 5, y + (i - 1) * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (action === 'special') {
    ctx.save();
    ctx.globalAlpha = 0.22 + specialPulse * 0.32;
    ctx.strokeStyle = 'rgba(216,62,98,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 3, 22 + specialPulse * 5, 10 + specialPulse * 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.2 + ultimatePulse * 0.38;
    ctx.strokeStyle = 'rgba(112,26,132,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 28 + ultimatePulse * 6, 13 + ultimatePulse * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const phase = (time || 0) * 0.0022 + variant * 0.8;
  const sway = Math.sin(phase) * 1.2;
  const capePulse = Math.sin(phase * 1.7) * (1.8 + specialPulse * 1.2 + ultimatePulse * 1.4);

  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.4;

  // Outer cape silhouette: wider base and curved wings so the body feels heavier.
  ctx.fillStyle = '#2b0b26';
  ctx.beginPath();
  ctx.moveTo(-3 + sway * 0.2, -12);
  ctx.quadraticCurveTo(-22, -6 + capePulse * 0.15, -30, 16 + capePulse * 0.5);
  ctx.quadraticCurveTo(-14, 18 + capePulse, -7, 12);
  ctx.quadraticCurveTo(0, 20 + capePulse * 0.8, 7, 12);
  ctx.quadraticCurveTo(14, 18 + capePulse, 30, 16 + capePulse * 0.5);
  ctx.quadraticCurveTo(22, -6 + capePulse * 0.15, 3 + sway * 0.2, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner cape lining for contrast and richer shape language.
  ctx.fillStyle = '#6d1432';
  ctx.beginPath();
  ctx.moveTo(-1, -9);
  ctx.quadraticCurveTo(-16, -2, -18, 12 + capePulse * 0.4);
  ctx.quadraticCurveTo(-7, 11, -4, 6);
  ctx.quadraticCurveTo(0, 12 + capePulse * 0.5, 4, 6);
  ctx.quadraticCurveTo(7, 11, 18, 12 + capePulse * 0.4);
  ctx.quadraticCurveTo(16, -2, 1, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Torso: aristocratic coat with vest detail.
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.moveTo(-11, -4);
  ctx.lineTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.lineTo(11, -4);
  ctx.quadraticCurveTo(0, -10, -11, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#a11f3c';
  ctx.beginPath();
  ctx.moveTo(-5, -1);
  ctx.lineTo(-4, 13);
  ctx.lineTo(4, 13);
  ctx.lineTo(5, -1);
  ctx.quadraticCurveTo(0, -4, -5, -1);
  ctx.closePath();
  ctx.fill();

  // Gold clasp and coat split.
  ctx.fillStyle = '#d6b45f';
  ctx.fillRect(-3, 2, 6, 2.4);
  ctx.fillStyle = '#2f0a1f';
  ctx.fillRect(-1, 4.5, 2, 8.2);

  // Arms / gloves.
  ctx.fillStyle = '#351326';
  ctx.beginPath();
  ctx.roundRect(-16, 1 + sway * 0.2, 6.5, 11, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(9.5, 1 - sway * 0.2, 6.5, 11, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f2dcdc';
  ctx.beginPath(); ctx.ellipse(-12.8, 12.5 + sway * 0.15, 2.2, 1.6, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12.8, 12.5 - sway * 0.15, 2.2, 1.6, 0.2, 0, Math.PI * 2); ctx.fill();

  if (action === 'attack' || action === 'special') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.35 + attackPulse * 0.34 + specialPulse * 0.26;
    ctx.strokeStyle = action === 'special' ? 'rgba(255,88,116,0.92)' : 'rgba(255,202,180,0.9)';
    ctx.lineWidth = action === 'special' ? 2.3 : 1.7;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(7, -4 + i * 2.5);
      ctx.quadraticCurveTo(16 + attackPulse * 6 + specialPulse * 5, -8 + i * 3, 25 + attackPulse * 10 + specialPulse * 9, -4 + i * 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Boots to avoid the old floating-triangle look.
  ctx.fillStyle = '#130912';
  ctx.beginPath(); ctx.roundRect(-8.4, 13.6, 6.1, 4.8, 1.4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(2.3, 13.6, 6.1, 4.8, 1.4); ctx.fill(); ctx.stroke();

  // High collar framing the face.
  ctx.fillStyle = '#381833';
  ctx.beginPath();
  ctx.moveTo(-12, -8);
  ctx.lineTo(-5, -16);
  ctx.lineTo(-1, -10);
  ctx.lineTo(-7, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, -8);
  ctx.lineTo(5, -16);
  ctx.lineTo(1, -10);
  ctx.lineTo(7, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head and face are intentionally kept close to the original design.
  ctx.fillStyle = '#f6e7e7';
  ctx.beginPath();
  ctx.arc(0, -11, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hairline / widow's peak.
  ctx.fillStyle = '#12070f';
  ctx.beginPath();
  ctx.moveTo(-7, -15);
  ctx.quadraticCurveTo(0, -21, 7, -15);
  ctx.lineTo(5, -12);
  ctx.lineTo(0, -14.5);
  ctx.lineTo(-5, -12);
  ctx.closePath();
  ctx.fill();

  // Eyes and fangs from the previous version.
  ctx.fillStyle = '#000';
  ctx.fillRect(-4, -13, 3, 3);
  ctx.fillRect(1, -13, 3, 3);

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.6 + ultimatePulse * 0.3;
    ctx.shadowBlur = 8 + ultimatePulse * 7;
    ctx.shadowColor = 'rgba(192,88,255,0.92)';
    ctx.fillStyle = 'rgba(214,140,255,0.95)';
    ctx.fillRect(-4, -13, 3, 3);
    ctx.fillRect(1, -13, 3, 3);
    ctx.restore();
  }

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(-2, -1.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(2, -1.2); ctx.stroke();

  ctx.restore();
}

export function drawZombie(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  void isLocal;
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.62 + Math.abs(Math.sin((time || 0) * 0.036 + variant * 0.7)) * 0.38) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.017 + variant * 0.4) * 0.5) : 0;
  const ultimatePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.026 + variant * 0.9) * 0.5) : 0;
  const lunge = attackPulse * 4.5 + dodgePulse * 5.5;

  if (action === 'dodge') {
    ctx.save();
    ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.4 - dodgePulse * 1.4);
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(166,214,140,0.78)';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.2 + dodgePulse * 0.34;
    for (let i = 0; i < 3; i++) {
      const y = -5 + i * 4.5;
      ctx.beginPath();
      ctx.moveTo(-31 - i * 7, y);
      ctx.lineTo(-10 - i * 6, y + (i - 1) * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.4 - dodgePulse * 1.1);

  if (action === 'special') {
    ctx.save();
    ctx.globalAlpha = 0.22 + specialPulse * 0.28;
    ctx.strokeStyle = 'rgba(125,255,142,0.82)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 6, 20 + specialPulse * 5, 11 + specialPulse * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.22 + ultimatePulse * 0.34;
    ctx.strokeStyle = 'rgba(188,72,92,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 5, 24 + ultimatePulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Add a subtle shaking effect to zombie characters to convey instability
  const shakeX = Math.sin((time || 0) * 0.02 + (bob * 0.3)) * (1.8 + specialPulse * 0.7 + ultimatePulse * 0.9);
  const shakeY = Math.cos((time || 0) * 0.015 + (bob * 0.25)) * (0.9 + specialPulse * 0.35);
  ctx.translate(shakeX, bob + shakeY);

  // Head base
  const headCX = 0;
  const headCY = -10;
  const headR = 9;
  ctx.fillStyle = '#cfeebb'; ctx.strokeStyle = colors.outline; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Exposed brain (right-side, plump lobes)
  const brainX = headCX + 5;
  const brainY = headCY - 6;
  ctx.fillStyle = '#e58aa2'; ctx.strokeStyle = '#8a3f4b'; ctx.lineWidth = 0.8;
  // main brain blob
  ctx.beginPath(); ctx.ellipse(brainX, brainY, 7, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // lobes
  ctx.beginPath(); ctx.arc(brainX - 2, brainY - 2, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(brainX + 2, brainY - 1, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(brainX - 1, brainY + 2, 2.1, 0, Math.PI * 2); ctx.fill();

  // Ragged skull edge (suggest torn flesh)
  ctx.fillStyle = '#c07a6a';
  ctx.beginPath();
  const jagCount = 6;
  ctx.moveTo(headCX + 2, headCY - headR + 2);
  for (let j = 0; j <= jagCount; j++) {
    const a = -Math.PI/2 + (j / jagCount) * Math.PI * 0.9;
    const r = headR - 1 + Math.sin((time || 0) * 0.005 + j) * 0.8;
    const x = headCX + Math.cos(a) * r;
    const y = headCY + Math.sin(a) * r;
    ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();

  // Blood splashes animated from the exposed area
  for (let s = 0; s < 5; s++) {
    const p = s / 5;
    const ph = (time || 0) * 0.006 + s * 0.7 + variant * 0.4;
    const sx = brainX + Math.cos(ph * 1.7) * (6 + p * 6);
    const sy = brainY + Math.abs(Math.sin(ph * 1.9)) * (6 + p * 10);
    const a = 0.65 + Math.abs(Math.sin(ph)) * 0.3 + ultimatePulse * 0.25;
    ctx.beginPath(); ctx.fillStyle = `rgba(140,20,30,${a})`; ctx.ellipse(sx, sy, 1.6 + p * 1.2, 1.2 + p * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Patchy body
  ctx.fillStyle = colors.body; ctx.fillRect(-9, -1, 18, 20); ctx.strokeRect(-9, -1, 18, 20);
  // Stitches / scars
  ctx.strokeStyle = '#553322'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -2); ctx.stroke();
  // One dead eye
  ctx.fillStyle = '#111'; ctx.fillRect(-5, -12, 3, 3); ctx.fillStyle = '#eee'; ctx.fillRect(3, -12, 3, 3);

  if (action === 'attack' || action === 'special') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.34 + attackPulse * 0.4 + specialPulse * 0.2;
    ctx.strokeStyle = action === 'special' ? 'rgba(140,255,146,0.9)' : 'rgba(244,212,168,0.85)';
    ctx.lineWidth = action === 'special' ? 2.2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.quadraticCurveTo(16 + attackPulse * 6 + specialPulse * 5, -7, 24 + attackPulse * 9 + specialPulse * 8, -2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawMedusa(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.62 + Math.abs(Math.sin((time || 0) * 0.034 + variant * 0.8)) * 0.38) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.017 + variant * 0.5) * 0.5) : 0;
  const ultimatePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.022 + variant * 0.7) * 0.5) : 0;
  const castProgress = Math.max(0, Math.min(1, anim?.castProgress ?? 0));
  const dodgeProgress = action === 'dodge'
    ? Math.max(0, Math.min(1, anim?.castProgress ?? ((Math.sin((time || 0) * 0.03 + variant * 0.5) + 1) * 0.5)))
    : 0;
  const preCover = action === 'dodge' ? Math.max(0, Math.min(1, dodgeProgress / 0.42)) : 0;
  const postUncover = action === 'dodge' ? Math.max(0, Math.min(1, (dodgeProgress - 0.58) / 0.42)) : 0;
  const dodgeCoverPulse = action === 'dodge'
    ? (dodgeProgress < 0.5 ? preCover : Math.max(0, 1 - postUncover))
    : 0;
  const dodgeVanishPulse = action === 'dodge' ? Math.max(0, 1 - Math.abs(dodgeProgress - 0.5) / 0.12) : 0;
  const dodgeBodyAlpha = action === 'dodge' ? Math.max(0.08, 1 - dodgeVanishPulse * 0.9) : 1;
  const lunge = attackPulse * 4 + dodgePulse * 5.5;
  ctx.translate(Math.cos(facingAngle) * lunge, bob + Math.sin(facingAngle) * lunge * 0.42 - dodgePulse * 1.4);

  if (action === 'dodge') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(179,238,178,0.78)';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.2 + dodgePulse * 0.34;
    for (let i = 0; i < 3; i++) {
      const y = -5 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-30 - i * 7, y);
      ctx.lineTo(-10 - i * 6, y + (i - 1) * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    const snakePalette = ['#4aa63b', '#7ef07a', '#9bff7a', '#d6ff9a', '#7ad160'];
    const snakeCount = 10;
    const coverStrength = 0.22 + dodgeCoverPulse * 1.05 + dodgePulse * 0.15;
    const ringLift = 5 + dodgeCoverPulse * 13;

    if (dodgeVanishPulse > 0.04) {
      ctx.save();
      ctx.globalAlpha = 0.18 + dodgeVanishPulse * 0.38;
      ctx.strokeStyle = 'rgba(184,255,132,0.84)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 11, 12 + dodgeVanishPulse * 14, 4 + dodgeVanishPulse * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < snakeCount; i++) {
      const twist = (time || 0) * 0.01 + i * 0.9 + dodgeProgress * 6.2;
      const startAng = twist + Math.sin(i * 0.7 + dodgeProgress * 9) * 0.2;
      const baseRadius = 8 + (i % 3) * 2 + coverStrength * 8;

      const rootX = Math.cos(startAng) * (baseRadius * 0.55);
      const rootY = 10 + Math.sin(i * 0.9 + dodgeProgress * 7) * 1.5;
      const midX = Math.cos(startAng + 0.9) * baseRadius;
      const midY = -2 - ringLift * 0.4 + Math.sin(twist * 1.5) * 3;
      const tipX = Math.cos(startAng + 1.7) * (baseRadius * 0.9);
      const tipY = -14 - ringLift + Math.sin(twist * 1.2) * 2;

      const snakeColor = snakePalette[i % snakePalette.length];
      ctx.strokeStyle = 'rgba(60,28,10,0.58)';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = snakeColor;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();

      ctx.fillStyle = snakeColor;
      ctx.beginPath();
      ctx.ellipse(tipX, tipY, 2.1, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (dodgeVanishPulse > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.18 + dodgeVanishPulse * 0.34;
      ctx.fillStyle = 'rgba(80,42,16,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 16 + dodgeVanishPulse * 10, 5 + dodgeVanishPulse * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (action === 'special') {
    ctx.save();
    const aimX = anim?.castTargetOffsetX ?? Math.cos(facingAngle) * 112;
    const aimY = (anim?.castTargetOffsetY ?? Math.sin(facingAngle) * 112) + 5;
    const aimMag = Math.hypot(aimX, aimY);
    const fx = aimMag > 0.001 ? aimX / aimMag : Math.cos(facingAngle);
    const fy = aimMag > 0.001 ? aimY / aimMag : Math.sin(facingAngle);
    const rx = -fy;
    const ry = fx;

    const telegraphPhase = Math.min(1, castProgress / 0.68);
    const centerDist = Math.max(92, Math.min(132, aimMag > 0.001 ? aimMag : 112));
    const depth = 150 + (1 - telegraphPhase) * 8;
    const halfWidth = 28 + (1 - telegraphPhase) * 2;
    const startDist = Math.max(24, centerDist - depth * 0.5);
    const endDist = centerDist + depth * 0.5;

    const p1x = fx * startDist - rx * halfWidth * 0.74;
    const p1y = fy * startDist - ry * halfWidth * 0.74;
    const p2x = fx * endDist - rx * halfWidth;
    const p2y = fy * endDist - ry * halfWidth;
    const p3x = fx * endDist + rx * halfWidth;
    const p3y = fy * endDist + ry * halfWidth;
    const p4x = fx * startDist + rx * halfWidth * 0.74;
    const p4y = fy * startDist + ry * halfWidth * 0.74;

    ctx.globalAlpha = 0.15 + (1 - telegraphPhase) * 0.2 + specialPulse * 0.16;
    ctx.fillStyle = 'rgba(82,40,12,0.18)';
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.lineTo(p4x, p4y);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.26 + (1 - telegraphPhase) * 0.2 + specialPulse * 0.18;
    ctx.strokeStyle = 'rgba(184,255,132,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.lineTo(p4x, p4y);
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(226,255,186,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(fx * (startDist + 12), fy * (startDist + 12));
    ctx.lineTo(fx * (endDist - 6), fy * (endDist - 6));
    ctx.stroke();
    ctx.setLineDash([]);

    if (castProgress >= 0.68) {
      const strikePhase = Math.max(0, Math.min(1, (castProgress - 0.68) / 0.32));
      const emerge = Math.min(1, strikePhase * 2.4);
      const retreat = Math.max(0, Math.min(1, (strikePhase - 0.28) / 0.72));
      const lift = Math.max(0, emerge * (1 - retreat * 0.92));
      const snakePalette = ['#4aa63b', '#7ef07a', '#9bff7a', '#d6ff9a', '#7ad160'];
      const snakeCount = 9;

      for (let i = 0; i < snakeCount; i++) {
        const t = snakeCount <= 1 ? 0.5 : i / (snakeCount - 1);
        const lateral = (t - 0.5) * (halfWidth * 1.7) + Math.sin((time || 0) * 0.012 + i * 1.1) * 2.2;
        const depthT = 0.18 + ((i % 3) / 2) * 0.68;
        const forward = startDist + depth * depthT;
        const sx = fx * forward + rx * lateral;
        const sy = fy * forward + ry * lateral + 6;
        const rise = 4 + lift * (20 + (i % 3) * 6);
        const wiggle = Math.sin((time || 0) * 0.02 + i * 0.8) * (2.4 + lift * 2.4);

        const tipX = sx + fx * (4 + lift * 9) + rx * wiggle;
        const tipY = sy - rise + fy * (4 + lift * 9);

        ctx.strokeStyle = 'rgba(60,28,10,0.56)';
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 2);
        ctx.quadraticCurveTo(sx + rx * wiggle * 0.6, sy - rise * 0.54, tipX, tipY);
        ctx.stroke();

        const snakeColor = snakePalette[i % snakePalette.length];
        ctx.strokeStyle = snakeColor;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 1);
        ctx.quadraticCurveTo(sx + rx * wiggle * 0.5, sy - rise * 0.5, tipX, tipY);
        ctx.stroke();

        ctx.fillStyle = snakeColor;
        ctx.beginPath();
        ctx.ellipse(tipX, tipY, 2.4, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();

        const tongueLen = 2 + lift * 2.8;
        ctx.strokeStyle = 'rgba(255,110,140,0.92)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + fx * tongueLen + rx * 1.1, tipY + fy * tongueLen + ry * 1.1);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + fx * tongueLen - rx * 1.1, tipY + fy * tongueLen - ry * 1.1);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  if (action === 'ultimate') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.22 + ultimatePulse * 0.38;
    ctx.fillStyle = 'rgba(184,232,130,0.32)';
    const coneRange = 208 + ultimatePulse * 20;
    const coneHalfHeight = 104 + ultimatePulse * 8;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(coneRange, -coneHalfHeight);
    ctx.lineTo(coneRange, coneHalfHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha *= dodgeBodyAlpha;

  const headX = 0;
  const headY = -12;
  const headR = 11;

  // Face (woman-like, slightly pale)
  ctx.fillStyle = '#efe6d6';
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;
  ctx.beginPath();
  ctx.ellipse(headX, headY, headR, headR * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes with bright, evil glow
  const eyePulse = 1 + Math.sin((time || 0) * 0.003 + variant * 0.6) * (0.5 + specialPulse * 0.2 + ultimatePulse * 0.28);
  const eyeCol = action === 'ultimate' ? '#dcff8c' : action === 'special' ? '#bbff88' : '#9aff7a';
  const glowCol = action === 'ultimate' ? 'rgba(216,255,142,0.95)' : 'rgba(150,255,120,0.95)';
  // Left eye glow
  ctx.save();
  ctx.shadowBlur = 14 * eyePulse;
  ctx.shadowColor = glowCol;
  ctx.fillStyle = eyeCol;
  ctx.beginPath();
  ctx.ellipse(-4, headY - 3, 3.6 * eyePulse, 5 * eyePulse, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Right eye glow
  ctx.save();
  ctx.shadowBlur = 14 * eyePulse;
  ctx.shadowColor = glowCol;
  ctx.fillStyle = eyeCol;
  ctx.beginPath();
  ctx.ellipse(4, headY - 3, 3.6 * eyePulse, 5 * eyePulse, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Pupil + highlight
  ctx.fillStyle = '#061a00';
  ctx.beginPath(); ctx.ellipse(-4, headY - 3, 1.2, 2.6, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4, headY - 3, 1.2, 2.6, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eaffd6';
  ctx.fillRect(-5.2, headY - 5, 2, 1.5);
  ctx.fillRect(3.2, headY - 5, 2, 1.5);

  // Nose and lips (subtle, female)
  ctx.fillStyle = '#a74b4b';
  ctx.beginPath(); ctx.moveTo(-2, headY + 2); ctx.quadraticCurveTo(0, headY + 5, 2, headY + 2); ctx.fill();

  // Slight cheek shading (adds a sinister makeup look)
  ctx.fillStyle = 'rgba(120,40,80,0.07)';
  ctx.beginPath(); ctx.ellipse(-6, headY + 1, 6, 3.4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6, headY + 1, 6, 3.4, 0.2, 0, Math.PI * 2); ctx.fill();

  // Serpentine hair: denser set of snakes with slithering motion and forked tongues
  const snakePalette = ['#4aa63b', '#7ef07a', '#9bff7a', '#d6ff9a', '#7ad160'];
  const snakeCount = 12;
  for (let i = 0; i < snakeCount; i++) {
    const t = i / (snakeCount - 1);
    const startAngle = -Math.PI * 0.95;
    const endAngle = -Math.PI * 0.05;
    const ang = startAngle + t * (endAngle - startAngle);
    const phase = ((time || 0) * 0.0026) + variant * 0.5 + i * 0.55;
    const baseX = Math.cos(ang) * (headR - 2);
    const baseY = headY + Math.sin(ang) * 3;
    const length = 22 + Math.sin(i * 1.9 + variant) * 4 + specialPulse * 4 + ultimatePulse * 5;
    const segments = 12;
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const along = u * length;
      const wobble = Math.sin(phase + u * Math.PI * 2) * (3 + u * 8);
      const x = baseX + Math.cos(ang) * along + Math.cos(phase * 1.2 + u * 3.7) * wobble;
      const y = baseY + Math.sin(ang) * along + Math.sin(phase * 1.1 + u * 3.9) * (2 + u * 6);
      pts.push({ x, y });
    }

    // Draw outline then inner stripe for depth
    ctx.beginPath(); ctx.moveTo(baseX, baseY);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.strokeStyle = colors.outline; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

    const snakeColor = snakePalette[i % snakePalette.length];
    ctx.beginPath(); ctx.moveTo(baseX, baseY);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.strokeStyle = snakeColor; ctx.lineWidth = 2.2; ctx.stroke();

    // Head (tip) with eye and glowing tongue
    const tip = pts[pts.length - 1];
    const before = pts[pts.length - 2] || pts[pts.length - 1];
    const angHead = Math.atan2(tip.y - before.y, tip.x - before.x);
    // Head ellipse
    ctx.beginPath(); ctx.ellipse(tip.x, tip.y, 4.2, 3.0, 0, 0, Math.PI * 2); ctx.fillStyle = snakeColor; ctx.fill(); ctx.strokeStyle = colors.outline; ctx.lineWidth = 1; ctx.stroke();
    // Snake eye (bright, quick glow)
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(255,200,120,0.9)';
    ctx.fillStyle = 'rgba(255,245,200,0.98)';
    ctx.beginPath(); ctx.arc(tip.x + Math.cos(angHead) * 1.2, tip.y + Math.sin(angHead) * 1.2, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Forked tongue flicking
    const flick = 1 + Math.sin((time || 0) * 0.025 + i * 0.8 + variant) * 0.9;
    const tongueLen = 3 + flick * 3;
    const leftAng = angHead + 0.32;
    const rightAng = angHead - 0.32;
    const lx = tip.x + Math.cos(leftAng) * tongueLen;
    const ly = tip.y + Math.sin(leftAng) * tongueLen;
    const rx = tip.x + Math.cos(rightAng) * tongueLen;
    const ry = tip.y + Math.sin(rightAng) * tongueLen;
    ctx.strokeStyle = 'rgba(255,110,140,0.95)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(rx, ry); ctx.stroke();
  }

  if (action === 'attack') {
    ctx.save();
    ctx.rotate(facingAngle);
    const reach = 14 + attackPulse * 24;
    const wiggle = Math.sin((time || 0) * 0.03 + variant) * (2 + attackPulse * 3);

    ctx.globalAlpha = 0.32 + attackPulse * 0.44;
    ctx.strokeStyle = 'rgba(52,20,10,0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-2, -16);
    ctx.quadraticCurveTo(6 + wiggle * 0.3, -20 - wiggle, 10 + reach, -12 + wiggle * 0.4);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(165,236,118,0.94)';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-2, -16);
    ctx.quadraticCurveTo(6 + wiggle * 0.2, -19 - wiggle * 0.8, 10 + reach, -12 + wiggle * 0.35);
    ctx.stroke();

    const tipX = 10 + reach;
    const tipY = -12 + wiggle * 0.35;
    ctx.fillStyle = 'rgba(196,255,152,0.95)';
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,126,152,0.92)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + 4, tipY - 1.6);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + 4, tipY + 1.6);
    ctx.stroke();
    ctx.restore();
  }

  // Subtle ornate headpiece behind snakes for an "evil-lady" silhouette
  ctx.save();
  ctx.fillStyle = 'rgba(40,10,60,0.65)';
  ctx.beginPath();
  ctx.moveTo(-18, headY - 16);
  ctx.quadraticCurveTo(0, headY - 34, 18, headY - 16);
  ctx.lineTo(18, headY - 8);
  ctx.quadraticCurveTo(0, headY - 28, -18, headY - 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();

  ctx.restore();
}

export function drawSphynx(
  ctx: CanvasRenderingContext2D,
  bob: number,
  colors: {body:string,outline:string},
  time: number,
  isLocal = false,
  variant = 0,
  anim?: SpriteAnimationState
) {
  ctx.save();
  const action = anim?.action ?? 'idle';
  const animFrame = anim?.animFrame ?? 0;
  const facingAngle = anim?.facingAngle ?? 0;
  const attackPulse = action === 'attack' ? Math.sin((animFrame / 3) * Math.PI) : 0;
  const dodgePulse = action === 'dodge' ? (0.62 + Math.abs(Math.sin((time || 0) * 0.032 + variant * 0.7)) * 0.38) : 0;
  const specialPulse = action === 'special' ? (0.5 + Math.sin((time || 0) * 0.018 + variant * 0.4) * 0.5) : 0;
  const ultimatePulse = action === 'ultimate' ? (0.5 + Math.sin((time || 0) * 0.022 + variant * 0.3) * 0.5) : 0;
  const stride = attackPulse * 3.8 + dodgePulse * 5.8;
  ctx.translate(Math.cos(facingAngle) * stride, bob + Math.sin(facingAngle) * stride * 0.45 - dodgePulse * 1.2);

  if (action === 'special') {
    ctx.save();
    ctx.globalAlpha = 0.24 + specialPulse * 0.32;
    ctx.strokeStyle = 'rgba(255,220,122,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 5, 27 + specialPulse * 3, 14 + specialPulse * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,242,186,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 20 + specialPulse * 2.5, 10 + specialPulse * 1.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (action === 'ultimate') {
    ctx.save();
    ctx.globalAlpha = 0.24 + ultimatePulse * 0.36;
    ctx.strokeStyle = 'rgba(255,186,84,0.95)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = ((time || 0) * 0.003 + i * (Math.PI * 2 / 3));
      const px = Math.cos(a) * (20 + ultimatePulse * 4);
      const py = Math.sin(a) * (9 + ultimatePulse * 3) + 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px - 3.4, py + 2);
      ctx.lineTo(px + 3.4, py + 2);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  if (action === 'dodge') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.strokeStyle = 'rgba(250,226,175,0.8)';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.2 + dodgePulse * 0.32;
    for (let i = 0; i < 3; i++) {
      const y = -4 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-30 - i * 6, y);
      ctx.lineTo(-10 - i * 5, y + (i - 1) * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;

  // Headdress (Nemes-style) behind the head
  const gold = '#e1c57f';
  const headdressPulse = 1 + specialPulse * 0.08 + ultimatePulse * 0.1;
  ctx.beginPath();
  ctx.moveTo(-18 * headdressPulse, -24);
  ctx.quadraticCurveTo(-10 * headdressPulse, -4, 0, -2 - specialPulse * 1.2);
  ctx.quadraticCurveTo(10 * headdressPulse, -4, 18 * headdressPulse, -24);
  ctx.closePath();
  ctx.fillStyle = gold; ctx.fill(); ctx.stroke();
  // central stripe on the headdress
  ctx.fillStyle = colors.outline; ctx.fillRect(-4, -24, 8, 24);

  // Head (human-like sphinx head, slightly feline)
  ctx.fillStyle = '#efe0c8'; ctx.beginPath(); ctx.ellipse(0, -16, 10, 12, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  // Alien almond eyes (kept from earlier change)
  const eyeColor = action === 'ultimate' ? '#ffd589' : action === 'special' ? '#fff1a8' : '#9effc7';
  const eyeGlow = action === 'special' || action === 'ultimate';
  ctx.save(); ctx.translate(-4, -14); ctx.rotate(-0.45);
  if (eyeGlow) { ctx.shadowBlur = 8 + (specialPulse + ultimatePulse) * 8; ctx.shadowColor = eyeColor; }
  ctx.fillStyle = eyeColor; ctx.beginPath(); ctx.ellipse(0, 0, 4.5 + ultimatePulse * 1.2, 6.5 + ultimatePulse * 1.3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#071809'; ctx.beginPath(); ctx.ellipse(0, 0, 1.2, 3.8, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.save(); ctx.translate(4, -14); ctx.rotate(0.45);
  if (eyeGlow) { ctx.shadowBlur = 8 + (specialPulse + ultimatePulse) * 8; ctx.shadowColor = eyeColor; }
  ctx.fillStyle = eyeColor; ctx.beginPath(); ctx.ellipse(0, 0, 4.5 + ultimatePulse * 1.2, 6.5 + ultimatePulse * 1.3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#071809'; ctx.beginPath(); ctx.ellipse(0, 0, 1.2, 3.8, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Nose / mouth
  ctx.fillStyle = '#4a2a1a'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-2, -6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.quadraticCurveTo(0, -1, 2, -2); ctx.stroke();

  // Decorative collar (Egyptian style)
  ctx.fillStyle = '#c77f2b'; ctx.fillRect(-14, -2, 28, 6); ctx.strokeRect(-14, -2, 28, 6);
  for (let i = -12; i <= 12; i += 6) { ctx.fillStyle = '#ffd76b'; ctx.fillRect(i, -1, 4, 4); }

  // Body: broad lion-like torso
  ctx.fillStyle = colors.body; ctx.beginPath(); ctx.ellipse(0, 6, 20, 12, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  // Hindquarters (lion haunch)
  ctx.beginPath(); ctx.ellipse(14, 12, 8, 8, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  // Forelegs and paws (front of the torso)
  ctx.fillStyle = '#ead5b0'; ctx.beginPath(); ctx.ellipse(-8, 14, 5, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(8, 14, 5, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  if (action === 'attack') {
    ctx.save();
    ctx.rotate(facingAngle);
    const t = Math.max(0, Math.min(1, attackPulse));
    const dropY = -34 + t * 38;
    const brickX = 20 + t * 2;

    ctx.globalAlpha = 0.4 + t * 0.5;
    ctx.fillStyle = 'rgba(198,160,94,0.96)';
    ctx.strokeStyle = 'rgba(76,52,24,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(brickX - 7, dropY - 5, 14, 10);
    ctx.fill();
    ctx.stroke();

    if (t > 0.55) {
      const crumble = (t - 0.55) / 0.45;
      ctx.globalAlpha = Math.max(0, 0.55 - crumble * 0.45);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = 4 + crumble * (8 + (i % 3) * 2);
        const px = brickX + Math.cos(a) * r;
        const py = 4 + Math.sin(a) * (2 + crumble * 6);
        ctx.fillStyle = 'rgba(232,196,128,0.88)';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      ctx.strokeStyle = 'rgba(235,200,128,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(brickX, 4, 10 + crumble * 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  if (action === 'special') {
    ctx.save();
    ctx.rotate(facingAngle);
    ctx.globalAlpha = 0.28 + specialPulse * 0.3;
    ctx.strokeStyle = 'rgba(255,210,122,0.92)';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.quadraticCurveTo(17 + specialPulse * 7, -8, 25 + specialPulse * 10, -2);
    ctx.stroke();
    ctx.restore();
  }

  // Tail curling around the haunch
  const tailWave = Math.sin((time || 0) * 0.004 + variant * 0.5) * (1.2 + ultimatePulse * 2.4);
  ctx.strokeStyle = colors.outline; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 10); ctx.quadraticCurveTo(26 + tailWave, 6 - tailWave * 0.5, 24 + tailWave * 0.7, 0); ctx.quadraticCurveTo(22 - tailWave, -6 - tailWave * 0.6, 16, -2); ctx.stroke();

  ctx.restore();
}

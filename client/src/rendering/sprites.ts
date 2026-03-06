// Shared sprite draw helpers used by both the in-game renderer and the UI previews
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

export function drawBat(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  void isLocal;
  ctx.save();
  ctx.translate(0, bob);
  // Body
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Faster vertical wing flapping
  const phase = (time || 0) * 0.0032 + variant * 0.8;
  const lift = Math.sin(phase) * 0.95;

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

  // Small fangs
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-3, 2); ctx.lineTo(-1, 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(1, 2); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill();

  ctx.restore();
}

export function drawCat(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  ctx.save();
  ctx.translate(0, bob);

  // Layout for in-game cat
  const headR = 10;
  const bodyX = -8, bodyY = -2, bodyW = 20, bodyH = 14;

  // Tail (senoidal along its length) - sample a smooth sine-wave-shaped curve
  const phase = (time * 0.0015) + (variant * 0.43);
  const tailBaseX = bodyX + bodyW;
  const tailBaseY = Math.round(bodyY + bodyH * 0.36);
  const tailLen = 34 * (isLocal ? 1.05 : 1);
  const baseAngle = Math.sin(phase) * 0.6 + 0.28; // main tail direction

  const dirX = Math.cos(baseAngle);
  const dirY = Math.sin(baseAngle);
  const perpX = Math.cos(baseAngle + Math.PI / 2);
  const perpY = Math.sin(baseAngle + Math.PI / 2);

  const segments = 10;
  const waveCount = 2.0; // number of sine cycles along the tail
  const amplitude = tailLen * 0.12;

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

  // Head and ears
  ctx.fillStyle = '#efe0c8';
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;
  ctx.beginPath(); ctx.arc(0, -12, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(-10, -24); ctx.lineTo(-2, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(10, -24); ctx.lineTo(2, -20); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Eyes
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-3, -12, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, -12, 2, 3, 0, 0, Math.PI * 2); ctx.fill();

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

export function drawVampire(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  void time; void isLocal; void variant;
  ctx.save(); ctx.translate(0, bob);
  // Cloak
  ctx.fillStyle = colors.body; ctx.strokeStyle = colors.outline; ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(0, -10); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Head
  ctx.fillStyle = '#f6e7e7'; ctx.beginPath(); ctx.arc(0, -8, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  // Fangs
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-2, 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(2, 2); ctx.stroke();
  // Eyes
  ctx.fillStyle = '#000'; ctx.fillRect(-4, -10, 3, 3); ctx.fillRect(1, -10, 3, 3);
  ctx.restore();
}

export function drawZombie(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  void isLocal;
  ctx.save();
  // Add a subtle shaking effect to zombie characters to convey instability
  const shakeX = Math.sin((time || 0) * 0.02 + (bob * 0.3)) * 1.8;
  const shakeY = Math.cos((time || 0) * 0.015 + (bob * 0.25)) * 0.9;
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
    const a = 0.7 + Math.abs(Math.sin(ph)) * 0.3;
    ctx.beginPath(); ctx.fillStyle = `rgba(140,20,30,${a})`; ctx.ellipse(sx, sy, 1.6 + p * 1.2, 1.2 + p * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Patchy body
  ctx.fillStyle = colors.body; ctx.fillRect(-9, -1, 18, 20); ctx.strokeRect(-9, -1, 18, 20);
  // Stitches / scars
  ctx.strokeStyle = '#553322'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -2); ctx.stroke();
  // One dead eye
  ctx.fillStyle = '#111'; ctx.fillRect(-5, -12, 3, 3); ctx.fillStyle = '#eee'; ctx.fillRect(3, -12, 3, 3);

  ctx.restore();
}

export function drawMedusa(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  ctx.save();
  ctx.translate(0, bob);
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
  const eyePulse = 1 + Math.sin((time || 0) * 0.003 + variant * 0.6) * 0.5;
  const glowCol = 'rgba(150,255,120,0.95)';
  // Left eye glow
  ctx.save();
  ctx.shadowBlur = 14 * eyePulse;
  ctx.shadowColor = glowCol;
  ctx.fillStyle = '#9aff7a';
  ctx.beginPath();
  ctx.ellipse(-4, headY - 3, 3.6 * eyePulse, 5 * eyePulse, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Right eye glow
  ctx.save();
  ctx.shadowBlur = 14 * eyePulse;
  ctx.shadowColor = glowCol;
  ctx.fillStyle = '#9aff7a';
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
    const length = 22 + Math.sin(i * 1.9 + variant) * 4;
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
}

export function drawSphynx(ctx: CanvasRenderingContext2D, bob: number, colors: {body:string,outline:string}, time: number, isLocal = false, variant = 0) {
  void time; void variant;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = isLocal ? 2 : 1.5;

  // Headdress (Nemes-style) behind the head
  const gold = '#e1c57f';
  ctx.beginPath();
  ctx.moveTo(-18, -24);
  ctx.quadraticCurveTo(-10, -4, 0, -2);
  ctx.quadraticCurveTo(10, -4, 18, -24);
  ctx.closePath();
  ctx.fillStyle = gold; ctx.fill(); ctx.stroke();
  // central stripe on the headdress
  ctx.fillStyle = colors.outline; ctx.fillRect(-4, -24, 8, 24);

  // Head (human-like sphinx head, slightly feline)
  ctx.fillStyle = '#efe0c8'; ctx.beginPath(); ctx.ellipse(0, -16, 10, 12, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  // Alien almond eyes (kept from earlier change)
  ctx.save(); ctx.translate(-4, -14); ctx.rotate(-0.45);
  ctx.fillStyle = '#9effc7'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#071809'; ctx.beginPath(); ctx.ellipse(0, 0, 1.2, 3.8, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.save(); ctx.translate(4, -14); ctx.rotate(0.45);
  ctx.fillStyle = '#9effc7'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6.5, 0, 0, Math.PI*2); ctx.fill();
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

  // Tail curling around the haunch
  ctx.strokeStyle = colors.outline; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 10); ctx.quadraticCurveTo(26, 6, 24, 0); ctx.quadraticCurveTo(22, -6, 16, -2); ctx.stroke();

  ctx.restore();
}

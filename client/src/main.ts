import { LoginScreen } from './ui/loginScreen';
import { GameClient } from './network/gameClient';
import { GameRenderer } from './rendering/renderer';
import { InputHandler } from './input/inputHandler';
import { AimVector, TouchButtonBehavior, TouchControls } from './ui/touchControls';
import { AbilitySlot, CreepDesign, GameState, Player, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/src/types';

// Read Vite environment variables when provided. Vite exposes variables prefixed
// with `VITE_` through `import.meta.env`. Priority:
// 1) `VITE_WS_URL` — full websocket URL (e.g. wss://game.mawgrim.com/ws)
// 2) If page loaded over HTTPS -> default to `wss://<host>/ws` (proxied by nginx)
// 3) If page loaded over HTTP -> default to `ws://<host>:<VITE_WS_PORT||4041>`
const _env = (import.meta as any)?.env ?? {};
function buildWsUrl(): string {
  console.log('Client environment variables:', _env);
  if (_env.VITE_WS_URL) return _env.VITE_WS_URL;
  const host = window.location.hostname;
  const customPath = _env.VITE_WS_PATH ?? '';
  if (window.location.protocol === 'https:') {
    console.warn('Page loaded over HTTPS, defaulting to secure WebSocket connection. If the server is not configured for this, set VITE_WS_URL explicitly to a ws:// URL.');
    // For HTTPS we assume nginx terminates TLS and proxies a /ws path to the server.
    const path = customPath || '/ws';
    return `https://${host}${path.startsWith('/') ? path : `/${path}`}`;
  }
  // HTTP fallback uses ws:// with an explicit port (useful for local dev)
  const port = _env.VITE_WS_PORT ?? 4041;
  const pathPart = customPath ? (customPath.startsWith('/') ? customPath : `/${customPath}`) : '';
  return `ws://${host}:${port}${pathPart}`;
}
const WS_URL = buildWsUrl();
const ABILITY_ORDER: AbilitySlot[] = ['basic', 'dodge', 'special', 'ultimate'];

type TouchAbilityBehaviorConfig = {
  special: TouchButtonBehavior;
  ultimate: TouchButtonBehavior;
};

function getTouchAbilityBehavior(design?: CreepDesign): TouchAbilityBehaviorConfig {
  if (design === 'medusa') {
    return { special: 'directional-release', ultimate: 'directional-release' };
  }
  if (design === 'bat') {
    return { special: 'tap', ultimate: 'hold' };
  }
  return { special: 'tap', ultimate: 'tap' };
}

function isMobileTouchDevice(): boolean {
  const uaMobile = /Android|iPhone|iPad|iPod|Mobi|Mobile/i.test(navigator.userAgent || '');
  return (
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
    ('ontouchstart' in window) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    uaMobile
  );
}

// Best-effort mobile landscape lock. Some browsers require fullscreen first,
// and some may deny the request depending on permissions/platform limitations.
async function ensureMobileLandscape(): Promise<void> {
  if (!isMobileTouchDevice()) return;
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
  };
  if (!orientation || typeof orientation.lock !== 'function') return;

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) {
    // Ignore fullscreen denial and still try orientation lock.
  }

  try {
    await orientation.lock('landscape');
  } catch (_) {
    // Ignore platforms that block programmatic orientation changes.
  }
}

function setupMobileOrientationState(gameScreen: HTMLDivElement): () => void {
  if (!isMobileTouchDevice()) return () => {};

  const applyOrientationClass = () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    gameScreen.classList.toggle('mobile-portrait', isPortrait);
  };

  const onChange = () => {
    applyOrientationClass();
    if (window.innerHeight > window.innerWidth) {
      void ensureMobileLandscape();
    }
  };

  applyOrientationClass();
  window.addEventListener('resize', onChange);
  screen.orientation?.addEventListener?.('change', onChange);

  return () => {
    window.removeEventListener('resize', onChange);
    screen.orientation?.removeEventListener?.('change', onChange);
  };
}

function main(): void {
  const loginScreen = new LoginScreen();
  
  loginScreen.onJoin((nickname: string, creepDesign: CreepDesign) => {
    void ensureMobileLandscape();
    loginScreen.setLoading(true);
    loginScreen.setError('');

    const client = new GameClient(WS_URL);

    client.onConnected(() => {
      client.join(nickname, creepDesign);
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
  const chatToggle = document.getElementById('chat-toggle') as HTMLButtonElement | null;
  const pvpToggleBtn = document.getElementById('pvp-toggle') as HTMLButtonElement | null;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatSend = document.getElementById('chat-send') as HTMLButtonElement;
  const deathOverlay = document.getElementById('death-overlay') as HTMLDivElement | null;
  const deathCountdownEl = document.getElementById('death-countdown') as HTMLSpanElement | null;
  const deathReenterBtn = document.getElementById('death-reenter-btn') as HTMLButtonElement | null;
  const deathExitBtn = document.getElementById('death-exit-btn') as HTMLButtonElement | null;
  const isTouchGame = TouchControls.isTouchDevice();
  void ensureMobileLandscape();
  gameScreen.style.display = 'flex';
  const cleanupOrientationState = setupMobileOrientationState(gameScreen);
  // Prevent default touch gestures (pinch/scroll) on the game canvas
  canvas.style.touchAction = 'none';

  // Responsive canvas sizing: keep the canvas centered and not full-bleed.
  // The canvas logical resolution is clamped to the world size and a small
  // padding so it remains centered on larger screens and fits on small ones.
  function resizeCanvasToFit() {
    const vv = (window as any).visualViewport;
    const viewportW = vv?.width ? Math.round(vv.width) : window.innerWidth;
    const viewportH = vv?.height ? Math.round(vv.height) : window.innerHeight;
    const isLandscape = viewportW >= viewportH;
    const padding = isTouchGame ? (isLandscape ? 10 : 22) : 48;
    const maxW = Math.max(200, Math.min(viewportW - padding, WORLD_WIDTH));
    const maxH = Math.max(160, Math.min(viewportH - padding, WORLD_HEIGHT));
    const worldAspect = WORLD_WIDTH / WORLD_HEIGHT;
    let targetW = maxW;
    let targetH = Math.round(targetW / worldAspect);
    if (targetH > maxH) {
      targetH = maxH;
      targetW = Math.round(targetH * worldAspect);
    }
    // Keep visual size, but cap internal render pixels on very large/high-DPI displays.
    const deviceDpr = Math.max(1, window.devicePixelRatio || 1);
    const maxRenderPixels = isTouchGame ? 1800000 : 2900000;
    const desiredPixels = targetW * targetH * deviceDpr * deviceDpr;
    const renderScale = desiredPixels > maxRenderPixels
      ? Math.sqrt(maxRenderPixels / Math.max(1, desiredPixels))
      : 1;
    const renderDpr = Math.max(0.72, deviceDpr * renderScale);

    canvas.width = Math.max(1, Math.round(targetW * renderDpr));
    canvas.height = Math.max(1, Math.round(targetH * renderDpr));
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }

  resizeCanvasToFit();

  const scenarioName = 'Graves of Nihilia';
  const renderer = new GameRenderer(canvas, playerId, scenarioName);
  renderer.syncCanvasMetrics();
  renderer.updateState(initialState);
  const inputHandler = new InputHandler(client, canvas, (cx, cy) => renderer.screenToWorld(cx, cy));
  const abilityHud = document.getElementById('ability-hud') as HTMLDivElement | null;
  const abilitySlotEls = new Map<AbilitySlot, HTMLDivElement>();
  let latestLocalPlayer: Player | null = null;
  let localDeathActive = false;
  let deathDecisionEndsAt = 0;
  let deathCountdownTimer: number | null = null;
  let deathAutoExitTimer: number | null = null;
  let deathChoiceLocked = false;

  if (abilityHud) {
    for (const slot of ABILITY_ORDER) {
      const el = abilityHud.querySelector(`[data-slot="${slot}"]`) as HTMLDivElement | null;
      if (el) abilitySlotEls.set(slot, el);
    }
  }

  const touchKeyMap: Record<AbilitySlot, string> = {
    basic: 'ATK',
    dodge: 'DOD',
    special: 'S1',
    ultimate: 'S2',
  };
  const desktopKeyMap: Record<AbilitySlot, string> = {
    basic: 'RMB',
    dodge: 'LMB',
    special: 'Q',
    ultimate: 'E',
  };

  let touchControls: TouchControls | null = null;
  const applyTouchAbilityBehavior = () => {
    if (!touchControls) return;
    const cfg = getTouchAbilityBehavior(latestLocalPlayer?.design);
    touchControls.setButtonBehavior('basic', 'directional-tilt');
    touchControls.setButtonBehavior('dodge', 'directional-tilt');
    touchControls.setButtonBehavior('special', cfg.special);
    touchControls.setButtonBehavior('ultimate', cfg.ultimate);
  };

  const applyAbilityKeyLabels = () => {
    for (const slot of ABILITY_ORDER) {
      const root = abilitySlotEls.get(slot);
      if (!root) continue;
      const keyEl = root.querySelector('.slot-key') as HTMLDivElement | null;
      if (!keyEl) continue;
      keyEl.textContent = isTouchGame ? touchKeyMap[slot] : desktopKeyMap[slot];
    }
  };

  const returnToCreepSelection = () => {
    if (deathCountdownTimer !== null) {
      window.clearInterval(deathCountdownTimer);
      deathCountdownTimer = null;
    }
    if (deathAutoExitTimer !== null) {
      window.clearTimeout(deathAutoExitTimer);
      deathAutoExitTimer = null;
    }
    client.disconnect();
    window.location.reload();
  };

  const setChatInputEnabled = (enabled: boolean) => {
    chatInput.disabled = !enabled;
    chatSend.disabled = !enabled;
    if (!enabled) chatInput.blur();
  };

  const updatePvpToggleUi = () => {
    if (!pvpToggleBtn) return;
    const enabled = Boolean(latestLocalPlayer?.pvpEnabled);
    pvpToggleBtn.textContent = enabled ? '☠ PVP ON' : '☠ PVP OFF';
    pvpToggleBtn.classList.toggle('enabled', enabled);
    pvpToggleBtn.classList.toggle('disabled', !enabled);
    pvpToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    pvpToggleBtn.disabled = localDeathActive;
  };

  const updateDeathCountdown = () => {
    if (!deathCountdownEl) return;
    const remainingMs = Math.max(0, deathDecisionEndsAt - Date.now());
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    deathCountdownEl.textContent = String(remainingSec);
  };

  const setDeathScreenActive = (active: boolean, deadlineMs?: number) => {
    localDeathActive = active;
    gameScreen.classList.toggle('death-active', active);
    if (deathOverlay) deathOverlay.style.display = active ? '' : 'none';
    inputHandler.setInputEnabled(!active);
    setChatInputEnabled(!active);
    updatePvpToggleUi();

    if (active) {
      deathChoiceLocked = false;
      if (deathReenterBtn) deathReenterBtn.disabled = false;
      if (deathExitBtn) deathExitBtn.disabled = false;

      deathDecisionEndsAt = typeof deadlineMs === 'number' && deadlineMs > Date.now()
        ? deadlineMs
        : Date.now() + 10000;
      updateDeathCountdown();

      if (deathCountdownTimer !== null) window.clearInterval(deathCountdownTimer);
      deathCountdownTimer = window.setInterval(updateDeathCountdown, 140);

      if (deathAutoExitTimer !== null) window.clearTimeout(deathAutoExitTimer);
      deathAutoExitTimer = window.setTimeout(() => {
        returnToCreepSelection();
      }, Math.max(0, deathDecisionEndsAt - Date.now()));
      return;
    }

    deathChoiceLocked = false;
    if (deathCountdownTimer !== null) {
      window.clearInterval(deathCountdownTimer);
      deathCountdownTimer = null;
    }
    if (deathAutoExitTimer !== null) {
      window.clearTimeout(deathAutoExitTimer);
      deathAutoExitTimer = null;
    }
  };

  const updateAbilityHud = () => {
    if (!abilityHud || abilitySlotEls.size === 0) return;
    const player = latestLocalPlayer;

    for (const slot of ABILITY_ORDER) {
      const root = abilitySlotEls.get(slot);
      if (!root) continue;

      const stateEl = root.querySelector('.slot-state') as HTMLDivElement | null;
      const fillEl = root.querySelector('.slot-fill') as HTMLDivElement | null;

      let stateText = 'Ready';
      let fillRatio = 0;
      let cls: 'ready' | 'cooling' | 'casting' = 'ready';

      if (player?.castState && player.castState.slot === slot) {
        const elapsed = Date.now() - player.castState.startedAtMs;
        const castDuration = Math.max(1, player.castState.castDurationMs);
        const progress = Math.max(0, Math.min(1, elapsed / castDuration));
        stateText = `Casting ${Math.round(progress * 100)}%`;
        fillRatio = 1 - progress;
        cls = 'casting';
      } else {
        const cooldown = player?.activeCooldowns?.[slot] ?? null;
        if (cooldown) {
          const remaining = Math.max(0, cooldown.expiresAtMs - Date.now());
          if (remaining > 0) {
            const total = Math.max(1, cooldown.durationMs);
            fillRatio = Math.max(0, Math.min(1, remaining / total));
            stateText = `${(remaining / 1000).toFixed(1)}s`;
            cls = 'cooling';
          }
        }
      }

      root.classList.remove('ready', 'cooling', 'casting');
      root.classList.add(cls);

      if (stateEl) stateEl.textContent = stateText;
      if (fillEl) fillEl.style.height = `${Math.round(fillRatio * 100)}%`;
      touchControls?.updateAbilityState(slot, {
        status: cls,
        text: stateText,
        fillRatio,
      });
    }
  };

  applyAbilityKeyLabels();

  if (TouchControls.isTouchDevice()) {
    gameScreen.classList.add('touch-ui-active');
    inputHandler.setMobileControlsEnabled(true);
    touchControls = new TouchControls(gameScreen, {
      onMove: (vector) => {
        inputHandler.setMobileMoveVector(vector.x, vector.y, vector.magnitude);
      },
      onAttack: (vector: AimVector) => {
        inputHandler.triggerMobileAttackWithDirection(vector);
      },
      onDodge: (vector: AimVector) => {
        inputHandler.triggerMobileDodgeWithDirection(vector);
      },
      onSkillPlaceholder: (slot, vector: AimVector) => {
        if (slot === 1) {
          inputHandler.triggerMobileSpecialWithDirection(vector);
        } else {
          inputHandler.triggerMobileUltimateCastWithDirection(vector);
        }
      },
      onSkillHoldStart: (slot, vector: AimVector) => {
        if (slot === 2) inputHandler.triggerMobileUltimateHoldWithDirection(vector);
      },
      onSkillHoldEnd: (slot) => {
        if (slot === 2) inputHandler.triggerMobileUltimateRelease();
      },
    });
    applyTouchAbilityBehavior();
  }

  pvpToggleBtn?.addEventListener('click', () => {
    if (localDeathActive) return;
    if (!latestLocalPlayer) return;
    client.sendPvpToggle(!latestLocalPlayer.pvpEnabled);
  });

  deathReenterBtn?.addEventListener('click', () => {
    if (deathChoiceLocked) return;
    deathChoiceLocked = true;
    if (deathReenterBtn) deathReenterBtn.disabled = true;
    if (deathExitBtn) deathExitBtn.disabled = true;
    client.sendReenter();
  });

  deathExitBtn?.addEventListener('click', () => {
    if (deathChoiceLocked) return;
    deathChoiceLocked = true;
    returnToCreepSelection();
  });

  const localPlayer = initialState.players[playerId];
  if (localPlayer) {
    latestLocalPlayer = localPlayer;
    inputHandler.setPosition(localPlayer.x, localPlayer.y, true);
    applyTouchAbilityBehavior();
    updateLocalStatsHud(localPlayer);
    updateAbilityHud();
    updatePvpToggleUi();
  }
  updatePvpToggleUi();
  inputHandler.updateObstacles(initialState.obstacles);
  const initialCount = document.getElementById('player-count');
  if (initialCount) initialCount.textContent = String(initialState.totalPlayers);

  client.onGameStateUpdate((state) => {
    renderer.updateState(state);
    inputHandler.updateObstacles(state.obstacles);
    // Inform input handler about local player's authoritative action
    const local = state.players[playerId];
    if (local) {
      latestLocalPlayer = local;
      inputHandler.setLocalAction(local.action);
      // Force-sync while dodging to avoid client/server position divergence.
      inputHandler.setPosition(local.x, local.y, local.action === 'dodge' || local.isDead);
      if (local.isDead) {
        setDeathScreenActive(true, local.deathDeadlineMs);
      } else if (localDeathActive) {
        setDeathScreenActive(false);
      }
      applyTouchAbilityBehavior();
      updateLocalStatsHud(local);
      updateAbilityHud();
      updatePvpToggleUi();
    } else if (localDeathActive) {
      // Server removed this player (timeout or disconnect): go back to creep selection.
      returnToCreepSelection();
    }
    const count = document.getElementById('player-count');
    if (count) count.textContent = String(state.totalPlayers);
  });
  client.onChatMessage((playerId, nickname, text, _timestamp) => {
    addChatMessage(nickname, text);
    // show a chat bubble above the speaking player
    try { renderer.showChatBubble(playerId, text); } catch (err) { /* noop if unavailable */ }
  });

  // Chat UI
  const refreshChatToggleLabel = () => {
    if (!chatToggle) return;
    chatToggle.textContent = gameScreen.classList.contains('chat-open') ? 'Cerrar chat' : 'Chat';
  };

  if (isTouchGame) {
    gameScreen.classList.remove('chat-open');
    refreshChatToggleLabel();
    chatToggle?.addEventListener('click', () => {
      const willOpen = !gameScreen.classList.contains('chat-open');
      gameScreen.classList.toggle('chat-open', willOpen);
      refreshChatToggleLabel();
      if (willOpen) {
        chatInput.focus();
        chatInput.select();
      } else {
        chatInput.blur();
      }
    });
  }

  function sendChat(): void {
    if (localDeathActive) return;
    const text = chatInput.value.trim();
    if (text) {
      client.sendChat(text);
      chatInput.value = '';
      chatInput.focus();
      chatInput.select();
    }
  }

  chatSend.addEventListener('click', sendChat);

  // Global Enter: open (focus) chat when pressed anywhere. If chat already focused,
  // the input handler below decides whether to send or blur.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (localDeathActive) return;
    if (e.key !== 'Enter') return;
    const active = document.activeElement as HTMLElement | null;
    if (active === chatInput) return; // let chat input handler handle it
    e.preventDefault();
    e.stopPropagation();
    chatInput.focus();
    chatInput.select();
  });

  // When typing in chat: Enter with text sends and keeps chat open; Enter with empty text blurs (closes)
  chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (localDeathActive) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const val = chatInput.value.trim();
      if (val) sendChat(); else chatInput.blur();
    } else {
      // stop propagation so game input doesn't react while typing
      e.stopPropagation();
    }
  });

  // Adjust chat container when on-screen keyboard / visualViewport changes (mobile)
  const chatContainerEl = document.getElementById('chat-container') as HTMLElement | null;
  const visualViewport = (window as any).visualViewport;
  function adjustChatForViewport() {
    if (!chatContainerEl) return;
    const vv = (window as any).visualViewport;
    if (!vv) {
      chatContainerEl.style.bottom = '';
      return;
    }
    // Keyboard height approximated by difference between layout viewport and visualViewport
    const kbHeight = Math.max(0, window.innerHeight - vv.height);
    const baseBottom = gameScreen.classList.contains('touch-ui-active') ? 156 : 20;
    chatContainerEl.style.bottom = `${kbHeight + baseBottom}px`;
  }

  chatInput.addEventListener('focus', () => {
    if (isTouchGame) {
      gameScreen.classList.add('chat-open');
      refreshChatToggleLabel();
    }
    if (visualViewport) {
      adjustChatForViewport();
      visualViewport.addEventListener('resize', adjustChatForViewport);
      visualViewport.addEventListener('scroll', adjustChatForViewport);
    } else {
      // fallback: ensure chat is visible
      chatContainerEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  chatInput.addEventListener('blur', () => {
    if (visualViewport) {
      visualViewport.removeEventListener('resize', adjustChatForViewport);
      visualViewport.removeEventListener('scroll', adjustChatForViewport);
    }
    if (chatContainerEl) chatContainerEl.style.bottom = '';
    if (isTouchGame) {
      window.setTimeout(() => {
        gameScreen.classList.remove('chat-open');
        refreshChatToggleLabel();
      }, 120);
    }
  });

  let resizeSettleA: number | null = null;
  let resizeSettleB: number | null = null;
  const handleViewportResize = () => {
    resizeCanvasToFit();
    renderer.syncCanvasMetrics();

    // Mobile browsers often update viewport in multiple passes during rotation.
    if (resizeSettleA !== null) window.clearTimeout(resizeSettleA);
    if (resizeSettleB !== null) window.clearTimeout(resizeSettleB);
    resizeSettleA = window.setTimeout(() => {
      resizeCanvasToFit();
      renderer.syncCanvasMetrics();
    }, 120);
    resizeSettleB = window.setTimeout(() => {
      resizeCanvasToFit();
      renderer.syncCanvasMetrics();
    }, 320);
  };

  window.addEventListener('resize', handleViewportResize);
  screen.orientation?.addEventListener?.('change', handleViewportResize);
  (window as any).visualViewport?.addEventListener?.('resize', handleViewportResize);

  const retryLandscapeLock = () => {
    if (isMobileTouchDevice() && window.innerHeight > window.innerWidth) {
      void ensureMobileLandscape();
    }
  };
  window.addEventListener('pointerdown', retryLandscapeLock, { once: true, passive: true });

  const abilityHudTimer = window.setInterval(updateAbilityHud, 80);

  renderer.startRenderLoop();

  window.addEventListener('beforeunload', () => {
    if (deathCountdownTimer !== null) window.clearInterval(deathCountdownTimer);
    if (deathAutoExitTimer !== null) window.clearTimeout(deathAutoExitTimer);
    touchControls?.destroy();
    cleanupOrientationState();
    window.removeEventListener('resize', handleViewportResize);
    screen.orientation?.removeEventListener?.('change', handleViewportResize);
    (window as any).visualViewport?.removeEventListener?.('resize', handleViewportResize);
    if (resizeSettleA !== null) window.clearTimeout(resizeSettleA);
    if (resizeSettleB !== null) window.clearTimeout(resizeSettleB);
    window.clearInterval(abilityHudTimer);
  });
}

function updateLocalStatsHud(player: Player): void {
  const creepEl = document.getElementById('stat-creep');
  const hpEl = document.getElementById('stat-hp');
  const damageEl = document.getElementById('stat-dmg');
  const speedEl = document.getElementById('stat-spd');
  const dodgeEl = document.getElementById('stat-dodge');

  if (creepEl) creepEl.textContent = player.design;
  if (hpEl) hpEl.textContent = `${Math.max(0, Math.round(player.health))}/${Math.round(player.maxHealth)}`;
  if (damageEl) damageEl.textContent = String(player.statDamage);
  if (speedEl) speedEl.textContent = String(player.statSpeed);
  if (dodgeEl) dodgeEl.textContent = String(player.statDodge);
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

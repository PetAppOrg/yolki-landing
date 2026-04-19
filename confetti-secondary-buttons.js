/*!
 * confetti-secondary-buttons.js
 *
 * Explosão de confete ao clicar em qualquer botão com a cor secondary.
 * Detecção automática por classe, data-variant ou computed background-color.
 * Event delegation no document → cobre botões adicionados dinamicamente (SPAs).
 * Respeita prefers-reduced-motion (faz bypass do efeito).
 *
 * Parâmetros ajustáveis:
 *   GRAVITY        — aceleração vertical constante (px/s²)
 *   LIFE_SECONDS   — duração total do efeito
 *   REDIRECT_DELAY — atraso antes de executar ação original do botão
 *   PARTICLE_COUNT — nº de quadradinhos no burst
 *
 * Zero dependências. IIFE auto-executável.
 */
(function () {
  'use strict';

  // ─── Parâmetros ajustáveis ─────────────────────────────────────────────
  var GRAVITY         = 520;   // px/s²
  var LIFE_SECONDS    = 2.0;   // duração total da partícula
  var REDIRECT_DELAY  = 1800;  // ms antes da ação original
  var PARTICLE_COUNT  = 55;
  var SPEED_MIN       = 380;   // px/s
  var SPEED_MAX       = 640;
  var CONE_DEG        = 270;   // abertura radial
  var DRAG_X          = 0.92;  // por segundo (horizontal)
  var DRAG_Y          = 0.97;  // por segundo (vertical)
  var WOBBLE_FREQ     = 5;     // rad/s
  var WOBBLE_AMP      = 28;    // px/s²
  var FADE_START_PCT  = 0.60;  // início do fade (fração da vida)
  var SIZE_MIN        = 7;
  var SIZE_MAX        = 12;
  var PALETTE = ['#01BCB5', '#8F06CD', '#FDA600', '#5EB864', '#F9D84D', '#FF000B', '#4286CD'];

  // Cores consideradas "secondary" (computed style: rgb ou rgba)
  function isSecondaryColor(bg) {
    if (!bg) return false;
    var n = bg.replace(/\s+/g, '').toLowerCase();
    return (
      n === 'rgb(143,6,205)' || n === 'rgba(143,6,205,1)' ||      // #8F06CD
      n === 'rgb(167,111,255)' || n === 'rgba(167,111,255,1)'     // #A76FFF (--secondary)
    );
  }

  // Classes diretamente tratadas como secondary (belt-and-suspenders)
  var SECONDARY_CLASS_SELECTORS = [
    '.btn-secondary',
    '.bg-secondary',
    '.plan-cta-secondary',
    '.nav-download',
    '.hero-cta-primary',
    '.msc-btn',
    '.referral-copy',
    '.corp-submit',
    '.waitlist-form button',
    '.pricing-signup-form button',
    '.exit-intent-form button'
  ].join(',');

  // ─── Canvas + loop ──────────────────────────────────────────────────────
  var canvas = null;
  var ctx = null;
  var particles = [];
  var lastTime = 0;
  var rafId = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');          // ctx antes do primeiro resize
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
  }

  function resizeCanvas() {
    if (!canvas) return;
    // Canvas 1:1 CSS pixels — sem dpr scaling, coords de clientX/Y batem direto
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  function burst(x, y) {
    ensureCanvas();
    var baseAngle = -Math.PI / 2;              // up
    var halfCone  = (CONE_DEG * Math.PI / 180) / 2;
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var angle = baseAngle + (Math.random() * 2 - 1) * halfCone;
      var speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN),
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 12,
        wobblePhase: Math.random() * Math.PI * 2,
        age: 0
      });
    }
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.05); // clamp 20fps mínimo
    lastTime = now;

    var dragX = Math.pow(DRAG_X, dt);
    var dragY = Math.pow(DRAG_Y, dt);

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age >= LIFE_SECONDS) {
        particles.splice(i, 1);
        continue;
      }
      // física
      p.vy += GRAVITY * dt;
      p.vx += Math.sin(p.age * WOBBLE_FREQ + p.wobblePhase) * WOBBLE_AMP * dt;
      p.vx *= dragX;
      p.vy *= dragY;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed * dt;

      // fade nos últimos (1-FADE_START_PCT)% da vida
      var lifePct = p.age / LIFE_SECONDS;
      var alpha = lifePct < FADE_START_PCT
        ? 1
        : 1 - (lifePct - FADE_START_PCT) / (1 - FADE_START_PCT);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    if (particles.length > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  // ─── Detecção do botão ──────────────────────────────────────────────────
  function findSecondaryButton(target) {
    if (!target || !target.closest) return null;
    var btn = target.closest(
      'button, a, [role="button"], input[type="submit"], input[type="button"]'
    );
    if (!btn) return null;

    // classe
    if (btn.matches(SECONDARY_CLASS_SELECTORS)) return btn;
    // data-variant
    if (btn.matches('[data-variant="secondary"]')) return btn;
    // computed bg-color no próprio botão
    if (isSecondaryColor(getComputedStyle(btn).backgroundColor)) return btn;
    // também aceita se há background-image linear-gradient com #A76FFF ou #8F06CD
    var bgImage = getComputedStyle(btn).backgroundImage || '';
    if (/a76fff|#a76fff|167,\s*111,\s*255|143,\s*6,\s*205|8f06cd/i.test(bgImage)) return btn;

    return null;
  }

  // ─── Event delegation + bypass para reduced-motion ──────────────────────
  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', function (e) {
    if (prefersReduced) return;              // acessibilidade: pula efeito
    var btn = findSecondaryButton(e.target);
    if (!btn) return;
    if (btn.__confettiReplay) return;        // cliente re-disparado pelo timeout

    e.preventDefault();
    e.stopImmediatePropagation();

    burst(e.clientX, e.clientY);

    setTimeout(function () {
      // link simples → navegação direta (preserva user-gesture expired)
      if (btn.tagName === 'A' && btn.href) {
        if (btn.target === '_blank') {
          window.open(btn.href, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = btn.href;
        }
        return;
      }
      // submit/button/role=button → re-dispara click nativo com flag bypass
      btn.__confettiReplay = true;
      try { btn.click(); } finally { delete btn.__confettiReplay; }
    }, REDIRECT_DELAY);
  }, true); // capture-phase → intercepta antes de handlers de página

  // garante canvas disponível mesmo se body só surge depois (defer)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCanvas, { once: true });
  } else {
    ensureCanvas();
  }
})();

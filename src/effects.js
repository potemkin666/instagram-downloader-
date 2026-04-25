export function copyCode(btn) {
  const block = document.getElementById('code-block');
  const text = Array.from(block.querySelectorAll('div'))
    .map(d => d.textContent.trim()).filter(Boolean).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'COPIED!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 2000);
  });
}

/* ═══════════════════════════════════════════════════════════
   PIXEL ART HELPER — build SVG from 2-D grid
═══════════════════════════════════════════════════════════ */
function pixelSVG(grid, palette, px, extraAttrs = '') {
  const rows = grid.length, cols = grid[0].length;
  let rects = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      if (v && palette[v]) {
        rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="${palette[v]}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${cols} ${rows}" width="${cols*px}" height="${rows*px}"
    shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" ${extraAttrs}>${rects}</svg>`;
}

/* ═══════════════════════════════════════════════════════════
   PIXEL ART CREATURES
═══════════════════════════════════════════════════════════ */

// ── Pixel Whale (14×20) ───────────────────────────────────
const WHALE_GRID = [
  [0,0,0,0,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,1,1,2,1,1,1,1,1,1,1,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,1,1,0,0],
  [0,0,0,1,1,0,0,1,1,0,0,1,1,0],
];
const WHALE_PAL = { 1:'#0d2b5e', 2:'#001a38' };

// ── Pixel Jellyfish (10×14) ───────────────────────────────
const JELLY_GRID = [
  [0,0,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,0],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,1,3,3,3,3,1,1,1],
  [0,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0],
  [0,1,0,1,0,1,0,1,0,0],
  [0,1,0,0,0,1,0,1,0,0],
  [0,0,0,1,0,0,0,1,0,0],
  [0,1,0,1,0,1,0,0,0,0],
  [0,1,0,0,0,1,0,1,0,0],
  [0,0,0,1,0,0,0,0,0,0],
];
const JELLY_PAL = { 1:'#ff69b4', 2:'#ffb3de', 3:'#ff8fab' };

// Smaller teal jellyfish variant
const JELLY2_PAL = { 1:'#00d4b8', 2:'#7fffef', 3:'#00b4d8' };

// ── Pixel Fish (right-facing, 8×5) ───────────────────────
const FISH_GRID = [
  [0,0,1,1,0,0,0,1],
  [0,1,1,1,1,1,1,1],
  [1,2,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1],
  [0,0,1,1,0,0,0,1],
];
const FISH_PAL  = { 1:'#00d4b8', 2:'#001a2e' };
const FISH2_PAL = { 1:'#4dffd2', 2:'#001a2e' };

// ── Pixel Lantern (8×10) ─────────────────────────────────
const LANTERN_GRID = [
  [0,0,0,1,1,0,0,0],
  [0,0,1,2,2,1,0,0],
  [0,1,2,2,2,2,1,0],
  [0,1,2,2,2,2,1,0],
  [1,1,2,2,2,2,1,1],
  [1,1,2,2,2,2,1,1],
  [0,1,2,2,2,2,1,0],
  [0,1,1,2,2,1,1,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,1,1,0,0,0],
];
const LANTERN_PAL = { 1:'#cc8800', 2:'#ffd700' };

/* ─ Inject creatures into DOM ─────────────────────────── */
(function injectCreatures() {
  // Large pixel whale — centered background
  const whale = document.createElement('div');
  whale.className = 'pixel-whale';
  whale.style.cssText = `
    top: 120px; left: 50%; transform: translateX(-50%);
    filter: drop-shadow(0 0 16px rgba(0,180,216,0.55)) drop-shadow(0 0 40px rgba(0,100,200,0.3));
    animation: whaleDrift 12s ease-in-out infinite alternate;
  `;
  whale.innerHTML = pixelSVG(WHALE_GRID, WHALE_PAL, 7);
  document.body.appendChild(whale);

  // Pink jellyfish top-right
  const j1 = document.createElement('div');
  j1.className = 'pixel-jelly';
  j1.style.cssText = `
    top: 60px; right: 8%;
    filter: drop-shadow(0 0 10px rgba(255,105,180,0.7));
    animation: jellyBob 5s ease-in-out infinite alternate;
  `;
  j1.innerHTML = pixelSVG(JELLY_GRID, JELLY_PAL, 5);
  document.body.appendChild(j1);

  // Teal jellyfish top-left
  const j2 = document.createElement('div');
  j2.className = 'pixel-jelly';
  j2.style.cssText = `
    top: 80px; left: 6%;
    filter: drop-shadow(0 0 10px rgba(0,212,184,0.6));
    animation: jellyBob 7s 1.5s ease-in-out infinite alternate;
    transform: scaleX(-1);
  `;
  j2.innerHTML = pixelSVG(JELLY_GRID, JELLY2_PAL, 4);
  document.body.appendChild(j2);

  // Lanterns
  const lanternPositions = [
    { top:'38%', left:'7%',  dur:'4s',  dly:'0s',   glow:'rgba(255,215,0,0.5)' },
    { top:'55%', right:'9%', dur:'5.5s',dly:'1.2s', glow:'rgba(255,215,0,0.45)' },
    { top:'72%', left:'12%', dur:'3.8s',dly:'0.6s', glow:'rgba(255,215,0,0.4)' },
    { top:'42%', right:'5%', dur:'6s',  dly:'2s',   glow:'rgba(255,215,0,0.35)' },
  ];
  lanternPositions.forEach(p => {
    const l = document.createElement('div');
    l.className = 'lantern';
    const pos = p.right
      ? `top:${p.top}; right:${p.right};`
      : `top:${p.top}; left:${p.left};`;
    l.style.cssText = `${pos}
      filter: drop-shadow(0 0 8px ${p.glow}) drop-shadow(0 0 20px ${p.glow});
      animation: lanternFloat ${p.dur} ${p.dly} ease-in-out infinite alternate;
    `;
    l.innerHTML = pixelSVG(LANTERN_GRID, LANTERN_PAL, 4);
    document.body.appendChild(l);
  });

  // Swimming fish
  const fishConfigs = [
    { top:'30%', dur:'14s', dly:'0s',   scale:1,   pal:FISH_PAL  },
    { top:'48%', dur:'18s', dly:'4s',   scale:0.7, pal:FISH2_PAL },
    { top:'65%', dur:'22s', dly:'8s',   scale:1.2, pal:FISH_PAL  },
    { top:'20%', dur:'16s', dly:'2s',   scale:0.6, pal:FISH2_PAL },
  ];
  fishConfigs.forEach((fc, i) => {
    const f = document.createElement('div');
    f.className = 'pixel-fish';
    f.style.cssText = `
      top: ${fc.top}; left: -60px;
      transform: scale(${fc.scale});
      transform-origin: left center;
      filter: drop-shadow(0 0 5px rgba(0,212,184,0.5));
      animation: fishSwim ${fc.dur} ${fc.dly} linear infinite;
    `;
    f.innerHTML = pixelSVG(FISH_GRID, fc.pal, 5);
    document.body.appendChild(f);
  });
})();

/* ─ Seaweed strips ───────────────────────────────────────── */
(function injectSeaweed() {
  const positions = [8, 18, 28, 42, 55, 68, 78, 88];
  positions.forEach((leftPct, i) => {
    const h = 60 + Math.random() * 80;
    const wrap = document.createElement('div');
    wrap.className = 'seaweed';
    wrap.style.cssText = `
      left: ${leftPct}%;
      animation: seaweedSway ${3 + i * 0.4}s ${i * 0.3}s ease-in-out infinite alternate;
    `;
    const body = document.createElement('div');
    body.className = 'seaweed-body';
    body.style.height = h + 'px';
    // Add pixel nodes along the seaweed
    [0.3, 0.55, 0.75].forEach(frac => {
      const node = document.createElement('div');
      node.className = 'seaweed-node';
      node.style.cssText = `top:${h * frac}px; left:-${2 + i % 3}px; width:${8 + (i % 2) * 4}px;`;
      body.appendChild(node);
    });
    wrap.appendChild(body);
    document.body.appendChild(wrap);
  });
})();

/* ─ Sparkle particles ────────────────────────────────────── */
(function injectSparkles() {
  const count = 22;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    const sz   = 2 + Math.floor(Math.random() * 3) * 2; // 2,4,6
    const dur  = 1.5 + Math.random() * 3;
    const dly  = Math.random() * 5;
    const top  = 5  + Math.random() * 90;
    const left = 3  + Math.random() * 94;
    s.style.cssText = `
      top:${top}%; left:${left}%;
      width:${sz}px; height:${sz * 4}px;
      animation: sparkleTwinkle ${dur}s ${dly}s ease-in-out infinite;
    `;
    // override pseudo-element sizes via inline custom props
    document.body.appendChild(s);
  }
})();

/* ─ Glowing water lines ──────────────────────────────────── */
(function injectWater() {
  const pool = document.getElementById('water-pool');
  const lineData = [
    { top:8,  dur:'3.5s', dly:'0s',   w:'60%',  l:'20%' },
    { top:20, dur:'4.2s', dly:'0.8s', w:'80%',  l:'10%' },
    { top:32, dur:'3.1s', dly:'1.5s', w:'50%',  l:'25%' },
    { top:44, dur:'5s',   dly:'0.3s', w:'70%',  l:'15%' },
    { top:56, dur:'3.8s', dly:'1.1s', w:'45%',  l:'30%' },
  ];
  lineData.forEach(d => {
    const line = document.createElement('div');
    line.className = 'water-line';
    line.style.cssText = `top:${d.top}px; left:${d.l}; width:${d.w}; animation-duration:${d.dur}; animation-delay:${d.dly};`;
    pool.appendChild(line);
  });
})();

/* ═══════════════════════════════════════════════════════════
   KEYFRAMES (injected via style tag)
═══════════════════════════════════════════════════════════ */
const KF = document.createElement('style');
KF.textContent = `
  @keyframes jellyBob {
    from { transform: translateY(-12px); }
    to   { transform: translateY(14px);  }
  }
  @keyframes whaleDrift {
    from { transform: translateX(-50%) translateY(-6px) rotate(-1deg); }
    to   { transform: translateX(-50%) translateY(10px) rotate(1deg);  }
  }
  @keyframes lanternFloat {
    from { transform: translateY(-8px) rotate(-4deg); }
    to   { transform: translateY(10px) rotate(4deg);  }
  }
  @keyframes fishSwim {
    from { left: -80px; }
    to   { left: calc(100vw + 80px); }
  }
  @keyframes seaweedSway {
    from { transform: rotate(-10deg); }
    to   { transform: rotate(10deg);  }
  }
  @keyframes sparkleTwinkle {
    0%, 100% { opacity:0;   transform:scale(0.4) rotate(0deg);   }
    50%       { opacity:1;   transform:scale(1)   rotate(45deg);  }
  }
`;
document.head.appendChild(KF);

/* ═══════════════════════════════════════════════════════════
   BIOLUMINESCENT CAVE CANVAS
═══════════════════════════════════════════════════════════ */
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H;

  // Bioluminescent sparkle particles
  let sparks = [];

  function mkSpark() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 1.8 + 0.4,
      dx:    (Math.random() - 0.5) * 0.25,
      dy:    (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.5 + 0.1,
      // alternate between teal and gold sparkles
      color: Math.random() > 0.8 ? [255, 215, 0] : [0, 245, 212],
    };
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    sparks = Array.from({ length: 150 }, mkSpark);
  }

  function draw() {
    // Deep cave gradient
    const bg = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.9);
    bg.addColorStop(0,   '#052242');   // teal-lit cave opening
    bg.addColorStop(0.18,'#0d1040');   // mid cave
    bg.addColorStop(0.45,'#080828');   // deep purple
    bg.addColorStop(0.75,'#06091e');   // abyss
    bg.addColorStop(1,   '#020510');   // void
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Teal bioluminescent glow (cave opening light)
    const glowGrad = ctx.createRadialGradient(W * 0.5, -H * 0.05, 0, W * 0.5, H * 0.2, W * 0.45);
    glowGrad.addColorStop(0,   'rgba(0,245,212,0.13)');
    glowGrad.addColorStop(0.5, 'rgba(0,180,216,0.06)');
    glowGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, W, H);

    // Purple rock glow on edges
    const leftRock = ctx.createRadialGradient(0, H * 0.5, 0, 0, H * 0.5, W * 0.35);
    leftRock.addColorStop(0,   'rgba(45,27,126,0.25)');
    leftRock.addColorStop(1,   'transparent');
    ctx.fillStyle = leftRock;
    ctx.fillRect(0, 0, W, H);

    const rightRock = ctx.createRadialGradient(W, H * 0.5, 0, W, H * 0.5, W * 0.35);
    rightRock.addColorStop(0,   'rgba(45,27,126,0.25)');
    rightRock.addColorStop(1,   'transparent');
    ctx.fillStyle = rightRock;
    ctx.fillRect(0, 0, W, H);

    // Sparkle bioluminescent particles (round pixels)
    sparks.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      // Quantise to 4px grid for pixel art feel
      const gx = Math.round(p.x / 4) * 4;
      const gy = Math.round(p.y / 4) * 4;
      const [r, g, b] = p.color;
      ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
      ctx.fillRect(gx, gy, 2, 2);   // square pixels
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

/* ═══════════════════════════════════════════════════════════
   NEXT-LEVEL AESTHETIC FX
═══════════════════════════════════════════════════════════ */
export function initNextLevelAesthetics() {
  const body = document.body;
  if (!body) return;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tiltTargets = ['.search-card', '.profile-summary', '.terminal-wrap', '.recent-wrap'];
  const PANEL_TILT_INTENSITY = 8;
  const COMMAND_CARD_TILT_INTENSITY = 12;
  const PANEL_PERSPECTIVE_PX = 1200;

  if (!prefersReducedMotion) {
    window.addEventListener('pointermove', (event) => {
      body.style.setProperty('--mouse-x', `${event.clientX}px`);
      body.style.setProperty('--mouse-y', `${event.clientY}px`);
      body.style.setProperty('--mouse-glow-opacity', '1');
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      body.style.setProperty('--mouse-glow-opacity', '0');
    });
  }

  function attachTilt(node, intensity = COMMAND_CARD_TILT_INTENSITY) {
    if (!node || prefersReducedMotion) return;
    node.addEventListener('pointermove', (event) => {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const tiltY = ((x - 0.5) * intensity).toFixed(2);
      const tiltX = ((0.5 - y) * intensity).toFixed(2);
      node.style.setProperty('--tilt-x', `${tiltX}deg`);
      node.style.setProperty('--tilt-y', `${tiltY}deg`);
      if (!node.classList.contains('command-card')) {
        node.style.transform = `perspective(${PANEL_PERSPECTIVE_PX}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translate3d(0,-4px,0)`;
      }
    });
    node.addEventListener('pointerleave', () => {
      node.style.removeProperty('--tilt-x');
      node.style.removeProperty('--tilt-y');
      if (!node.classList.contains('command-card')) node.style.transform = '';
    });
  }

  tiltTargets.forEach(selector => {
    document.querySelectorAll(selector).forEach(node => attachTilt(node, PANEL_TILT_INTENSITY));
  });

  function primeCommandCardTilt(root = document) {
    root.querySelectorAll('.command-card:not([data-tilt-ready])').forEach(card => {
      card.dataset.tiltReady = 'true';
      attachTilt(card, COMMAND_CARD_TILT_INTENSITY);
    });
  }

  const commandGrid = document.getElementById('commands-grid');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches && node.matches('.command-card')) {
          if (!node.dataset.tiltReady) {
            node.dataset.tiltReady = 'true';
            attachTilt(node, COMMAND_CARD_TILT_INTENSITY);
          }
          return;
        }
        primeCommandCardTilt(node);
      });
    });
  });
  if (commandGrid) observer.observe(commandGrid, { childList: true });
  primeCommandCardTilt();
}

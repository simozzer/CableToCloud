// Sound effects (Web Audio, no files needed) and the level-complete confetti.
(function () {
  const Fx = NG.Fx = { muted: false };
  let ctx = null;

  function audio() {
    if (Fx.muted) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (_) { return null; }
  }

  // notes: [frequency Hz, start offset s, duration s]
  function play(notes, type = 'sine', vol = 0.12) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + 0.01;
    notes.forEach(([f, at, dur]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(vol, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(a.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.05);
    });
  }

  Fx.tick = () => play([[880, 0, 0.12], [1320, 0.08, 0.18]], 'triangle', 0.1);
  Fx.fail = () => play([[220, 0, 0.18], [180, 0.12, 0.25]], 'square', 0.04);
  Fx.win = () => play([[523, 0, 0.25], [659, 0.12, 0.25], [784, 0.24, 0.25], [1047, 0.36, 0.6]], 'triangle', 0.13);

  Fx.confetti = function () {
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    cv.width = innerWidth;
    cv.height = innerHeight;
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    const colours = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f97316'];
    const bits = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: colours[Math.floor(Math.random() * colours.length)],
    }));
    const t0 = performance.now();
    const frame = now => {
      g.clearRect(0, 0, cv.width, cv.height);
      bits.forEach(b => {
        b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
      });
      if (now - t0 < 3000) requestAnimationFrame(frame); else cv.remove();
    };
    requestAnimationFrame(frame);
    setTimeout(() => cv.remove(), 3500);
  };
})();

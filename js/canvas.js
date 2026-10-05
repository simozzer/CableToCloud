// The SVG workspace: draws devices and cables, handles dragging/cabling, and animates packets.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 620;
  const { esc, clamp } = NG.util;
  const C = NG.Canvas = { W, H };
  let svg, G, layers = {}, drag = null, picker;

  C.init = function (el, game) {
    svg = el; G = game;
    picker = document.getElementById('port-picker');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="12.5" cy="12.5" r="1.1" class="grid-dot"/></pattern></defs>
      <rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#grid)"/>
      <g id="layer-links"></g><g id="layer-rubber"></g><g id="layer-devs"></g><g id="layer-anim"></g>`;
    ['links', 'rubber', 'devs', 'anim'].forEach(n => { layers[n] = svg.querySelector('#layer-' + n); });

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);

    const wrap = document.getElementById('canvas-wrap');
    wrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      const t = e.dataTransfer.getData('text/plain');
      if (t) { const p = pt(e); G.addFromPalette(t, p.x, p.y); }
    });
  };

  function pt(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  C.toScreen = function (x, y) {
    const p = svg.createSVGPoint();
    p.x = x; p.y = y;
    const s = p.matrixTransform(svg.getScreenCTM());
    const r = svg.parentElement.getBoundingClientRect();
    return { x: s.x - r.left, y: s.y - r.top };
  };

  // ---------- Input ----------

  function onDown(e) {
    if (e.button !== 0) return;
    const p = pt(e);
    const dg = e.target.closest('[data-dev]'), lg = e.target.closest('[data-link]');
    C.hidePicker();
    if (G.tool === 'cable') { if (dg) G.cableClick(dg.dataset.dev); else G.cancelCable(); return; }
    if (G.tool === 'delete') { if (dg) G.deleteDevice(dg.dataset.dev); else if (lg) G.deleteLink(lg.dataset.link); return; }
    if (dg) {
      const d = G.dev(dg.dataset.dev);
      drag = { d, ox: p.x - d.x, oy: p.y - d.y, sx: p.x, sy: p.y, moved: false };
      svg.setPointerCapture(e.pointerId);
      if (!G.sel || G.sel.dev !== d.id) G.select({ dev: d.id });
    } else if (lg) G.select({ link: lg.dataset.link });
    else G.select(null);
  }

  function onMove(e) {
    const p = pt(e);
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
      drag.moved = true;
      drag.d.x = Math.round(clamp(p.x - drag.ox, 45, W - 45));
      drag.d.y = Math.round(clamp(p.y - drag.oy, 40, H - 75));
      C.render();
    } else if (G.cableFrom) C.rubber(p);
  }

  function onUp(e) {
    if (!drag) return;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    drag = null;
  }

  C.rubber = function (p) {
    const a = G.cableFrom && G.dev(G.cableFrom.dev);
    layers.rubber.innerHTML = a && p ? `<line class="rubber" x1="${a.x}" y1="${a.y}" x2="${p.x}" y2="${p.y}"/>` : '';
  };

  function portRole(d, port) {
    const def = NG.Types[d.type];
    if (!def.ifaces) return '';
    const f = def.ifaces.find(i => i.ports.includes(port));
    return f.role === 'wan' ? 'WAN · Internet side' : 'LAN · your devices';
  }

  C.pickPort = function (d, cb) {
    const s = C.toScreen(d.x, d.y + 28);
    picker.innerHTML = `<div class="pp-title">${esc(d.name)}: choose a port</div>` + d.ports.map(p => {
      const used = !!NG.Model.linkAt(G.net, d.id, p);
      return `<button data-port="${esc(p)}" ${used ? 'disabled' : ''}><b>${esc(p)}</b><span>${portRole(d, p)}${used ? ' · in use' : ''}</span></button>`;
    }).join('');
    picker.style.left = s.x + 'px';
    picker.style.top = s.y + 'px';
    picker.hidden = false;
    picker.onclick = ev => {
      const b = ev.target.closest('button[data-port]');
      if (!b || b.disabled) return;
      C.hidePicker();
      cb(b.dataset.port);
    };
  };
  C.hidePicker = () => { if (picker) picker.hidden = true; };

  // ---------- Drawing ----------

  C.render = function () {
    layers.links.innerHTML = G.net.links.map(linkSvg).join('');
    layers.devs.innerHTML = G.net.devices.map(devSvg).join('');
  };

  function labelPos(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    // Put the label just outside the device's box (icon above, name/IP text below).
    const ux = dx / len, uy = dy / len;
    const tx = ux ? 52 / Math.abs(ux) : Infinity;
    const ty = uy > 0 ? 66 / uy : uy < 0 ? 38 / -uy : Infinity;
    const t = Math.min(0.42, (Math.min(tx, ty) + 10) / len);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  function portLabel(p, text) {
    const w = text.length * 6.6 + 10;
    return `<g class="port-label" transform="translate(${p.x},${p.y})"><rect x="${-w / 2}" y="-8" width="${w}" height="16" rx="4"/><text y="4">${esc(text)}</text></g>`;
  }

  function linkSvg(l) {
    const a = G.dev(l.a.dev), b = G.dev(l.b.dev);
    if (!a || !b) return '';
    const wan = a.type === 'internet' || b.type === 'internet';
    const sel = G.sel && G.sel.link === l.id;
    return `<g class="link ${wan ? 'wan' : ''} ${sel ? 'sel' : ''}" data-link="${l.id}">
      <line class="link-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      <line class="link-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      ${portLabel(labelPos(a, b), l.a.port)}${portLabel(labelPos(b, a), l.b.port)}
    </g>`;
  }

  function ipLabels(d) {
    const T = G.T, kind = NG.Types[d.type].kind, IP = NG.IP;
    if (!T || !T.byDev[d.id]) return [];
    if (kind === 'host') {
      const i = T.byDev[d.id][0];
      if (!i.up) return [{ text: 'unplugged', cls: 'bad' }];
      if (i.ip == null) return [{ text: d.config.mode === 'none' ? 'no IP settings' : 'no IP', cls: 'bad' }];
      if (i.conflict) return [{ text: IP.str(i.ip) + ' conflict!', cls: 'bad' }];
      return [{ text: `${IP.str(i.ip)}/${IP.prefix(i.mask)}`, cls: i.source === 'apipa' ? 'warn' : '' }];
    }
    if (kind === 'router') {
      return T.byDev[d.id].filter(i => i.ip != null).map(i => ({ text: `${i.name} ${IP.str(i.ip)}${i.role === 'wan' ? '' : '/' + IP.prefix(i.mask)}` }));
    }
    if (kind === 'internet') return [{ text: 'ISP ' + IP.str(NG.Sim.ISP.ip), cls: 'muted' }];
    return [];
  }

  const STATUS_TITLE = { ok: 'Internet reachable', warn: 'Has an address but no Internet', bad: 'Not connected / no address' };

  function devSvg(d) {
    const sel = G.sel && G.sel.dev === d.id;
    const src = G.cableFrom && G.cableFrom.dev === d.id;
    const st = G.status[d.id];
    const labels = ipLabels(d);
    return `<g class="dev t-${d.type} ${sel ? 'sel' : ''} ${src ? 'cable-src' : ''}" data-dev="${d.id}" transform="translate(${d.x},${d.y})">
      <rect class="dev-halo" x="-48" y="-36" width="96" height="${84 + labels.length * 13}" rx="12"/>
      ${NG.Icons[d.type]()}
      ${st ? `<circle class="status ${st}" cx="34" cy="-24" r="6"><title>${STATUS_TITLE[st]}</title></circle>` : ''}
      <text class="dev-name" y="38">${esc(d.name)}</text>
      ${labels.map((t, i) => `<text class="dev-ip ${t.cls || ''}" y="${53 + i * 13}">${esc(t.text)}</text>`).join('')}
    </g>`;
  }

  // ---------- Animation ----------

  C.animate = function (edges, opts = {}) {
    return new Promise(resolve => {
      if (!edges || !edges.length) { resolve(); return; }
      const per = opts.speed || 320;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'packet ' + (opts.cls || ''));
      g.innerHTML = `<circle r="7"/>${opts.label ? `<text y="-12">${esc(opts.label)}</text>` : ''}`;
      layers.anim.appendChild(g);
      const t0 = performance.now();
      let finished = false;
      const finish = () => { if (finished) return; finished = true; g.remove(); resolve(); };
      // requestAnimationFrame pauses in background tabs; make sure commands never hang.
      setTimeout(finish, edges.length * per + 400);
      const step = now => {
        if (finished) return;
        const t = (now - t0) / per, idx = Math.floor(t);
        const e = edges[idx];
        const a = e && G.dev(e.from), b = e && G.dev(e.to);
        if (!a || !b) { finish(); return; }
        const f = t - idx;
        g.setAttribute('transform', `translate(${a.x + (b.x - a.x) * f},${a.y + (b.y - a.y) * f})`);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  C.flash = function (devId, cls) {
    const d = G.dev(devId);
    if (!d) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'flash ' + cls);
    g.setAttribute('transform', `translate(${d.x},${d.y})`);
    g.innerHTML = cls === 'bad'
      ? '<circle r="24"/><path d="M-9 -9 L9 9 M9 -9 L-9 9"/>'
      : '<circle r="24"/><path d="M-9 0 L-3 7 L10 -7"/>';
    layers.anim.appendChild(g);
    setTimeout(() => g.remove(), 1400);
  };

  C.clearAnim = () => { if (layers.anim) layers.anim.innerHTML = ''; };
})();

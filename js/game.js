// Game controller: level loading, tools, objectives, log and modals.
(function () {
  const { IP, Model, Sim, Types } = NG;
  const { esc, clamp, $, $$ } = NG.util;

  const G = NG.Game = {
    net: null, T: null, level: null, levelIndex: 0,
    tool: 'select', sel: null, cableFrom: null, status: {}, events: [], done: false, hintIdx: 0,
  };

  const TOOL_TIPS = {
    select: 'Drag devices to move them. Click a device or cable to inspect it.',
    cable: 'Click a device, then another device, to connect them with an Ethernet cable. Esc cancels.',
    delete: 'Click a device or cable to remove it.',
  };

  // ---------- Saved progress ----------
  const STORE_KEY = 'cabletocloud.progress.v1';
  const OLD_STORE_KEY = 'netquest.progress.v1'; // before the rename
  G.progress = { completed: [], unlockAll: false, muted: false };
  function loadProgress() {
    try {
      const saved = localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY);
      Object.assign(G.progress, JSON.parse(saved) || {});
    } catch (_) { /* storage unavailable */ }
    NG.Fx.muted = !!G.progress.muted;
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(G.progress)); } catch (_) { /* storage unavailable */ }
  }
  const isDone = i => G.progress.completed.includes(NG.Levels[i].id);
  G.isUnlocked = i => i === 0 || G.progress.unlockAll || isDone(i) || isDone(i - 1);

  function updateHeader() {
    const n = NG.Levels.filter((_, i) => isDone(i)).length;
    $('#btn-levels').textContent = `Levels (${n}/${NG.Levels.length})`;
    $('#btn-sound').textContent = G.progress.muted ? '♪ Sound: off' : '♪ Sound: on';
  }

  G.dev = id => G.net.devices.find(d => d.id === id);
  G.link = id => G.net.links.find(l => l.id === id);
  const nameOf = id => { const d = G.dev(id); return d ? d.name : '?'; };
  const setTip = t => { $('#tool-tip').textContent = t; };

  G.init = function () {
    NG.Canvas.init($('#canvas'), G);
    NG.Terminal.init();
    $$('#tools .tool').forEach(b => b.addEventListener('click', () => G.setTool(b.dataset.tool)));
    $('#btn-briefing').onclick = () => G.showBriefing();
    $('#btn-levels').onclick = () => G.showLevels();
    $('#btn-reset').onclick = () => G.modal('<h2>Restart this level?</h2><p>Your network will be reset to how the level started.</p>', [
      { label: 'Cancel', onClick: G.closeModal },
      { label: 'Restart', cls: 'primary', onClick: () => { G.closeModal(); G.loadLevel(G.levelIndex); } },
    ]);
    $('#btn-hint').onclick = G.nextHint;
    $('#btn-solution').onclick = G.askSolution;
    $('#btn-subnet').onclick = () => NG.Explorer.open(G.level.explorer || '192.168.1.0');
    $('#btn-sound').onclick = () => {
      G.progress.muted = !G.progress.muted;
      NG.Fx.muted = G.progress.muted;
      saveProgress();
      updateHeader();
      NG.Fx.tick();
    };
    document.addEventListener('keydown', onKey);
    loadProgress();
    updateHeader();
    G.setTool('select');
    const next = NG.Levels.findIndex((_, i) => !isDone(i));
    G.loadLevel(next < 0 ? NG.Levels.length - 1 : next);
  };

  function onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape') { G.cancelCable(); if (!$('#modal').hidden) G.closeModal(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && G.sel) {
      e.preventDefault();
      if (G.sel.dev) G.deleteDevice(G.sel.dev); else if (G.sel.link) G.deleteLink(G.sel.link);
    }
  }

  // ---------- Levels ----------

  G.loadLevel = function (idx) {
    const L = NG.Levels[idx];
    Object.assign(G, { level: L, levelIndex: idx, net: Model.create(), events: [], done: false, sel: null, cableFrom: null, hintIdx: 0, T: null, prevRes: null });
    L.setup(G.net, Model);
    NG.Canvas.clearAnim();
    NG.Terminal.reset();
    $('#log-out').innerHTML = '';
    $('#hint-box').hidden = true;
    $('#level-title').innerHTML = `Level ${idx + 1}: ${esc(L.title)} <small>${esc(L.subtitle)}</small>`;
    G.recompute({ silent: true });
    NG.Inspector.render();
    G.log(`Level ${idx + 1}: ${L.title}`);
    G.showBriefing();
  };

  G.showBriefing = function () {
    const L = G.level;
    G.modal(`<div class="brief">
      <div class="lvl-num">Level ${G.levelIndex + 1}</div>
      <h2>${esc(L.title)}</h2><p class="subtitle">${esc(L.subtitle)}</p>
      ${L.briefing}
      <h4>Your objectives</h4><ol class="obj-preview">${L.objectives.map(o => `<li>${o.text}</li>`).join('')}</ol>
    </div>`, [{ label: 'Start ▶', cls: 'primary', onClick: G.closeModal }]);
    $$('#modal [data-explorer]').forEach(b => { b.onclick = () => NG.Explorer.open(b.dataset.explorer, G.showBriefing); });
  };

  G.showLevels = function () {
    G.modal(`<h2>Levels</h2><div class="lvl-list">${NG.Levels.map((L, i) => {
      const open = G.isUnlocked(i), done = isDone(i);
      return `<button class="lvl-card ${i === G.levelIndex ? 'current' : ''} ${done ? 'done' : ''}" data-i="${i}" ${open ? '' : 'disabled'}>
        <span class="n">${done ? '✓' : i + 1}</span>
        <span class="grow"><b>${esc(L.title)}</b><small>${esc(L.subtitle)}</small></span>
        <span class="state">${done ? 'Complete' : open ? '' : 'Locked'}</span></button>`;
    }).join('')}</div>
      <label class="check teacher"><input type="checkbox" id="unlock-all" ${G.progress.unlockAll ? 'checked' : ''}> Unlock all levels (teacher mode)</label>`,
    [
      { label: 'Reset progress', cls: 'danger', onClick: () => G.modal('<h2>Reset progress?</h2><p>All levels will be marked as not completed.</p>', [
        { label: 'Cancel', onClick: G.showLevels },
        { label: 'Reset', cls: 'primary', onClick: () => { G.progress.completed = []; saveProgress(); updateHeader(); G.closeModal(); G.loadLevel(0); } },
      ]) },
      { label: 'Close', onClick: G.closeModal },
    ]);
    $$('.lvl-card').forEach(b => { b.onclick = () => { G.closeModal(); G.loadLevel(+b.dataset.i); }; });
    $('#unlock-all').onchange = e => { G.progress.unlockAll = e.target.checked; saveProgress(); G.showLevels(); };
  };

  // Suggestions on a working solution: things that pass, but could be cleaner or safer.
  G.reviewNotes = () => NG.Objectives.review(G.level, G.ctx());

  G.showWin = function (quiet) {
    const L = G.level, next = NG.Levels[G.levelIndex + 1], notes = G.reviewNotes();
    const buttons = [{ label: 'Keep exploring', onClick: G.closeModal }];
    if (L.solution) buttons.push({ label: 'Model solution', onClick: () => G.showSolution(() => G.showWin(true)) });
    if (next) buttons.push({ label: `Next: ${next.title} →`, cls: 'primary', onClick: () => { G.closeModal(); G.loadLevel(G.levelIndex + 1); } });
    if (!quiet) { NG.Fx.win(); NG.Fx.confetti(); }
    G.modal(`<div class="win"><div class="badge">✓</div><h2>Level complete!</h2><h3>${esc(L.title)}</h3>
      <div class="review ${notes.length ? 'has-notes' : ''}"><h4>How good is your solution?</h4>
        ${notes.length ? `<p class="small">Everything required works. A few things could be better:</p><ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>`
          : '<p class="small">✓ All requirements met, and nothing to tidy up. That’s as clean as the model solution.</p>'}</div>
      <h4>What you learned</h4>${L.learned}
      ${next ? '' : '<p><b>You’ve finished every level. Congratulations, network engineer!</b></p>'}</div>`, buttons);
  };

  // back: where "Back" goes (the win screen), otherwise the modal just closes.
  G.showSolution = function (back) {
    const L = G.level;
    G.modal(`<div class="solution"><h2>Model solution</h2><h3>${esc(L.title)}</h3>${L.solution}</div>`,
      [{ label: back ? '← Back' : 'Close', cls: 'primary', onClick: back || G.closeModal }], 'wide');
  };

  G.askSolution = function () {
    if (!G.level.solution) return;
    if (G.done) { G.showSolution(); return; }
    G.modal('<h2>Show the solution?</h2><p>This shows the complete answer for this level. The hints give it away more gently, one step at a time.</p>', [
      { label: 'Cancel', onClick: G.closeModal },
      { label: 'Next hint instead', onClick: () => { G.closeModal(); G.nextHint(); } },
      { label: 'Show solution', cls: 'primary', onClick: () => G.showSolution() },
    ]);
  };

  G.externalVisit = async function () {
    const t = Sim.externalVisit(G.T);
    if (t.noWan) { G.toast('Your router has no public (WAN) address yet.'); return; }
    G.log(`A customer (${IP.str(Sim.REMOTE)}) opens http://${IP.str(t.wanIp)}/ ...`);
    await NG.Terminal.animT(t, 'HTTP');
    if (t.ok) { G.log('The customer sees your website!', 'ok'); G.toast('Success: the customer can see your website!'); }
    else {
      G.log('The customer could not load your site. ' + Sim.explain(G.T, t.fail, t.stage), 'bad');
      G.toast('The customer could not reach your site. Check the event log to see why.');
      NG.Fx.fail();
    }
    G.recordEvent({ type: 'external', ok: t.ok });
  };

  G.nextHint = function () {
    const hs = G.level.hints || [];
    if (!hs.length) return;
    const i = Math.min(G.hintIdx, hs.length - 1);
    const box = $('#hint-box');
    box.innerHTML = `<b>Hint ${i + 1} of ${hs.length}:</b> ${hs[i]}`;
    box.hidden = false;
    G.hintIdx = i + 1;
  };

  // ---------- Simulation refresh ----------

  G.recompute = function (opts = {}) {
    const prev = G.T;
    G.T = Sim.build(G.net);
    const T = G.T;

    if (!opts.silent) {
      T.events.forEach(ev => {
        if (ev.type !== 'dhcp') return;
        G.log(`DHCP: ${nameOf(ev.client.dev)} was given ${IP.str(ev.ip)} by ${nameOf(ev.server.dev)}`, 'dhcp');
        const path = Sim.l2path(T, ev.client, ev.server);
        NG.Canvas.animate(path, { cls: 'dhcp', label: 'DHCP Discover' })
          .then(() => NG.Canvas.animate(path.slice().reverse().map(e => ({ from: e.to, to: e.from })), { cls: 'dhcp', label: 'DHCP Offer' }));
      });
      T.ifaces.forEach(i => {
        const was = prev && prev.ifaces.find(x => x.key === i.key);
        if (i.source === 'apipa' && (!was || was.source !== 'apipa')) G.log(`${nameOf(i.dev)}: no DHCP server answered, so it gave itself ${IP.str(i.ip)}`, 'warn');
        if (i.conflict && (!was || !was.conflict)) G.log(`IP conflict: ${nameOf(i.dev)} and ${nameOf(i.conflict.dev)} both use ${IP.str(i.ip)}`, 'bad');
      });
    }

    // Status dot = "can this device reach the Internet?"
    const target = IP.parse('8.8.8.8');
    G.status = {};
    G.net.devices.forEach(d => {
      const k = Types[d.type].kind;
      if (k === 'host') {
        const i = T.byDev[d.id][0];
        G.status[d.id] = !i.up || i.ip == null || i.conflict ? 'bad' : Sim.transact(T, d.id, target).ok ? 'ok' : 'warn';
      } else if (k === 'router') {
        G.status[d.id] = Sim.transact(T, d.id, target).ok ? 'ok' : 'warn';
      }
    });

    NG.Canvas.render();
    G.renderPalette();
    NG.Inspector.renderStatus();
    G.checkObjectives();
  };

  G.recordEvent = function (ev) {
    G.events.push(ev);
    G.checkObjectives();
  };

  G.ctx = () => ({ net: G.net, T: G.T, events: G.events });

  // A step counts only while it still holds (see NG.Objectives.evaluate in levels.js).
  G.checkObjectives = function () {
    const L = G.level;
    const { did, ok: res } = NG.Objectives.evaluate(L, G.ctx());
    const prev = G.prevRes;
    const fresh = res.map((r, i) => r && prev && !prev[i]);
    G.prevRes = res;
    $('#objectives').innerHTML = L.objectives.map((o, i) => {
      const broken = did[i] && !res[i];
      return `<li class="${res[i] ? 'done' : ''} ${broken ? 'broken' : ''} ${fresh[i] ? 'just' : ''}"><span class="tick">${res[i] ? '✓' : broken ? '!' : i + 1}</span>
        <span>${o.text}${broken ? '<small class="broken-note">Was done, but a later change broke it. Check it again.</small>' : ''}</span></li>`;
    }).join('');
    const n = res.filter(Boolean).length;
    $('#obj-progress').textContent = `${n}/${L.objectives.length}`;
    if (fresh.some(Boolean) && n < L.objectives.length) NG.Fx.tick();
    if (n === L.objectives.length && !G.done) {
      G.done = true;
      G.log(`Level complete: ${L.title}`, 'ok');
      if (!G.progress.completed.includes(L.id)) G.progress.completed.push(L.id);
      saveProgress();
      updateHeader();
      setTimeout(G.showWin, 1600);
    }
  };

  // ---------- Toolbox ----------

  G.remaining = type => {
    const lim = G.level.palette[type];
    return lim === Infinity ? Infinity : lim - G.net.devices.filter(d => d.type === type && d.fromPalette).length;
  };

  G.renderPalette = function () {
    const el = $('#palette');
    const types = Object.keys(G.level.palette);
    if (!types.length) { el.innerHTML = '<p class="muted small">No new devices needed in this level.</p>'; return; }
    el.innerHTML = types.map(t => {
      const n = G.remaining(t), def = Types[t];
      return `<div class="pal-item ${n === 0 ? 'empty' : ''}" draggable="${n !== 0}" data-type="${t}" title="${esc(def.desc)}">
        <svg viewBox="-38 -30 76 58" class="t-${t}">${NG.Icons[t]()}</svg>
        <div><b>${def.label}</b><small>${n === Infinity ? 'unlimited' : n + ' left'}</small></div></div>`;
    }).join('');
    $$('.pal-item', el).forEach(it => {
      it.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', it.dataset.type); e.dataTransfer.effectAllowed = 'copy'; });
      it.addEventListener('click', () => G.addFromPalette(it.dataset.type));
    });
  };

  function freeSpot() {
    for (const x of [580, 760, 920]) {
      for (const y of [290, 130, 450]) {
        if (!G.net.devices.some(d => Math.hypot(d.x - x, d.y - y) < 110)) return { x, y };
      }
    }
    return { x: 600 + Math.random() * 300, y: 120 + Math.random() * 380 };
  }

  G.addFromPalette = function (type, x, y) {
    if (!(type in G.level.palette)) return;
    if (G.remaining(type) <= 0) { G.toast(`No more ${Types[type].label}s are available in this level.`); return; }
    if (x == null) ({ x, y } = freeSpot());
    const d = Model.add(G.net, type, Math.round(clamp(x, 45, NG.Canvas.W - 45)), Math.round(clamp(y, 40, NG.Canvas.H - 75)),
      { fromPalette: true, hostMode: G.level.defaultHostMode || 'dhcp' });
    G.log(`Added ${d.name}`);
    G.recompute();
    G.select({ dev: d.id });
  };

  // ---------- Tools ----------

  G.setTool = function (t) {
    G.cancelCable();
    G.tool = t;
    $$('#tools .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    $('#canvas').setAttribute('class', 'tool-' + t);
    setTip(TOOL_TIPS[t]);
  };

  G.select = function (sel) {
    G.sel = sel;
    NG.Canvas.render();
    NG.Inspector.render();
    const d = sel && sel.dev && G.dev(sel.dev);
    if (d && ['host', 'router'].includes(Types[d.type].kind)) NG.Terminal.attach(d.id);
  };

  G.cableClick = function (devId) {
    const d = G.dev(devId);
    if (!d) return;
    if (G.cableFrom && G.cableFrom.dev === devId) { G.toast('Click a different device for the other end of the cable.'); return; }
    const free = d.ports.filter(p => !Model.linkAt(G.net, d.id, p));
    if (!free.length) { G.toast(`${d.name} has no free ports.`); return; }
    const choose = port => {
      if (!G.cableFrom) {
        G.cableFrom = { dev: d.id, port };
        NG.Canvas.render();
        setTip(`Cable plugged into ${d.name} (${port}). Now click the device for the other end. Esc cancels.`);
        return;
      }
      const a = G.dev(G.cableFrom.dev);
      Model.connect(G.net, a, G.cableFrom.port, d, port);
      G.log(`Cable connected: ${a.name} ${G.cableFrom.port} ↔ ${d.name} ${port}`);
      G.cableFrom = null;
      NG.Canvas.rubber(null);
      setTip(TOOL_TIPS.cable);
      G.recompute();
    };
    if (Types[d.type].kind === 'router' || d.type === 'mswitch') NG.Canvas.pickPort(d, choose);
    else choose(free[0]);
  };

  G.cancelCable = function () {
    NG.Canvas.hidePicker();
    if (!G.cableFrom) return;
    G.cableFrom = null;
    NG.Canvas.rubber(null);
    NG.Canvas.render();
    setTip(TOOL_TIPS[G.tool]);
  };

  G.deleteDevice = function (id) {
    const d = G.dev(id);
    if (!d) return;
    if (d.locked) { G.toast(`${d.name} is part of this level and can't be removed.`); return; }
    if (G.cableFrom && G.cableFrom.dev === id) G.cancelCable();
    Model.removeDevice(G.net, id);
    G.log(`Removed ${d.name}`);
    if (G.sel && G.sel.dev === id) G.sel = null;
    if (NG.Terminal.devId === id) NG.Terminal.attach(null);
    G.recompute();
    NG.Inspector.render();
  };

  G.deleteLink = function (id) {
    const l = G.link(id);
    if (!l) return;
    if (l.locked) { G.toast("This cable is part of the level and can't be removed."); return; }
    Model.removeLink(G.net, id);
    G.log(`Cable unplugged: ${nameOf(l.a.dev)} ${l.a.port} ↔ ${nameOf(l.b.dev)} ${l.b.port}`);
    if (G.sel && G.sel.link === id) G.sel = null;
    G.recompute();
    NG.Inspector.render();
  };

  // ---------- UI helpers ----------

  G.log = function (msg, cls = '') {
    const el = $('#log-out');
    const div = document.createElement('div');
    div.className = 'log-line ' + cls;
    div.innerHTML = `<span class="ts">${new Date().toTimeString().slice(0, 8)}</span> ${esc(msg)}`;
    el.appendChild(div);
    while (el.children.length > 200) el.firstChild.remove();
    el.scrollTop = el.scrollHeight;
  };

  let toastTimer;
  G.toast = function (msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  };

  G.modal = function (html, buttons, cls) {
    const card = $('#modal .modal-card');
    card.className = 'modal-card ' + (cls || '');
    card.innerHTML = `<div class="modal-body">${html}</div><div class="modal-actions"></div>`;
    const act = $('.modal-actions', card);
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.cls) el.className = b.cls;
      el.onclick = b.onClick;
      act.appendChild(el);
    });
    $('#modal').hidden = false;
  };
  G.closeModal = () => { $('#modal').hidden = true; };

  document.addEventListener('DOMContentLoaded', G.init);
})();

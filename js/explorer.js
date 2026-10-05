// Subnet helper: an interactive view of a /24 block that can be split into halves and merged back.
(function () {
  const IP = NG.IP;
  const { esc, $, $$ } = NG.util;
  const X = NG.Explorer = {};
  const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16'];
  const size = p => Math.pow(2, 32 - p);
  const last = n => n & 255;
  const bin8 = n => (n & 255).toString(2).padStart(8, '0');
  let st = null;

  const norm = s => {
    const ip = IP.parse(s);
    return ip == null ? null : IP.net(ip, IP.maskFromPrefix(24));
  };

  X.open = function (base, back) {
    st = { base: norm(base) || IP.parse('192.168.1.0'), sel: 0, back };
    st.blocks = [{ net: st.base, p: 24 }];
    NG.Game.modal('<div id="sx"></div>', [{
      label: back ? '← Back' : 'Close', cls: 'primary',
      onClick: () => { NG.Game.closeModal(); if (back) back(); },
    }], 'wide');
    render();
  };

  // The other half of the block this one was split from.
  function buddyIndex() {
    const b = st.blocks[st.sel];
    if (b.p <= 24) return -1;
    const buddy = (b.net ^ size(b.p)) >>> 0;
    return st.blocks.findIndex(k => k.net === buddy && k.p === b.p);
  }

  function split() {
    const b = st.blocks[st.sel];
    if (b.p >= 30) return;
    const half = size(b.p + 1);
    st.blocks.splice(st.sel, 1, { net: b.net, p: b.p + 1 }, { net: b.net + half, p: b.p + 1 });
  }

  function merge() {
    const j = buddyIndex();
    if (j < 0) return;
    const i = Math.min(st.sel, j), b = st.blocks[i];
    st.blocks.splice(i, 2, { net: b.net, p: b.p - 1 });
    st.sel = i;
  }

  function splitAll(p) {
    st.blocks = [];
    for (let n = st.base; n < st.base + 256; n += size(p)) st.blocks.push({ net: n, p });
    st.sel = 0;
  }

  function seg(k, i) {
    const w = size(k.p) / 256 * 100;
    const label = w >= 12 ? `.${last(k.net)}/${k.p}` : w >= 6 ? `/${k.p}` : '';
    return `<button class="sx-seg ${i === st.sel ? 'sel' : ''}" data-i="${i}" style="width:${w}%;--c:${COLORS[i % COLORS.length]}"
      title="${IP.str(k.net)}/${k.p}: ${size(k.p) - 2} usable">${label}</button>`;
  }

  function detail(b) {
    const n = b.net, s = size(b.p), bc = n + s - 1, m = IP.maskFromPrefix(b.p), sub = b.p - 24;
    const bits = v => { const t = bin8(v); return `<span class="nb">${t.slice(0, sub)}</span><span class="hb">${t.slice(sub)}</span>`; };
    const row = (label, v, note) => `<tr><td>${label}</td><td><code>.${last(v)}</code></td><td class="bits">${bits(v)}</td><td class="small muted">${note || ''}</td></tr>`;
    return `<div class="sx-detail" style="--c:${COLORS[st.sel % COLORS.length]}">
      <div class="sx-head">
        <span class="sx-swatch"></span><b>${IP.str(n)}/${b.p}</b>
        <span class="muted small">block ${st.sel + 1} of ${st.blocks.length}</span>
        <span class="grow"></span>
        <button id="sx-split" ${b.p >= 30 ? 'disabled' : ''}>Split in half</button>
        <button id="sx-merge" ${buddyIndex() < 0 ? 'disabled' : ''}>Merge with its other half</button>
      </div>
      <div class="sx-grid">
        <table class="kv">
          <tr><th>Network address</th><td><code>${IP.str(n)}</code></td></tr>
          <tr><th>First usable</th><td><code>${IP.str(n + 1)}</code> <small class="muted">often the router</small></td></tr>
          <tr><th>Last usable</th><td><code>${IP.str(bc - 1)}</code></td></tr>
          <tr><th>Broadcast address</th><td><code>${IP.str(bc)}</code></td></tr>
          <tr><th>Size</th><td>${s} addresses, <b>${s - 2} usable</b></td></tr>
          <tr><th>Subnet mask</th><td><code>${IP.str(m)}</code> (/${b.p})</td></tr>
        </table>
        <div>
          <table class="sx-bin">
            <tr><th></th><th>Last number</th><th>In binary</th><th></th></tr>
            ${row('Mask', m, `${b.p - 24} ones then ${32 - b.p} zeros`)}
            ${row('Network', n, 'host bits all 0')}
            ${row('First usable', n + 1)}
            ${row('Last usable', bc - 1)}
            ${row('Broadcast', bc, 'host bits all 1')}
          </table>
          <p class="small"><span class="key nb">■</span> subnet bits (${sub}): the same for every address in this block.
          <span class="key hb">■</span> host bits (${32 - b.p}): number the devices.
          The first three numbers (<code>${IP.str(n).split('.').slice(0, 3).join('.')}</code>) are the same for the whole /24.</p>
        </div>
      </div>
    </div>`;
  }

  function explain(b) {
    const sub = b.p - 24, s = size(b.p), count = Math.pow(2, sub);
    const starts = [];
    for (let v = 0; v < 256 && starts.length < 9; v += s) starts.push('.' + v);
    if (256 / s > 9) starts.push('…');
    if (!sub) {
      return `<div class="sx-explain"><h4>How it works</h4>
        <p>A <b>/24</b> mask (<code>255.255.255.0</code>) means 24 bits identify the network and the last <b>8 bits</b> number the devices:
        2<sup>8</sup> = 256 addresses, 254 usable. Press <b>Split in half</b> to make the prefix one bit longer.</p></div>`;
    }
    return `<div class="sx-explain"><h4>How it works</h4>
      <p>A <b>/${b.p}</b> prefix is ${sub} bit${sub === 1 ? '' : 's'} longer than /24. Those ${sub} bit${sub === 1 ? ' is' : 's are'} <b>borrowed</b> from the host part to number the subnets:</p>
      <ul>
        <li>${sub} subnet bit${sub === 1 ? '' : 's'} → 2<sup>${sub}</sup> = <b>${count}</b> subnets of this size fit in the /24.</li>
        <li>${32 - b.p} host bits left → 2<sup>${32 - b.p}</sup> = <b>${s}</b> addresses each. Minus the network and broadcast addresses, that leaves <b>${s - 2}</b> for devices.</li>
        <li>/${b.p} subnets always start on a multiple of ${s}: ${starts.join(', ')}.</li>
        <li>Each time you split, the prefix grows by 1 and the size halves. Merging does the opposite.</li>
      </ul></div>`;
  }

  // In a tutorial level, show that level's checklist inside the helper.
  function checklist() {
    const G = NG.Game, L = G.level;
    if (!L.tutorial) return '';
    const res = G.prevRes || [];
    return `<ol class="sx-tasks">${L.objectives.map((o, i) =>
      `<li class="${res[i] ? 'done' : ''}"><span class="tick">${res[i] ? '✓' : i + 1}</span><span>${o.text}</span></li>`).join('')}</ol>`;
  }

  function render() {
    const root = $('#sx');
    if (!root) return;
    // Report the current layout so tutorial objectives can check it.
    NG.Game.recordEvent({ type: 'sx', base: st.base, blocks: st.blocks.map(k => ({ net: k.net, p: k.p })), sel: st.sel });
    const b = st.blocks[st.sel];
    const same = st.blocks.every(k => k.p === st.blocks[0].p) ? st.blocks[0].p : '';
    root.innerHTML = `
      <h2>Subnet helper</h2>
      ${checklist()}
      <p class="muted">The bar is one /24 block: 256 addresses from <code>.0</code> to <code>.255</code>. Click a block to inspect it, then split it in half or merge it back.
      You can mix sizes, as you would when planning real networks.</p>
      <div class="sx-controls">
        <label>Block <input id="sx-base" value="${IP.str(st.base)}" spellcheck="false"> /24</label>
        <label>Split evenly into <select id="sx-all">
          <option value="" disabled ${same === '' ? 'selected' : ''}>mixed sizes</option>
          ${[24, 25, 26, 27, 28, 29, 30].map(p => `<option value="${p}" ${same === p ? 'selected' : ''}>/${p}: ${256 / size(p)} × ${size(p)} addresses</option>`).join('')}
        </select></label>
      </div>
      <div class="sx-bar">${st.blocks.map(seg).join('')}</div>
      <div class="sx-scale">${[0, 64, 128, 192].map(v => `<span style="left:${v / 256 * 100}%">.${v}</span>`).join('')}<span style="right:0">.255</span></div>
      ${detail(b)}
      ${explain(b)}`;

    $$('.sx-seg', root).forEach(el => { el.onclick = () => { st.sel = Number(el.dataset.i); render(); }; });
    $('#sx-split', root).onclick = () => { split(); render(); };
    $('#sx-merge', root).onclick = () => { merge(); render(); };
    $('#sx-all', root).onchange = e => { splitAll(Number(e.target.value)); render(); };
    $('#sx-base', root).onchange = e => {
      const n = norm(e.target.value);
      if (n == null) { e.target.value = IP.str(st.base); return; }
      st.base = n; st.blocks = [{ net: n, p: 24 }]; st.sel = 0; render();
    };
  }
})();

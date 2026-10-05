// Right-hand panel: shows and edits the selected device or cable.
(function () {
  const IP = NG.IP, Types = NG.Types, Model = NG.Model;
  const { esc, $, $$ } = NG.util;
  const I = NG.Inspector = {};
  const G = () => NG.Game;
  const name = id => { const d = G().dev(id); return d ? d.name : '?'; };
  let root;

  I.render = function () {
    root = document.getElementById('inspector');
    const sel = G().sel;
    if (sel && sel.link) { const l = G().link(sel.link); if (l) { renderLink(l); return; } }
    const d = sel && sel.dev && G().dev(sel.dev);
    if (!d) { root.innerHTML = empty(); return; }
    ({ host: renderHost, router: renderRouter, switch: renderSimple, internet: renderSimple })[Types[d.type].kind](d);
    I.renderStatus();
  };

  I.renderStatus = function () {
    const el = document.getElementById('insp-status');
    const d = G().sel && G().sel.dev && G().dev(G().sel.dev);
    if (!el || !d) return;
    const kind = Types[d.type].kind;
    el.innerHTML = kind === 'host' ? hostStatus(d) : kind === 'router' ? routerStatus(d) : kind === 'switch' ? switchStatus(d) : internetStatus(d);
  };

  const empty = () => `<h3>Inspector</h3><p class="muted">Click a device or cable on the workspace to see its details here.</p>`;

  function head(d) {
    return `<div class="insp-head">
      <svg class="insp-icon t-${d.type}" viewBox="-38 -30 76 58">${NG.Icons[d.type]()}</svg>
      <div><input class="insp-name" id="f-name" value="${esc(d.name)}" maxlength="20" spellcheck="false" title="Rename">
      <div class="insp-type">${Types[d.type].label}${d.locked ? ' · part of this level' : ''}</div></div>
    </div><div id="insp-status"></div>`;
  }

  const delBtn = d => (d.locked ? '' : '<div class="btn-row"><button class="danger" id="f-del">Remove device</button></div>');

  function bindCommon(d) {
    const nm = $('#f-name', root);
    nm.addEventListener('change', () => {
      const v = nm.value.trim();
      if (v) { d.name = v; NG.Canvas.render(); NG.Terminal.render(); }
      else nm.value = d.name;
    });
    const del = $('#f-del', root);
    if (del) del.onclick = () => G().deleteDevice(d.id);
    $$('[data-run]', root).forEach(b => {
      b.onclick = () => {
        let cmd = b.dataset.run;
        if (cmd === 'ping-gw') {
          const i = G().T.byDev[d.id][0];
          if (i.gw == null) { G().toast(`${d.name} has no default gateway yet.`); return; }
          cmd = 'ping ' + IP.str(i.gw);
        }
        NG.Terminal.exec(cmd, d.id);
      };
    });
  }

  // ---------- Hosts ----------

  function field(label, path, val, ph) {
    return `<label class="fld"><span>${label}</span><input data-path="${path}" value="${esc(val)}" placeholder="${ph}" spellcheck="false"></label>`;
  }

  function renderHost(d) {
    const c = d.config;
    const radio = (v, label) => `<label class="radio"><input type="radio" name="mode" value="${v}" ${c.mode === v ? 'checked' : ''}> ${label}</label>`;
    root.innerHTML = head(d) + `
      <h4>IPv4 settings</h4>
      ${d.lockedConfig ? '<p class="note">These settings are locked in this level.</p>' : ''}
      <div class="radios">
        ${radio('none', 'Not configured')}
        ${radio('dhcp', 'Obtain an IP address automatically (DHCP)')}
        ${radio('static', 'Use the following IP address (static)')}
      </div>
      <div class="fields" id="static-fields">
        ${field('IP address', 'ip', c.ip, 'e.g. 192.168.1.50')}
        ${field('Subnet mask', 'mask', c.mask, 'e.g. 255.255.255.0')}
        ${field('Default gateway', 'gw', c.gw, 'e.g. 192.168.1.1')}
        ${field('DNS server', 'dns', c.dns, 'e.g. 8.8.8.8')}
        <div class="calc" id="calc"></div>
      </div>
      ${c.services ? `<h4>Services</h4><label class="check"><input type="checkbox" id="f-web" ${c.services.web ? 'checked' : ''} ${d.lockedConfig ? 'disabled' : ''}> Web server (HTTP, TCP port 80)</label>` : ''}
      <div class="btn-row"><button class="primary" id="f-save">Apply settings</button></div>
      <h4>Quick tests <small class="muted">(run in the terminal)</small></h4>
      <div class="btn-row wrap">
        <button data-run="ipconfig">ipconfig</button>
        <button data-run="ping-gw">ping gateway</button>
        <button data-run="ping 8.8.8.8">ping 8.8.8.8</button>
        <button data-run="browse www.example.com">browse example.com</button>
      </div>
      ${delBtn(d)}`;
    bindCommon(d);

    const mode = () => ($('input[name=mode]:checked', root) || {}).value || 'none';
    const save = $('#f-save', root);
    const update = () => {
      const m = mode();
      $$('#static-fields input', root).forEach(i => { i.disabled = m !== 'static' || d.lockedConfig; });
      $('#static-fields', root).classList.toggle('off', m !== 'static');
      const info = m === 'static' ? IP.info($('[data-path=ip]', root).value, $('[data-path=mask]', root).value) : null;
      $('#calc', root).innerHTML = info ? `<span class="${info.ok ? '' : 'warn'}">${esc(info.warn || '')} ${esc(info.text)}</span>` : '';
    };
    const dirty = () => { save.textContent = 'Apply settings •'; update(); };
    $$('input[name=mode]', root).forEach(r => { r.disabled = d.lockedConfig; r.addEventListener('change', dirty); });
    $$('#static-fields input', root).forEach(i => i.addEventListener('input', dirty));
    if ($('#f-web', root)) $('#f-web', root).addEventListener('change', dirty);
    save.disabled = d.lockedConfig;
    save.onclick = () => {
      c.mode = mode();
      $$('[data-path]', root).forEach(i => Model.setPath(c, i.dataset.path, i.value.trim()));
      if ($('#f-web', root)) c.services.web = $('#f-web', root).checked;
      G().log(`${d.name}: IPv4 settings applied (${{ none: 'not configured', dhcp: 'DHCP', static: 'static' }[c.mode]})`);
      G().recompute();
      I.render();
    };
    update();
  }

  function hostStatus(d) {
    const T = G().T, i = T.byDev[d.id][0];
    const rows = [];
    const l = Model.linkAt(G().net, d.id, d.ports[0]);
    if (l) { const o = Model.peer(l, d.id); rows.push(['Cable', `<span class="good">● connected</span> to ${esc(name(o.dev))} ${esc(o.port)}`]); }
    else rows.push(['Cable', '<span class="bad">● not connected</span>']);
    let addr;
    if (i.ip == null) addr = '<span class="bad">none</span>';
    else {
      const src = { dhcp: `from DHCP (${esc(i.srv && name(i.srv.dev))})`, apipa: '<span class="warn">self-assigned: no DHCP server answered</span>', static: 'static' }[i.source] || '';
      addr = `<code>${IP.str(i.ip)}</code><br><small>${src}</small>`;
      if (i.conflict) addr += `<br><span class="bad">conflict with ${esc(name(i.conflict.dev))}</span>`;
    }
    rows.push(['IPv4 address', addr]);
    if (i.mask != null) rows.push(['Subnet mask', `<code>${IP.str(i.mask)}</code>`]);
    rows.push(['Default gateway', i.gw != null ? `<code>${IP.str(i.gw)}</code>` : '<span class="muted">none</span>']);
    rows.push(['DNS server', i.dns.length ? i.dns.map(x => `<code>${IP.str(x)}</code>`).join(', ') : '<span class="muted">none</span>']);
    rows.push(['Internet', G().status[d.id] === 'ok' ? '<span class="good">✓ reachable</span>' : '<span class="bad">✗ not reachable</span>']);
    let h = kv(rows);
    if (d.config.mode === 'static' && i.errors.length) h += `<div class="errors">${i.errors.map(e => `<div>⚠ ${esc(e)}</div>`).join('')}</div>`;
    return h;
  }

  const kv = rows => `<table class="kv">${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table>`;

  // ---------- Routers ----------

  function lanForm(f, ic) {
    const p = `ifaces.${f.name}`;
    return `<div class="router-if">
      <h4>Settings: ${esc(f.name)} <small class="muted">(${f.ports.length > 1 ? 'ports ' + f.ports.join(', ') : 'port ' + f.ports[0]})</small></h4>
      <div class="fields">
        ${field('IP address', p + '.ip', ic.ip, 'e.g. 192.168.1.1')}
        ${field('Subnet mask', p + '.mask', ic.mask, 'e.g. 255.255.255.0')}
        <div class="calc" data-calc="${esc(f.name)}"></div>
      </div>
      <label class="check"><input type="checkbox" data-path="${p}.dhcp.enabled" ${ic.dhcp.enabled ? 'checked' : ''}> <b>DHCP server</b> on this network</label>
      <div class="fields" data-dhcp="${esc(f.name)}">
        ${field('Pool start', p + '.dhcp.start', ic.dhcp.start, 'first address to hand out')}
        ${field('Pool end', p + '.dhcp.end', ic.dhcp.end, 'last address to hand out')}
        ${field('DNS server', p + '.dhcp.dns', ic.dhcp.dns, 'e.g. 1.1.1.1')}
        <p class="small muted">Clients are also given this interface’s IP address as their <b>default gateway</b>.</p>
      </div>
    </div>`;
  }

  function renderRouter(d) {
    const def = Types[d.type], lock = d.lockedConfig;
    const lans = def.ifaces.filter(f => f.role === 'lan');
    const pf = !lock && G().level.features && G().level.features.portForward;
    root.innerHTML = head(d) + `
      ${lock ? '<p class="note">This router is managed by your Internet provider. You can look, but not change its settings.</p>'
        : lans.map(f => lanForm(f, d.config.ifaces[f.name])).join('') + '<div class="btn-row"><button class="primary" id="f-save">Save router settings</button></div>'}
      ${pf ? portForwardHtml(d) : ''}
      <h4>Quick tests</h4>
      <div class="btn-row wrap"><button data-run="ipconfig">show interfaces</button><button data-run="ping 8.8.8.8">ping 8.8.8.8</button></div>
      ${delBtn(d)}`;
    bindCommon(d);
    if (lock) return;
    if (pf) bindPortForward(d);

    const save = $('#f-save', root);
    const update = () => {
      lans.forEach(f => {
        const val = k => $(`[data-path="ifaces.${f.name}.${k}"]`, root);
        const info = IP.info(val('ip').value, val('mask').value);
        const calc = $$('[data-calc]', root).find(e => e.dataset.calc === f.name);
        calc.innerHTML = info ? `<span class="${info.ok ? '' : 'warn'}">${esc(info.warn || '')} ${esc(info.text)}</span>` : '';
        const on = val('dhcp.enabled').checked;
        const box = $$('[data-dhcp]', root).find(e => e.dataset.dhcp === f.name);
        box.classList.toggle('off', !on);
        $$('input', box).forEach(i => { i.disabled = !on; });
      });
    };
    $$('[data-path]', root).forEach(i => i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => { save.textContent = 'Save router settings •'; update(); }));
    save.onclick = () => {
      $$('[data-path]', root).forEach(i => Model.setPath(d.config, i.dataset.path, i.type === 'checkbox' ? i.checked : i.value.trim()));
      G().log(`${d.name}: router settings saved`);
      G().recompute();
      I.render();
    };
    update();
  }

  function portForwardHtml(d) {
    const rules = d.config.portForwards;
    return `<div class="router-if"><h4>Port forwarding</h4>
      <p class="small muted">Lets connections from the Internet reach a device inside. Traffic arriving at the WAN address on this port is sent to the inside address.</p>
      ${rules.length ? `<table class="tbl"><tr><th>Protocol</th><th>Outside port</th><th>Inside address</th><th>Port</th><th></th></tr>
        ${rules.map((r, k) => `<tr><td>${esc(r.proto.toUpperCase())}</td><td>${esc(r.port)}</td><td><code>${esc(r.ip)}</code></td><td>${esc(r.toPort || r.port)}</td>
          <td><button class="danger small-btn" data-pf-del="${k}">✕</button></td></tr>`).join('')}</table>`
        : '<p class="small muted">No rules yet.</p>'}
      <div class="pf-add">
        <select id="pf-proto"><option value="tcp">TCP</option><option value="udp">UDP</option></select>
        <input id="pf-port" placeholder="port" size="5" spellcheck="false">
        <span>→</span>
        <input id="pf-ip" placeholder="inside IP" spellcheck="false">
        <input id="pf-to" placeholder="port" size="5" spellcheck="false">
        <button id="pf-add">Add</button>
      </div>
      <div class="errors" id="pf-err"></div></div>`;
  }

  function bindPortForward(d) {
    const rules = d.config.portForwards;
    $$('[data-pf-del]', root).forEach(b => {
      b.onclick = () => {
        const r = rules.splice(Number(b.dataset.pfDel), 1)[0];
        G().log(`${d.name}: removed port forward ${r.proto.toUpperCase()} ${r.port} → ${r.ip}`);
        G().recompute();
        I.render();
      };
    });
    $('#pf-add', root).onclick = () => {
      const port = $('#pf-port', root).value.trim(), ip = $('#pf-ip', root).value.trim(), to = $('#pf-to', root).value.trim() || port;
      const okPort = v => /^\d+$/.test(v) && +v >= 1 && +v <= 65535;
      const err = !okPort(port) ? 'Enter an outside port from 1 to 65535 (web servers use 80).'
        : IP.parse(ip) == null ? 'Enter the inside device’s IP address.'
          : !okPort(to) ? 'Enter an inside port from 1 to 65535.' : '';
      if (err) { $('#pf-err', root).textContent = '⚠ ' + err; return; }
      const proto = $('#pf-proto', root).value;
      rules.push({ proto, port, ip, toPort: to });
      G().log(`${d.name}: port forward ${proto.toUpperCase()} ${port} → ${ip}:${to}`);
      G().recompute();
      I.render();
    };
  }

  function routerStatus(d) {
    const T = G().T, ifs = T.byDev[d.id], def = Types[d.type];
    let h = `<table class="tbl"><tr><th>Interface</th><th>Ports</th><th>Link</th><th>Address</th></tr>`;
    ifs.forEach(i => {
      const fd = def.ifaces.find(f => f.name === i.name);
      h += `<tr><td><b>${esc(i.name)}</b></td><td><small>${fd.ports.join(', ')}</small></td>
        <td>${i.up ? '<span class="good">up</span>' : '<span class="muted">down</span>'}</td>
        <td>${i.ip != null ? `<code>${IP.str(i.ip)}/${IP.prefix(i.mask)}</code>${i.source === 'dhcp' ? ' <small>via DHCP</small>' : ''}` : '<span class="muted">—</span>'}</td></tr>`;
    });
    h += '</table>';
    ifs.forEach(i => {
      const s = i.dhcpServer;
      if (i.role === 'lan' && !s) { h += `<div class="box"><b>DHCP server on ${esc(i.name)}:</b> <span class="warn">off</span></div>`; return; }
      if (!s || s.isp) return;
      if (!s.valid) { h += `<div class="errors">⚠ DHCP server on ${esc(i.name)} is not running: ${esc(s.reason)}.</div>`; return; }
      const leases = T.ifaces.filter(c => c.srv === i && c.source === 'dhcp');
      h += `<div class="box"><b>DHCP server on ${esc(i.name)}</b>
        ${kv([['Pool', `<code>${IP.str(s.start)}</code> – <code>${IP.str(s.end)}</code>`], ['Gateway given', `<code>${IP.str(s.gw)}</code>`], ['DNS given', s.dns.map(x => `<code>${IP.str(x)}</code>`).join(', ') || '—']])}
        <div class="leases"><b>Leases</b>${leases.length ? leases.map(c => `<div>${esc(name(c.dev))} → <code>${IP.str(c.ip)}</code></div>`).join('') : '<div class="muted">none yet</div>'}</div></div>`;
    });
    const c = G().net.devices.find(x => x.id === d.id).config;
    if (c.nat) h += '<p class="small muted">NAT is on: traffic from LAN devices goes out to the Internet using the WAN address.</p>';
    return h;
  }

  // ---------- Switch / Internet / cables ----------

  function renderSimple(d) {
    const visit = d.type === 'internet' && G().level.features && G().level.features.portForward;
    root.innerHTML = head(d) + (visit ? `<h4>Test from outside</h4>
      <p class="small">Pretend to be a customer at home (<code>${IP.str(NG.Sim.REMOTE)}</code>) visiting your router’s public address.</p>
      <div class="btn-row"><button class="primary" id="f-visit">Visit from the Internet</button></div>` : '') + delBtn(d);
    bindCommon(d);
    if (visit) $('#f-visit', root).onclick = () => G().externalVisit();
  }

  function switchStatus(d) {
    const rows = d.ports.map(p => {
      const l = Model.linkAt(G().net, d.id, p);
      if (!l) return [p, '<span class="muted">empty</span>'];
      const o = Model.peer(l, d.id);
      return [p, `${esc(name(o.dev))} <small>${esc(o.port)}</small>`];
    });
    return '<p class="small">A switch joins devices into one local network. It needs no IP address.</p>' + kv(rows);
  }

  function internetStatus() {
    const S = NG.Sim;
    return `<p class="small">Your Internet provider (ISP). It gives your router a public address by DHCP and passes traffic on to the rest of the Internet.</p>
      ${kv([['ISP gateway', `<code>${IP.str(S.ISP.ip)}</code>`]])}
      <div class="box"><b>Servers you can reach</b>
      ${Object.keys(S.VIRTUAL).map(ip => `<div><code>${IP.str(+ip)}</code> ${esc(S.VIRTUAL[ip].name)} <small class="muted">${esc(S.VIRTUAL[ip].role)}</small></div>`).join('')}</div>`;
  }

  function renderLink(l) {
    root.innerHTML = `<h3>Ethernet cable</h3>
      ${kv([['End A', `${esc(name(l.a.dev))} <code>${esc(l.a.port)}</code>`], ['End B', `${esc(name(l.b.dev))} <code>${esc(l.b.port)}</code>`]])}
      ${l.locked ? '<p class="note">This cable is part of the level.</p>' : '<div class="btn-row"><button class="danger" id="f-unplug">Unplug cable</button></div>'}`;
    const b = $('#f-unplug', root);
    if (b) b.onclick = () => G().deleteLink(l.id);
  }
})();

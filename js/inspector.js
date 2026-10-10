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
    if (d.type === 'mswitch') renderMSwitch(d);
    else if (d.type === 'vmhost') renderVmHost(d);
    else ({ host: renderHost, router: renderRouter, switch: renderSimple, internet: renderSimple })[Types[d.type].kind](d);
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
      ${d.type === 'vm' ? vmAdapterHtml(d) : ''}
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
      ${c.services ? `<h4>Services</h4>${NG.Sim.SERVICES.map(s => `<label class="check"><input type="checkbox" data-svc="${s.key}"
        ${c.services[s.key] ? 'checked' : ''} ${d.lockedConfig ? 'disabled' : ''}> ${s.long} <small class="muted">${s.proto.toUpperCase()} port ${s.port}</small></label>`).join('')}
        <div class="fields">${field('Allow SSH from', 'sshAllow', c.sshAllow || '', 'anyone (or e.g. 10.1.99.10)')}</div>
        ${c.sshAllow && !NG.Sim.parseRange(c.sshAllow) ? '<div class="errors">⚠ “Allow SSH from” isn’t a valid address or network, so nobody can log in.</div>' : ''}` : ''}
      <div class="btn-row"><button class="primary" id="f-save">Apply settings</button></div>
      ${c.services && c.services.dns ? dnsRecordsHtml(d) : ''}
      <h4>Quick tests <small class="muted">(run in the terminal)</small></h4>
      <div class="btn-row wrap">
        <button data-run="ipconfig">ipconfig</button>
        <button data-run="ping-gw">ping gateway</button>
        <button data-run="ping 8.8.8.8">ping 8.8.8.8</button>
        <button data-run="browse www.example.com">browse example.com</button>
        ${c.services ? '<button data-run="netstat">netstat</button>' : ''}
      </div>
      ${delBtn(d)}`;
    bindCommon(d);
    if (c.services && c.services.dns) bindDnsRecords(d);
    if (d.type === 'vm') bindVmAdapter(d);

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
    $$('[data-svc]', root).forEach(i => i.addEventListener('change', dirty));
    $$('[data-path=sshAllow]', root).forEach(i => { i.disabled = d.lockedConfig; i.addEventListener('input', dirty); });
    save.disabled = d.lockedConfig;
    save.onclick = () => {
      c.mode = mode();
      $$('[data-path]', root).forEach(i => Model.setPath(c, i.dataset.path, i.value.trim()));
      $$('[data-svc]', root).forEach(i => { c.services[i.dataset.svc] = i.checked; });
      G().log(`${d.name}: IPv4 settings applied (${{ none: 'not configured', dhcp: 'DHCP', static: 'static' }[c.mode]})`);
      G().recompute();
      I.render();
    };
    update();
  }

  function dnsRecordsHtml(d) {
    const recs = d.config.dnsRecords, lock = d.lockedConfig;
    return `<div class="router-if"><h4>DNS records</h4>
      <p class="small muted">Names this DNS server answers for itself. Questions about any other name are passed on to its own DNS server.</p>
      ${recs.length ? `<table class="tbl"><tr><th>Name</th><th>Address</th><th></th></tr>
        ${recs.map((r, k) => `<tr><td><code>${esc(r.name)}</code></td><td><code>${esc(r.ip)}</code></td>
          <td>${lock ? '' : `<button class="danger small-btn" data-dns-del="${k}">✕</button>`}</td></tr>`).join('')}</table>`
        : '<p class="small muted">No records yet.</p>'}
      ${lock ? '' : `<div class="pf-add">
        <input id="dns-name" placeholder="name, e.g. files.office" spellcheck="false">
        <span>→</span>
        <input id="dns-ip" placeholder="IP address" spellcheck="false">
        <button id="dns-add">Add</button>
      </div>
      <div class="errors" id="dns-err"></div>`}</div>`;
  }

  function bindDnsRecords(d) {
    if (d.lockedConfig) return;
    const recs = d.config.dnsRecords;
    $$('[data-dns-del]', root).forEach(b => {
      b.onclick = () => {
        const r = recs.splice(Number(b.dataset.dnsDel), 1)[0];
        G().log(`${d.name}: removed DNS record ${r.name}`);
        G().recompute();
        I.render();
      };
    });
    $('#dns-add', root).onclick = () => {
      const nm = $('#dns-name', root).value.trim().toLowerCase().replace(/^[\\/]+/, '').replace(/\.$/, ''), ip = $('#dns-ip', root).value.trim();
      const err = !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(nm) ? 'Enter a name with at least one dot, such as files.office.'
        : IP.parse(ip) == null ? 'Enter the IP address the name should point to.'
          : recs.some(r => r.name === nm) ? `There is already a record for ${nm}. Remove it first to change it.` : '';
      if (err) { $('#dns-err', root).textContent = '⚠ ' + err; return; }
      recs.push({ name: nm, ip });
      G().log(`${d.name}: DNS record ${nm} → ${ip}`);
      G().recompute();
      I.render();
    };
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
    if (d.config.services) {
      const on = NG.Sim.listening(d);
      rows.push(['Listening on', on.length ? on.map(s => `${esc(s.label)} <small class="muted">${s.proto.toUpperCase()} ${s.port}</small>`).join('<br>') : '<span class="muted">no services</span>']);
    }
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
    const feat = G().level.features || {};
    const pf = !lock && feat.portForward, acl = !lock && feat.acl && d.config.acl;
    root.innerHTML = head(d) + `
      ${acl ? aclHtml(d) : ''}
      ${lock ? '<p class="note">This router is managed by your Internet provider. You can look, but not change its settings.</p>'
        : lans.map(f => lanForm(f, d.config.ifaces[f.name])).join('') + '<div class="btn-row"><button class="primary" id="f-save">Save router settings</button></div>'}
      ${pf ? portForwardHtml(d) : ''}
      <h4>Quick tests</h4>
      <div class="btn-row wrap"><button data-run="ipconfig">show interfaces</button><button data-run="ping 8.8.8.8">ping 8.8.8.8</button></div>
      ${delBtn(d)}`;
    bindCommon(d);
    if (lock) return;
    if (pf) bindPortForward(d);
    if (acl) bindAcl(d);

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

  function aclHtml(d) {
    const rules = d.config.acl;
    const catchAll = r => r.action === 'permit' && r.proto === 'any' && NG.Sim.parseRange(r.src).any && NG.Sim.parseRange(r.dst).any;
    const what = r => r.proto === 'any' ? 'any protocol' : r.proto === 'icmp' ? 'ICMP (ping)'
      : `${r.proto.toUpperCase()} ${r.port ? 'port ' + esc(r.port) : 'any port'}`;
    return `<div class="router-if acl"><h4>Access rules <small class="muted">(firewall)</small></h4>
      <p class="small muted">Checked, top to bottom, for every new connection that passes through the router. The <b>first</b> rule that matches decides.
      If there are any rules, anything that matches none of them is <b>denied</b>. Replies to allowed connections always get back.</p>
      ${rules.length ? `<ol class="acl-list">
        ${rules.map((r, k) => `<li><span class="acl-n">${k + 1}</span>
          <span class="acl-rule"><span class="acl-${r.action}">${r.action}</span> <code>${esc(r.src)}</code> → <code>${esc(r.dst)}</code>
            <small class="muted">${what(r)}</small></span>
          <span class="acl-btns"><button class="small-btn" data-acl-up="${k}" ${k ? '' : 'disabled'} title="Move up">▲</button><button class="small-btn" data-acl-down="${k}" ${k < rules.length - 1 ? '' : 'disabled'} title="Move down">▼</button><button class="danger small-btn" data-acl-del="${k}" title="Remove">✕</button></span></li>`).join('')}
        <li class="acl-implicit"><span class="acl-n">∗</span><span class="acl-rule"><span class="acl-deny">deny</span> everything else
          <small>Built in, not one of your rules. It is always there once the list has any rules, and can’t be removed.</small></span></li></ol>
        ${catchAll(rules[rules.length - 1]) ? '' : `<div class="note acl-warn">⚠ Anything not permitted above is blocked, <b>including DNS lookups and the Internet</b>.
          If everything else should keep working, end the list with <b>permit</b> <code>any</code> → <code>any</code>.</div>`}`
        : '<p class="small muted">No rules: the router forwards everything.</p>'}
      <div class="acl-add">
        <select id="acl-action" title="Action"><option value="permit">permit</option><option value="deny">deny</option></select>
        <select id="acl-proto" title="Protocol"><option value="any">any protocol</option><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP (ping)</option></select>
        <input id="acl-port" placeholder="port" spellcheck="false" title="Port (empty = any)">
        <input id="acl-src" class="wide" placeholder="source: any, 10.1.20.0/24 or one address" spellcheck="false">
        <input id="acl-dst" class="wide" placeholder="destination: any, 10.1.99.30 or a network" spellcheck="false">
        <button id="acl-add" class="wide">Add rule</button>
      </div>
      <div class="errors" id="acl-err"></div></div>`;
  }

  function bindAcl(d) {
    const rules = d.config.acl, S = NG.Sim;
    const changed = msg => { G().log(`${d.name}: ${msg}`); G().recompute(); I.render(); };
    const move = (k, by) => { const [r] = rules.splice(k, 1); rules.splice(k + by, 0, r); changed(`moved rule “${S.ruleText(r)}” to position ${k + by + 1}`); };
    $$('[data-acl-up]', root).forEach(b => { b.onclick = () => move(Number(b.dataset.aclUp), -1); });
    $$('[data-acl-down]', root).forEach(b => { b.onclick = () => move(Number(b.dataset.aclDown), 1); });
    $$('[data-acl-del]', root).forEach(b => {
      b.onclick = () => { const [r] = rules.splice(Number(b.dataset.aclDel), 1); changed(`removed access rule “${S.ruleText(r)}”`); };
    });
    const protoSel = $('#acl-proto', root), portIn = $('#acl-port', root);
    let warned = null; // the rule last warned about, so pressing Add again adds it
    $('#acl-add', root).onclick = () => {
      const norm = v => { v = v.trim().toLowerCase(); return v === '' ? 'any' : v; };
      const src = norm($('#acl-src', root).value), dst = norm($('#acl-dst', root).value), proto = protoSel.value, port = portIn.value.trim();
      const bad = v => { const r = S.parseRange(v); return !r ? `“${v}” isn’t valid. Use any, an address (10.1.99.30) or a network (10.1.20.0/24).`
        : r.aligned === false ? `“${v}” isn’t the start of a network. Did you mean ${IP.str(r.net)}/${IP.prefix(r.mask)}?`
          // A bare x.x.x.0 is almost always a network written without its prefix, which would match only that one address.
          : !v.includes('/') && v !== 'any' && (r.net & 255) === 0 ? `“${v}” on its own means just that one address. For the whole network, add the prefix, e.g. ${v}/24.` : ''; };
      const err = bad(src) || bad(dst)
        || (port && !(/^\d+$/.test(port) && +port >= 1 && +port <= 65535) ? 'Enter a port from 1 to 65535, or leave it empty for any port.' : '')
        || (port && proto !== 'tcp' && proto !== 'udp' ? `Ports belong to TCP or UDP. Choose one in the protocol box (file sharing on ${port === '445' ? '445 is TCP' : 'a port is usually TCP'}), or clear the port.` : '');
      if (err) { $('#acl-err', root).textContent = '⚠ ' + err; return; }
      const r = { action: $('#acl-action', root).value, src, dst, proto, port };
      // A well-known port with the other protocol (e.g. TCP 53) is almost always a slip: warn once, add on a second press.
      const w = port && S.wellKnown(port), key = JSON.stringify(r);
      if (w && w.proto !== proto && warned !== key) {
        warned = key;
        $('#acl-err', root).textContent = `⚠ Port ${port} is ${w.name}, which uses ${w.proto.toUpperCase()}, not ${proto.toUpperCase()}. `
          + 'Change the protocol, or press Add rule again to add it anyway.';
        return;
      }
      rules.push(r);
      changed(`added access rule ${rules.length}: “${S.ruleText(r)}”`);
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
    if (d.type === 'mswitch') return '<p class="small">A managed switch: ports in the same VLAN form one local network. Ports in different VLANs are as separate as two switches. A <b>trunk</b> carries several VLANs over one cable, each frame tagged with its VLAN number.</p>';
    const rows = d.ports.map(p => {
      const l = Model.linkAt(G().net, d.id, p);
      if (!l) return [p, '<span class="muted">empty</span>'];
      const o = Model.peer(l, d.id);
      return [p, `${esc(name(o.dev))} <small>${esc(o.port)}</small>`];
    });
    return '<p class="small">A switch joins devices into one local network. It needs no IP address.</p>' + kv(rows);
  }

  // ---------- Virtual machines ----------

  const VM_MODES = [
    { key: 'br', label: 'Bridged', text: 'joins the laptop’s own network, like another computer on the switch' },
    { key: 'nat', label: 'NAT', text: 'hidden behind the laptop, which shares its address (like a home router)' },
    { key: 'ho', label: 'Host-only', text: 'a private network with just the laptop and its VMs: no Internet' },
  ];
  const vmLink = d => G().net.links.find(l => l.a.dev === d.id || l.b.dev === d.id);
  const vmMode = d => {
    const l = vmLink(d), o = l && Model.peer(l, d.id);
    return o && (VM_MODES.find(m => o.port.startsWith(m.key)) || {}).key;
  };

  function vmAdapterHtml(d) {
    const cur = vmMode(d);
    return `<h4>Network adapter <small class="muted">(a hypervisor setting)</small></h4>
      <div class="radios">${VM_MODES.map(m => `<label class="radio"><input type="radio" name="vm-mode" value="${m.key}" ${cur === m.key ? 'checked' : ''} ${d.lockedConfig ? 'disabled' : ''}>
        <b>${m.label}</b>: <small>${m.text}</small></label>`).join('')}</div>`;
  }

  // Re-plug the VM's virtual cable into a free port of the chosen network on its host.
  function bindVmAdapter(d) {
    $$('input[name=vm-mode]', root).forEach(r => r.addEventListener('change', () => {
      const l = vmLink(d);
      if (!l) return;
      const end = l.a.dev === d.id ? l.b : l.a, host = G().dev(end.dev);
      const port = host.ports.find(p => p.startsWith(r.value) && !Model.linkAt(G().net, host.id, p));
      if (!port) { G().toast(`${host.name} has no free ${r.value} port.`); I.render(); return; }
      end.port = port;
      G().log(`${d.name}: network adapter set to ${VM_MODES.find(m => m.key === r.value).label}`);
      G().recompute();
      I.render();
    }));
  }

  function renderVmHost(d) {
    const feat = G().level.features || {};
    root.innerHTML = head(d) + `
      <div class="box small"><b>Inside this laptop</b> its hypervisor runs three virtual networks:
        <table class="kv">
          <tr><th>Bridged</th><td>VMs share the laptop’s network port and join its network directly.</td></tr>
          <tr><th>NAT</th><td><code>10.0.2.0/24</code>. VMs reach out through the laptop’s address. Nothing outside can reach them.</td></tr>
          <tr><th>Host-only</th><td><code>192.168.56.0/24</code>. Only the laptop and its VMs. Never routed anywhere.</td></tr>
        </table>
        Choose each VM’s network in the VM’s own settings.</div>
      ${feat.portForward ? portForwardHtml(d) : ''}
      <h4>Quick tests</h4>
      <div class="btn-row wrap"><button data-run="ipconfig">show interfaces</button><button data-run="ping 8.8.8.8">ping 8.8.8.8</button></div>`;
    bindCommon(d);
    if (feat.portForward) bindPortForward(d);
  }

  function renderMSwitch(d) {
    const lock = d.lockedConfig, cfg = d.config.ports;
    const row = p => {
      const c = cfg[p] || {}, trunk = c.mode === 'trunk';
      const l = Model.linkAt(G().net, d.id, p), o = l && Model.peer(l, d.id);
      return `<tr data-port="${esc(p)}"><td><b>${esc(p)}</b></td>
        <td>${o ? `${esc(name(o.dev))} <small class="muted">${esc(o.port)}</small>` : '<span class="muted">empty</span>'}</td>
        <td><select data-f="mode" ${lock ? 'disabled' : ''}><option value="access">access</option><option value="trunk" ${trunk ? 'selected' : ''}>trunk</option></select></td>
        <td><input data-f="vlan" value="${esc(trunk ? (c.allowed == null ? 'all' : c.allowed) : (c.vlan || 1))}" size="7" spellcheck="false" ${lock ? 'disabled' : ''}
          title="${trunk ? 'VLANs this trunk carries, e.g. 10,20 (or all)' : 'VLAN number for this port (1–4094)'}"></td></tr>`;
    };
    root.innerHTML = head(d) + `
      <h4>Ports</h4>
      <table class="tbl vlan-tbl"><tr><th>Port</th><th>Connected to</th><th>Mode</th><th>VLAN(s)</th></tr>${d.ports.map(row).join('')}</table>
      <p class="small muted"><b>access</b>: the port belongs to one VLAN. <b>trunk</b>: the port carries the listed VLANs (e.g. <code>10,20</code>), tagged, to another switch.</p>
      ${lock ? '' : '<div class="btn-row"><button class="primary" id="f-save">Save switch settings</button></div><div class="errors" id="vlan-err"></div>'}
      ${delBtn(d)}`;
    bindCommon(d);
    if (lock) return;
    const save = $('#f-save', root);
    $$('.vlan-tbl select', root).forEach(s => s.addEventListener('change', () => {
      const inp = $('[data-f=vlan]', s.closest('tr'));
      inp.value = s.value === 'trunk' ? 'all' : '1';
      save.textContent = 'Save switch settings •';
    }));
    $$('.vlan-tbl input', root).forEach(i => i.addEventListener('input', () => { save.textContent = 'Save switch settings •'; }));
    save.onclick = () => {
      const next = {};
      for (const tr of $$('.vlan-tbl tr[data-port]', root)) {
        const p = tr.dataset.port, mode = $('[data-f=mode]', tr).value, v = $('[data-f=vlan]', tr).value.trim();
        if (mode === 'trunk') {
          if (NG.Sim.parseVlans(v) === undefined) { $('#vlan-err', root).textContent = `⚠ ${p}: list the VLANs as numbers, e.g. 10,20 (or all).`; return; }
          next[p] = { mode, allowed: v.toLowerCase() === 'all' || !v ? null : v };
        } else {
          if (!/^\d+$/.test(v) || +v < 1 || +v > 4094) { $('#vlan-err', root).textContent = `⚠ ${p}: a VLAN number is from 1 to 4094.`; return; }
          next[p] = { mode, vlan: Number(v) };
        }
      }
      d.config.ports = next;
      G().log(`${d.name}: switch port settings saved`);
      G().recompute();
      I.render();
    };
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

// The command-line terminal for the selected computer or router.
(function () {
  const IP = NG.IP, Sim = NG.Sim, Types = NG.Types;
  const { esc, sleep, $ } = NG.util;
  const Tm = NG.Terminal = { devId: null, hist: {}, busy: false };
  const G = () => NG.Game;
  const C = () => NG.Canvas;
  let out, input, promptEl, titleEl;
  const cmdHist = [];
  let cmdPos = 0;

  Tm.init = function () {
    out = $('#term-out'); input = $('#term-input'); promptEl = $('#term-prompt'); titleEl = $('#term-title');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; Tm.exec(v); }
      else if (e.key === 'ArrowUp') { if (cmdPos > 0) input.value = cmdHist[--cmdPos]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (cmdPos < cmdHist.length) input.value = cmdHist[++cmdPos] || ''; e.preventDefault(); }
    });
    out.addEventListener('click', () => { if (!window.getSelection().toString() && !input.disabled) input.focus(); });
    Tm.render();
  };

  Tm.reset = function () { Tm.hist = {}; Tm.devId = null; Tm.busy = false; Tm.render(); };

  Tm.attach = function (id) {
    if (id && !Tm.hist[id]) {
      Tm.hist[id] = [];
      printer(id)(`${G().dev(id).name}: type "help" for a list of commands.`, 'muted');
    }
    Tm.devId = id;
    Tm.render();
  };

  const lineHtml = l => `<div class="tl ${l.cls || ''}">${esc(l.text) || '&nbsp;'}</div>`;

  Tm.render = function () {
    const d = Tm.devId && G().dev(Tm.devId);
    if (!d) {
      Tm.devId = null;
      out.innerHTML = '<div class="tl muted">Click a computer or router to open its terminal.</div>';
      promptEl.textContent = '>';
      titleEl.textContent = 'Terminal';
      input.disabled = true;
      return;
    }
    titleEl.textContent = 'Terminal: ' + d.name;
    promptEl.textContent = d.name + '>';
    input.disabled = Tm.busy;
    out.innerHTML = Tm.hist[d.id].map(lineHtml).join('');
    out.scrollTop = out.scrollHeight;
  };

  // Output for a device keeps going to that device even if the user selects another one mid-command.
  function printer(id) {
    return (text, cls) => {
      const h = (Tm.hist[id] = Tm.hist[id] || []);
      h.push({ text, cls });
      if (h.length > 500) h.shift();
      if (Tm.devId === id) { out.insertAdjacentHTML('beforeend', lineHtml({ text, cls })); out.scrollTop = out.scrollHeight; }
    };
  }
  const why = (p, msg) => { if (msg) p('Why? ' + msg, 'why'); };

  Tm.exec = async function (line, id = Tm.devId) {
    if (!id || Tm.busy) return;
    const d = G().dev(id);
    if (!d) return;
    if (Tm.devId !== id) Tm.attach(id);
    const p = printer(id);
    p(`${d.name}> ${line}`, 'cmd');
    line = line.trim();
    if (!line) return;
    cmdHist.push(line);
    cmdPos = cmdHist.length;
    const parts = line.split(/\s+/);
    Tm.busy = true;
    input.disabled = true;
    try { await dispatch(parts[0].toLowerCase(), parts.slice(1), d, p); }
    catch (e) { console.error(e); p('Internal error: ' + e.message, 'err'); }
    Tm.busy = false;
    if (Tm.devId) { input.disabled = false; input.focus(); }
  };

  async function dispatch(cmd, args, d, p) {
    const kind = Types[d.type].kind;
    switch (cmd) {
      case 'help': case '?': return help(p);
      case 'clear': case 'cls': Tm.hist[d.id] = []; Tm.render(); return;
      case 'ipconfig': case 'ifconfig': return kind === 'router' ? showInterfaces(d, p) : ipconfig(d, args, p);
      case 'ping': return ping(d, args, p);
      case 'nslookup': return nslookup(d, args, p);
      case 'browse': case 'curl': return browse(d, args, p);
      case 'open': case 'dir': return /^[\\/]/.test(args[0] || '') || cmd === 'dir' ? openShare(d, args, p) : browse(d, args, p);
      case 'test': return testPort(d, args, p);
      case 'netstat': return netstat(d, p);
      default: p(`'${cmd}' is not a recognised command. Type help for a list of commands.`, 'err');
    }
  }

  function help(p) {
    p('Commands:');
    p('  ipconfig            show this computer\'s IP settings');
    p('  ipconfig /all       ...with more detail');
    p('  ipconfig /renew     ask the DHCP server for an address again');
    p('  ping <ip or name>   check whether another device answers (e.g. ping 8.8.8.8)');
    p('  nslookup <name>     ask the DNS server for a name\'s IP address');
    p('  browse <address>    open a web page (e.g. browse www.example.com)');
    p('  open \\\\<server>     open a shared folder on a file server (e.g. open \\\\files.office)');
    p('  test <host> <port>  check whether a port is open (e.g. test files.office 445)');
    p('  netstat             list the ports this device is listening on');
    p('  clear               clear the screen');
  }

  const mac = id => { let h = 7; for (const ch of id) h = (h * 131 + ch.charCodeAt(0)) >>> 0; return '00-1A-2B-' + [h & 255, (h >>> 8) & 255, (h >>> 16) & 255].map(x => x.toString(16).toUpperCase().padStart(2, '0')).join('-'); };
  const reverse = path => path.slice().reverse().map(e => ({ from: e.to, to: e.from }));

  async function ipconfig(d, args, p) {
    const T = G().T, i = T.byDev[d.id][0];
    const all = args.some(a => /^[/-]all$/i.test(a));
    const renew = args.some(a => /^[/-]renew$/i.test(a));
    if (renew) {
      if (d.config.mode !== 'dhcp') { p('The operation failed: this adapter is not set to obtain an IP address automatically (DHCP).', 'err'); return; }
      if (!i.up) { p('No operation can be performed on Ethernet while it has its media disconnected.', 'err'); return; }
      if (i.source === 'dhcp') {
        const path = Sim.l2path(T, i, i.srv), back = reverse(path);
        await C().animate(path, { cls: 'dhcp', label: 'Discover' });
        await C().animate(back, { cls: 'dhcp', label: 'Offer' });
        await C().animate(path, { cls: 'dhcp', label: 'Request' });
        await C().animate(back, { cls: 'dhcp', label: 'Ack' });
      } else {
        C().flash(d.id, 'bad');
        p('An error occurred while renewing interface Ethernet: unable to contact your DHCP server. Request has timed out.', 'err');
        why(p, i.poolFull ? 'The DHCP server has run out of addresses to give.' : 'No DHCP server answered on this network.');
      }
    }
    p('');
    p('Windows IP Configuration');
    p('');
    if (all) { p(`   Host Name . . . . . . . . . . . . : ${d.name}`); p(''); }
    p('Ethernet adapter Ethernet:');
    p('');
    if (!i.up) {
      p('   Media State . . . . . . . . . . . : Media disconnected', 'warn');
      why(p, 'No network cable is plugged into this computer.');
    } else {
      if (all) {
        p(`   Physical Address. . . . . . . . . : ${mac(d.id)}`);
        p(`   DHCP Enabled. . . . . . . . . . . : ${d.config.mode === 'dhcp' ? 'Yes' : 'No'}`);
      }
      if (i.ip == null) {
        p('   (no IPv4 address)', 'warn');
        why(p, d.config.mode === 'none' ? 'IPv4 is not configured. Choose DHCP or static in the settings panel.' : 'The static settings are incomplete or invalid.');
      } else {
        const label = i.source === 'apipa' ? 'Autoconfiguration IPv4 Address. . ' : 'IPv4 Address. . . . . . . . . . . ';
        p(`   ${label}: ${IP.str(i.ip)}${i.conflict ? ' (Duplicate)' : ' (Preferred)'}`, i.source === 'apipa' || i.conflict ? 'warn' : 'ok');
        p(`   Subnet Mask . . . . . . . . . . . : ${IP.str(i.mask)}`);
        p(`   Default Gateway . . . . . . . . . : ${i.gw != null ? IP.str(i.gw) : ''}`);
        if (all && i.source === 'dhcp') p(`   DHCP Server . . . . . . . . . . . : ${IP.str(i.srv.ip)}`);
        p(`   DNS Servers . . . . . . . . . . . : ${i.dns.map(IP.str).join(', ')}`);
        if (i.source === 'apipa') why(p, 'A 169.254.x.x address means the computer asked for an address by DHCP, but no DHCP server answered.');
        if (i.conflict) why(p, `${G().dev(i.conflict.dev).name} is already using ${IP.str(i.ip)}.`);
      }
    }
    G().recordEvent({ type: 'ipconfig', dev: d.id, source: i.source, ip: i.ip });
  }

  function showInterfaces(d, p) {
    const T = G().T;
    p('Interface   IP address           Status');
    T.byDev[d.id].forEach(i => {
      const addr = i.ip != null ? `${IP.str(i.ip)}/${IP.prefix(i.mask)}` : 'unassigned';
      p(`${i.name.padEnd(11)} ${addr.padEnd(20)} ${i.up ? 'up' : 'down'}`);
    });
  }

  // Animate a request/reply and mark where it failed.
  Tm.animT = async function (t, label) {
    if (t.req.path.length) await C().animate(t.req.path, { cls: 'req', label });
    if (t.stage === 'request') { C().flash(t.fail.dev, t.fail.code === 'acl' ? 'block' : 'bad'); return; }
    if (t.rep && t.rep.path.length) await C().animate(t.rep.path, { cls: 'rep', label: 'reply' });
    C().flash(t.ok ? t.from : t.fail.dev, t.ok ? 'ok' : 'bad');
  };

  function failLine(t) {
    const f = t.fail || {};
    if (t.stage === 'request' && f.dev === t.from) {
      if (f.code === 'arp') return `Reply from ${IP.str(t.req.pkt.src)}: Destination host unreachable.`;
      return 'PING: transmit failed. General failure.';
    }
    if (t.stage === 'request' && (f.code === 'arp' || f.code === 'noroute') && t.req.hops.length) {
      return `Reply from ${IP.str(t.req.hops[t.req.hops.length - 1].ip)}: Destination host unreachable.`;
    }
    return 'Request timed out.';
  }

  const animSteps = async steps => { for (const s of steps) await Tm.animT(s, 'DNS?'); };
  const isName = s => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s) && /[a-z]/i.test(s);

  async function ping(d, args, p) {
    if (!args[0]) { p('Usage: ping <ip address or name>   e.g. ping 8.8.8.8'); return; }
    const T = G().T;
    let dst = IP.parse(args[0]), shown = args[0];
    if (dst == null) {
      if (!isName(args[0])) { p(`Ping request could not find host ${args[0]}.`, 'err'); why(p, 'That is not a valid IP address or name.'); return; }
      const r = Sim.resolve(T, d.id, args[0]);
      await animSteps(r.steps);
      if (!r.ok) {
        p(`Ping request could not find host ${args[0]}. Please check the name and try again.`, 'err');
        why(p, Sim.explain(T, r.fail));
        G().recordEvent({ type: 'ping', dev: d.id, name: args[0].toLowerCase(), ok: false });
        return;
      }
      dst = r.ip;
      shown = `${args[0]} [${IP.str(dst)}]`;
    } else shown = IP.str(dst);
    const t = Sim.transact(T, d.id, dst);
    p(`Pinging ${shown} with 32 bytes of data:`);
    const routers = t.req.hops.filter(h => Types[T.devs[h.dev].type].kind === 'router').length;
    for (let k = 0; k < 4; k++) {
      if (k === 0) await Tm.animT(t, 'ping'); else await sleep(300);
      if (t.ok) {
        const time = t.req.virtual ? 12 + ((k * 7) % 5) : 1 + routers;
        p(`Reply from ${IP.str(dst)}: bytes=32 time=${time}ms TTL=${t.req.virtual ? 117 : 128 - routers}`, 'ok');
      } else p(failLine(t), 'err');
    }
    p('');
    p(`Ping statistics for ${IP.str(dst)}:`);
    p(`    Packets: Sent = 4, Received = ${t.ok ? 4 : 0}, Lost = ${t.ok ? 0 : 4} (${t.ok ? 0 : 100}% loss)`);
    if (!t.ok) why(p, Sim.explain(T, t.fail, t.stage));
    G().recordEvent({ type: 'ping', dev: d.id, dst, name: IP.parse(args[0]) == null ? args[0].toLowerCase() : null, ok: t.ok, code: t.fail && t.fail.code });
  }

  async function nslookup(d, args, p) {
    if (!args[0]) { p('Usage: nslookup <name>   e.g. nslookup www.example.com'); return; }
    const T = G().T, name = args[0].toLowerCase(), servers = Sim.dnsServersOf(T, d.id);
    if (!servers.length) {
      p('*** Default servers are not available', 'err');
      why(p, Sim.explain(T, { code: 'nodns', dev: d.id }));
      G().recordEvent({ type: 'nslookup', dev: d.id, name, ok: false });
      return;
    }
    p(`Server:   ${IP.str(servers[0])}`);
    const r = Sim.resolve(T, d.id, name);
    await animSteps(r.steps);
    if (r.ok) {
      p('');
      p(`Name:     ${name}`);
      p(`Address:  ${IP.str(r.ip)}`, 'ok');
      if (r.steps.length > 1) why(p, `${G().dev(r.steps[0].req.dev) ? G().dev(r.steps[0].req.dev).name : 'The router'} didn't know the answer itself, so it relayed the question to its own DNS server.`);
    } else if (r.fail.code === 'nxdomain') {
      p(`*** ${IP.str(r.server)} can't find ${name}: Non-existent domain`, 'err');
      why(p, Sim.explain(T, r.fail));
    } else {
      p('DNS request timed out.', 'err');
      why(p, Sim.explain(T, r.fail));
    }
    G().recordEvent({ type: 'nslookup', dev: d.id, name, ok: r.ok });
  }

  async function browse(d, args, p) {
    const url = args[0] || 'www.example.com';
    const T = G().T;
    const r = Sim.browse(T, d.id, url);
    p(`Opening http://${r.host}/ ...`);
    await animSteps(r.dns.steps);
    if (r.stage === 'dns') {
      p(`  Can't find the server at ${r.host}.`, 'err');
      why(p, Sim.explain(T, r.fail));
    } else {
      if (IP.parse(r.host) == null) p(`  DNS: ${r.host} is ${IP.str(r.ip)}`);
      await Tm.animT(r.http, 'HTTP');
      if (r.ok) {
        const v = r.http.req.virtual;
        const title = v ? v.title : `${G().dev(r.http.req.dev).name} web page`;
        p(`  Connected to ${IP.str(r.ip)} port 80: HTTP/1.1 200 OK`, 'ok');
        p(`  ┌${'─'.repeat(38)}┐`, 'page');
        p(`  │ ${title.padEnd(36)} │`, 'page');
        p(`  │ ${'This page reached you over the network!'.slice(0, 36).padEnd(36)} │`, 'page');
        p(`  └${'─'.repeat(38)}┘`, 'page');
      } else {
        p(`  Unable to connect to ${r.host}.`, 'err');
        why(p, Sim.explain(T, r.fail, r.stage));
      }
    }
    G().recordEvent({ type: 'browse', dev: d.id, host: r.host, ok: r.ok });
  }

  const FILES = ['Price list.xlsx', 'Staff handbook.pdf', 'Logo.png', 'Meeting notes.docx'];

  async function openShare(d, args, p) {
    if (!Sim.shareHost(args[0])) { p('Usage: open \\\\<server>   e.g. open \\\\files.office'); return; }
    const T = G().T;
    const r = Sim.openShare(T, d.id, args[0]);
    p(`Opening \\\\${r.host} ...`);
    await animSteps(r.dns.steps);
    if (r.stage === 'dns') {
      p(`  Windows can't find \\\\${r.host}.`, 'err');
      why(p, Sim.explain(T, r.fail));
    } else {
      if (IP.parse(r.host) == null) p(`  DNS: ${r.host} is ${IP.str(r.ip)}`);
      await Tm.animT(r.conn, 'SMB');
      if (r.ok) {
        const srv = G().dev(r.conn.req.dev);
        p(`  Connected to ${IP.str(r.ip)} on TCP port 445 (SMB)`, 'ok');
        p(`  Directory of \\\\${r.host}\\Shared   (on ${srv.name})`, 'page');
        FILES.forEach(f => p(`    ${f}`, 'page'));
      } else {
        p(`  Can't open \\\\${r.host}: the network path was not found.`, 'err');
        why(p, Sim.explain(T, r.fail, r.stage));
      }
    }
    G().recordEvent({ type: 'open', dev: d.id, host: r.host, ok: r.ok, code: r.fail && r.fail.code });
  }

  async function testPort(d, args, p) {
    const port = Number(args[1]);
    if (!args[0] || !/^\d+$/.test(args[1] || '') || port < 1 || port > 65535) {
      p('Usage: test <ip address or name> <port>   e.g. test files.office 445');
      return;
    }
    const T = G().T;
    const r = Sim.testPort(T, d.id, args[0], port);
    await animSteps(r.dns.steps);
    if (r.stage === 'dns') {
      p(`Can't find ${args[0]}.`, 'err');
      why(p, Sim.explain(T, r.fail));
    } else {
      const sv = Sim.svcByPort(r.proto, port);
      const what = `${r.proto.toUpperCase()} port ${port}${sv ? ' (' + sv.long + ')' : ''} on ${args[0]}${IP.parse(args[0]) == null ? ' [' + IP.str(r.ip) + ']' : ''}`;
      await Tm.animT(r.conn, String(port));
      if (r.ok) p(`${what}: OPEN. Something is listening.`, 'ok');
      else if (r.closed) p(`${what}: CLOSED. The device answered, but nothing is listening on that port.`, 'warn');
      else if (r.fail.code === 'acl') p(`${what}: FILTERED. No answer at all: something on the way dropped the packet.`, 'err');
      else p(`${what}: no answer. The device couldn't be reached at all.`, 'err');
      if (!r.ok) why(p, Sim.explain(T, r.fail, r.stage));
    }
    G().recordEvent({ type: 'test', dev: d.id, host: String(args[0]).toLowerCase(), ip: r.ip, port, ok: r.ok, closed: !!r.closed, code: r.fail && r.fail.code });
  }

  function netstat(d, p) {
    const T = G().T, i = T.byDev[d.id][0];
    const on = Types[d.type].kind === 'host' ? Sim.listening(d) : d.config.dnsProxy ? [Sim.svcByPort('udp', 53)] : [];
    p('Active listening ports');
    p('');
    p('  Proto  Local address          Service');
    on.forEach(s => p(`  ${s.proto.toUpperCase().padEnd(6)} ${(`${i && i.ip != null ? IP.str(i.ip) : '0.0.0.0'}:${s.port}`).padEnd(22)} ${s.long}`));
    if (!on.length) {
      p('  (none)', 'muted');
      why(p, `${d.name} isn't running any services, so it won't accept connections from other devices. It can still connect out to them.`);
    }
    G().recordEvent({ type: 'netstat', dev: d.id, ports: on.map(s => s.port) });
  }
})();

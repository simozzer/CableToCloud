// Network simulation: works out each device's IP settings (static / DHCP / APIPA),
// then walks packets hop by hop (ARP on the local segment, gateways, NAT) and
// explains in plain English why a packet failed.
(function () {
  const IP = NG.IP, Types = NG.Types, P = IP.parse;

  // Hosts that "live" on the Internet cloud.
  const VIRTUAL = {};
  [
    ['8.8.8.8', { name: 'dns.google', dns: true, role: 'Google public DNS' }],
    ['1.1.1.1', { name: 'one.one.one.one', dns: true, role: 'Cloudflare public DNS' }],
    ['93.184.216.34', { name: 'www.example.com', web: true, role: 'web server', title: 'Example Domain' }],
    ['198.51.100.25', { name: 'customer.example.net', role: 'a customer at home' }],
  ].forEach(([ip, v]) => { VIRTUAL[P(ip)] = v; });

  // The (tiny) Internet-wide DNS database.
  const DNS_DB = {
    'www.example.com': '93.184.216.34', 'example.com': '93.184.216.34',
    'dns.google': '8.8.8.8', 'one.one.one.one': '1.1.1.1',
  };

  // The ISP side of the WAN link.
  const ISP = { ip: P('203.0.113.1'), mask: IP.maskFromPrefix(24), start: P('203.0.113.42'), end: P('203.0.113.250'), dns: [P('8.8.8.8')] };

  // Services a server can run. Each listens on one well-known port.
  const SERVICES = [
    { key: 'web', proto: 'tcp', port: 80, label: 'Web server', long: 'Web server (HTTP)' },
    { key: 'files', proto: 'tcp', port: 445, label: 'File sharing', long: 'File sharing (SMB)' },
    { key: 'dns', proto: 'udp', port: 53, label: 'DNS server', long: 'DNS server' },
  ];
  const svcByPort = (proto, port) => SERVICES.find(s => s.proto === proto && s.port === port);
  const listening = d => SERVICES.filter(s => d.config.services && d.config.services[s.key]);

  const pk = (d, p) => d + ':' + p;
  const devOf = k => k.slice(0, k.indexOf(':'));
  const kindOf = d => Types[d.type].kind;
  const usable = i => !!(i && i.up && i.ip != null && !i.conflict);

  function ifaceDefs(d) {
    const def = Types[d.type];
    if (def.kind === 'router') return def.ifaces;
    if (def.kind === 'switch') return [];
    return [{ name: d.ports[0], ports: [d.ports[0]], role: def.kind === 'internet' ? 'isp' : 'host' }];
  }
  // Ports that share one Ethernet segment inside a device (switch = all ports).
  const l2Groups = d => (kindOf(d) === 'switch' ? [d.ports] : ifaceDefs(d).map(i => i.ports));

  // ---------- Building the topology ----------

  function build(net) {
    const T = { net, devs: {}, ifaces: [], byDev: {}, linkOf: {}, group: {}, events: [] };
    const parent = {};
    const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };

    net.devices.forEach(d => {
      T.devs[d.id] = d;
      T.byDev[d.id] = [];
      d.ports.forEach(p => { parent[pk(d.id, p)] = pk(d.id, p); });
    });
    net.links.forEach(l => {
      const a = pk(l.a.dev, l.a.port), b = pk(l.b.dev, l.b.port);
      if (!(a in parent) || !(b in parent)) return;
      union(a, b);
      T.linkOf[a] = l;
      T.linkOf[b] = l;
    });
    net.devices.forEach(d => l2Groups(d).forEach(g => {
      const keys = g.map(p => pk(d.id, p));
      keys.forEach(k => { T.group[k] = keys; union(keys[0], k); });
    }));

    net.devices.forEach(d => ifaceDefs(d).forEach(def => {
      const up = def.ports.some(p => T.linkOf[pk(d.id, p)]);
      const i = {
        key: d.id + '/' + def.name, dev: d.id, name: def.name, role: def.role, kind: kindOf(d), ports: def.ports,
        up, seg: up ? find(pk(d.id, def.ports[0])) : null,
        ip: null, mask: null, gw: null, dns: [], source: 'none', errors: [],
      };
      configure(d, i);
      T.ifaces.push(i);
      T.byDev[d.id].push(i);
    }));

    runDhcp(T, net);
    findConflicts(T);
    return T;
  }

  function staticCfg(i, c) {
    const ip = P(c.ip), mask = IP.parseMask(c.mask);
    if (ip == null) i.errors.push(c.ip ? `IP address "${c.ip}" is not valid` : 'No IP address entered');
    if (mask == null) i.errors.push(c.mask ? `Subnet mask "${c.mask}" is not valid` : 'No subnet mask entered');
    if (ip == null || mask == null) return;
    if (IP.reserved(ip, mask)) { i.errors.push(`${c.ip} is the network or broadcast address of its subnet`); return; }
    i.ip = ip; i.mask = mask; i.source = 'static';
    if (c.gw) { const g = P(c.gw); if (g == null) i.errors.push('Default gateway is not a valid IP address'); else i.gw = g; }
    if (c.dns) { const l = IP.parseList(c.dns); if (!l) i.errors.push('DNS server is not a valid IP address'); else i.dns = l; }
  }

  function dhcpServerCfg(i, D) {
    if (!D || !D.enabled) return null;
    const s = { valid: false, start: P(D.start), end: P(D.end), dns: IP.parseList(D.dns || '') || [], gw: i.ip };
    if (i.ip == null) s.reason = 'the interface has no IP address';
    else if (s.start == null || s.end == null) s.reason = 'the pool start/end addresses are not valid';
    else if (s.start > s.end) s.reason = 'the pool starts after it ends';
    else if (!IP.same(s.start, i.ip, i.mask) || !IP.same(s.end, i.ip, i.mask)) s.reason = `the pool is not inside the interface's network ${IP.cidr(i.ip, i.mask)}`;
    else if (IP.reserved(s.start, i.mask) || IP.reserved(s.end, i.mask)) s.reason = 'the pool includes the network or broadcast address';
    else if (D.dns && !IP.parseList(D.dns)) s.reason = 'the DNS server address is not valid';
    else s.valid = true;
    return s;
  }

  function configure(d, i) {
    const c = d.config;
    if (i.role === 'host') {
      if (c.mode === 'static') staticCfg(i, c);
      else if (c.mode === 'dhcp') i.wantDhcp = true;
    } else if (i.role === 'isp') {
      i.ip = ISP.ip; i.mask = ISP.mask; i.source = 'static';
      i.dhcpServer = { valid: true, start: ISP.start, end: ISP.end, dns: ISP.dns, gw: ISP.ip, isp: true };
    } else if (i.role === 'wan') {
      const w = c.ifaces[i.name];
      if (w.mode === 'static') staticCfg(i, w); else i.wantDhcp = true;
      i.nat = !!c.nat;
    } else if (i.role === 'lan') {
      const L = c.ifaces[i.name];
      const ip = P(L.ip), mask = IP.parseMask(L.mask);
      if (L.ip && ip == null) i.errors.push('Invalid IP address');
      if (L.mask && mask == null) i.errors.push('Invalid subnet mask');
      if (ip != null && mask != null) { i.ip = ip; i.mask = mask; i.source = 'static'; }
      i.dhcpServer = dhcpServerCfg(i, L.dhcp);
    }
  }

  function apipa(c) {
    let h = 0;
    for (const ch of c.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c.ip = (P('169.254.0.0') + (((h % 254) + 1) << 8) + ((h >>> 8) % 254) + 1) >>> 0;
    c.mask = IP.maskFromPrefix(16); c.gw = null; c.dns = []; c.source = 'apipa';
  }

  // Leases are remembered in net.leases so devices keep the same address between rebuilds.
  function runDhcp(T, net) {
    const old = net.leases || {}, fresh = {};
    const servers = T.ifaces.filter(i => i.up && i.dhcpServer && i.dhcpServer.valid);
    const clients = T.ifaces.filter(i => i.wantDhcp);
    clients.forEach(c => {
      if (!c.up) return;
      c.srv = servers.find(s => s.seg === c.seg && s.dev !== c.dev) || null;
      if (!c.srv) apipa(c);
    });
    servers.forEach(s => {
      const D = s.dhcpServer, prev = old[s.key] || {}, mine = clients.filter(c => c.srv === s);
      const used = new Set([s.ip]);
      fresh[s.key] = {};
      const give = (c, ip) => {
        used.add(ip);
        fresh[s.key][c.key] = ip;
        Object.assign(c, { ip, mask: s.mask, gw: D.gw, dns: D.dns.slice(), source: 'dhcp' });
        if (prev[c.key] !== ip) T.events.push({ type: 'dhcp', client: c, server: s, ip });
      };
      mine.forEach(c => { const p = prev[c.key]; if (p != null && p >= D.start && p <= D.end && !used.has(p)) give(c, p); });
      mine.forEach(c => {
        if (c.source === 'dhcp') return;
        for (let a = D.start; a <= D.end; a++) if (!used.has(a)) { give(c, a); return; }
        c.poolFull = true;
        apipa(c);
      });
    });
    net.leases = fresh;
  }

  // Two devices on one segment with the same IP: routers win, otherwise the older device wins.
  function findConflicts(T) {
    const seen = {};
    const rank = i => (i.kind === 'router' || i.kind === 'internet' ? 0 : 1);
    T.ifaces.filter(i => i.up && i.ip != null).sort((a, b) => rank(a) - rank(b)).forEach(i => {
      const k = i.seg + '|' + i.ip;
      if (seen[k]) i.conflict = seen[k]; else seen[k] = i;
    });
  }

  // ---------- Forwarding ----------

  function isLocal(T, devId, ip) {
    if (kindOf(T.devs[devId]) === 'internet' && VIRTUAL[ip]) return true;
    return T.byDev[devId].some(i => i.ip === ip && usable(i));
  }

  function route(T, devId, dst) {
    const kind = kindOf(T.devs[devId]), ifs = T.byDev[devId];
    if (kind === 'host') {
      const i = ifs[0];
      if (!i.up) return { err: 'nolink', iface: i };
      if (i.ip == null) return { err: 'noip', iface: i };
      if (i.conflict) return { err: 'conflict', iface: i };
      if (IP.same(dst, i.ip, i.mask)) return { iface: i, nh: dst };
      if (i.gw == null) return { err: i.source === 'apipa' ? 'apipa' : 'nogw', iface: i };
      if (!IP.same(i.gw, i.ip, i.mask)) return { err: 'gwoff', iface: i };
      return { iface: i, nh: i.gw, viaGw: true };
    }
    if (kind === 'internet') {
      const i = ifs[0];
      if (i.up && IP.same(dst, i.ip, i.mask)) return { iface: i, nh: dst };
      return { err: 'netunreach' };
    }
    let best = null;
    ifs.forEach(i => {
      if (usable(i) && IP.same(dst, i.ip, i.mask) && (!best || IP.prefix(i.mask) > IP.prefix(best.mask))) best = i;
    });
    if (best) return { iface: best, nh: dst };
    const wan = ifs.find(i => i.role === 'wan');
    if (usable(wan) && wan.gw != null && IP.same(wan.gw, wan.ip, wan.mask)) return { iface: wan, nh: wan.gw, viaGw: true };
    return { err: 'noroute', iface: wan };
  }

  // Shortest cable path between two interfaces on the same segment, as device-to-device edges.
  function l2path(T, a, b) {
    const goal = new Set(b.ports.map(p => pk(b.dev, p)));
    const prev = {}, q = [];
    a.ports.map(p => pk(a.dev, p)).filter(k => T.linkOf[k]).forEach(k => { prev[k] = null; q.push(k); });
    let end = null;
    while (q.length) {
      const k = q.shift();
      if (goal.has(k)) { end = k; break; }
      const nb = (T.group[k] || []).slice();
      const l = T.linkOf[k];
      if (l) { const o = pk(l.a.dev, l.a.port) === k ? l.b : l.a; nb.push(pk(o.dev, o.port)); }
      nb.forEach(n => { if (!(n in prev)) { prev[n] = k; q.push(n); } });
    }
    if (!end) return [];
    const seq = [];
    for (let k = end; k != null; k = prev[k]) seq.unshift(k);
    const edges = [];
    for (let i = 1; i < seq.length; i++) {
      const da = devOf(seq[i - 1]), db = devOf(seq[i]);
      if (da !== db) edges.push({ from: da, to: db });
    }
    return edges;
  }

  function fail(res, code, dev, extra) {
    res.ok = false;
    res.fail = Object.assign({ code, dev, pkt: Object.assign({}, res.pkt) }, extra || {});
    return res;
  }

  // Move one packet until it is delivered or dropped. ctx.nat holds NAT sessions for the reply.
  function walk(T, startId, pkt, ctx) {
    const res = { ok: false, path: [], hops: [], pkt };
    let devId = startId, inIf = null;
    for (let ttl = 0; ttl < 32; ttl++) {
      const kind = kindOf(T.devs[devId]);
      if (inIf) {
        res.hops.push({ dev: devId, ip: inIf.ip });
        if (kind === 'router' && inIf.role === 'wan' && inIf.nat && pkt.dst === inIf.ip) {
          const s = ctx.nat.slice().reverse().find(x => x.outside === pkt.dst && x.remote === pkt.src);
          if (s) pkt.dst = s.inside;
          else {
            // A new connection from outside: only allowed in by a port-forwarding rule.
            const rule = (T.devs[devId].config.portForwards || []).find(x => x.proto === pkt.proto && Number(x.port) === pkt.port);
            const to = rule ? P(rule.ip) : null;
            if (to != null) {
              ctx.nat.push({ inside: to, outside: inIf.ip, remote: pkt.src });
              pkt.dst = to;
              if (rule.toPort) pkt.port = Number(rule.toPort);
              res.forwarded = { dev: devId, to };
            }
          }
        }
      }
      if (inIf && kind === 'internet' && (IP.isPrivate(pkt.src) || IP.isApipa(pkt.src))) return fail(res, 'privsrc', devId);
      if (isLocal(T, devId, pkt.dst)) {
        res.ok = true; res.dev = devId;
        res.virtual = kind === 'internet' ? VIRTUAL[pkt.dst] || null : null;
        return res;
      }
      if (inIf && kind === 'host') return fail(res, 'notrouter', devId);
      const r = route(T, devId, pkt.dst);
      if (r.err) return fail(res, r.err, devId, { iface: r.iface });
      if (kind === 'router' && r.iface.role === 'wan' && r.iface.nat && pkt.src !== r.iface.ip && (!inIf || inIf.role !== 'wan')) {
        ctx.nat.push({ inside: pkt.src, outside: r.iface.ip, remote: pkt.dst });
        pkt.src = r.iface.ip;
      }
      const tgt = T.ifaces.find(i => i.seg === r.iface.seg && i.dev !== devId && usable(i) && i.ip === r.nh);
      if (!tgt) return fail(res, 'arp', devId, { iface: r.iface, nh: r.nh, viaGw: r.viaGw });
      res.path.push(...l2path(T, r.iface, tgt));
      devId = tgt.dev;
      inIf = tgt;
    }
    return fail(res, 'ttl', devId);
  }

  // Is something listening on this port at the device the request reached?
  function service(T, req, proto, port) {
    if (proto === 'icmp') return { ok: true };
    const d = T.devs[req.dev], k = kindOf(d);
    if (k === 'internet') {
      const v = req.virtual;
      if (v && port === 53 && v.dns) return { ok: true, dns: true };
      if (v && port === 80 && v.web) return { ok: true, web: true };
      return { ok: false };
    }
    if (k === 'router' && port === 53 && d.config.dnsProxy) return { ok: true, dns: true, proxy: true };
    if (k === 'host') {
      const s = listening(d).find(x => x.proto === proto && x.port === port);
      if (s) return { ok: true, [s.key]: true, local: s.key === 'dns' };
    }
    return { ok: false };
  }

  // A request and its reply: a ping (icmp), a DNS question (udp 53), a web request (tcp 80) or a file share (tcp 445).
  // opts.src lets a virtual Internet host (e.g. a customer) be the sender.
  function transact(T, fromId, dst, proto = 'icmp', port, opts = {}) {
    const ctx = { nat: [] };
    const r0 = route(T, fromId, dst);
    const src = opts.src != null ? opts.src : isLocal(T, fromId, dst) ? dst : (r0.iface && r0.iface.ip != null ? r0.iface.ip : 0);
    const req = walk(T, fromId, { src, dst, proto, port }, ctx);
    const out = { ok: false, req, dst, from: fromId, proto, port };
    if (!req.ok) { out.stage = 'request'; out.fail = req.fail; return out; }
    const dport = req.pkt.port;
    out.svc = service(T, req, proto, dport);
    if (!out.svc.ok) { out.stage = 'service'; out.fail = { code: 'refused', dev: req.dev, port: dport, pkt: Object.assign({}, req.pkt) }; return out; }
    const rep = walk(T, req.dev, { src: req.pkt.dst, dst: req.pkt.src, proto, port: dport }, ctx);
    out.rep = rep;
    if (!rep.ok) { out.stage = 'reply'; out.fail = rep.fail; return out; }
    if (rep.dev !== fromId) { out.stage = 'reply'; out.fail = { code: 'misdelivered', dev: rep.dev }; return out; }
    out.ok = true;
    return out;
  }

  // ---------- DNS & web ----------

  const dnsServersOf = (T, devId) => {
    const ifs = T.byDev[devId];
    const i = kindOf(T.devs[devId]) === 'router' ? ifs.find(x => x.role === 'wan') : ifs[0];
    return i ? i.dns : [];
  };

  // Turn a name into an IP. steps = every DNS transaction, for animation.
  function resolve(T, fromId, name, depth = 0) {
    name = String(name).trim().toLowerCase().replace(/\.$/, '');
    const lit = P(name);
    if (lit != null) return { ok: true, ip: lit, steps: [] };
    const servers = dnsServersOf(T, fromId), steps = [];
    if (!servers.length) {
      // Report a more basic problem (unplugged, no address...) before blaming DNS.
      const r0 = route(T, fromId, P('8.8.8.8'));
      if (['nolink', 'noip', 'conflict', 'apipa'].includes(r0.err)) return { ok: false, steps, fail: { code: r0.err, dev: fromId, iface: r0.iface } };
      return { ok: false, steps, fail: { code: 'nodns', dev: fromId } };
    }
    let first = null;
    for (const s of servers) {
      const t = transact(T, fromId, s, 'udp', 53);
      steps.push(t);
      if (!t.ok || (t.svc.proxy && depth > 0)) { first = first || t; continue; }
      if (t.svc.local) {
        // An internal DNS server answers from its own records and forwards everything else.
        const rec = (T.devs[t.req.dev].config.dnsRecords || []).find(x => x.name.toLowerCase() === name);
        if (rec) return { ok: true, ip: P(rec.ip), steps, server: s, local: true };
        if (depth > 0) return { ok: false, steps, server: s, fail: { code: 'nxdomain', dev: fromId, name } };
      }
      if (t.svc.proxy || t.svc.local) {
        // A home router relays the question to its own DNS server.
        const up = resolve(T, t.req.dev, name, 1);
        steps.push(...up.steps);
        if (!up.ok) return { ok: false, steps, server: s, fail: up.fail.code === 'nxdomain' ? up.fail : { code: 'upstream', dev: t.req.dev, inner: up.fail, stage: up.fail.stage } };
        return { ok: true, ip: up.ip, steps, server: s };
      }
      const ip = DNS_DB[name];
      if (ip == null) return { ok: false, steps, server: s, fail: { code: 'nxdomain', dev: fromId, name } };
      return { ok: true, ip: P(ip), steps, server: s };
    }
    return { ok: false, steps, server: servers[0], fail: { code: 'dnsfail', dev: fromId, server: servers[0], inner: first.fail, stage: first.stage } };
  }

  function browse(T, fromId, url) {
    const host = String(url).replace(/^https?:\/\//i, '').split(/[/:?#]/)[0].toLowerCase();
    const r = resolve(T, fromId, host);
    if (!r.ok) return { ok: false, stage: 'dns', dns: r, host, fail: r.fail };
    const t = transact(T, fromId, r.ip, 'tcp', 80);
    return { ok: t.ok, dns: r, http: t, host, ip: r.ip, fail: t.fail, stage: t.stage };
  }

  // \\server\share or //server/share → the server's name or address.
  const shareHost = s => String(s || '').replace(/^[\\/]+/, '').split(/[\\/]/)[0].toLowerCase();

  // Open a shared folder: find the server by name, then connect to TCP port 445 (SMB).
  function openShare(T, fromId, path) {
    const host = shareHost(path);
    const r = resolve(T, fromId, host);
    if (!r.ok) return { ok: false, stage: 'dns', dns: r, host, fail: r.fail };
    const t = transact(T, fromId, r.ip, 'tcp', 445);
    return { ok: t.ok, dns: r, conn: t, host, ip: r.ip, fail: t.fail, stage: t.stage };
  }

  // Is anything listening on this port? Like Test-NetConnection -Port.
  function testPort(T, fromId, target, port) {
    const r = resolve(T, fromId, target);
    if (!r.ok) return { ok: false, stage: 'dns', dns: r, fail: r.fail };
    const proto = port === 53 ? 'udp' : 'tcp';
    const t = transact(T, fromId, r.ip, proto, port);
    // Only the request reaching the device and being refused means "closed". Anything else is a network fault.
    return { ok: t.ok, closed: t.stage === 'service', dns: r, conn: t, ip: r.ip, proto, fail: t.fail, stage: t.stage };
  }

  // ---------- Explanations ----------

  function explain(T, f, stage) {
    if (!f) return '';
    const name = id => (T.devs[id] ? T.devs[id].name : '?');
    const n = name(f.dev), i = f.iface, s = IP.str, dst = f.pkt ? f.pkt.dst : null;
    let msg;
    switch (f.code) {
      case 'nolink': msg = `${n} has no network cable plugged in.`; break;
      case 'noip': msg = `${n} has no IP address. Set its IPv4 settings to DHCP (automatic) or enter a static address.`; break;
      case 'conflict': msg = `${n} can't use ${s(i.ip)} because ${name(i.conflict.dev)} already has that address (IP address conflict).`; break;
      case 'apipa': msg = `${n} only has a self-assigned 169.254.x.x address because no DHCP server answered. It has no default gateway, so it can't reach other networks.`; break;
      case 'nogw': msg = `${n} has no default gateway, so it doesn't know where to send traffic for other networks.`; break;
      case 'gwoff': msg = `${n}'s default gateway ${s(i.gw)} is not inside its own network ${IP.cidr(i.ip, i.mask)}. Check the IP address, subnet mask and gateway.`; break;
      case 'noroute': {
        const wan = i;
        msg = `${n} has no route to ${s(dst)}.` + (!usable(wan) ? ' Its WAN (Internet) port has no working address — is it connected to the Internet?' : '');
        break;
      }
      case 'netunreach':
        msg = dst != null && IP.isPrivate(dst)
          ? `The packet for ${s(dst)} was sent out to the Internet, which can't deliver it: private addresses (10.x, 172.16–31.x, 192.168.x) only exist inside local networks. Does the router have an interface in ${s(dst)}'s network?`
          : `Nothing on the Internet answered at ${s(dst)}. Try a known server such as 8.8.8.8 or 1.1.1.1.`;
        break;
      case 'arp':
        msg = f.viaGw
          ? `${n} sent the packet to its gateway ${s(f.nh)}, but nothing on its local network answered to that address.`
          : `${n} looked for ${s(f.nh)} on its local network (${IP.cidr(i.ip, i.mask)}), but no device with that address answered.`;
        break;
      case 'notrouter': msg = `${n} received a packet for ${s(dst)}, but it isn't a router, so it dropped it.`; break;
      case 'privsrc': msg = `The packet reached the Internet from the private address ${s(f.pkt.src)}. Private addresses can't be used on the Internet — the router must translate them (NAT).`; break;
      case 'refused': {
        const d = T.devs[f.dev];
        if (f.port === 53) {
          msg = kindOf(d) === 'router'
            ? `${n} (${s(dst)}) doesn't run a DNS service. Use a DNS server that does, such as 8.8.8.8 or 1.1.1.1.`
            : `${kindOf(d) === 'internet' ? s(dst) : n + ' (' + s(dst) + ')'} is not a DNS server, so nobody answered the question.`;
        } else if (kindOf(d) === 'router') {
          msg = `${n} received a connection for TCP port ${f.port}, but it has no port-forwarding rule sending that port to a server inside, so it refused it.`;
        } else if (kindOf(d) === 'internet') {
          msg = f.port === 80 ? `Nothing at ${s(dst)} is running a web server.` : `${s(dst)} refused the connection on port ${f.port}.`;
        } else {
          const sv = svcByPort(f.pkt.proto, f.port);
          const on = listening(d).map(x => `${x.port} (${x.label.toLowerCase()})`);
          msg = `${n} (${s(dst)}) got the request, but nothing is listening on ${f.pkt.proto.toUpperCase()} port ${f.port}`
            + (sv ? `: its ${sv.label.toLowerCase()} service isn't running.` : '.')
            + (on.length ? ` It is listening on port ${on.join(' and ')}.` : '');
        }
        break;
      }
      case 'nodns': msg = `${n} has no DNS server set, so it can't turn names into IP addresses.`; break;
      case 'nxdomain':
        msg = /\.office$/.test(f.name)
          ? `No DNS server has a record for "${f.name}". Internal names only work once someone adds them to the internal DNS server.`
          : `The DNS server says the name "${f.name}" doesn't exist. (In this game, try www.example.com.)`;
        break;
      case 'dnsfail': msg = `${n} couldn't get an answer from its DNS server ${s(f.server)}. ` + explain(T, f.inner, f.stage); break;
      case 'upstream': msg = `${n} relays DNS questions to its own DNS server, but that failed. ` + explain(T, f.inner, f.stage); break;
      case 'ttl': msg = 'The packet went round in a loop until it expired.'; break;
      default: msg = 'The reply arrived somewhere unexpected.';
    }
    return stage === 'reply' ? 'The request arrived, but the reply could not get back. ' + msg : msg;
  }

  // A customer on the Internet opens http://<router's public address>/
  const REMOTE = P('198.51.100.25');
  function externalVisit(T) {
    const inet = T.net.devices.find(d => kindOf(d) === 'internet');
    const isp = inet && T.byDev[inet.id][0];
    const wan = isp && T.ifaces.find(i => i.role === 'wan' && usable(i) && i.seg === isp.seg);
    if (!wan) return { ok: false, noWan: true };
    const t = transact(T, inet.id, wan.ip, 'tcp', 80, { src: REMOTE });
    t.wanIp = wan.ip;
    return t;
  }

  NG.Sim = {
    build, route, transact, resolve, browse, openShare, testPort, shareHost, externalVisit, l2path, explain, usable, dnsServersOf,
    listening, svcByPort, SERVICES, VIRTUAL, ISP, REMOTE,
  };
})();

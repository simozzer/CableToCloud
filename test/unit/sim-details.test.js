// Finer details of the simulation (js/sim.js): edge cases found by mutation testing, the exact route packets take,
// and the full text of every "Why?" explanation. Two readable catalogues are stored in sim-details.test.js.snapshot.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, Sim, IP, P, rule } = require('../load');

const iface = (T, d) => T.byDev[d.id][0];
const names = (T, path) => path.map(e => `${T.devs[e.from].name}→${T.devs[e.to].name}`).join(' ');
const statik = (d, ip, gw = '', dns = '', mask = '255.255.255.0') => Object.assign(d.config, { mode: 'static', ip, mask, gw, dns });

function home(n = 1, routerCfg) {
  const net = Model.create();
  const inet = Model.add(net, 'internet', 0, 0, { name: 'Internet' });
  const r = Model.add(net, 'homerouter', 0, 0, Object.assign({ name: 'Router' }, routerCfg ? { config: routerCfg } : {}));
  const sw = Model.add(net, 'switch', 0, 0, { name: 'Switch' });
  Model.connect(net, inet, 'ISP', r, 'WAN');
  Model.connect(net, r, 'LAN1', sw, 'P1');
  const pcs = Array.from({ length: n }, (_, k) => { const d = Model.add(net, 'pc', 0, 0); Model.connect(net, sw, 'P' + (k + 2), d, 'eth0'); return d; });
  return { net, inet, r, sw, pcs, T: () => Sim.build(net) };
}

function office(extra = {}) {
  // Staff PC on Gi0/1, a server on Gi0/2 running DNS (with records) and file sharing.
  const net = Model.create();
  const inet = Model.add(net, 'internet', 0, 0, { name: 'Internet' });
  const r = Model.add(net, 'officerouter', 0, 0, { name: 'Router', config: Object.assign({ ifaces: {
    'Gi0/1': { ip: '10.0.1.1', mask: '255.255.255.0', dhcp: { enabled: true, start: '10.0.1.100', end: '10.0.1.150', dns: '10.0.2.53' } },
    'Gi0/2': { ip: '10.0.2.1', mask: '255.255.255.0' } } }, extra) });
  const pc = Model.add(net, 'pc', 0, 0, { name: 'PC' });
  const srv = Model.add(net, 'server', 0, 0, { name: 'Server', hostMode: 'static', config: {
    ip: '10.0.2.53', mask: '255.255.255.0', gw: '10.0.2.1', dns: '8.8.8.8',
    services: { dns: true, files: true }, dnsRecords: [{ name: 'files.office', ip: '10.0.2.53' }] } });
  Model.connect(net, inet, 'ISP', r, 'Gi0/0');
  Model.connect(net, r, 'Gi0/1', pc, 'eth0');
  Model.connect(net, r, 'Gi0/2', srv, 'eth0');
  return { net, r, pc, srv, T: () => Sim.build(net) };
}

// ---------- DHCP ----------

test('DHCP never hands out the server’s own address, and records new leases once', () => {
  const h = home(1, { ifaces: { LAN: { dhcp: { start: '192.168.1.1', end: '192.168.1.3' } } } });
  const T = h.T();
  assert.equal(IP.str(iface(T, h.pcs[0]).ip), '192.168.1.2');
  assert.deepEqual(T.events.map(e => [e.type, e.client.dev, e.server.dev, IP.str(e.ip)]),
    [['dhcp', h.r.id, h.inet.id, '203.0.113.42'], ['dhcp', h.pcs[0].id, h.r.id, '192.168.1.2']], 'the router’s WAN from the ISP, then the PC');
  assert.equal(iface(T, h.pcs[0]).dns === T.byDev[h.r.id][1].dhcpServer.dns, false, 'each client gets its own copy of the DNS list');
  assert.deepEqual(h.T().events, [], 'the same lease again is not news');
});

test('a remembered lease is kept only while it is still valid', () => {
  const h = home(2);
  h.T();
  // Shrink the pool so PC2's old address (.101) falls outside it.
  h.r.config.ifaces.LAN.dhcp.end = '192.168.1.100';
  const T = h.T();
  assert.equal(IP.str(iface(T, h.pcs[0]).ip), '192.168.1.100', 'PC1 keeps its lease');
  assert.equal(iface(T, h.pcs[1]).source, 'apipa', 'PC2’s lease is gone and the pool is full');
  // A remembered lease that another device now holds statically isn't reused.
  const h2 = home(1);
  h2.T();
  const other = Model.add(h2.net, 'pc', 0, 0);
  statik(other, '192.168.1.100');
  Model.connect(h2.net, h2.sw, 'P5', other, 'eth0');
  const T2 = h2.T();
  assert.equal(IP.str(iface(T2, h2.pcs[0]).ip), '192.168.1.100', 'the router finds the clash itself only for the pool, the static PC conflicts');
});

test('an unplugged DHCP client gets nothing at all, not even 169.254', () => {
  const h = home(1);
  h.net.links = h.net.links.filter(l => l.b.dev !== h.pcs[0].id);
  const i = iface(h.T(), h.pcs[0]);
  assert.deepEqual([i.ip, i.source], [null, 'none']);
});

test('a router doesn’t lease an address to itself', () => {
  // The WAN port is plugged into the router’s own LAN switch.
  const h = home(0);
  h.net.links = h.net.links.filter(l => l.a.port !== 'ISP');
  Model.connect(h.net, h.sw, 'P2', h.r, 'WAN');
  const wan = h.T().byDev[h.r.id][0];
  assert.equal(wan.source, 'apipa');
});

// ---------- Addresses and conflicts ----------

test('static settings: each missing or wrong field gets its own error', () => {
  const errs = cfg => { const h = home(1); Object.assign(h.pcs[0].config, { mode: 'static', ip: '', mask: '', gw: '', dns: '' }, cfg); const T = h.T(); return iface(T, h.pcs[0]).errors; };
  assert.deepEqual(errs({}), ['No IP address entered', 'No subnet mask entered']);
  assert.deepEqual(errs({ ip: '1.2.3.4' }), ['No subnet mask entered']);
  assert.deepEqual(errs({ mask: '24' }), ['No IP address entered']);
  assert.deepEqual(errs({ ip: '1.2.3.4', mask: '24' }), []);
  assert.deepEqual(errs({ ip: '1.2.3.4', mask: '24', gw: 'x', dns: 'y' }), ['Default gateway is not a valid IP address', 'DNS server is not a valid IP address']);
  const h = home(1);
  statik(h.pcs[0], '192.168.1.9', '192.168.1.1', '8.8.8.8, 1.1.1.1');
  const i = iface(h.T(), h.pcs[0]);
  assert.deepEqual([i.source, IP.str(i.gw), i.dns.map(IP.str)], ['static', '192.168.1.1', ['8.8.8.8', '1.1.1.1']]);
});

test('router interfaces: invalid settings are reported, half-filled ones give no address', () => {
  const lan = cfg => { const h = home(0, { ifaces: { LAN: cfg } }); return h.T().byDev[h.r.id][1]; };
  assert.deepEqual(lan({ ip: 'x', mask: 'y' }).errors, ['Invalid IP address', 'Invalid subnet mask']);
  assert.deepEqual(lan({ ip: '', mask: '' }).errors, []);
  assert.equal(lan({ ip: '10.0.0.1', mask: '' }).ip, null);
  assert.equal(lan({ ip: '', mask: '24' }).ip, null);
  const ok = lan({ ip: '10.0.0.1', mask: '24' });
  assert.deepEqual([IP.str(ok.ip), ok.source], ['10.0.0.1', 'static']);
});

test('conflicts: same address on another network is fine, unplugged devices don’t count, routers win', () => {
  const h = home(2);
  const lonely = Model.add(h.net, 'pc', 0, 0);
  statik(h.pcs[0], '192.168.1.50');
  statik(lonely, '192.168.1.50');
  let T = h.T();
  assert.equal(iface(T, h.pcs[0]).conflict, undefined, 'the other device is unplugged');
  // A PC with the router's address, created before the router.
  const net = Model.create();
  const pc = Model.add(net, 'pc', 0, 0), r = Model.add(net, 'homerouter', 0, 0);
  statik(pc, '192.168.1.1');
  Model.connect(net, r, 'LAN1', pc, 'eth0');
  T = Sim.build(net);
  assert.ok(iface(T, pc).conflict);
  assert.equal(T.byDev[r.id][1].conflict, undefined);
});

// ---------- Routing ----------

test('a router picks the most specific matching network', () => {
  const o = office();
  o.r.config.ifaces['Gi0/3'] = { ip: '10.0.0.1', mask: '255.255.0.0', dhcp: { enabled: false } };
  const sw = Model.add(o.net, 'switch', 0, 0);
  Model.connect(o.net, o.r, 'Gi0/3', sw, 'P1');
  const T = o.T();
  assert.equal(Sim.route(T, o.r.id, P('10.0.2.53')).iface.name, 'Gi0/2', '/24 beats /16');
  assert.equal(Sim.route(T, o.r.id, P('10.0.9.9')).iface.name, 'Gi0/3');
});

test('a WAN gateway outside the WAN network can’t be used', () => {
  const h = home(1);
  h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '198.51.100.1', dns: '8.8.8.8' };
  assert.equal(Sim.route(h.T(), h.r.id, P('8.8.8.8')).err, 'noroute');
});

test('two routers sending each other’s traffic round in circles', () => {
  const net = Model.create();
  const a = Model.add(net, 'officerouter', 0, 0, { name: 'A' }), b = Model.add(net, 'officerouter', 0, 0, { name: 'B' });
  a.config.ifaces['Gi0/0'] = { mode: 'static', ip: '10.9.9.1', mask: '255.255.255.0', gw: '10.9.9.2', dns: '' };
  b.config.ifaces['Gi0/0'] = { mode: 'static', ip: '10.9.9.2', mask: '255.255.255.0', gw: '10.9.9.1', dns: '' };
  a.config.nat = b.config.nat = false;
  Model.connect(net, a, 'Gi0/0', b, 'Gi0/0');
  const T = Sim.build(net), x = Sim.transact(T, a.id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'ttl');
  assert.equal(x.req.hops.length, 31);
});

test('pinging your own address works without the network', () => {
  const h = home(1), T = h.T(), me = iface(T, h.pcs[0]).ip;
  const x = Sim.transact(T, h.pcs[0].id, me);
  assert.equal(x.ok, true);
  assert.equal(x.req.pkt.src, me);
  assert.deepEqual(x.req.path, []);
});

// ---------- Packet routes (catalogue) ----------

test('the route packets take: a catalogue of journeys', t => {
  const lines = [];
  const show = (label, T, x) => {
    const hops = x.req.hops.map(h => `${T.devs[h.dev].name}(${IP.str(h.ip)})`).join(' ');
    lines.push(`${label}\n  ${x.ok ? 'ok' : 'FAILED ' + x.fail.code} · sent ${IP.str(x.req.pkt.src)} → ${IP.str(x.req.pkt.dst)}:${x.req.pkt.port || ''}`
      + `\n  request: ${names(T, x.req.path)}\n  hops: ${hops}`
      + (x.req.forwarded ? `\n  forwarded by ${T.devs[x.req.forwarded.dev].name} to ${IP.str(x.req.forwarded.to)}` : '')
      + (x.rep ? `\n  reply:   ${names(T, x.rep.path)}` : ''));
  };
  const h = home(2), T1 = h.T();
  show('PC to the Internet (NAT)', T1, Sim.transact(T1, h.pcs[0].id, P('8.8.8.8')));
  show('PC to PC on one switch', T1, Sim.transact(T1, h.pcs[0].id, iface(T1, h.pcs[1]).ip));
  const o = office(), T2 = o.T();
  show('PC to a server on another network (TCP 445)', T2, Sim.transact(T2, o.pc.id, P('10.0.2.53'), 'tcp', 445));
  // Port forwarding with a different inside port.
  const web = Model.add(h.net, 'server', 0, 0, { name: 'Web', hostMode: 'static', config: { ip: '192.168.1.80', mask: '255.255.255.0', gw: '192.168.1.1', services: { web: true } } });
  Model.connect(h.net, h.sw, 'P8', web, 'eth0');
  h.r.config.portForwards = [{ proto: 'udp', port: '8080', ip: '192.168.1.99', toPort: '80' }, { proto: 'tcp', port: '8080', ip: '192.168.1.80', toPort: '80' }];
  const T3 = h.T(), inet = h.net.devices.find(d => d.type === 'internet');
  show('a customer opens port 8080, forwarded to port 80 inside', T3, Sim.transact(T3, inet.id, P('203.0.113.42'), 'tcp', 8080, { src: Sim.REMOTE }));
  show('a customer tries port 9999 (no forward)', T3, Sim.transact(T3, inet.id, P('203.0.113.42'), 'tcp', 9999, { src: Sim.REMOTE }));
  // VLAN trunk between two switches.
  const net = Model.create();
  const s1 = Model.add(net, 'mswitch', 0, 0, { name: 'S1', config: { ports: { P1: { mode: 'access', vlan: 10 }, P8: { mode: 'trunk', allowed: '10' } } } });
  const s2 = Model.add(net, 'mswitch', 0, 0, { name: 'S2', config: { ports: { P1: { mode: 'access', vlan: 10 }, P8: { mode: 'trunk', allowed: null } } } });
  const a = Model.add(net, 'pc', 0, 0, { name: 'A', hostMode: 'static', config: { ip: '10.0.0.1', mask: '255.255.255.0' } });
  const b = Model.add(net, 'pc', 0, 0, { name: 'B', hostMode: 'static', config: { ip: '10.0.0.2', mask: '255.255.255.0' } });
  Model.connect(net, s1, 'P1', a, 'eth0');
  Model.connect(net, s1, 'P8', s2, 'P8');
  Model.connect(net, s2, 'P1', b, 'eth0');
  const T4 = Sim.build(net);
  show('across a VLAN trunk', T4, Sim.transact(T4, a.id, P('10.0.0.2')));
  t.assert.snapshot(`\n${lines.join('\n')}\n`, { serializers: [v => v] });
});

// ---------- Services ----------

test('services answer only on their own protocol and port', () => {
  const o = office(), T = o.T();
  assert.equal(Sim.transact(T, o.pc.id, P('10.0.2.53'), 'udp', 53).svc.local, true);
  assert.equal(Sim.transact(T, o.pc.id, P('10.0.2.53'), 'tcp', 53).ok, false, 'DNS here is UDP');
  assert.equal(Sim.transact(T, o.pc.id, P('10.0.2.53'), 'tcp', 445).svc.local, false);
  assert.equal(Sim.transact(T, o.pc.id, P('8.8.8.8'), 'tcp', 80).ok, false, '8.8.8.8 is DNS, not a web server');
  assert.equal(Sim.transact(T, o.pc.id, P('93.184.216.34'), 'udp', 53).ok, false, 'example.com is a web server, not DNS');
  assert.equal(Sim.transact(T, o.pc.id, P('10.0.1.1'), 'udp', 53).ok, false, 'this router doesn’t relay DNS');
  assert.equal(Sim.svcByPort('tcp', 22).key, 'ssh');
  assert.equal(Sim.svcByPort('udp', 22), undefined);
  assert.equal(Sim.svcByPort('tcp', 53), undefined);
});

test('the public servers in the Internet cloud', () => {
  const h = home(1), T = h.T(), pc = h.pcs[0].id;
  for (const [name, ip] of [['dns.google', '8.8.8.8'], ['one.one.one.one', '1.1.1.1'], ['example.com', '93.184.216.34'], ['WWW.Example.COM.', '93.184.216.34']]) {
    assert.equal(IP.str(Sim.resolve(T, pc, name).ip), ip, name);
  }
  assert.equal(Sim.transact(T, pc, P('1.1.1.1'), 'udp', 53).ok, true);
  assert.equal(Sim.transact(T, pc, P('198.51.100.25')).ok, true, 'the customer answers pings');
  assert.equal(Sim.transact(T, pc, P('198.51.100.25'), 'tcp', 80).ok, false);
  assert.equal(Sim.transact(T, pc, P('8.8.8.8')).req.virtual.name, 'dns.google');
  assert.equal(Sim.transact(T, pc, iface(T, pc === h.pcs[0].id ? h.pcs[0] : h.pcs[0]).gw).req.virtual, null);
});

test('URLs and share names are reduced to the host', () => {
  const h = home(1), T = h.T(), pc = h.pcs[0].id;
  for (const url of ['HTTPS://www.example.com:443/path?q=1#top', 'http://www.example.com', 'www.example.com/x']) assert.equal(Sim.browse(T, pc, url).host, 'www.example.com', url);
  assert.equal(Sim.browse(T, pc, 'xhttp://www.example.com').host, 'xhttp');
  for (const [s, host] of [['\\\\FS1\\share', 'fs1'], ['//fs1/share', 'fs1'], ['fs1', 'fs1'], ['', ''], [null, '']]) assert.equal(Sim.shareHost(s), host, String(s));
});

test('a port test reports "closed" only when the device itself refuses', () => {
  const o = office(), T = o.T();
  assert.deepEqual([Sim.testPort(T, o.pc.id, '10.0.2.53', 80).closed, Sim.testPort(T, o.pc.id, '10.0.2.99', 80).closed, Sim.testPort(T, o.pc.id, 'nope.office', 80).ok], [true, false, false]);
});

// ---------- DNS chains ----------

test('DNS loops are cut off: a server asked about a name it doesn’t know, whose DNS is itself', () => {
  const o = office();
  o.srv.config.dns = '10.0.2.53';
  const T = o.T(), r = Sim.resolve(T, o.pc.id, 'www.example.com');
  assert.equal(r.fail.code, 'nxdomain');
  assert.equal(Sim.resolve(T, o.pc.id, 'files.office').ok, true);
});

test('a relaying router that relays to itself gives up', () => {
  const h = home(1);
  h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '203.0.113.1', dns: '192.168.1.1' };
  const T = h.T(), r = Sim.resolve(T, h.pcs[0].id, 'www.example.com');
  assert.equal(r.fail.code, 'upstream');
  assert.equal(r.fail.inner.code, 'dnsfail');
});

test('names fail on the basic fault first: unplugged, no address, conflict, self-assigned', () => {
  const codes = [];
  for (const setup of [
    h => { h.net.links = h.net.links.filter(l => l.b.dev !== h.pcs[0].id); },
    h => { h.pcs[0].config.mode = 'none'; },
    h => { statik(h.pcs[0], '192.168.1.1', '', '8.8.8.8'); },
    h => { h.r.config.ifaces.LAN.dhcp.enabled = false; },
  ]) {
    const h = home(1);
    setup(h);
    if (h.pcs[0].config.mode === 'static' && h.pcs[0].config.ip === '192.168.1.1') h.pcs[0].config.dns = '';
    codes.push(Sim.resolve(h.T(), h.pcs[0].id, 'www.example.com').fail.code);
  }
  assert.deepEqual(codes, ['nolink', 'noip', 'conflict', 'apipa']);
});

test('a router uses its WAN DNS servers', () => {
  const h = home(0), T = h.T();
  assert.deepEqual(Sim.dnsServersOf(T, h.r.id).map(IP.str), ['8.8.8.8']);
});

// ---------- Rules: parsing and matching details ----------

test('VLAN lists: the limits are 1 and 4094', () => {
  assert.deepEqual(Sim.parseVlans('1'), [1]);
  assert.deepEqual(Sim.parseVlans('4094'), [4094]);
  assert.deepEqual(Sim.parseVlans(' 10 , 20 '), [10, 20]);
  assert.equal(Sim.parseVlans('ALL'), null);
  assert.equal(Sim.parseVlans(''), null);
  assert.equal(Sim.parseVlans(undefined), null);
  for (const bad of ['4095', '0-3', '10x', 'x10', '1-4095']) assert.equal(Sim.parseVlans(bad), undefined, bad);
  assert.equal(Sim.parseVlans('1-4094').length, 4094);
});

test('rule ranges: case, spaces, wildcards and anchors', () => {
  assert.equal(Sim.parseRange('ANY').any, true);
  assert.equal(Sim.parseRange(' * ').any, true);
  assert.equal(IP.prefix(Sim.parseRange(' 10.0.0.0/8 ').mask), 8);
  for (const bad of ['x10.0.0.0/8', '10.0.0.0/8x', '10.0.0.0/', '/8', '']) assert.equal(Sim.parseRange(bad), null, JSON.stringify(bad));
  assert.equal(Sim.parseRange('10.0.0.0/0').mask, 0);
});

test('rule text shows a port only for TCP and UDP rules that have one', () => {
  assert.equal(Sim.ruleText(rule('permit', 'any', 'any', 'udp', '53')), 'permit any → any UDP 53');
  assert.equal(Sim.ruleText(rule('permit', 'any', 'any', 'tcp', '')), 'permit any → any TCP');
  assert.equal(Sim.ruleText(rule('permit', 'any', 'any', 'any', '80')), 'permit any → any any');
});

test('rule matching: ports are ignored for "any" and ICMP rules', () => {
  const ping = { src: P('10.0.0.1'), dst: P('10.0.0.2'), proto: 'icmp' };
  assert.equal(Sim.checkAcl([rule('permit', 'any', 'any', 'icmp', '7')], ping).allow, true);
  assert.equal(Sim.checkAcl([rule('permit', 'any', 'any', 'any', '7')], { ...ping, proto: 'tcp', port: 80 }).allow, true);
  const miss = Sim.checkAcl([rule('permit', 'any', 'any', 'tcp', '80')], { ...ping, proto: 'udp', port: 53 }).misses[0].why;
  assert.equal(miss, 'it is for TCP and this packet is UDP');
  const portMiss = Sim.checkAcl([rule('permit', 'any', 'any', 'tcp', '80')], { ...ping, proto: 'tcp', port: 81 }).misses[0].why;
  assert.equal(portMiss, 'it is for port 80 and this packet is for port 81');
});

test('a deny hiding a specific permit is reported; the final catch-all permit isn’t', () => {
  const pkt = { src: P('10.0.0.1'), dst: P('10.0.0.2'), proto: 'tcp', port: 80 };
  const a = Sim.checkAcl([rule('deny', 'any', '10.0.0.2'), rule('permit', 'any', 'any'), rule('permit', '10.0.0.1', '10.0.0.2')], pkt);
  assert.equal(a.shadowed.index, 2);
  assert.equal(Sim.checkAcl([rule('deny', 'any', '10.0.0.2'), rule('permit', 'any', 'any')], pkt).shadowed, undefined);
  assert.equal(Sim.checkAcl([rule('deny', 'any', '10.0.0.2'), rule('deny', '10.0.0.1', 'any')], pkt).shadowed, undefined, 'a deny below doesn’t count');
  assert.equal(Sim.checkAcl([rule('permit', '10.0.0.0/24', 'any'), rule('permit', '10.0.0.1', 'any')], pkt).shadowed, undefined, 'only after a deny');
});

test('unreachable rules: what counts as covering', () => {
  const lint = rules => Sim.aclLint(rules).map(x => [x.index, x.by, x.same]);
  assert.deepEqual(lint([rule('permit', '10.0.0.0/8', 'any'), rule('deny', '10.1.0.0/16', 'any')]), [[1, 0, false]]);
  assert.deepEqual(lint([rule('permit', '10.1.0.0/16', 'any'), rule('deny', '10.0.0.0/8', 'any')]), [], 'a narrower rule doesn’t cover a wider one');
  assert.deepEqual(lint([rule('permit', 'any', '10.0.0.0/24'), rule('permit', 'any', '10.0.1.5')]), [], 'different networks');
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'tcp'), rule('permit', 'any', 'any', 'tcp', '80')]), [[1, 0, true]], 'all TCP covers TCP 80');
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'udp', '53'), rule('permit', 'any', 'any', 'udp', '53')]), [[1, 0, true]]);
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'tcp', '80'), rule('permit', 'any', 'any', 'tcp')]), [], 'TCP 80 doesn’t cover all TCP');
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'tcp', '53'), rule('permit', 'any', 'any', 'udp', '53')]), [], 'same port, other protocol');
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'icmp'), rule('permit', 'any', 'any', 'tcp')]), []);
  assert.deepEqual(lint([rule('permit', 'nonsense', 'any'), rule('permit', 'any', 'any')]), []);
});

test('rules apply where traffic crosses the router, and not to replies or the router’s own traffic', () => {
  const o = office({ acl: [rule('deny', 'any', 'any', 'udp', '53')] });
  const T = o.T();
  assert.equal(Sim.transact(T, o.pc.id, P('10.0.2.53')).ok, false, 'the built-in deny blocks the ping');
  assert.equal(Sim.transact(T, o.r.id, P('10.0.2.53')).ok, true, 'the router’s own traffic isn’t filtered');
  o.r.config.acl = [rule('permit', '10.0.1.0/24', 'any')];
  assert.equal(Sim.transact(o.T(), o.pc.id, P('10.0.2.53')).ok, true, 'the reply from 10.0.2.53 gets back without a rule');
});

test('NAT keeps two outgoing connections apart', () => {
  const h = home(2), T = h.T();
  const a = Sim.transact(T, h.pcs[0].id, P('8.8.8.8')), b = Sim.transact(T, h.pcs[1].id, P('8.8.8.8'));
  assert.equal(a.rep.dev, h.pcs[0].id);
  assert.equal(b.rep.dev, h.pcs[1].id);
});

test('a customer visit uses the router connected to the Internet, not another device’s WAN-like port', () => {
  const h = home(0);
  const lap = Model.add(h.net, 'vmhost', 0, 0);
  Model.connect(h.net, h.sw, 'P2', lap, 'eth0');
  const T = h.T();
  assert.equal(IP.str(Sim.externalVisit(T).wanIp), '203.0.113.42');
  assert.equal(Sim.externalVisit(Sim.build(Model.create())).noWan, true, 'no Internet cloud at all');
});

// ---------- The "Why?" catalogue ----------

test('every "Why?" explanation, word for word', t => {
  const lines = [];
  const add = (label, T, f, stage) => lines.push(`${label}\n  ${Sim.explain(T, f, stage)}`);
  const tx = (h, from, dst, proto, port) => { const T = h.T(); const x = Sim.transact(T, from.id, P(dst), proto, port); return [T, x.fail, x.stage]; };
  let h = home(1);
  h.net.links = h.net.links.filter(l => l.b.dev !== h.pcs[0].id);
  add('unplugged', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); h.pcs[0].config.mode = 'none'; add('not configured', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(2); statik(h.pcs[0], '192.168.1.100'); add('address conflict', ...tx(h, h.pcs[1], '8.8.8.8'));
  h = home(1, { ifaces: { LAN: { dhcp: { enabled: false } } } }); add('no DHCP answer', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); statik(h.pcs[0], '192.168.1.9'); add('no gateway', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); statik(h.pcs[0], '192.168.1.9', '10.0.0.1'); add('gateway on another network', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); statik(h.pcs[0], '192.168.1.9', '192.168.1.254'); add('gateway that doesn’t exist', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); add('local address nobody has', ...tx(h, h.pcs[0], '192.168.1.77'));
  h = home(1); add('Internet: unknown public address', ...tx(h, h.pcs[0], '9.9.9.9'));
  h = home(1); add('Internet: private address', ...tx(h, h.pcs[0], '10.1.2.3'));
  h = home(1); h.r.config.nat = false; add('NAT off', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); h.net.links = h.net.links.filter(l => l.a.port !== 'ISP'); add('router without Internet', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1); add('web server that isn’t one', ...tx(h, h.pcs[0], '8.8.8.8', 'tcp', 80));
  h = home(1); add('Internet host refusing a port', ...tx(h, h.pcs[0], '8.8.8.8', 'tcp', 25));
  h = home(1); add('not a DNS server (Internet)', ...tx(h, h.pcs[0], '93.184.216.34', 'udp', 53));
  let o = office(); add('not a DNS server (computer)', ...tx(o, o.pc, '10.0.2.1', 'udp', 53).slice(0, 1), { code: 'refused', dev: o.pc.id, port: 53, pkt: { proto: 'udp', dst: P('10.0.1.100') } });
  o = office(); add('router without a DNS service', ...tx(o, o.pc, '10.0.1.1', 'udp', 53));
  o = office(); add('router without a port forward', ...tx(o, o.pc, '10.0.1.1', 'tcp', 80));
  o = office(); add('service not running', ...tx(o, o.pc, '10.0.2.53', 'tcp', 80));
  o = office(); o.srv.config.services = {}; add('service not running, nothing listening', ...tx(o, o.pc, '10.0.2.53', 'tcp', 445));
  o = office(); o.srv.config.services.ssh = true; o.srv.config.sshAllow = '10.0.2.0/24'; add('SSH host firewall', ...tx(o, o.pc, '10.0.2.53', 'tcp', 22));
  o = office({ acl: [rule('deny', 'any', '10.0.2.0/24'), rule('permit', 'any', '10.0.2.53', 'tcp', '445')] }); add('rule hides a permit', ...tx(o, o.pc, '10.0.2.53', 'tcp', 445));
  o = office({ acl: [rule('permit', '10.0.9.0/24', '10.0.2.53', 'tcp', '445'), rule('permit', 'any', '10.0.2.53', 'tcp', '80'), rule('permit', 'any', '10.0.2.53', 'icmp')] });
  add('no rule matches (two near misses)', ...tx(o, o.pc, '10.0.2.53', 'tcp', 445));
  o = office({ acl: [rule('permit', 'any', '10.0.2.53', 'tcp', '445')] });
  add('no rule matches (ping)', ...tx(o, o.pc, '10.0.2.53'));
  // Names.
  const why = (label, g, fn) => { const T = g.T(); const r = fn(T); add(label, T, r.fail, r.stage); };
  o = office(); o.pc.config.mode = 'static'; Object.assign(o.pc.config, { ip: '10.0.1.9', mask: '24', gw: '10.0.1.1', dns: '' });
  why('no DNS server set', o, T => Sim.resolve(T, o.pc.id, 'files.office'));
  o = office(); why('internal name missing', o, T => Sim.resolve(T, o.pc.id, 'nope.office'));
  o = office(); o.r.config.ifaces['Gi0/1'].dhcp.dns = '8.8.8.8'; why('internal name asked of public DNS', o, T => Sim.resolve(T, o.pc.id, 'files.office'));
  h = home(1); why('public name missing', h, T => Sim.resolve(T, h.pcs[0].id, 'nothing.example'));
  o = office({ acl: [rule('permit', 'any', 'any', 'tcp', '445')] }); why('DNS blocked by a rule', o, T => Sim.resolve(T, o.pc.id, 'files.office'));
  o = office(); o.srv.config.services.dns = false; why('DNS server not running', o, T => Sim.resolve(T, o.pc.id, 'files.office'));
  h = home(1); h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '203.0.113.1', dns: '' };
  why('router relay with no DNS of its own', h, T => Sim.resolve(T, h.pcs[0].id, 'www.example.com'));
  // Virtual machines and the rest.
  h = home(0);
  const lap = Model.add(h.net, 'vmhost', 0, 0, { name: 'Laptop' }), vm = Model.add(h.net, 'vm', 0, 0, { name: 'VM' });
  Model.connect(h.net, h.sw, 'P2', lap, 'eth0'); Model.connect(h.net, lap, 'ho1', vm, 'eth0');
  add('host-only network', ...tx(h, vm, '8.8.8.8'));
  h = home(2); const T0 = h.T(); statik(h.pcs[0], '192.168.1.50', IP.str(iface(T0, h.pcs[1]).ip)); add('a PC used as a router', ...tx(h, h.pcs[0], '8.8.8.8'));
  h = home(1);
  const web = Model.add(h.net, 'server', 0, 0, { name: 'Web', hostMode: 'static', config: { ip: '192.168.1.80', mask: '255.255.255.0', services: { web: true } } });
  Model.connect(h.net, h.sw, 'P8', web, 'eth0');
  h.r.config.portForwards.push({ proto: 'tcp', port: '80', ip: '192.168.1.80', toPort: '80' });
  const Tv = h.T(), v = Sim.externalVisit(Tv);
  add('reply can’t get back (server without a gateway)', Tv, v.fail, v.stage);
  add('loop', Tv, { code: 'ttl', dev: web.id });
  add('reply to the wrong place', Tv, { code: 'misdelivered', dev: web.id });
  add('unknown device', Tv, { code: 'nodns', dev: 'nobody' });
  t.assert.snapshot(`\n${lines.join('\n')}\n`, { serializers: [v => v] });
});

// The network simulation (js/sim.js): addressing, forwarding, services, rules, VLANs and the "Why?" explanations.
// Each test builds a small network from scratch, so it is clear what is being tested.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, Sim, IP, P, rule } = require('../load');

// A tiny network builder: home(n) gives Internet + home router + n PCs on DHCP behind a switch.
function home(n = 1, routerCfg) {
  const net = Model.create();
  const inet = Model.add(net, 'internet', 0, 0);
  const r = Model.add(net, 'homerouter', 0, 0, routerCfg ? { config: routerCfg } : {});
  const sw = Model.add(net, 'switch', 0, 0);
  Model.connect(net, inet, 'ISP', r, 'WAN');
  Model.connect(net, r, 'LAN1', sw, 'P1');
  const pcs = Array.from({ length: n }, (_, k) => { const d = Model.add(net, 'pc', 0, 0); Model.connect(net, sw, 'P' + (k + 2), d, 'eth0'); return d; });
  return { net, inet, r, sw, pcs, T: () => Sim.build(net) };
}
const iface = (T, d) => T.byDev[d.id][0];
const why = (T, x) => Sim.explain(T, x.fail, x.stage);
const statik = (d, ip, gw = '192.168.1.1', dns = '8.8.8.8', mask = '255.255.255.0') => Object.assign(d.config, { mode: 'static', ip, mask, gw, dns });

// ---------- Addressing ----------

test('DHCP gives an address, mask, gateway and DNS from the pool, and keeps it between rebuilds', () => {
  const h = home(2);
  let T = h.T();
  const i = iface(T, h.pcs[0]);
  assert.equal(i.source, 'dhcp');
  assert.equal(IP.str(i.ip), '192.168.1.100');
  assert.equal(IP.str(i.gw), '192.168.1.1');
  assert.equal(IP.str(i.dns[0]), '192.168.1.1');
  assert.equal(IP.str(iface(T, h.pcs[1]).ip), '192.168.1.101');
  T = h.T();
  assert.equal(IP.str(iface(T, h.pcs[1]).ip), '192.168.1.101', 'leases are remembered');
  assert.ok(T.events.length === 0, 'no new DHCP events when nothing changed');
});

test('no DHCP server means a self-assigned 169.254 address', () => {
  const h = home(1, { ifaces: { LAN: { dhcp: { enabled: false } } } });
  const T = h.T(), i = iface(T, h.pcs[0]);
  assert.equal(i.source, 'apipa');
  assert.ok(IP.isApipa(i.ip));
  const x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.match(why(T, x), /self-assigned 169\.254/);
});

test('a full DHCP pool leaves later clients self-assigned', () => {
  const h = home(2, { ifaces: { LAN: { dhcp: { start: '192.168.1.100', end: '192.168.1.100' } } } });
  const T = h.T();
  assert.equal(iface(T, h.pcs[1]).source, 'apipa');
  assert.equal(iface(T, h.pcs[1]).poolFull, true);
});

test('DHCP server settings are checked, with a reason when they’re wrong', () => {
  const reason = dhcp => {
    const h = home(0, { ifaces: { LAN: { dhcp } } });
    return h.T().byDev[h.r.id].find(i => i.name === 'LAN').dhcpServer.reason;
  };
  assert.match(reason({ start: 'x', end: '192.168.1.5' }), /not valid/);
  assert.match(reason({ start: '192.168.1.9', end: '192.168.1.5' }), /starts after it ends/);
  assert.match(reason({ start: '10.0.0.1', end: '10.0.0.5' }), /not inside/);
  assert.match(reason({ start: '192.168.1.0', end: '192.168.1.5' }), /network or broadcast/);
  assert.match(reason({ dns: 'nope' }), /DNS server address is not valid/);
  const h = home(0, { ifaces: { LAN: { ip: '', mask: '' } } });
  assert.match(h.T().byDev[h.r.id][1].dhcpServer.reason, /no IP address/);
});

test('static settings are validated', () => {
  const errs = cfg => { const h = home(1); Object.assign(h.pcs[0].config, { mode: 'static' }, cfg); return iface(h.T(), h.pcs[0]).errors.join(' | '); };
  assert.match(errs({ ip: '', mask: '' }), /No IP address entered.*Subnet mask "" is not valid|No IP address entered/);
  assert.match(errs({ ip: '300.1.1.1', mask: '24' }), /not valid/);
  assert.match(errs({ ip: '192.168.1.0', mask: '24' }), /network or broadcast/);
  assert.match(errs({ ip: '192.168.1.5', mask: '24', gw: 'x' }), /Default gateway is not a valid/);
  assert.match(errs({ ip: '192.168.1.5', mask: '24', dns: 'x' }), /DNS server is not a valid/);
  assert.match(errs({ ip: '192.168.1.5', mask: 'abc' }), /Subnet mask "abc" is not valid/);
});

test('an address used twice is a conflict: the router wins, then the older device', () => {
  const h = home(2);
  statik(h.pcs[0], '192.168.1.1');
  statik(h.pcs[1], '192.168.1.50');
  let T = h.T();
  assert.ok(iface(T, h.pcs[0]).conflict, 'a PC can’t take the router’s address');
  statik(h.pcs[0], '192.168.1.50');
  T = h.T();
  assert.ok(iface(T, h.pcs[1]).conflict);
  const x = Sim.transact(T, h.pcs[1].id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'conflict');
  assert.match(why(T, x), /already has that address/);
});

// ---------- Forwarding and failures ----------

test('a working path: ping the Internet through NAT', () => {
  const h = home(1), T = h.T();
  const x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.equal(x.ok, true);
  assert.equal(IP.str(x.req.pkt.src), '203.0.113.42', 'NAT replaced the private source address');
});

test('local failures and their explanations', () => {
  const cases = [
    [h => { h.net.links = h.net.links.filter(l => l.b.dev !== h.pcs[0].id); }, 'nolink', /no network cable/],
    [h => { h.pcs[0].config.mode = 'none'; }, 'noip', /has no IP address/],
    [h => statik(h.pcs[0], '192.168.1.50', ''), 'nogw', /no default gateway/],
    [h => statik(h.pcs[0], '192.168.1.50', '10.0.0.1'), 'gwoff', /not inside its own network/],
    [h => statik(h.pcs[0], '192.168.1.50', '192.168.1.254'), 'arp', /gateway 192\.168\.1\.254, but nothing/],
  ];
  for (const [setup, code, msg] of cases) {
    const h = home(1);
    setup(h);
    const T = h.T(), x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
    assert.equal(x.fail.code, code);
    assert.match(why(T, x), msg);
  }
});

test('a local address that nobody has', () => {
  const h = home(1), T = h.T();
  const x = Sim.transact(T, h.pcs[0].id, P('192.168.1.77'));
  assert.equal(x.fail.code, 'arp');
  assert.match(why(T, x), /looked for 192\.168\.1\.77 on its local network/);
});

test('a PC used as a gateway drops the packet: it isn’t a router', () => {
  const h = home(2), T0 = h.T();
  statik(h.pcs[0], '192.168.1.50', IP.str(iface(T0, h.pcs[1]).ip));
  const T = h.T(), x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'notrouter');
  assert.match(why(T, x), /isn't a router/);
});

test('the Internet: unknown hosts, private addresses, and missing NAT', () => {
  const h = home(1);
  let T = h.T();
  assert.match(why(T, Sim.transact(T, h.pcs[0].id, P('9.9.9.9'))), /Nothing on the Internet answered/);
  assert.match(why(T, Sim.transact(T, h.pcs[0].id, P('10.5.5.5'))), /Does the router have an interface/);
  h.r.config.nat = false;
  T = h.T();
  const x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'privsrc');
  assert.match(why(T, x), /must translate them \(NAT\)/);
});

test('a router with no working WAN has no route out', () => {
  const h = home(1);
  h.net.links = h.net.links.filter(l => l.a.port !== 'ISP');
  const T = h.T(), x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'noroute');
  assert.match(why(T, x), /WAN \(Internet\) port has no working address/);
  assert.match(Sim.explain(T, Object.assign({}, x.fail, { iface: { up: true, ip: 1, mask: 0 } })), /has no route to 8\.8\.8\.8\.$/);
});

test('explanations for the rare cases', () => {
  const h = home(1), T = h.T();
  assert.equal(Sim.explain(T, null), '');
  assert.match(Sim.explain(T, { code: 'ttl' }), /loop/);
  assert.match(Sim.explain(T, { code: 'misdelivered' }), /somewhere unexpected/);
  assert.match(Sim.explain(T, { code: 'ttl' }, 'reply'), /^The request arrived, but the reply could not get back/);
});

// ---------- DNS ----------

test('names: literal addresses, router relay, public DNS, and missing names', () => {
  const h = home(1), T = h.T(), pc = h.pcs[0].id;
  assert.equal(Sim.resolve(T, pc, '1.2.3.4').ip, P('1.2.3.4'));
  const r = Sim.resolve(T, pc, 'www.example.com.');
  assert.equal(IP.str(r.ip), '93.184.216.34');
  assert.equal(r.steps.length, 2, 'the PC asks the router, the router asks 8.8.8.8');
  const nx = Sim.resolve(T, pc, 'nothing.example');
  assert.equal(nx.fail.code, 'nxdomain');
  assert.match(Sim.explain(T, nx.fail), /try www\.example\.com/);
});

test('names fail clearly: no DNS server, unreachable DNS, a basic fault first', () => {
  const h = home(1);
  statik(h.pcs[0], '192.168.1.50', '192.168.1.1', '');
  let T = h.T();
  const none = Sim.resolve(T, h.pcs[0].id, 'www.example.com');
  assert.match(Sim.explain(T, none.fail), /no DNS server set/);
  statik(h.pcs[0], '192.168.1.50', '192.168.1.1', '192.168.1.53');
  T = h.T();
  const dead = Sim.resolve(T, h.pcs[0].id, 'www.example.com');
  assert.match(Sim.explain(T, dead.fail), /couldn't get an answer from its DNS server 192\.168\.1\.53/);
  h.pcs[0].config.mode = 'none';
  T = h.T();
  assert.equal(Sim.resolve(T, h.pcs[0].id, 'www.example.com').fail.code, 'noip', 'report the basic fault, not DNS');
});

test('a router relaying DNS reports its own upstream failure', () => {
  const h = home(1);
  h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '203.0.113.1', dns: '' };
  const T = h.T(), r = Sim.resolve(T, h.pcs[0].id, 'www.example.com');
  assert.equal(r.fail.code, 'upstream');
  assert.match(Sim.explain(T, r.fail), /relays DNS questions to its own DNS server, but that failed/);
});

test('asking something that isn’t a DNS server', () => {
  const h = home(1);
  statik(h.pcs[0], '192.168.1.50', '192.168.1.1', '93.184.216.34');
  let T = h.T();
  assert.match(Sim.explain(T, Sim.resolve(T, h.pcs[0].id, 'x.com').fail), /is not a DNS server/);
  statik(h.pcs[0], '192.168.1.50', '192.168.1.1', '192.168.1.1');
  h.r.config.dnsProxy = false;
  T = h.T();
  assert.match(Sim.explain(T, Sim.resolve(T, h.pcs[0].id, 'x.com').fail), /doesn't run a DNS service/);
});

// ---------- Services, sharing and ports ----------

function office() {
  // Two networks on an office router: a PC on Gi0/1 and a server on Gi0/2 that runs DNS with local records.
  const net = Model.create();
  const inet = Model.add(net, 'internet', 0, 0);
  const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: {
    'Gi0/1': { ip: '10.0.1.1', mask: '255.255.255.0', dhcp: { enabled: true, start: '10.0.1.100', end: '10.0.1.150', dns: '10.0.2.53' } },
    'Gi0/2': { ip: '10.0.2.1', mask: '255.255.255.0' } } } });
  const pc = Model.add(net, 'pc', 0, 0);
  const srv = Model.add(net, 'server', 0, 0, { hostMode: 'static', config: {
    ip: '10.0.2.53', mask: '255.255.255.0', gw: '10.0.2.1', dns: '8.8.8.8',
    services: { dns: true, files: true }, dnsRecords: [{ name: 'files.office', ip: '10.0.2.53' }] } });
  Model.connect(net, inet, 'ISP', r, 'Gi0/0');
  Model.connect(net, r, 'Gi0/1', pc, 'eth0');
  Model.connect(net, r, 'Gi0/2', srv, 'eth0');
  return { net, r, pc, srv, T: () => Sim.build(net) };
}

test('an internal DNS server answers its own records and forwards the rest', () => {
  const o = office(), T = o.T();
  assert.equal(IP.str(Sim.resolve(T, o.pc.id, 'files.office').ip), '10.0.2.53');
  assert.equal(Sim.resolve(T, o.pc.id, 'www.example.com').ok, true);
  const nx = Sim.resolve(T, o.pc.id, 'missing.office');
  assert.match(Sim.explain(T, nx.fail), /adds them to the internal DNS server/);
});

test('a public DNS server never knows internal names', () => {
  const o = office();
  o.r.config.ifaces['Gi0/1'].dhcp.dns = '8.8.8.8';
  const T = o.T(), nx = Sim.resolve(T, o.pc.id, 'files.office');
  assert.match(Sim.explain(T, nx.fail), /8\.8\.8\.8 is a public DNS server/);
});

test('file shares, port tests and closed ports', () => {
  const o = office(), T = o.T();
  assert.equal(Sim.shareHost('\\\\Files.Office\\Shared'), 'files.office');
  assert.equal(Sim.openShare(T, o.pc.id, '\\\\files.office').ok, true);
  assert.equal(Sim.openShare(T, o.pc.id, '\\\\nope.office').stage, 'dns');
  const closed = Sim.testPort(T, o.pc.id, 'files.office', 80);
  assert.equal(closed.closed, true);
  assert.match(why(T, closed), /nothing is listening on TCP port 80: its web server service isn't running\. It is listening on port 445/);
  const other = Sim.testPort(T, o.pc.id, '10.0.2.53', 8080);
  assert.match(why(T, other), /nothing is listening on TCP port 8080\./);
  assert.equal(Sim.testPort(T, o.pc.id, '10.0.2.53', 53).proto, 'udp');
  assert.equal(Sim.testPort(T, o.pc.id, 'nope.office', 445).stage, 'dns');
  assert.deepEqual(Sim.listening(o.srv).map(s => s.port), [445, 53]);
});

test('web servers on the Internet and on the LAN', () => {
  const h = home(1), T = h.T(), pc = h.pcs[0].id;
  assert.equal(Sim.browse(T, pc, 'http://www.example.com/page').ok, true);
  assert.match(why(T, Sim.browse(T, pc, '8.8.8.8')), /8\.8\.8\.8 is not a DNS server|Nothing at 8\.8\.8\.8 is running a web server/);
  assert.match(why(T, Sim.testPort(T, pc, '8.8.8.8', 25)), /refused the connection on port 25/);
  assert.equal(Sim.browse(T, pc, 'nothing.example').stage, 'dns');
});

test('port forwarding: customers reach a server inside, which needs a gateway for the reply', () => {
  const h = home(1);
  let T = h.T();
  assert.match(why(T, Sim.externalVisit(T)), /no port-forwarding rule/);
  const web = Model.add(h.net, 'server', 0, 0, { hostMode: 'static', config: { ip: '192.168.1.80', mask: '255.255.255.0', gw: '', services: { web: true } } });
  Model.connect(h.net, h.sw, 'P8', web, 'eth0');
  h.r.config.portForwards.push({ proto: 'tcp', port: '80', ip: '192.168.1.80', toPort: '80' });
  T = h.T();
  const noGw = Sim.externalVisit(T);
  assert.equal(noGw.stage, 'reply');
  web.config.gw = '192.168.1.1';
  T = h.T();
  assert.equal(Sim.externalVisit(T).ok, true);
  h.net.links = h.net.links.filter(l => l.a.port !== 'ISP');
  assert.equal(Sim.externalVisit(h.T()).noWan, true);
});

test('SSH: servers can limit who may log in, even inside one subnet', () => {
  const o = office();
  o.srv.config.services.ssh = true;
  let T = o.T();
  assert.equal(Sim.testPort(T, o.pc.id, '10.0.2.53', 22).ok, true);
  o.srv.config.sshAllow = '10.0.9.0/24';
  T = o.T();
  const x = Sim.testPort(T, o.pc.id, '10.0.2.53', 22);
  assert.equal(x.fail.code, 'hostfw');
  assert.match(why(T, x), /only accept logins from 10\.0\.9\.0\/24/);
  assert.equal(Sim.sshAllowed(o.srv, P('10.0.9.4')), true);
  o.srv.config.sshAllow = 'rubbish';
  assert.equal(Sim.sshAllowed(o.srv, P('10.0.9.4')), false, 'an invalid setting lets nobody in');
});

// ---------- Access rules ----------

test('rule ranges and text', () => {
  assert.deepEqual(Sim.parseRange('any'), { net: 0, mask: 0, any: true });
  assert.equal(Sim.parseRange('10.1.20.5/24').aligned, false);
  assert.equal(Sim.parseRange('10.1.20.0/24').aligned, true);
  assert.equal(IP.prefix(Sim.parseRange('10.1.99.30').mask), 32);
  for (const bad of ['nope', '10.1.1.1/40', '999.1.1.1']) assert.equal(Sim.parseRange(bad), null, bad);
  assert.equal(Sim.ruleText(rule('permit', 'any', '10.0.0.5', 'tcp', '445')), 'permit any → 10.0.0.5 TCP 445');
  assert.equal(Sim.ruleText(rule('deny', 'any', 'any', 'icmp', '7')), 'deny any → any ICMP');
  assert.equal(Sim.ruleText(rule('deny', 'any', 'any')), 'deny any → any any');
});

test('rules: first match wins, with a built-in deny at the end', () => {
  const pkt = { src: P('10.1.10.5'), dst: P('10.1.99.30'), proto: 'tcp', port: 445 };
  const a = Sim.checkAcl([rule('deny', 'any', '10.1.99.30'), rule('permit', '10.1.10.0/24', '10.1.99.30', 'tcp', '445')], pkt);
  assert.equal(a.allow, false);
  assert.equal(a.index, 0);
  assert.equal(a.shadowed.index, 1, 'the permit below would have matched');
  assert.equal(Sim.checkAcl([rule('permit', '10.1.10.0/24', 'any', 'tcp', '445')], pkt).allow, true);
  const none = Sim.checkAcl([rule('permit', 'any', 'any', 'udp', '53')], pkt);
  assert.equal(none.index, -1);
  assert.match(none.misses[0].why, /it is for UDP/);
  assert.match(Sim.checkAcl([rule('permit', 'any', 'any', 'tcp', '80')], pkt).misses[0].why, /it is for port 80/);
});

test('rules that can never match are found', () => {
  const lint = Sim.aclLint([
    rule('deny', '10.1.0.0/16', 'any'),
    rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'),
    rule('permit', 'any', 'any', 'tcp', '80'),
    rule('permit', 'any', '10.0.0.1', 'tcp', '80'),
    rule('permit', 'any', '10.0.0.1', 'udp', '80'),
  ]);
  assert.deepEqual(lint.map(x => [x.index, x.by]), [[1, 0], [3, 2]]);
});

test('rules on the router: blocked packets, explanations, replies get back', () => {
  const o = office();
  o.r.config.acl = [rule('deny', '10.0.1.0/24', '10.0.2.53', 'tcp', '445'), rule('permit', 'any', 'any')];
  let T = o.T();
  const x = Sim.openShare(T, o.pc.id, '\\\\files.office');
  assert.equal(x.fail.code, 'acl');
  assert.match(why(T, x), /Rule 1 “deny 10\.0\.1\.0\/24 → 10\.0\.2\.53 TCP 445” matched it\./);
  assert.equal(Sim.resolve(T, o.pc.id, 'files.office').ok, true, 'DNS still allowed, and its reply returns');
  o.r.config.acl = [rule('deny', 'any', '10.0.2.0/24'), rule('permit', 'any', '10.0.2.53', 'udp', '53')];
  T = o.T();
  const dns = Sim.resolve(T, o.pc.id, 'files.office');
  const msg = Sim.explain(T, dns.fail);
  assert.match(msg, /Rule 2 “permit any → 10\.0\.2\.53 UDP 53” would have allowed it, but rule 1 comes first/);
  assert.match(msg, /Every name has to be looked up in DNS before anything else happens/);
  o.r.config.acl = [rule('permit', 'any', '10.0.2.53', 'tcp', '80')];
  T = o.T();
  const ping = Sim.transact(T, o.pc.id, P('10.0.2.53'));
  assert.match(why(T, ping), /ICMP \(ping\) from .* No rule matched, so the built-in “deny everything else”.*Rule 1 .* didn't apply because it is for TCP/);
});

// ---------- VLANs ----------

test('VLAN lists and port settings', () => {
  assert.equal(Sim.parseVlans('all'), null);
  assert.deepEqual(Sim.parseVlans('10, 20-22'), [10, 20, 21, 22]);
  for (const bad of ['x', '0', '5000', '9-3']) assert.equal(Sim.parseVlans(bad), undefined, bad);
  const sw = { config: { ports: { P1: { mode: 'access', vlan: 10 }, P2: { mode: 'trunk', allowed: '10,20' } } } };
  assert.deepEqual(Sim.portVlan(sw, 'P1'), { trunk: false, untagged: 10 });
  assert.deepEqual(Sim.portVlan(sw, 'P2'), { trunk: true, untagged: 1, allowed: [10, 20] });
  assert.deepEqual(Sim.portVlan(sw, 'P3'), { trunk: false, untagged: 1 });
});

test('VLANs split one switch, and trunks carry only the VLANs both ends allow', () => {
  const net = Model.create();
  const s1 = Model.add(net, 'mswitch', 0, 0), s2 = Model.add(net, 'mswitch', 0, 0);
  const pc = n => Model.add(net, 'pc', 0, 0, { hostMode: 'static', config: { ip: '10.0.0.' + n, mask: '255.255.255.0' } });
  const a = pc(1), b = pc(2), c = pc(3);
  Model.connect(net, s1, 'P1', a, 'eth0');
  Model.connect(net, s1, 'P2', b, 'eth0');
  Model.connect(net, s1, 'P8', s2, 'P8');
  Model.connect(net, s2, 'P1', c, 'eth0');
  const reach = (x, y) => Sim.transact(Sim.build(net), x.id, P('10.0.0.' + y)).ok;
  assert.equal(reach(a, 3), true, 'all in VLAN 1 to start with');
  s1.config.ports = { P1: { mode: 'access', vlan: 10 }, P8: { mode: 'trunk', allowed: '10' } };
  s2.config.ports = { P1: { mode: 'access', vlan: 10 }, P8: { mode: 'trunk', allowed: '20' } };
  assert.equal(reach(a, 2), false, 'different VLANs on one switch');
  assert.equal(reach(a, 3), false, 'the trunks don’t agree on VLAN 10');
  s2.config.ports.P8.allowed = null;
  assert.equal(reach(a, 3), true, 'now both ends carry VLAN 10');
  const T = Sim.build(net);
  assert.ok(Sim.l2path(T, iface(T, a), iface(T, c)).length >= 3);
});

// ---------- Virtual machines ----------

test('a VM host: NAT VMs get out, host-only VMs never leave the laptop', () => {
  const h = home(0);
  const lap = Model.add(h.net, 'vmhost', 0, 0), nat = Model.add(h.net, 'vm', 0, 0), iso = Model.add(h.net, 'vm', 0, 0);
  Model.connect(h.net, h.sw, 'P2', lap, 'eth0');
  Model.connect(h.net, lap, 'nat1', nat, 'eth0');
  Model.connect(h.net, lap, 'ho1', iso, 'eth0');
  const T = h.T();
  assert.equal(IP.str(iface(T, nat).ip), '10.0.2.15');
  assert.equal(Sim.transact(T, nat.id, P('8.8.8.8')).ok, true);
  const x = Sim.transact(T, iso.id, P('8.8.8.8'));
  assert.equal(x.fail.code, 'hostonly');
  assert.match(why(T, x), /host-only network \(192\.168\.56\.0\/24\) is private/);
  assert.equal(Sim.transact(T, lap.id, iface(T, iso).ip).ok, true, 'the laptop itself can reach it');
});

// Edge cases in the simulation that mutation testing showed weren't pinned down.
// Each test is named for the situation it covers, so a failure says what broke.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, Sim, IP, P, rule } = require('../load');

const iface = (T, d) => T.byDev[d.id][0];
const statik = (d, ip, gw = '', dns = '', mask = '255.255.255.0') => Object.assign(d.config, { mode: 'static', ip, mask, gw, dns });

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

// ---------- Building the network ----------

test('a switch has no IP interfaces; the topology lists each interface once', () => {
  const h = home(2), T = h.T();
  assert.deepEqual(T.byDev[h.sw.id], []);
  assert.deepEqual(T.ifaces.map(i => `${T.devs[i.dev].name}/${i.name}`), ['Internet1/ISP', 'Router1/WAN', 'Router1/LAN', 'PC1/eth0', 'PC2/eth0']);
});

test('a cable to a port the device doesn’t have is ignored', () => {
  const h = home(1);
  Model.connect(h.net, h.pcs[0], 'eth9', h.sw, 'P7');
  Model.connect(h.net, h.sw, 'P8', h.pcs[0], 'nope');
  const T = h.T();
  assert.equal(T.linked[`${h.sw.id}:P7`], undefined);
  assert.equal(T.linked[`${h.sw.id}:P8`], undefined);
  assert.equal(iface(T, h.pcs[0]).source, 'dhcp', 'the real cable still works');
});

test('the Internet’s own interface: a fixed address and the ISP’s DHCP server', () => {
  const h = home(0), i = h.T().byDev[h.inet.id][0];
  assert.deepEqual([IP.str(i.ip), i.source, i.dhcpServer.valid, i.dhcpServer.isp], ['203.0.113.1', 'static', true, true]);
});

test('static settings that are incomplete give no address at all', () => {
  const h = home(2);
  Object.assign(h.pcs[0].config, { mode: 'static', ip: '', mask: '255.255.255.0' });
  Object.assign(h.pcs[1].config, { mode: 'static', ip: '192.168.1.9', mask: '' });
  const T = h.T();
  for (const d of h.pcs) assert.deepEqual([iface(T, d).ip, iface(T, d).mask, iface(T, d).source], [null, null, 'none']);
});

test('router interfaces: valid settings have no errors; half-valid ones no address', () => {
  const lan = cfg => { const h = home(0, { ifaces: { LAN: cfg } }); return h.T().byDev[h.r.id][1]; };
  assert.deepEqual(lan({ ip: '10.0.0.1', mask: '24' }).errors, []);
  for (const cfg of [{ ip: 'x', mask: '24' }, { ip: '10.0.0.1', mask: 'x' }]) {
    const i = lan(cfg);
    assert.deepEqual([i.ip, i.source], [null, 'none'], JSON.stringify(cfg));
  }
});

test('a DHCP pool whose end address is invalid says so', () => {
  const h = home(0, { ifaces: { LAN: { dhcp: { start: '192.168.1.100', end: 'oops' } } } });
  assert.equal(h.T().byDev[h.r.id][1].dhcpServer.reason, 'the pool start/end addresses are not valid');
});

// ---------- DHCP leases ----------

test('the last address in the pool is handed out', () => {
  const h = home(1, { ifaces: { LAN: { dhcp: { start: '192.168.1.100', end: '192.168.1.100' } } } });
  assert.equal(IP.str(iface(h.T(), h.pcs[0]).ip), '192.168.1.100');
});

test('a device keeps a lease at the very start or end of the pool, even when another device asks first', () => {
  const h = home(3, { ifaces: { LAN: { dhcp: { start: '192.168.1.100', end: '192.168.1.102' } } } });
  h.T();
  // A newcomer that is processed before everyone else; then PC2 (.101) leaves.
  const newcomer = Model.add(h.net, 'pc', 0, 0);
  h.net.devices.unshift(h.net.devices.pop());
  Model.connect(h.net, h.sw, 'P8', newcomer, 'eth0');
  h.net.links = h.net.links.filter(l => l.b.dev !== h.pcs[1].id);
  const T = h.T();
  assert.equal(IP.str(iface(T, h.pcs[0]).ip), '192.168.1.100', 'first address in the pool');
  assert.equal(IP.str(iface(T, h.pcs[2]).ip), '192.168.1.102', 'last address in the pool');
  assert.equal(IP.str(iface(T, newcomer).ip), '192.168.1.101', 'the newcomer gets the free one');
});

test('a lease outside a moved pool is given up', () => {
  const h = home(1);
  h.T();
  h.r.config.ifaces.LAN.dhcp.start = '192.168.1.120';
  assert.equal(IP.str(iface(h.T(), h.pcs[0]).ip), '192.168.1.120');
});

// ---------- Conflicts ----------

test('conflicts: the Internet’s address wins over a PC; unplugged and unaddressed devices never conflict', () => {
  // A PC on the ISP side using the ISP gateway's address.
  const net = Model.create();
  const pc = Model.add(net, 'pc', 0, 0), inet = Model.add(net, 'internet', 0, 0), sw = Model.add(net, 'switch', 0, 0);
  statik(pc, '203.0.113.1');
  Model.connect(net, inet, 'ISP', sw, 'P1');
  Model.connect(net, sw, 'P2', pc, 'eth0');
  const T = Sim.build(net);
  assert.ok(iface(T, pc).conflict);
  assert.equal(T.byDev[inet.id][0].conflict, undefined);
  // Two unplugged PCs with one address; two unconfigured PCs on one switch.
  const h = home(2);
  const a = Model.add(h.net, 'pc', 0, 0), b = Model.add(h.net, 'pc', 0, 0);
  statik(a, '10.0.0.5'); statik(b, '10.0.0.5');
  h.pcs.forEach(d => { d.config.mode = 'none'; });
  const T2 = h.T();
  for (const d of [a, b, ...h.pcs]) assert.equal(iface(T2, d).conflict, undefined, d.name);
});

// ---------- Routing ----------

test('a router prefers the more specific network whatever order its interfaces are in, and the first of equals', () => {
  for (const [first, second, expect] of [['/16', '/24', 'Gi0/3'], ['/24', '/16', 'Gi0/1']]) {
    const net = Model.create();
    const cfg = (ip, mask) => ({ ip, mask, dhcp: { enabled: false } });
    const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: {
      'Gi0/1': first === '/16' ? cfg('10.0.0.1', '255.255.0.0') : cfg('10.0.5.1', '255.255.255.0'),
      'Gi0/3': second === '/16' ? cfg('10.0.0.1', '255.255.0.0') : cfg('10.0.5.1', '255.255.255.0') } } });
    ['Gi0/1', 'Gi0/3'].forEach(p => Model.connect(net, r, p, Model.add(net, 'switch', 0, 0), 'P1'));
    assert.equal(Sim.route(Sim.build(net), r.id, P('10.0.5.9')).iface.name, expect, `${first} then ${second}`);
  }
  const net = Model.create();
  const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: {
    'Gi0/1': { ip: '10.0.0.1', mask: '255.255.255.0' }, 'Gi0/2': { ip: '10.0.0.2', mask: '255.255.255.0' } } } });
  ['Gi0/1', 'Gi0/2'].forEach(p => Model.connect(net, r, p, Model.add(net, 'switch', 0, 0), 'P1'));
  assert.equal(Sim.route(Sim.build(net), r.id, P('10.0.0.9')).iface.name, 'Gi0/1', 'two equal matches: the first wins');
});

test('a configured but unplugged interface isn’t used', () => {
  const net = Model.create();
  const inet = Model.add(net, 'internet', 0, 0);
  const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: {
    'Gi0/1': { ip: '10.0.1.1', mask: '255.255.255.0', dhcp: { enabled: true, start: '10.0.1.10', end: '10.0.1.20', dns: '8.8.8.8' } },
    'Gi0/2': { ip: '10.0.2.1', mask: '255.255.255.0' } } } });
  const pc = Model.add(net, 'pc', 0, 0);
  Model.connect(net, inet, 'ISP', r, 'Gi0/0');
  Model.connect(net, r, 'Gi0/1', pc, 'eth0');
  const x = Sim.transact(Sim.build(net), pc.id, P('10.0.2.5'));
  assert.equal(x.fail.code, 'netunreach', 'the router has no working route to 10.0.2.x, so it goes to the Internet');
});

test('an unplugged WAN with a gateway still gives no route', () => {
  const h = home(1);
  h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '203.0.113.1', dns: '8.8.8.8' };
  h.net.links = h.net.links.filter(l => l.a.port !== 'ISP');
  assert.equal(Sim.transact(h.T(), h.pcs[0].id, P('8.8.8.8')).fail.code, 'noroute');
});

test('a router whose WAN gateway doesn’t exist', () => {
  const h = home(1);
  h.r.config.ifaces.WAN = { mode: 'static', ip: '203.0.113.42', mask: '255.255.255.0', gw: '203.0.113.99', dns: '8.8.8.8' };
  const T = h.T(), x = Sim.transact(T, h.pcs[0].id, P('8.8.8.8'));
  assert.equal(x.stage, 'request');
  assert.equal(Sim.explain(T, x.fail), 'Router1 sent the packet to its gateway 203.0.113.99, but nothing on its local network answered to that address.');
});

test('the Internet sending to an address that doesn’t exist', () => {
  const h = home(0), T = h.T();
  const x = Sim.transact(T, h.inet.id, P('9.9.9.9'));
  assert.deepEqual([x.ok, x.fail.code, x.req.pkt.src], [false, 'netunreach', 0]);
});

// ---------- NAT and port forwarding ----------

test('port forwarding only applies to traffic from the Internet, not to the LAN side', () => {
  const h = home(1);
  h.r.config.portForwards.push({ proto: 'tcp', port: '80', ip: '192.168.1.80', toPort: '80' });
  const web = Model.add(h.net, 'server', 0, 0, { hostMode: 'static', config: { ip: '192.168.1.80', mask: '255.255.255.0', gw: '192.168.1.1', services: { web: true } } });
  Model.connect(h.net, h.sw, 'P8', web, 'eth0');
  const T = h.T(), x = Sim.transact(T, h.pcs[0].id, P('192.168.1.1'), 'tcp', 80);
  assert.equal(x.ok, false, 'the router’s LAN address isn’t forwarded');
  assert.equal(x.req.forwarded, undefined);
});

test('a port forward without a separate inside port keeps the same port', () => {
  const h = home(0);
  h.r.config.portForwards.push({ proto: 'tcp', port: '80', ip: '192.168.1.80' });
  const web = Model.add(h.net, 'server', 0, 0, { hostMode: 'static', config: { ip: '192.168.1.80', mask: '255.255.255.0', gw: '192.168.1.1', services: { web: true } } });
  Model.connect(h.net, h.sw, 'P8', web, 'eth0');
  const v = Sim.externalVisit(h.T());
  assert.equal(v.ok, true);
  assert.equal(v.req.pkt.port, 80);
});

test('a customer visit comes from the customer’s address, to the router connected to the Internet', () => {
  // The Internet cloud added after the router this time.
  const net = Model.create();
  const r = Model.add(net, 'homerouter', 0, 0), inet = Model.add(net, 'internet', 0, 0);
  Model.connect(net, inet, 'ISP', r, 'WAN');
  const v = Sim.externalVisit(Sim.build(net));
  assert.equal(IP.str(v.wanIp), '203.0.113.42');
  assert.equal(v.req.pkt.src, Sim.REMOTE);
  assert.equal(v.fail.code, 'refused', 'no port forward yet');
});

test('two computers behind NAT pinging the same server each get their own reply', () => {
  const h = home(2), T = h.T();
  const replies = h.pcs.map(pc => Sim.transact(T, pc.id, P('8.8.8.8')).rep.dev);
  assert.deepEqual(replies, h.pcs.map(pc => pc.id));
});

// ---------- DNS and names ----------

test('names are trimmed and lower-cased; addresses need no lookup', () => {
  const h = home(1), T = h.T();
  assert.equal(IP.str(Sim.resolve(T, h.pcs[0].id, '  WWW.EXAMPLE.COM  ').ip), '93.184.216.34');
  assert.deepEqual(Sim.resolve(T, h.pcs[0].id, '10.1.2.3'), { ok: true, ip: P('10.1.2.3'), steps: [] });
});

test('an internal-looking name asked through a home router reaches public DNS, which says so', () => {
  const h = home(1), T = h.T(), r = Sim.resolve(T, h.pcs[0].id, 'files.office');
  assert.match(Sim.explain(T, r.fail), /^8\.8\.8\.8 is a public DNS server/);
  const other = Sim.resolve(T, h.pcs[0].id, 'files.office.com');
  assert.match(Sim.explain(T, other.fail), /doesn't exist\. \(In this game, try www\.example\.com\.\)/, 'only names ending in .office are internal');
});

test('share names: the server is the first part after the slashes', () => {
  assert.equal(Sim.shareHost('fs1\\share'), 'fs1');
  assert.equal(Sim.shareHost('fs1/share/sub'), 'fs1');
});

test('SSH allowed from blank (only spaces) means anyone', () => {
  assert.equal(Sim.sshAllowed({ config: { sshAllow: '   ' } }, P('1.2.3.4')), true);
});

test('the public servers on the Internet', () => {
  assert.deepEqual(Object.entries(Sim.VIRTUAL).map(([ip, v]) => `${IP.str(+ip)} ${v.name}${v.dns ? ' dns' : ''}${v.web ? ' web' : ''}`),
    ['1.1.1.1 one.one.one.one dns', '8.8.8.8 dns.google dns', '93.184.216.34 www.example.com web', '198.51.100.25 customer.example.net']);
});

// ---------- Explanations: what they mention ----------

test('a blocked packet’s explanation mentions only permits for the same destination', () => {
  const net = Model.create();
  const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: {
    'Gi0/1': { ip: '10.0.1.1', mask: '255.255.255.0' }, 'Gi0/2': { ip: '10.0.2.1', mask: '255.255.255.0' } },
    acl: [rule('deny', '10.0.9.0/24', '10.0.2.5'), rule('permit', 'any', '10.0.2.6'), rule('permit', '10.0.9.0/24', '10.0.2.5')] } });
  const a = Model.add(net, 'pc', 0, 0, { hostMode: 'static', config: { ip: '10.0.1.5', mask: '255.255.255.0', gw: '10.0.1.1' } });
  const b = Model.add(net, 'pc', 0, 0, { hostMode: 'static', config: { ip: '10.0.2.5', mask: '255.255.255.0', gw: '10.0.2.1' } });
  Model.connect(net, r, 'Gi0/1', a, 'eth0');
  Model.connect(net, r, 'Gi0/2', b, 'eth0');
  const T = Sim.build(net), x = Sim.transact(T, a.id, P('10.0.2.5'));
  const msg = Sim.explain(T, x.fail);
  assert.match(msg, /Rule 3 “permit 10\.0\.9\.0\/24 → 10\.0\.2\.5 any” didn't apply because the source 10\.0\.1\.5 isn't in 10\.0\.9\.0\/24\.$/);
  assert.doesNotMatch(msg, /Rule 1/, 'a deny that didn’t match isn’t mentioned');
  assert.doesNotMatch(msg, /Rule 2/, 'a permit for another address isn’t mentioned');
});

test('unreachable rules: a narrower rule never covers a wider one, and UDP ports count', () => {
  const lint = rules => Sim.aclLint(rules).map(x => [x.index, x.by]);
  assert.deepEqual(lint([rule('permit', '10.0.0.0/24', 'any'), rule('permit', '10.0.0.0/16', 'any')]), []);
  assert.deepEqual(lint([rule('permit', 'any', '10.0.0.0/24'), rule('permit', 'any', '10.0.0.0/16')]), []);
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'udp'), rule('permit', 'any', 'any', 'udp', '53')]), [[1, 0]]);
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'udp', '53'), rule('permit', 'any', 'any', 'udp')]), []);
  assert.deepEqual(lint([rule('permit', 'any', 'any', 'udp', '53'), rule('permit', 'any', 'any', 'udp', '54')]), []);
});

test('the stage of a failure: request, service or reply', () => {
  const h = home(1);
  h.pcs[0].config.mode = 'none';
  assert.equal(Sim.transact(h.T(), h.pcs[0].id, P('8.8.8.8')).stage, 'request');
});

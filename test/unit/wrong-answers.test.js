// Plausible wrong answers must not pass.
//
// Each case starts from a level solved by its model solution, changes one thing the way a player might get it
// wrong, and checks that the objective that should catch it does. Add a case here whenever you find a wrong
// answer that a level accepts.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Levels, Model, play, rule, lan } = require('../load');
const solutions = require('../solutions');

const solved = id => { const g = play(id); solutions[id](g); return g; };
const host = (g, t, cfg) => { Object.assign(g.dev(t).config, cfg); g.rebuild(); };
const routerIf = (g, name, cfg) => { Object.assign(g.router().config.ifaces[name], cfg); g.rebuild(); };
const dhcp = (g, name, cfg) => { Object.assign(g.router().config.ifaces[name].dhcp, cfg); g.rebuild(); };

// [level id, what the player got wrong, change, objective number (1-based) that must now fail]
const CASES = [
  ['dhcp', 'PC plugged into nothing', g => { g.net.links = g.net.links.filter(l => l.b.dev !== g.dev('PC1').id); g.rebuild(); }, 2],
  ['dhcp', 'PC given a static address instead', g => host(g, 'PC1', { mode: 'static', ip: '192.168.1.50', mask: '24', gw: '192.168.1.1', dns: '8.8.8.8' }), 3],

  ['static', 'gateway left as the PC itself', g => host(g, 'pc1', { gw: '192.168.1.50' }), 5],
  ['static', 'mask written as /25', g => host(g, 'pc1', { mask: '255.255.255.128' }), 4],
  ['static', 'a second DNS server only', g => host(g, 'pc1', { dns: '1.1.1.1' }), 6],

  ['switch', 'server inside the DHCP pool', g => host(g, 'Server1', { ip: '192.168.1.150' }), 4],
  ['switch', 'server at the start of the pool', g => host(g, 'Server1', { ip: '192.168.1.100' }), 4],
  ['switch', 'server at the end of the pool', g => host(g, 'Server1', { ip: '192.168.1.199' }), 4],
  ['switch', 'server takes the router’s address', g => host(g, 'Server1', { ip: '192.168.1.1' }), 4],
  ['switch', 'server in another network', g => host(g, 'Server1', { ip: '192.168.2.10' }), 4],
  ['switch', 'server on DHCP', g => host(g, 'Server1', { mode: 'dhcp' }), 4],
  ['switch', 'server without DNS', g => host(g, 'Server1', { dns: '' }), 5],
  ['switch', 'server with the wrong gateway', g => host(g, 'Server1', { gw: '192.168.1.254' }), 5],
  ['switch', 'only two PCs on the switch', g => { g.net.links = g.net.links.filter(l => l.b.dev !== g.dev('PC3').id); g.rebuild(); }, 2],
  ['switch', 'switch plugged into a PC, not the router', g => { g.net.links = g.net.links.filter(l => l.a.port !== 'LAN'); g.rebuild(); }, 1],

  ['router', 'LAN mask /16', g => routerIf(g, 'LAN', { mask: '255.255.0.0' }), 1],
  ['router', 'pool one address too long', g => dhcp(g, 'LAN', { end: '10.20.30.151' }), 2],
  ['router', 'pool starts too early', g => dhcp(g, 'LAN', { start: '10.20.30.99' }), 2],
  ['router', 'DHCP switched off', g => dhcp(g, 'LAN', { enabled: false }), 2],
  ['router', 'DNS 8.8.8.8 instead of 1.1.1.1', g => dhcp(g, 'LAN', { dns: '8.8.8.8' }), 3],

  ['subnets', 'staff mask /25', g => routerIf(g, 'Gi0/1', { mask: '255.255.255.128' }), 1],
  ['subnets', 'guests on the staff address', g => routerIf(g, 'Gi0/2', { ip: '192.168.20.2' }), 2],
  ['subnets', 'guest DHCP without DNS', g => dhcp(g, 'Gi0/2', { dns: '' }), 3],

  ['portforward', 'forwarding UDP instead of TCP', g => { g.router().config.portForwards[0].proto = 'udp'; g.rebuild(); }, 3],
  ['portforward', 'outside port 8080', g => { g.router().config.portForwards[0].port = '8080'; g.rebuild(); }, 3],
  ['portforward', 'forwarded to the wrong address', g => { g.router().config.portForwards[0].ip = '192.168.1.81'; g.rebuild(); }, 3],
  ['portforward', 'inside port 8080', g => { g.router().config.portForwards[0].toPort = '8080'; g.rebuild(); }, 3],

  ['subnet-halves', 'Office keeps the whole /24', g => routerIf(g, 'Gi0/1', { mask: '255.255.255.0' }), 3],
  ['subnet-halves', 'a /23 that reaches outside the block', g => routerIf(g, 'Gi0/1', { mask: '255.255.254.0' }), 1],
  ['subnet-halves', 'Lab outside the given block', g => routerIf(g, 'Gi0/2', lan('192.168.51.1', '255.255.255.128', { start: '192.168.51.10', end: '192.168.51.120', dns: '8.8.8.8' })), 2],
  ['subnet-halves', 'Lab /26: too small for 100', g => routerIf(g, 'Gi0/2', lan('192.168.50.129', '255.255.255.192', { start: '192.168.50.130', end: '192.168.50.190', dns: '8.8.8.8' })), 2],
  ['subnet-halves', 'pool only 50 addresses', g => dhcp(g, 'Gi0/1', { end: '192.168.50.59' }), 4],
  ['subnet-halves', 'Lab not configured at all', g => routerIf(g, 'Gi0/2', { ip: '', mask: '' }), 3],
  ['subnetting', 'Management overlaps Engineering', g => routerIf(g, 'Gi0/3', lan('172.16.5.81', '255.255.255.240', { start: '172.16.5.82', end: '172.16.5.94', dns: '8.8.8.8' })), 4],
  ['subnetting', 'Management overlaps Sales (bigger range)', g => routerIf(g, 'Gi0/3', lan('172.16.5.33', '255.255.255.240', { start: '172.16.5.34', end: '172.16.5.46', dns: '8.8.8.8' })), 4],
  ['subnetting', 'Engineering /28: too small for 25', g => routerIf(g, 'Gi0/2', { mask: '255.255.255.240' }), 2],
  ['subnetting', 'Sales pool invalid (outside its subnet)', g => dhcp(g, 'Gi0/1', { end: '172.16.5.70' }), 5],

  ['fileserver', 'file server at .21', g => host(g, 'Server1', { ip: '10.1.99.21' }), 3],
  ['fileserver', 'file server plugged into the HR switch', g => {
    g.net.links = g.net.links.filter(l => l.b.dev !== g.dev('Server1').id);
    Model.connect(g.net, g.dev('HR-SW'), 'P5', g.dev('Server1'), 'eth0'); g.rebuild(); }, 3],
  ['fileserver', 'file server using 8.8.8.8 for DNS', g => host(g, 'Server1', { dns: '8.8.8.8' }), 4],
  ['fileserver', 'file server on DHCP', g => host(g, 'Server1', { mode: 'dhcp' }), 4],
  ['fileserver', 'DNS record points at DNS1', g => { g.dev('dns1').config.dnsRecords.find(r => r.name === 'files.office').ip = '10.1.99.53'; g.rebuild(); }, 6],

  ['guests', 'guest DNS kept internal, with a hole for it', g => {
    dhcp(g, 'Gi0/2', { dns: '10.1.99.53' });
    g.router().config.acl.unshift(rule('permit', '10.1.50.0/24', '10.1.99.53', 'udp', '53')); g.rebuild(); }, 5],
  ['guests', 'only the file server blocked', g => { g.router().config.acl[0] = rule('deny', '10.1.50.0/24', '10.1.99.20'); g.rebuild(); }, 3],

  ['dmz', 'WebServer moved, but its gateway still the old one', g => host(g, 'web', { gw: '10.1.99.1' }), 3],
  ['dmz', 'WebServer at .81', g => host(g, 'web', { ip: '10.1.200.81' }), 3],
  ['dmz', 'old record left, new one missing', g => { g.dev('dns1').config.dnsRecords.find(r => r.name === 'shop.office').ip = '10.1.99.80'; g.rebuild(); }, 5],
  ['dmz', 'DMZ only blocked from the file server', g => { g.router().config.acl[0] = rule('deny', '10.1.200.0/24', '10.1.99.20'); g.rebuild(); }, 6],

  ['vlans', 'trunk carries only VLAN 10', g => { g.dev('Floor1-SW').config.ports.P8.allowed = '10'; g.rebuild(); }, 3],
  ['vlans', 'trunk on Floor 1 only', g => { g.dev('Floor2-SW').config.ports.P8 = { mode: 'access', vlan: 10 }; g.rebuild(); }, 3],
  ['vlans', 'HR-PC2 left in VLAN 10', g => { g.dev('Floor2-SW').config.ports.P4.vlan = 10; g.rebuild(); }, 4],

  ['vms', 'TestVM left on NAT', g => {
    const d = g.dev('testvm'), l = g.net.links.find(x => x.b.dev === d.id || x.a.dev === d.id);
    (l.a.dev === d.id ? l.b : l.a).port = 'nat2'; g.rebuild(); }, 5],
  ['vms', 'WebVM back on NAT', g => {
    const d = g.dev('webvm'), l = g.net.links.find(x => x.b.dev === d.id || x.a.dev === d.id);
    (l.a.dev === d.id ? l.b : l.a).port = 'nat1'; g.rebuild(); }, 3],

  ['ssh', 'FS1 accepts SSH from the whole Servers network', g => host(g, 'fs', { sshAllow: '10.1.99.0/24' }), 3],
  ['ssh', 'DNS1 accepts SSH from the IT network', g => host(g, 'dns1', { sshAllow: '10.1.30.0/24' }), 3],
  ['ssh', 'IT may SSH to every server', g => { g.router().config.acl[2] = rule('permit', '10.1.30.0/24', '10.1.99.0/24', 'tcp', '22'); g.rebuild(); }, 2],
  ['ssh', 'everyone may SSH to Jump1', g => { g.router().config.acl[2] = rule('permit', 'any', '10.1.99.10', 'tcp', '22'); g.rebuild(); }, 2],
];

for (const [id, label, change, objective] of CASES) {
  test(`${id}: ${label} → objective ${objective} fails`, () => {
    const g = solved(id);
    assert.equal(g.result().ok[objective - 1], true, 'the model solution meets it');
    change(g);
    assert.equal(g.result().ok[objective - 1], false, `objective ${objective} still passes: “${g.L.objectives[objective - 1].text.replace(/<[^>]+>/g, '')}”`);
  });
}

test('every wrong-answer case names a real level and objective', () => {
  for (const [id, , , n] of [...CASES, ...MORE_WRONG]) {
    const L = Levels.find(l => l.id === id);
    assert.ok(L && n >= 1 && n <= L.objectives.length, `${id} ${n}`);
  }
});

// A wrong answer that needs a little more setting up: the start of the DHCP pool, with nobody else holding it.
const MORE_WRONG = [
  ['switch', 'server at the very start of the pool (.100), with that address free', g => {
    host(g, 'PC1', { mode: 'static', ip: '192.168.1.60', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' });
    host(g, 'Server1', { ip: '192.168.1.100' }); }, 4],
];
for (const [id, label, change, objective] of MORE_WRONG) {
  test(`${id}: ${label} → objective ${objective} fails`, () => {
    const g = solved(id);
    change(g);
    assert.equal(g.result().ok[objective - 1], false);
  });
}

// ---------- Other right answers must pass too ----------
// The model solution is one answer. These are different answers that are also correct: each must still
// complete the level. Add one whenever a player finds a valid answer that the level rejected.
const RIGHT = [
  ['switch', 'server above the DHCP pool (.200), proved again', g => { host(g, 'Server1', { ip: '192.168.1.200' }); g.act.ping('PC1', '192.168.1.200'); }],
  ['switch', 'server just below the pool (.99), proved again', g => { host(g, 'Server1', { ip: '192.168.1.99' }); g.act.ping('PC1', '192.168.1.99'); }],
  ['static', 'the router as DNS server as well as 8.8.8.8', g => host(g, 'pc1', { dns: '8.8.8.8, 192.168.1.1' })],
  ['subnetting', 'Management’s pool exactly 10 addresses', g => dhcp(g, 'Gi0/3', { start: '172.16.5.98', end: '172.16.5.107' })],
  ['subnetting', 'subnets in a different order (Management first)', g => {
    routerIf(g, 'Gi0/3', lan('172.16.5.1', '255.255.255.240', { start: '172.16.5.2', end: '172.16.5.14', dns: '8.8.8.8' }));
    routerIf(g, 'Gi0/2', lan('172.16.5.33', '255.255.255.224', { start: '172.16.5.34', end: '172.16.5.62', dns: '8.8.8.8' }));
    routerIf(g, 'Gi0/1', lan('172.16.5.65', '255.255.255.192', { start: '172.16.5.66', end: '172.16.5.126', dns: '8.8.8.8' })); }],
  ['subnet-halves', 'Lab first, Office second', g => {
    routerIf(g, 'Gi0/1', lan('192.168.50.129', '255.255.255.128', { start: '192.168.50.138', end: '192.168.50.248', dns: '8.8.8.8' }));
    routerIf(g, 'Gi0/2', lan('192.168.50.1', '255.255.255.128', { start: '192.168.50.10', end: '192.168.50.120', dns: '8.8.8.8' })); }],
  ['acl', 'block Sales by name instead of “everyone but HR”', g => {
    g.router().config.acl = [rule('deny', '10.1.10.0/24', '10.1.99.30'), rule('permit', 'any', 'any')]; g.rebuild(); }],
  ['guests', 'deny each private range separately', g => {
    g.router().config.acl = [rule('deny', '10.1.50.0/24', '10.1.10.0/24'), rule('deny', '10.1.50.0/24', '10.1.99.0/24'), rule('permit', 'any', 'any')]; g.rebuild(); }],
  ['dmz', 'block the DMZ with 10.0.0.0/8', g => { g.router().config.acl[0] = rule('deny', '10.1.200.0/24', '10.0.0.0/8'); g.rebuild(); }],
  ['ssh', 'Jump1 accepts SSH only from IT', g => host(g, 'jump', { sshAllow: '10.1.30.0/24' })],
  ['vlans', 'trunks carry every VLAN', g => {
    g.dev('Floor1-SW').config.ports.P8.allowed = null; g.dev('Floor2-SW').config.ports.P8.allowed = null; g.rebuild(); }],
];

for (const [id, label, change] of RIGHT) {
  test(`${id}: ${label} still completes the level`, () => {
    const g = solved(id);
    change(g);
    const failing = g.L.objectives.filter((_, i) => !g.result().ok[i]).map(o => o.text.replace(/<[^>]+>/g, ''));
    assert.deepEqual(failing, []);
  });
}

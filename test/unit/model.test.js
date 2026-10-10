// The network data model (js/model.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, NG } = require('../load');

test('devices get unique names and their type’s default settings', () => {
  const net = Model.create();
  const a = Model.add(net, 'pc', 0, 0), b = Model.add(net, 'pc', 0, 0), s = Model.add(net, 'server', 0, 0, { name: 'Web' });
  assert.deepEqual([a.name, b.name, s.name], ['PC1', 'PC2', 'Web']);
  assert.equal(a.config.mode, 'dhcp');
  assert.equal(Model.add(net, 'pc', 0, 0, { hostMode: 'static' }).config.mode, 'static');
  assert.deepEqual(s.config.services, { web: false, files: false, dns: false, ssh: false });
  assert.notEqual(a.id, b.id);
});

test('options merge into the defaults, keeping what isn’t mentioned', () => {
  const net = Model.create();
  const r = Model.add(net, 'officerouter', 0, 0, { config: { ifaces: { 'Gi0/1': { ip: '10.0.0.1' } } } });
  assert.equal(r.config.ifaces['Gi0/1'].ip, '10.0.0.1');
  assert.equal(r.config.ifaces['Gi0/1'].dhcp.enabled, false, 'untouched nested settings stay');
  assert.deepEqual(r.config.acl, []);
});

test('cables: connect, find, follow, remove', () => {
  // Several devices and cables, so "find the right one" can't pass by luck.
  const net = Model.create();
  const a = Model.add(net, 'pc', 0, 0), b = Model.add(net, 'pc', 0, 0), sw = Model.add(net, 'switch', 0, 0), r = Model.add(net, 'homerouter', 0, 0);
  const la = Model.connect(net, a, 'eth0', sw, 'P1');
  const lb = Model.connect(net, sw, 'P2', b, 'eth0');
  const lr = Model.connect(net, r, 'LAN1', sw, 'P8', { locked: true });
  assert.equal(Model.linkAt(net, sw.id, 'P1'), la);
  assert.equal(Model.linkAt(net, sw.id, 'P2'), lb, 'found from either end of the cable');
  assert.equal(Model.linkAt(net, b.id, 'eth0'), lb);
  assert.equal(Model.linkAt(net, sw.id, 'P3'), undefined);
  assert.equal(Model.linkAt(net, a.id, 'P1'), undefined, 'right port, wrong device');
  assert.deepEqual(Model.peer(la, a.id), { dev: sw.id, port: 'P1' });
  assert.deepEqual(Model.peer(la, sw.id), { dev: a.id, port: 'eth0' });
  assert.deepEqual([la.locked, lr.locked], [false, true]);
  assert.notEqual(la.id, lb.id);
  assert.match(la.id, /^l\d+$/);
  Model.removeLink(net, lb.id);
  assert.deepEqual(net.links, [la, lr], 'only that cable is removed');
  Model.removeDevice(net, sw.id);
  assert.deepEqual(net.links, [], 'removing a device unplugs every cable on it');
  assert.deepEqual(net.devices.map(d => d.id), [a.id, b.id, r.id]);
  Model.connect(net, a, 'eth0', b, 'eth0');
  Model.connect(net, r, 'LAN2', a, 'eth0');
  Model.removeDevice(net, r.id);
  assert.equal(net.links.length, 1, 'cables from either end of the removed device go; others stay');
});

test('device flags and ports', () => {
  const net = Model.create();
  const plain = Model.add(net, 'pc', 0, 0), fixed = Model.add(net, 'pc', 0, 0, { locked: true, lockedConfig: true, fromPalette: true, tag: 't' });
  assert.deepEqual([plain.locked, plain.lockedConfig, plain.fromPalette, plain.tag], [false, false, false, null]);
  assert.deepEqual([fixed.locked, fixed.lockedConfig, fixed.fromPalette, fixed.tag], [true, true, true, 't']);
  plain.ports.push('extra');
  assert.deepEqual(NG.Types.pc.ports, ['eth0'], 'each device gets its own copy of the port list');
  assert.deepEqual(Model.add(net, 'switch', 0, 0).ports, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
});

test('merging settings: nested objects merge, lists and values replace', () => {
  const net = Model.create();
  const s = Model.add(net, 'server', 0, 0, { config: { services: { web: true }, dnsRecords: [{ name: 'a', ip: '1.1.1.1' }], extra: { x: 1 } } });
  assert.deepEqual(s.config.services, { web: true, files: false, dns: false, ssh: false });
  assert.deepEqual(s.config.dnsRecords, [{ name: 'a', ip: '1.1.1.1' }]);
  assert.deepEqual(s.config.extra, { x: 1 }, 'a new key is added whole');
  const r = Model.add(net, 'homerouter', 0, 0, { config: { portForwards: [{ port: '80' }], ifaces: { LAN: { dhcp: null } } } });
  assert.deepEqual(r.config.portForwards, [{ port: '80' }]);
  assert.equal(r.config.ifaces.LAN.dhcp, null, 'null replaces rather than merges');
  const odd = Model.add(net, 'homerouter', 0, 0, { config: { nat: { on: true }, ifaces: { LAN: 'off' } } });
  assert.deepEqual(odd.config.nat, { on: true }, 'an object replaces a plain value');
  assert.equal(odd.config.ifaces.LAN, 'off', 'a plain value replaces an object');
});

test('default settings of every device type', t => {
  // A readable list of what each new device starts with (in model.test.js.snapshot).
  const lines = Object.entries(NG.Types).map(([type, def]) => `${type} (${def.kind}, ${def.prefix}): ports ${def.ports.join(' ')}\n  ${JSON.stringify(def.cfg())}`
    + (def.ifaces ? `\n  interfaces ${JSON.stringify(def.ifaces)}` : ''));
  t.assert.snapshot(`\n${lines.join('\n')}\n`, { serializers: [v => v] });
});

test('settings paths used by the forms', () => {
  const o = { ifaces: { LAN: { dhcp: { start: '' } } } };
  Model.setPath(o, 'ifaces.LAN.dhcp.start', '10.0.0.5');
  assert.equal(Model.getPath(o, 'ifaces.LAN.dhcp.start'), '10.0.0.5');
  assert.equal(Model.getPath(o, 'ifaces.WAN.ip'), undefined);
});

test('every device type has an icon-friendly label, ports and settings', () => {
  for (const [type, def] of Object.entries(NG.Types)) {
    assert.ok(def.label && def.kind && def.ports.length, type);
    assert.equal(typeof def.cfg(), 'object', type);
  }
});

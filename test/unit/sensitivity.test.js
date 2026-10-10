// Sensitivity tests: does each objective care about exactly the right things?
//
// Start from a level solved by its model solution, make ONE small change, and record which objectives stop
// counting. For example "a failed ping instead of a successful one", "the ping came from another device",
// "PC1's cable unplugged", "rule 2 removed". The result is a readable list stored in sensitivity.test.js.snapshot.
//
// Why: the level tests prove the right answer passes. These prove wrong answers don't, so an objective can't
// quietly stop checking something (mutation testing found many such gaps before these tests existed).
//
// If you change a level on purpose, read the new list (does each change break what it should?), then:
//   npm run test:update-snapshots
'use strict';
const test = require('node:test');
const { Levels, Objectives, Sim, IP, P, play } = require('../load');
const solutions = require('../solutions');

const clone = o => JSON.parse(JSON.stringify(o));
const nextIp = s => { const n = P(s); return n == null ? s : IP.str(n + 1); };

// The one-step changes to try on a solved network. Each returns a label and a function that edits a copy.
function networkChanges(net) {
  const out = [];
  const name = id => net.devices.find(d => d.id === id).name;
  net.links.forEach((l, k) => out.push([`unplug ${name(l.a.dev)}:${l.a.port}–${name(l.b.dev)}:${l.b.port}`, n => { n.links.splice(k, 1); }]));
  net.devices.forEach((d, k) => {
    const c = d.config, at = n => n.devices[k].config, who = d.name;
    if (c.mode === 'static') {
      out.push([`${who}: next IP address`, n => { at(n).ip = nextIp(c.ip); }]);
      out.push([`${who}: mask /16`, n => { at(n).mask = '255.255.0.0'; }]);
      out.push([`${who}: no gateway`, n => { at(n).gw = ''; }]);
      out.push([`${who}: no DNS server`, n => { at(n).dns = ''; }]);
      out.push([`${who}: DHCP instead of static`, n => { at(n).mode = 'dhcp'; }]);
    } else if (c.mode === 'dhcp') {
      out.push([`${who}: not configured`, n => { at(n).mode = 'none'; }]);
    }
    Object.keys(c.services || {}).filter(s => c.services[s]).forEach(s => out.push([`${who}: ${s} service off`, n => { at(n).services[s] = false; }]));
    if (c.sshAllow) out.push([`${who}: SSH allowed from anyone`, n => { at(n).sshAllow = ''; }]);
    (c.dnsRecords || []).forEach((r, j) => out.push([`${who}: DNS record ${r.name} removed`, n => { at(n).dnsRecords.splice(j, 1); }]));
    (c.portForwards || []).forEach((r, j) => out.push([`${who}: port forward ${r.port} → ${r.ip} removed`, n => { at(n).portForwards.splice(j, 1); }]));
    (c.acl || []).forEach((r, j) => out.push([`${who}: rule ${j + 1} (${Sim.ruleText(r)}) removed`, n => { at(n).acl.splice(j, 1); }]));
    Object.keys(c.ports || {}).forEach(p => out.push([`${who}: ${p} back to VLAN 1`, n => { delete at(n).ports[p]; }]));
    Object.entries(c.ifaces || {}).forEach(([i, f]) => {
      if (f.ip) out.push([`${who}: ${i} next IP address`, n => { at(n).ifaces[i].ip = nextIp(f.ip); }]);
      if (f.dhcp && f.dhcp.enabled) {
        out.push([`${who}: ${i} DHCP off`, n => { at(n).ifaces[i].dhcp.enabled = false; }]);
        out.push([`${who}: ${i} DHCP hands out DNS 9.9.9.9`, n => { at(n).ifaces[i].dhcp.dns = '9.9.9.9'; }]);
        out.push([`${who}: ${i} DHCP pool ends one earlier`, n => { at(n).ifaces[i].dhcp.end = IP.str(P(f.dhcp.end) - 1); }]);
      }
    });
  });
  return out;
}

// The one-field changes to try on each recorded command (event).
function eventChanges(e, otherDev) {
  const out = [['removed', null]];
  const set = (label, k, v) => out.push([label, Object.assign({}, e, { [k]: v })]);
  if ('ok' in e) set(e.ok ? 'failed instead' : 'succeeded instead', 'ok', !e.ok);
  if ('dev' in e) set('from another device', 'dev', otherDev(e.dev));
  if ('to' in e && e.to) set('to another device', 'to', otherDev(e.to));
  if (e.dst != null) set('other destination', 'dst', e.dst + 1);
  if (e.ip != null) set('other address', 'ip', e.ip + 1);
  if (e.host) set('other host', 'host', 'other.office');
  if (e.port != null) set('other port', 'port', e.port + 1);
  if (e.code) set('other failure reason', 'code', 'arp');
  if ('code' in e && !e.code && 'ok' in e && !e.ok) set('blocked by a rule', 'code', 'acl');
  if (e.source) set(`source ${e.source === 'dhcp' ? 'static' : 'dhcp'}`, 'source', e.source === 'dhcp' ? 'static' : 'dhcp');
  if (e.name) set('other name', 'name', 'other.example');
  if (e.blocks) set('other subnet layout', 'blocks', [{ net: P('192.168.1.0'), p: 24 }]);
  set('another command', 'type', e.type === 'ping' ? 'browse' : 'ping');
  return out;
}

const describe = e => `${e.type}${e.host ? ' ' + e.host : e.dst != null ? ' ' + IP.str(e.dst) : e.ip != null ? ' ' + IP.str(e.ip) : ''}${e.port ? ':' + e.port : ''}`;
const diff = (base, now) => base.map((ok, i) => (ok && !now[i] ? i + 1 : null)).filter(Boolean);

for (const [n, L] of Levels.entries()) {
  test(`level ${n + 1} (${L.id}): what breaks each objective`, t => {
    const g = play(L.id);
    solutions[L.id](g);
    const base = g.result().ok;
    const evaluate = (net, events) => Objectives.evaluate(L, { net, T: Sim.build(net), events }).ok;
    const lines = [];

    for (const [label, edit] of networkChanges(g.net)) {
      const net = clone(g.net);
      edit(net);
      const broken = diff(base, evaluate(net, g.events));
      if (broken.length) lines.push(`${label.padEnd(58)} breaks ${broken.join(', ')}`);
    }

    const devIds = g.net.devices.map(d => d.id);
    const otherDev = id => devIds.find(x => x !== id);
    g.events.forEach((e, k) => {
      for (const [label, changed] of eventChanges(e, otherDev)) {
        const events = g.events.slice();
        if (changed) events[k] = changed; else events.splice(k, 1);
        const broken = diff(base, Objectives.evaluate(L, { net: g.net, T: g.T, events }).ok);
        if (broken.length) lines.push(`${`command ${k + 1} (${describe(e)}): ${label}`.padEnd(58)} breaks ${broken.join(', ')}`);
      }
    });

    t.assert.snapshot(`\n${lines.join('\n')}\n`, { serializers: [v => v] });
  });
}

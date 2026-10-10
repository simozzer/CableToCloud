// Every level: it starts unfinished, its model solution finishes it, and the review is clean.
// Plus regression tests for problems players have hit.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Levels, play, rule, P } = require('../load');
const solutions = require('../solutions');

const failing = g => g.L.objectives.filter((_, i) => !g.result().ok[i]).map(o => o.text.replace(/<[^>]+>/g, ''));

test('every level has a model solution, hints, a briefing and a summary', () => {
  for (const L of Levels) {
    assert.ok(L.solution, `${L.id}: no in-game model solution`);
    assert.ok(solutions[L.id], `${L.id}: no solution in test/solutions.js`);
    assert.ok(L.hints && L.hints.length, `${L.id}: no hints`);
    assert.ok(L.briefing && L.learned, `${L.id}: missing briefing or learned`);
    assert.ok(L.objectives.length >= 3, `${L.id}: fewer than 3 objectives`);
  }
});

test('level ids are unique', () => {
  assert.equal(new Set(Levels.map(L => L.id)).size, Levels.length);
});

for (const [n, L] of Levels.entries()) {
  test(`level ${n + 1} (${L.id}): starts unfinished, model solution completes it with a clean review`, t => {
    const g = play(L.id);
    assert.equal(g.result().complete, false, 'the level is already complete before doing anything');
    solutions[L.id](g);
    assert.deepEqual(failing(g), [], 'objectives not met by the model solution');
    assert.deepEqual(g.review(), [], 'the review has suggestions for the model solution');
    // The progress trace: which objectives tick after each step of the solution. It catches an objective that
    // ticks too early or too late, which "complete at the end" can't. Stored in levels.test.js.snapshot.
    // If you change a level on purpose, check the new trace reads right, then: npm run test:update-snapshots
    t.assert.snapshot(`\n${g.trace.join('\n')}\n`, { serializers: [v => v] });
  });
}

// ---------- What each level starts with ----------

test('every level’s starting network (layout snapshot)', t => {
  // One readable block per level: each device with its position, flags and settings, then the cables.
  // Starting devices are locked so players can't delete them; check new levels follow the same pattern.
  const flags = d => [d.locked && 'locked', d.lockedConfig && 'settings locked', d.tag && `tag ${d.tag}`].filter(Boolean).join(', ');
  const blocks = Levels.map((L, i) => {
    const g = play(L.id), name = id => g.net.devices.find(d => d.id === id).name;
    const devs = g.net.devices.map(d => `  ${d.name} (${d.type}) at ${d.x},${d.y} [${flags(d)}]\n    ${JSON.stringify(d.config)}`);
    const links = g.net.links.map(l => `  ${name(l.a.dev)}:${l.a.port} – ${name(l.b.dev)}:${l.b.port}${l.locked ? ' (locked)' : ''}`);
    const extra = [L.features && `features ${JSON.stringify(L.features)}`, L.palette && Object.keys(L.palette).length && `toolbox ${JSON.stringify(L.palette)}`,
      L.defaultHostMode && `new computers start as ${L.defaultHostMode}`, L.explorer && `Subnet helper opens on ${L.explorer}`, L.tutorial && 'tutorial'].filter(Boolean);
    return `Level ${i + 1}: ${L.id}${extra.length ? '\n  ' + extra.join('; ') : ''}\n${devs.join('\n')}\n${links.join('\n')}`;
  });
  t.assert.snapshot(`\n${blocks.join('\n\n')}\n`, { serializers: [v => v] });
});

test('level judging survives broken level code', () => {
  const { Objectives } = require('../load');
  const L = { objectives: [{ check: () => true }, { check: () => { throw new Error('bug'); } }, { check: () => true, verify: () => { throw new Error('bug'); } }] };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(Objectives.evaluate(L, {}), { did: [true, false, true], ok: [true, false, false], complete: false });
    assert.deepEqual(Objectives.review({}, {}), []);
    assert.deepEqual(Objectives.review({ review: () => undefined }, {}), []);
    assert.deepEqual(Objectives.review({ review: () => { throw new Error('bug'); } }, {}), []);
    assert.deepEqual(Objectives.review({ review: () => ['x'] }, {}), ['x']);
    assert.deepEqual(Objectives.evaluate({ objectives: [{ check: () => 1 }] }, {}), { did: [true], ok: [true], complete: true });
  } finally { console.warn = warn; }
});

test('review notes, word for word', () => {
  const g = play('acl');
  solutions.acl(g);
  g.router().config.acl.push(rule('permit', '10.1.20.0/24', 'any', 'tcp', '80'));
  assert.deepEqual(g.review(), [
    'Rule 4 (<code>permit 10.1.20.0/24 → any TCP 80</code>) can never match: rule 3 above it already catches everything it would. You can delete it.',
    'Your list has 4 rules. It can be done with 3: compare with the model solution.',
  ]);
  const p = play('portforward');
  solutions.portforward(p);
  p.router().config.portForwards.push({ proto: 'tcp', port: '22', ip: '192.168.1.80', toPort: '22' });
  assert.match(p.review()[0], /more than one port-forwarding rule/);
  assert.equal(p.review().length, 1);
  const d = play('dmz');
  solutions.dmz(d);
  d.dev('web').config.dns = '10.1.99.53';
  assert.deepEqual(d.review(), ['WebServer still uses an inside DNS server, which the DMZ is (rightly) not allowed to reach. Give it <code>8.8.8.8</code>.']);
  d.dev('web').config.dns = '10.2.0.1';
  assert.deepEqual(d.review(), [], 'outside 10.1.0.0/16 is not flagged');
  d.dev('web').config.dns = 'garbage';
  assert.deepEqual(d.review(), []);
  const s = play('subnet-halves');
  solutions['subnet-halves'](s);
  s.router().config.ifaces['Gi0/2'].ip = '192.168.50.200';
  s.rebuild();
  assert.deepEqual(s.review(), ['<b>Lab</b>’s router is <code>192.168.50.200</code>. By convention the router takes the <b>first</b> usable address (<code>192.168.50.129</code>), so anyone can guess the gateway.']);
  const u = play('subnetting');
  u.router().config.ifaces['Gi0/1'].ip = '';
  u.rebuild();
  assert.deepEqual(u.review(), [], 'unconfigured interfaces are skipped');
  const t7 = play('troubleshoot');
  solutions.troubleshoot(t7);
  for (const [ip, flagged] of [['192.168.1.100', true], ['192.168.1.199', true], ['192.168.1.99', false], ['192.168.1.200', false]]) {
    t7.dev('accounts').config.ip = ip;
    assert.equal(t7.review().length, flagged ? 1 : 0, ip);
  }
  t7.dev('accounts').config = Object.assign(t7.dev('accounts').config, { mode: 'dhcp', ip: '192.168.1.150' });
  assert.deepEqual(t7.review(), [], 'a DHCP device’s leftover static address is ignored');
});

test('the Subnet helper tutorial counts blocks in any order', () => {
  const g = play('subnet-basics');
  g.act.subnetHelper([['192.168.1.128', 25], ['192.168.1.0', 25]]);
  assert.equal(g.result().ok[1], true);
  g.act.subnetHelper([['192.168.1.224', 27], ['192.168.1.0', 25], ['192.168.1.192', 27], ['192.168.1.128', 26]]);
  assert.equal(g.result().ok[4], true, 'one /25, one /26 and two /27s, listed in any order');
  const h = play('subnet-basics');
  h.act.subnetHelper([['192.168.1.0', 26], ['192.168.1.64', 26], ['192.168.1.128', 26], ['192.168.1.192', 26]], 3);
  assert.equal(h.result().ok[3], false, 'the selected /26 must be .128, not .192');
  h.act.subnetHelper([['192.168.1.128', 25]], 0);
  assert.equal(h.result().ok[3], false, 'a /25 at .128 is not the /26');
});

// ---------- Regression tests ----------

test('broken steps: a "prove it" step stops counting when a later change breaks it', () => {
  const g = play('ports');
  g.act.browse('sales', 'intranet.office');
  assert.equal(g.result().ok[0], true);
  g.dev('fs').config.services.web = false;
  g.rebuild();
  const r = g.result();
  assert.equal(r.did[0], true, 'the step was done');
  assert.equal(r.ok[0], false, 'but it no longer holds');
});

test('level 14: writing the rules before trying the open still completes (opening step accepts a blocked attempt)', () => {
  const g = play('acl');
  g.router().config.acl = [rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'), rule('deny', 'any', '10.1.99.30'), rule('permit', 'any', 'any')];
  g.rebuild();
  g.act.open('sales', '\\\\hr.office');
  g.act.test('sales', 'hr.office', 445);
  assert.deepEqual(failing(g), []);
});

test('level 14: an allowlist (permits only, relying on the built-in deny) completes', () => {
  const g = play('acl');
  g.act.open('sales', '\\\\hr.office');
  g.router().config.acl = [
    rule('permit', 'any', 'any', 'udp', '53'),
    rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'),
    rule('permit', '10.1.0.0/16', '10.1.99.20', 'tcp', '445'),
    rule('permit', '10.1.0.0/16', '10.1.99.20', 'tcp', '80'),
    rule('permit', '10.1.0.0/16', 'any', 'tcp', '80'),
  ];
  g.rebuild();
  g.act.test('sales', 'hr.office', 445);
  assert.deepEqual(failing(g), []);
  assert.match(g.review().join(' '), /can be done with 3/, 'the review points to the shorter list');
});

test('level 14: a single HR permit blocks DNS too, so HR cannot open the share by name', () => {
  const g = play('acl');
  g.router().config.acl = [rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445')];
  g.rebuild();
  assert.equal(g.act.open('hr', '\\\\hr.office').ok, false);
  assert.equal(g.act.open('hr', '\\\\10.1.99.30').ok, true, 'by address it works: only DNS is blocked');
});

test('level 11: oversized, badly placed subnets pass but get review notes', () => {
  const g = play('subnetting');
  const r = g.router().config.ifaces;
  const set = (n, ip, mask, s, e) => Object.assign(r[n], { ip, mask, dhcp: { enabled: true, start: s, end: e, dns: '8.8.8.8' } });
  set('Gi0/1', '172.16.5.1', '255.255.255.192', '172.16.5.2', '172.16.5.62');
  set('Gi0/2', '172.16.5.129', '255.255.255.192', '172.16.5.130', '172.16.5.190');
  set('Gi0/3', '172.16.5.200', '255.255.255.240', '172.16.5.194', '172.16.5.206');
  g.rebuild();
  assert.deepEqual(failing(g), []);
  const notes = g.review().join(' ');
  assert.match(notes, /Engineering<\/b> uses a \/26/);
  assert.match(notes, /first<\/b> usable address/);
  assert.match(notes, /reach up to/);
});

test('level 7: static addresses inside the DHCP pool are flagged', () => {
  const g = play('troubleshoot');
  solutions.troubleshoot(g);
  g.dev('accounts').config.ip = '192.168.1.150';
  g.rebuild();
  assert.match(g.review().join(' '), /Accounts has the static address/);
});

test('level 15: the broken starting rules fail most objectives', () => {
  const g = play('acl-troubleshoot');
  assert.ok(g.result().ok.filter(Boolean).length <= 1);
});

test('level 17: a leftover port forward to the old address is flagged', () => {
  const g = play('dmz');
  solutions.dmz(g);
  g.router().config.portForwards.push({ proto: 'tcp', port: '8080', ip: '10.1.99.80', toPort: '80' });
  assert.match(g.review().join(' '), /old address/);
});

test('level 18: a trunk carrying all VLANs is flagged', () => {
  const g = play('vlans');
  solutions.vlans(g);
  g.dev('Floor2-SW').config.ports.P8 = { mode: 'trunk', allowed: null };
  g.rebuild();
  assert.deepEqual(failing(g), []);
  assert.match(g.review().join(' '), /Floor2-SW’s trunk carries <b>all<\/b>/);
});

test('level 18: a trunk on one end only leaves floor 2 without addresses', () => {
  const g = play('vlans');
  solutions.vlans(g);
  g.dev('Floor2-SW').config.ports.P8 = { mode: 'access', vlan: 1 };
  g.rebuild();
  assert.equal(g.T.byDev[g.dev('sales2').id][0].source, 'apipa');
});

test('level 20: Jump1 open to everyone is flagged', () => {
  const g = play('ssh');
  solutions.ssh(g);
  g.dev('jump').config.sshAllow = '';
  assert.match(g.review().join(' '), /Jump1 itself accepts SSH from anyone/);
});

test('level 9: the tutorial needs the /30 before the final merge', () => {
  const g = play('subnet-basics');
  g.act.subnetHelper([['192.168.1.0', 24]]);
  assert.equal(g.result().ok[6], false);
  g.act.subnetHelper([['192.168.1.0', 30]]);
  g.act.subnetHelper([['192.168.1.0', 24]]);
  assert.equal(g.result().ok[6], true);
  assert.equal(P('192.168.1.0') > 0, true);
});

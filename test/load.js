// Loads the game's core modules (no browser needed) and provides helpers for tests.
//
// The core is plain browser scripts that attach themselves to a global NG object, so this file
// fakes the one browser global they use (window) and runs them in the same order as index.html.
// Only the modules with no page code are loaded: ip, model, sim and levels.
'use strict';
const path = require('node:path');

globalThis.window = globalThis;
const js = f => require(path.join(__dirname, '..', 'js', f));
js('util.js');
js('ip.js');
js('model.js');
js('sim.js');
js('levels.js');

const { IP, Sim, Model, Levels, Objectives } = globalThis.NG;
const P = IP.parse;

// A level being played: its network, the simulation built from it and the events so far,
// shaped exactly like the game's own context (G.ctx() in game.js).
function play(id) {
  const L = typeof id === 'number' ? Levels[id] : Levels.find(l => l.id === id);
  if (!L) throw new Error(`No level "${id}"`);
  const g = { L, net: Model.create(), events: [], T: null, trace: [] };
  L.setup(g.net, Model);
  g.ctx = () => ({ net: g.net, T: g.T, events: g.events });
  g.result = () => Objectives.evaluate(L, g.ctx());
  // The progress trace: after each change or command, one symbol per objective.
  //   ✓ done and still holds   · not done   ! done once, but broken now
  // and, separately, what each objective's "verify" re-check says right now (- = it has none).
  g.mark = label => {
    const r = g.result(), c = g.ctx();
    const steps = r.ok.map((ok, i) => (ok ? '✓' : r.did[i] ? '!' : '·')).join('');
    const verify = L.objectives.map(o => (!o.verify ? '-' : safe(() => o.verify(c)) ? '✓' : '·')).join('');
    g.trace.push(`${label.padEnd(44)} ${steps}   verify: ${verify}`);
  };
  g.rebuild = (label = 'settings changed') => { g.T = Sim.build(g.net); if (g.T) g.mark(label); return g; };
  g.review = () => Objectives.review(L, g.ctx());
  g.dev = nameOrTag => {
    const d = g.net.devices.find(x => x.tag === nameOrTag || x.name === nameOrTag);
    if (!d) throw new Error(`No device "${nameOrTag}" in level ${L.id}`);
    return d;
  };
  g.router = () => g.net.devices.find(d => NG.Types[d.type].kind === 'router');
  g.ip = nameOrTag => IP.str(g.T.byDev[g.dev(nameOrTag).id][0].ip);
  g.act = actions(g);
  return g.rebuild('start');
}

const safe = f => { try { return !!f(); } catch (e) { return false; } };

// The terminal commands, without the terminal: each runs the same simulation call as terminal.js
// and records the same event, so level objectives see exactly what they would in the game.
// If you change an event's shape in terminal.js, change it here too (the browser tests check they match).
function actions(g) {
  const id = t => g.dev(t).id;
  const ev = e => { g.events.push(e); return e; };
  const isIp = s => P(s) != null;
  // Each command also adds a line to the progress trace, e.g. "ping(PC1, 8.8.8.8)".
  const traced = cmds => Object.fromEntries(Object.entries(cmds).map(([name, f]) => [name, (...args) => {
    const e = f(...args);
    g.mark(`${name}(${args.map(a => (Array.isArray(a) ? a.map(b => b.join('/')).join(' ') : a)).join(', ')})`);
    return e;
  }]));
  return traced({
    ipconfig(t) { const i = g.T.byDev[id(t)][0]; return ev({ type: 'ipconfig', dev: id(t), source: i.source, ip: i.ip }); },
    ping(t, target) {
      let dst = P(target);
      if (dst == null) {
        const r = Sim.resolve(g.T, id(t), target);
        if (!r.ok) return ev({ type: 'ping', dev: id(t), name: target.toLowerCase(), ok: false });
        dst = r.ip;
      }
      const x = Sim.transact(g.T, id(t), dst);
      return ev({ type: 'ping', dev: id(t), dst, name: isIp(target) ? null : target.toLowerCase(), ok: x.ok, code: x.fail && x.fail.code });
    },
    nslookup(t, name) { const r = Sim.resolve(g.T, id(t), name); return ev({ type: 'nslookup', dev: id(t), name: name.toLowerCase(), ok: r.ok }); },
    browse(t, url) { const r = Sim.browse(g.T, id(t), url); return ev({ type: 'browse', dev: id(t), host: r.host, ok: r.ok }); },
    open(t, share) { const r = Sim.openShare(g.T, id(t), share); return ev({ type: 'open', dev: id(t), host: r.host, ok: r.ok, code: r.fail && r.fail.code }); },
    test(t, target, port) {
      const r = Sim.testPort(g.T, id(t), target, port);
      return ev({ type: 'test', dev: id(t), host: String(target).toLowerCase(), ip: r.ip, port, ok: r.ok, closed: !!r.closed, code: r.fail && r.fail.code });
    },
    netstat(t) { return ev({ type: 'netstat', dev: id(t), ports: Sim.listening(g.dev(t)).map(s => s.port) }); },
    ssh(t, target) {
      const r = Sim.testPort(g.T, id(t), target, 22);
      if (r.ok) return ev({ type: 'ssh', dev: id(t), to: r.conn.req.dev, ok: true });
      return ev({ type: 'ssh', dev: id(t), ip: r.ip, ok: false, code: r.fail && r.fail.code });
    },
    visit() { const x = Sim.externalVisit(g.T); return ev({ type: 'external', ok: x.ok }); },
    // The Subnet helper reports its layout as an event (see explorer.js).
    subnetHelper(blocks, sel = 0) { return ev({ type: 'sx', base: P('192.168.1.0'), blocks: blocks.map(([n, p]) => ({ net: P(n), p })), sel }); },
  });
}

// Small builders used by the solutions.
const rule = (action, src, dst, proto = 'any', port = '') => ({ action, src, dst, proto, port });
const lan = (ip, mask, dhcp) => Object.assign({ ip, mask }, dhcp ? { dhcp: Object.assign({ enabled: true }, dhcp) } : {});

module.exports = { NG: globalThis.NG, IP, Sim, Model, Levels, Objectives, P, play, rule, lan };

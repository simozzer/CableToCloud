// Level definitions. Each level: setup(), palette, objectives (live checks), hints, briefing, learned.
(function () {
  const IP = NG.IP;

  const H = {
    devs: (c, type) => c.net.devices.filter(d => d.type === type),
    ifc: (c, d) => c.T.byDev[d.id][0],
    cabled: (c, d, pred) => c.net.links.some(l => {
      const me = l.a.dev === d.id ? l.a : l.b.dev === d.id ? l.b : null;
      if (!me) return false;
      const other = me === l.a ? l.b : l.a;
      const od = c.net.devices.find(x => x.id === other.dev);
      return od && pred(od, other.port);
    }),
    ev: (c, f) => c.events.some(f),
  };

  const Levels = [];

  Levels.push({
    id: 'dhcp',
    title: 'Hello, Internet',
    subtitle: 'Connect a PC with a cable and DHCP',
    palette: { pc: 1 },
    defaultHostMode: 'none',
    setup(net, M) {
      const inet = M.add(net, 'internet', 120, 290, { locked: true });
      const r = M.add(net, 'homerouter', 420, 290, { locked: true, lockedConfig: true });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
    },
    briefing: `
      <p>You've just unboxed a new PC and want to get it online. Your Internet provider has already installed a
      <b>home router</b> and connected it to the <b>Internet</b>.</p>
      <div class="concepts">
        <div class="concept"><h5>Router: WAN and LAN</h5>
          <p>The <b>WAN</b> port faces the Internet. The <b>LAN</b> ports are for your own devices. The router passes traffic between the two.</p></div>
        <div class="concept"><h5>IP address</h5>
          <p>Every device on a network needs its own address: four numbers from 0–255, like <code>192.168.1.100</code>.</p></div>
        <div class="concept"><h5>DHCP</h5>
          <p>The router has a <b>DHCP server</b> that hands out addresses automatically. The PC <i>Discovers</i>, the router <i>Offers</i>,
          the PC <i>Requests</i>, the router <i>Acknowledges</i> (“DORA”). The PC also learns its <b>subnet mask</b>, <b>default gateway</b> and <b>DNS server</b>.</p></div>
      </div>
      <h4>How to play</h4>
      <ul class="howto">
        <li><b>Drag</b> a device from the Toolbox onto the workspace (or just click it).</li>
        <li>Choose the <b>Ethernet cable</b> tool, click one device, then the other. Routers ask which port to use.</li>
        <li><b>Click</b> a device to see and change its settings in the panel on the right.</li>
        <li>Type commands such as <code>ipconfig</code> and <code>ping</code> in the <b>terminal</b> at the bottom.</li>
      </ul>`,
    objectives: [
      { text: 'Drag a <b>PC</b> from the Toolbox onto the workspace',
        check: c => H.devs(c, 'pc').length > 0 },
      { text: 'With the <b>Ethernet cable</b> tool, plug the PC into one of the router’s <b>LAN</b> ports',
        check: c => H.devs(c, 'pc').some(pc => H.cabled(c, pc, (d, port) => d.type === 'homerouter' && port.startsWith('LAN'))) },
      { text: 'Set the PC to <b>Obtain an IP address automatically (DHCP)</b> and apply',
        check: c => H.devs(c, 'pc').some(pc => pc.config.mode === 'dhcp') },
      { text: 'The PC gets an address from the router’s DHCP server',
        check: c => H.devs(c, 'pc').some(pc => H.ifc(c, pc).source === 'dhcp' && pc.config.mode === 'dhcp' && !H.ifc(c, pc).srv.dhcpServer.isp) },
      { text: 'In the PC’s terminal, run <code>ipconfig</code> to see what DHCP gave you',
        check: c => H.ev(c, e => e.type === 'ipconfig' && e.source === 'dhcp') },
      { text: 'Test your Internet connection: <code>ping 8.8.8.8</code>',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dst === IP.parse('8.8.8.8')) },
    ],
    hints: [
      'Drag the PC to the right-hand side of the router so the cable is easy to draw.',
      'Pick the <b>Ethernet cable</b> tool, click the PC, then click the router and choose a <b>LAN</b> port (not WAN — that one already goes to the Internet).',
      'Click the PC with the <b>Select</b> tool. Under <b>IPv4 settings</b>, choose “Obtain an IP address automatically (DHCP)” and press <b>Apply settings</b>.',
      'Click in the terminal at the bottom and type <code>ipconfig</code>, then <code>ping 8.8.8.8</code>.',
    ],
    learned: `
      <ul>
        <li>Your devices plug into the router’s <b>LAN</b> ports. The <b>WAN</b> port connects to your Internet provider.</li>
        <li><b>DHCP</b> gave your PC four settings: an IP address, a subnet mask, a default gateway (the router) and a DNS server.</li>
        <li><code>ipconfig</code> shows a computer’s settings. <code>ping</code> checks whether another device answers.</li>
        <li>Your PC has a <i>private</i> address (192.168.x.x). The router used <b>NAT</b> to send your traffic onto the Internet from its own public WAN address.</li>
      </ul>`,
  });

  // ---------- Level 2 ----------
  const P = IP.parse;
  const pc1 = c => c.net.devices.find(d => d.tag === 'pc1');
  const isStatic = c => pc1(c).config.mode === 'static';

  Levels.push({
    id: 'static',
    title: 'Set in Stone',
    subtitle: 'Configure a static IP address',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 120, 290, { locked: true });
      const r = M.add(net, 'homerouter', 420, 290, {
        locked: true, lockedConfig: true,
        config: { ifaces: { LAN: { dhcp: { enabled: false } } } },
      });
      const pc = M.add(net, 'pc', 740, 290, { locked: true, tag: 'pc1', hostMode: 'dhcp' });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', pc, 'eth0', { locked: true });
    },
    briefing: `
      <p>At the office, the manager has <b>switched off the router’s DHCP server</b>. Every device here gets a fixed (<b>static</b>) address
      that you type in by hand. PC1 is plugged in, but it can’t get online.</p>
      <div class="concepts">
        <div class="concept"><h5>169.254.x.x = trouble</h5>
          <p>When a computer set to DHCP gets no answer, it gives itself a <b>self-assigned</b> (APIPA) address starting <code>169.254</code>.
          It has no gateway, so it can’t reach the Internet.</p></div>
        <div class="concept"><h5>IP address &amp; subnet mask</h5>
          <p>The <b>mask</b> says which part of the address is the <i>network</i>. With <code>255.255.255.0</code> (also written <code>/24</code>)
          the first three numbers are the network, so <code>192.168.1.50</code> and <code>192.168.1.1</code> are on the same network, <code>192.168.1.0/24</code>.
          The last number must be unique on that network.</p></div>
        <div class="concept"><h5>Default gateway</h5>
          <p>Where to send anything that is <i>not</i> on the local network. That’s the router’s <b>LAN</b> address. Click the router to find it.</p></div>
        <div class="concept"><h5>DNS server</h5>
          <p>Turns names like <i>www.example.com</i> into IP addresses. <code>8.8.8.8</code> is Google’s public DNS server.</p></div>
      </div>
      <p class="muted small">Tip: a live calculator under the address boxes shows which network your address is in.</p>`,
    objectives: [
      { text: 'Run <code>ipconfig</code> on PC1 and spot its self-assigned <code>169.254.x.x</code> address',
        check: c => H.ev(c, e => e.type === 'ipconfig' && e.dev === pc1(c).id && e.source === 'apipa') },
      { text: 'Switch PC1 to <b>Use the following IP address (static)</b>',
        check: c => isStatic(c) },
      { text: 'IP address: <code>192.168.1.50</code>',
        check: c => isStatic(c) && P(pc1(c).config.ip) === P('192.168.1.50') },
      { text: 'Subnet mask: <code>255.255.255.0</code>',
        check: c => isStatic(c) && IP.parseMask(pc1(c).config.mask) === IP.maskFromPrefix(24) },
      { text: 'Default gateway: the router’s <b>LAN</b> address',
        check: c => isStatic(c) && P(pc1(c).config.gw) === P('192.168.1.1') },
      { text: 'DNS server: <code>8.8.8.8</code>',
        check: c => isStatic(c) && (IP.parseList(pc1(c).config.dns) || []).includes(P('8.8.8.8')) },
      { text: 'Check the local network: <code>ping</code> the gateway',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === pc1(c).id && e.dst === P('192.168.1.1')) },
      { text: 'Check the Internet: <code>ping 8.8.8.8</code>',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === pc1(c).id && e.dst === P('8.8.8.8')) },
    ],
    hints: [
      'Click PC1, then type <code>ipconfig</code> in the terminal. The 169.254 address shows DHCP failed.',
      'Click the <b>router</b>. Its LAN interface shows <code>192.168.1.1/24</code>. That address is PC1’s default gateway, and <code>/24</code> means the mask is <code>255.255.255.0</code>.',
      'Click PC1, choose <b>Use the following IP address (static)</b>, fill in all four boxes and press <b>Apply settings</b>.',
      'Use the quick-test buttons: <b>ping gateway</b> first, then <b>ping 8.8.8.8</b>.',
    ],
    learned: `
      <ul>
        <li>A <code>169.254.x.x</code> address means the computer wanted DHCP but no DHCP server answered.</li>
        <li>A static configuration needs four things: <b>IP address</b>, <b>subnet mask</b>, <b>default gateway</b> and <b>DNS server</b>.</li>
        <li>The IP address must be in the <b>same network</b> as the gateway (here <code>192.168.1.0/24</code>) and must not be used by any other device.</li>
        <li>Troubleshoot step by step: first <code>ping</code> the gateway (local network), then something on the Internet.</li>
        <li>Static addresses suit devices that must never change address, such as servers and printers.</li>
      </ul>`,
  });

  // ---------- Level 3 ----------
  const M24 = IP.maskFromPrefix(24);
  const POOL = [P('192.168.1.100'), P('192.168.1.199')];
  const lanIf = c => c.T.ifaces.find(i => i.kind === 'router' && i.role === 'lan');
  const onLan = (c, d) => { const i = H.ifc(c, d), lan = lanIf(c); return i.up && lan.up && i.seg === lan.seg; };
  const pcs = c => H.devs(c, 'pc');
  const server = c => H.devs(c, 'server')[0];
  const serverIp = c => { const s = server(c); return s ? H.ifc(c, s).ip : null; };

  Levels.push({
    id: 'switch',
    title: 'Growing Office',
    subtitle: 'Connect several devices with a switch',
    palette: { switch: 1, pc: 3, server: 1 },
    defaultHostMode: 'dhcp',
    setup(net, M) {
      const inet = M.add(net, 'internet', 110, 290, { locked: true });
      const r = M.add(net, 'isprouter', 320, 290, { locked: true, lockedConfig: true });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
    },
    briefing: `
      <p>Your small business is growing: three staff PCs and a <b>file server</b> all need to be on the network.
      But the ISP’s router has only <b>one LAN port</b>!</p>
      <div class="concepts">
        <div class="concept"><h5>Switch</h5>
          <p>A switch has lots of ports and joins every device plugged into it into <b>one local network</b>. Connect the switch to the router,
          and every device on the switch can reach the router too. A simple switch needs no IP address.</p></div>
        <div class="concept"><h5>Switch vs router</h5>
          <p>A <b>switch</b> connects devices <i>within</i> a network. A <b>router</b> connects <i>different</i> networks together, such as your LAN and the Internet.</p></div>
        <div class="concept"><h5>DHCP pool</h5>
          <p>The router’s DHCP server only hands out addresses from its <b>pool</b>, here <code>192.168.1.100</code>–<code>192.168.1.199</code>.
          Click the router to see it.</p></div>
        <div class="concept"><h5>Static devices go outside the pool</h5>
          <p>A server needs an address that never changes, so give it a static one. Pick one <b>outside</b> the pool. Otherwise DHCP could hand the
          same address to a PC, and the two devices would clash (an <b>IP conflict</b>).</p></div>
      </div>`,
    objectives: [
      { text: 'Connect a <b>switch</b> to the router’s <b>LAN</b> port',
        check: c => H.devs(c, 'switch').some(sw => H.cabled(c, sw, (d, port) => d.type === 'isprouter' && port === 'LAN')) },
      { text: 'Plug three <b>PCs</b> into the switch',
        check: c => pcs(c).filter(pc => onLan(c, pc) && H.cabled(c, pc, d => d.type === 'switch')).length >= 3 },
      { text: 'All three PCs get an address by DHCP',
        check: c => pcs(c).filter(pc => onLan(c, pc) && H.ifc(c, pc).source === 'dhcp').length >= 3 },
      { text: 'Connect the <b>server</b> and give it a <b>static</b> address in <code>192.168.1.0/24</code> that is <b>outside the DHCP pool</b>',
        check: c => {
          const s = server(c);
          if (!s || s.config.mode !== 'static' || !onLan(c, s)) return false;
          const i = H.ifc(c, s);
          return i.ip != null && !i.conflict && IP.same(i.ip, P('192.168.1.0'), M24) && (i.ip < POOL[0] || i.ip > POOL[1]) && i.ip !== P('192.168.1.1');
        } },
      { text: 'Give the server the correct subnet mask, default gateway and DNS server',
        check: c => {
          const s = server(c);
          if (!s || s.config.mode !== 'static') return false;
          const i = H.ifc(c, s);
          return i.mask === M24 && i.gw === P('192.168.1.1') && i.dns.length > 0;
        } },
      { text: 'Every PC can reach the server and the Internet',
        check: c => {
          const ip = serverIp(c), list = pcs(c), target = P('8.8.8.8');
          return ip != null && list.length >= 3 && list.every(pc =>
            NG.Sim.transact(c.T, pc.id, ip).ok && NG.Sim.transact(c.T, pc.id, target).ok);
        } },
      { text: 'Prove it: from a PC, <code>ping</code> the server',
        check: c => { const s = server(c); return H.ev(c, e => e.type === 'ping' && e.ok && s && e.dst === H.ifc(c, s).ip && pcs(c).some(pc => pc.id === e.dev)); } },
    ],
    hints: [
      'Drag the switch between the router and where your PCs will go. Use the cable tool to connect the router’s <b>LAN</b> port to the switch.',
      'Cable each PC to the switch. Switch ports are picked automatically. PCs start on DHCP, so they should get addresses straight away.',
      'Click the router to see the DHCP pool (<code>.100</code>–<code>.199</code>). For the server, pick something outside it, such as <code>192.168.1.10</code>.',
      'Server settings: mask <code>255.255.255.0</code>, gateway <code>192.168.1.1</code> (the router), DNS <code>8.8.8.8</code>. Then click a PC and type <code>ping 192.168.1.10</code>.',
    ],
    learned: `
      <ul>
        <li>A <b>switch</b> lets many devices share one network. Everything on it is on the same local network as the router’s LAN.</li>
        <li>A <b>router</b> joins <i>different</i> networks. A switch joins devices <i>within</i> one network.</li>
        <li>The DHCP server gives addresses from a <b>pool</b>. Devices with static addresses, like servers and printers, should use addresses <b>outside</b> the pool to avoid IP conflicts.</li>
        <li>Devices on the same network talk to each other directly. Only traffic for other networks goes to the default gateway.</li>
      </ul>`,
  });

  // ---------- Level 4 ----------
  const NET4 = P('10.20.30.0');
  const in4 = ip => ip != null && IP.same(ip, NET4, M24);
  const router4 = c => c.net.devices.find(d => d.type === 'homerouter');
  const lan4 = c => router4(c).config.ifaces.LAN;
  const PRINTER4 = P('10.20.30.10');

  Levels.push({
    id: 'router',
    title: 'Fresh Out of the Box',
    subtitle: 'Configure the router’s LAN and DHCP server',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 110, 290, { locked: true });
      const r = M.add(net, 'homerouter', 330, 290, {
        locked: true,
        config: { ifaces: { LAN: { ip: '192.168.0.1', mask: '255.255.255.0', dhcp: { enabled: true, start: '192.168.0.100', end: '192.168.0.199', dns: '192.168.0.1' } } } },
      });
      const sw = M.add(net, 'switch', 560, 290, { locked: true });
      const pcs4 = [[800, 120], [860, 290], [800, 460]].map(([x, y]) => M.add(net, 'pc', x, y, { locked: true, hostMode: 'dhcp' }));
      const pr = M.add(net, 'printer', 560, 480, {
        locked: true, hostMode: 'static',
        config: { ip: '10.20.30.10', mask: '255.255.255.0', gw: '10.20.30.1', dns: '1.1.1.1' },
      });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', sw, 'P1', { locked: true });
      pcs4.forEach((pc, k) => M.connect(net, sw, 'P' + (k + 2), pc, 'eth0', { locked: true }));
      M.connect(net, sw, 'P5', pr, 'eth0', { locked: true });
    },
    briefing: `
      <p>You’re now the network administrator for a new office. The router has just been <b>reset to factory settings</b>, so it uses
      <code>192.168.0.0/24</code>. But the company standard is <code>10.20.30.0/24</code>, and the printer has already been set up for it.
      Reconfigure the router to match.</p>
      <div class="box"><b>Company network plan</b>
        <table class="kv">
          <tr><th>Network</th><td><code>10.20.30.0/24</code> (mask <code>255.255.255.0</code>)</td></tr>
          <tr><th>Router (gateway)</th><td><code>10.20.30.1</code></td></tr>
          <tr><th>Printer (static)</th><td><code>10.20.30.10</code></td></tr>
          <tr><th>DHCP pool</th><td><code>10.20.30.100</code> – <code>10.20.30.150</code></td></tr>
          <tr><th>DNS for clients</th><td><code>1.1.1.1</code> (Cloudflare)</td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>Private address ranges</h5>
          <p>These ranges are reserved for local networks and never appear on the Internet:
          <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code> and <code>192.168.0.0/16</code>. The router uses NAT to share its one public address.</p></div>
        <div class="concept"><h5>The router’s LAN address</h5>
          <p>This is the <b>default gateway</b> for every device on the network, so it must be inside the network it serves.</p></div>
        <div class="concept"><h5>DHCP settings</h5>
          <p>The <b>pool</b> is the range of addresses to hand out, and it must be inside the router’s network. Along with an address, DHCP gives each client
          the mask, the gateway (the router) and a <b>DNS server</b>.</p></div>
      </div>
      <p class="muted small">Click the router to edit its settings, then press <b>Save router settings</b>. Watch what happens to the PCs as you change things.</p>`,
    objectives: [
      { text: 'Set the router’s LAN address to <code>10.20.30.1</code> with mask <code>255.255.255.0</code>',
        check: c => { const i = lanIf(c); return i.ip === P('10.20.30.1') && i.mask === M24; } },
      { text: 'Set the DHCP pool to <code>10.20.30.100</code> – <code>10.20.30.150</code>',
        check: c => { const D = lan4(c).dhcp; return D.enabled && P(D.start) === P('10.20.30.100') && P(D.end) === P('10.20.30.150'); } },
      { text: 'Hand out <code>1.1.1.1</code> as the DNS server',
        check: c => { const D = lan4(c).dhcp; return D.enabled && (IP.parseList(D.dns) || []).includes(P('1.1.1.1')); } },
      { text: 'All three PCs get a <code>10.20.30.x</code> address by DHCP',
        check: c => pcs(c).length === 3 && pcs(c).every(pc => { const i = H.ifc(c, pc); return i.source === 'dhcp' && in4(i.ip); }) },
      { text: 'Every PC can reach the printer and the Internet',
        check: c => pcs(c).every(pc => NG.Sim.transact(c.T, pc.id, PRINTER4).ok && NG.Sim.transact(c.T, pc.id, P('8.8.8.8')).ok) },
      { text: 'Check a PC with <code>ipconfig</code> to see its new address',
        check: c => H.ev(c, e => e.type === 'ipconfig' && e.source === 'dhcp' && in4(e.ip)) },
    ],
    hints: [
      'Start with <code>ipconfig</code> on a PC: it has a <code>192.168.0.x</code> address. The printer’s status light is amber because its gateway <code>10.20.30.1</code> doesn’t exist yet.',
      'Click the router, change the LAN IP address to <code>10.20.30.1</code> and save. What happens to the PCs? Click the router again to read why.',
      'The DHCP pool must be inside the router’s network. Change the pool to <code>10.20.30.100</code> – <code>10.20.30.150</code> and the DNS server to <code>1.1.1.1</code>.',
      'Once the PCs have <code>10.20.30.x</code> addresses, run <code>ipconfig</code> on one and <code>ping 10.20.30.10</code> to reach the printer.',
    ],
    learned: `
      <ul>
        <li>The router’s <b>LAN address</b> is the default gateway for the whole network, and decides which network the LAN uses.</li>
        <li>A <b>DHCP pool</b> must sit inside the router’s network. If it doesn’t, the DHCP server can’t run and clients fall back to <code>169.254.x.x</code>.</li>
        <li>DHCP hands out more than an address: the <b>subnet mask</b>, <b>default gateway</b> and <b>DNS server</b> all come with it.</li>
        <li><code>10.0.0.0/8</code>, <code>172.16.0.0/12</code> and <code>192.168.0.0/16</code> are <b>private</b> ranges for local networks.</li>
        <li>Keeping static devices (like the printer at <code>.10</code>) outside the pool (<code>.100</code>–<code>.150</code>) avoids conflicts.</li>
      </ul>`,
  });

  const tagged = (c, t) => c.net.devices.find(d => d.tag === t);
  const canBrowse = (c, d) => !!d && NG.Sim.browse(c.T, d.id, 'www.example.com').ok;

  // ---------- Level 5: DNS ----------
  Levels.push({
    id: 'dns',
    title: 'Names, Not Numbers',
    subtitle: 'How DNS turns names into IP addresses',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 110, 290, { locked: true });
      const r = M.add(net, 'homerouter', 330, 290, { locked: true, lockedConfig: true });
      const sw = M.add(net, 'switch', 560, 290, { locked: true });
      const a = M.add(net, 'pc', 800, 160, {
        locked: true, tag: 'pc1', hostMode: 'static',
        config: { ip: '192.168.1.20', mask: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.53' },
      });
      const b = M.add(net, 'pc', 800, 430, { locked: true, tag: 'pc2', hostMode: 'dhcp' });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', sw, 'P1', { locked: true });
      M.connect(net, sw, 'P2', a, 'eth0', { locked: true });
      M.connect(net, sw, 'P3', b, 'eth0', { locked: true });
    },
    briefing: `
      <p>PC1’s owner rings the help desk: <i>“The Internet is broken! I can’t open any websites.”</i> But is it really broken?</p>
      <div class="concepts">
        <div class="concept"><h5>DNS: the Internet’s phone book</h5>
          <p>Computers connect using IP addresses, but people remember names. Before visiting <i>www.example.com</i>, a computer asks its
          <b>DNS server</b> “what is the IP address of www.example.com?”. Then it connects to that address.</p></div>
        <div class="concept"><h5>Names fail, numbers work</h5>
          <p>If <code>ping 8.8.8.8</code> works but <code>browse www.example.com</code> doesn’t, the network is fine. The problem is <b>DNS</b>.</p></div>
        <div class="concept"><h5>Who answers DNS?</h5>
          <p>Public DNS servers such as <code>8.8.8.8</code> (Google) and <code>1.1.1.1</code> (Cloudflare). Home routers can also <b>relay</b> DNS:
          PCs ask the router, and the router asks its own DNS server on their behalf.</p></div>
      </div>
      <h4>New commands</h4>
      <ul class="howto">
        <li><code>nslookup www.example.com</code> asks the DNS server for a name’s address.</li>
        <li><code>browse www.example.com</code> opens a web page.</li>
        <li><code>ping www.example.com</code> pings by name.</li>
      </ul>`,
    objectives: [
      { text: 'On PC1, <code>ping 8.8.8.8</code>: is the Internet connection really broken?',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'pc1').id && e.dst === P('8.8.8.8')) },
      { text: 'On PC1, try <code>browse www.example.com</code> and read why it fails',
        check: c => H.ev(c, e => e.type === 'browse' && e.dev === tagged(c, 'pc1').id) },
      { text: 'On PC2 (which works), run <code>nslookup www.example.com</code>',
        check: c => H.ev(c, e => e.type === 'nslookup' && e.ok && e.dev === tagged(c, 'pc2').id) },
      { text: 'Fix PC1’s <b>DNS server</b> setting',
        check: c => NG.Sim.resolve(c.T, tagged(c, 'pc1').id, 'www.example.com').ok },
      { text: 'On PC1, <code>browse www.example.com</code> successfully',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'pc1').id) },
      { text: 'On PC1, <code>ping www.example.com</code> by name',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'pc1').id && e.name === 'www.example.com') },
    ],
    hints: [
      'Click PC1 and type <code>ping 8.8.8.8</code>. Replies mean the network path to the Internet works fine.',
      'Now try <code>browse www.example.com</code> on PC1. The “Why?” line explains that its DNS server <code>192.168.1.53</code> doesn’t exist.',
      'Click PC2 and run <code>ipconfig</code>, then <code>nslookup www.example.com</code>. Which DNS server does PC2 use?',
      'Click PC1 and change its DNS server to <code>8.8.8.8</code> (or the router, <code>192.168.1.1</code>). Then press <b>Apply settings</b>.',
    ],
    learned: `
      <ul>
        <li><b>DNS</b> turns names like <i>www.example.com</i> into IP addresses. Without it, you can only reach things by number.</li>
        <li>If pinging an IP address works but names don’t, suspect <b>DNS</b>, not the network.</li>
        <li><code>nslookup</code> tests DNS directly and shows which server answered.</li>
        <li>A home router can <b>relay</b> DNS: PCs ask the router, and the router asks the ISP’s or a public DNS server.</li>
      </ul>`,
  });

  // ---------- Level 6: two networks ----------
  const STAFF = P('192.168.10.0'), GUEST = P('192.168.20.0');
  const routerIf = (c, name) => c.T.ifaces.find(i => i.kind === 'router' && i.name === name);
  const inNet = (c, d, net) => { const i = H.ifc(c, d); return i.source === 'dhcp' && i.ip != null && IP.same(i.ip, net, M24); };
  const ifOk = (c, name, gw) => { const i = routerIf(c, name); return i && i.ip === P(gw) && i.mask === M24; };
  const dhcpOk = (c, name) => { const i = routerIf(c, name); return i && i.dhcpServer && i.dhcpServer.valid && i.dhcpServer.dns.length > 0; };

  Levels.push({
    id: 'subnets',
    title: 'Staff and Guests',
    subtitle: 'Two networks on one router',
    palette: { switch: 2, pc: 2, laptop: 2 },
    defaultHostMode: 'dhcp',
    setup(net, M) {
      const inet = M.add(net, 'internet', 110, 290, { locked: true });
      const r = M.add(net, 'officerouter', 330, 290, { locked: true });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
    },
    briefing: `
      <p>The office wants free Wi-Fi-style access for <b>guests</b>, but guests must be on a <b>separate network</b> from the <b>staff</b> computers.
      You have a business router where <b>every port is its own network</b>.</p>
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>Gi0/0</th><td>WAN: already connected to the Internet</td></tr>
          <tr><th>Gi0/1: Staff</th><td><code>192.168.10.0/24</code>, router <code>192.168.10.1</code>. Two PCs</td></tr>
          <tr><th>Gi0/2: Guests</th><td><code>192.168.20.0/24</code>, router <code>192.168.20.1</code>. Two laptops</td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>One interface, one network</h5>
          <p>Each router interface has its own IP address and belongs to a different network. The router <b>routes</b> packets between them.</p></div>
        <div class="concept"><h5>One DHCP scope per network</h5>
          <p>Each network needs its own DHCP pool inside its own range, and each hands out its own gateway (that interface’s address).</p></div>
        <div class="concept"><h5>No DNS relay here</h5>
          <p>This business router doesn’t answer DNS questions itself. Hand out a public DNS server such as <code>8.8.8.8</code>.</p></div>
      </div>`,
    objectives: [
      { text: 'Configure <b>Gi0/1</b> (Staff) as <code>192.168.10.1</code> / <code>255.255.255.0</code>',
        check: c => ifOk(c, 'Gi0/1', '192.168.10.1') },
      { text: 'Configure <b>Gi0/2</b> (Guests) as <code>192.168.20.1</code> / <code>255.255.255.0</code>',
        check: c => ifOk(c, 'Gi0/2', '192.168.20.1') },
      { text: 'Run a DHCP server on <b>both</b> networks, each handing out a DNS server',
        check: c => dhcpOk(c, 'Gi0/1') && dhcpOk(c, 'Gi0/2') },
      { text: 'Two <b>PCs</b> on the Staff network (through a switch)',
        check: c => H.devs(c, 'pc').filter(d => inNet(c, d, STAFF)).length >= 2 },
      { text: 'Two <b>laptops</b> on the Guest network (through a switch)',
        check: c => H.devs(c, 'laptop').filter(d => inNet(c, d, GUEST)).length >= 2 },
      { text: 'Everyone can <code>browse www.example.com</code>',
        check: c => { const all = [...H.devs(c, 'pc'), ...H.devs(c, 'laptop')]; return all.length >= 4 && all.every(d => canBrowse(c, d)); } },
      { text: 'From a staff PC, <code>ping</code> a guest laptop: the router routes between the networks',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dst != null && IP.same(e.dst, GUEST, M24) && H.devs(c, 'pc').some(d => d.id === e.dev && inNet(c, d, STAFF))) },
    ],
    hints: [
      'Click the router. It has a settings section for each interface: Gi0/1, Gi0/2 and Gi0/3 (unused).',
      'For Gi0/1: IP <code>192.168.10.1</code>, mask <code>255.255.255.0</code>, DHCP on, pool <code>192.168.10.100</code> – <code>192.168.10.199</code>, DNS <code>8.8.8.8</code>. Then do the same for Gi0/2 with <code>192.168.20</code>.',
      'Cable one switch to <b>Gi0/1</b> and the other to <b>Gi0/2</b>. Then plug the PCs into the staff switch and the laptops into the guest switch.',
      'Run <code>ipconfig</code> on a laptop to find its address, then ping that address from a staff PC.',
    ],
    learned: `
      <ul>
        <li>A <b>router</b> connects separate networks: each interface has an address in a different network.</li>
        <li>Each network needs its own <b>DHCP scope</b>, with a pool and gateway inside that network.</li>
        <li>Devices on different networks talk through their <b>default gateway</b>. The router forwards packets between its interfaces.</li>
        <li>Separating guests from staff is a first step towards security. (Real routers then add <b>firewall rules</b> to block traffic between them.)</li>
      </ul>`,
  });

  // ---------- Level 7: troubleshooting ----------
  const USERS7 = [
    { tag: 'reception', name: 'Reception', type: 'pc', x: 330, y: 100, cfg: { ip: '192.168.1.30', mask: '255.255.255.0', gw: '192.168.1.254', dns: '8.8.8.8' } },
    { tag: 'accounts', name: 'Accounts', type: 'pc', x: 600, y: 80, cfg: { ip: '192.168.1.20', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' } },
    { tag: 'design', name: 'Design', type: 'pc', x: 770, y: 150, cfg: { ip: '192.168.1.61', mask: '255.255.255.252', gw: '192.168.1.1', dns: '8.8.8.8' } },
    { tag: 'sales', name: 'Sales', type: 'laptop', x: 770, y: 450, cfg: { ip: '192.168.1.40', mask: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.53' } },
    { tag: 'manager', name: 'Manager', type: 'laptop', x: 600, y: 520, cfg: { ip: '192.168.2.45', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' } },
  ];
  const PRINTER7 = P('192.168.1.20');

  Levels.push({
    id: 'troubleshoot',
    title: 'Help Desk Hero',
    subtitle: 'Find and fix six network faults',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 290, { locked: true });
      const r = M.add(net, 'homerouter', 260, 290, { locked: true, lockedConfig: true });
      const sw = M.add(net, 'switch', 470, 290, { locked: true, name: 'Switch1' });
      const pr = M.add(net, 'printer', 330, 490, { locked: true, name: 'Printer', tag: 'printer', hostMode: 'static', config: { ip: '192.168.1.20', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' } });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', sw, 'P1', { locked: true });
      M.connect(net, sw, 'P2', pr, 'eth0', { locked: true });
      USERS7.forEach((u, k) => {
        const d = M.add(net, u.type, u.x, u.y, { locked: true, name: u.name, tag: u.tag, hostMode: 'static', config: u.cfg });
        M.connect(net, sw, 'P' + (k + 3), d, 'eth0', { locked: true });
      });
      const sw2 = M.add(net, 'switch', 770, 300, { locked: true, name: 'Switch2' });
      const wh = M.add(net, 'pc', 915, 300, { locked: true, name: 'Warehouse', tag: 'warehouse', hostMode: 'dhcp' });
      M.connect(net, sw2, 'P1', wh, 'eth0', { locked: true });
    },
    briefing: `
      <p>Monday morning, and the help desk phone won’t stop ringing. <b>Six people</b> can’t get on the Internet. The router, switch and printer are fine.
      The problems are on the users’ computers. Find and fix each fault.</p>
      <div class="concepts">
        <div class="concept"><h5>1. Physical</h5><p>Is it plugged in? Is the switch connected to the rest of the network?</p></div>
        <div class="concept"><h5>2. Address</h5><p>Run <code>ipconfig</code>. A 169.254 address? A duplicate? An address in the wrong network?</p></div>
        <div class="concept"><h5>3. Local</h5><p><code>ping</code> the gateway (<code>192.168.1.1</code>). If that fails, check the IP address, mask and gateway.</p></div>
        <div class="concept"><h5>4. Internet</h5><p><code>ping 8.8.8.8</code>. If that works, the network is fine.</p></div>
        <div class="concept"><h5>5. Names</h5><p><code>browse www.example.com</code>. If only names fail, check DNS.</p></div>
      </div>
      <p>The office network is <code>192.168.1.0/24</code>. The router (<code>192.168.1.1</code>) hands out <code>.100</code>–<code>.199</code> by DHCP,
      and the printer is at <code>192.168.1.20</code>. Read the <b>Why?</b> lines carefully: they point you at the fault.</p>`,
    objectives: [
      ...USERS7.map(u => ({ text: `<b>${u.name}</b> can browse the web`, check: c => canBrowse(c, tagged(c, u.tag)) })),
      { text: '<b>Warehouse</b> can browse the web', check: c => canBrowse(c, tagged(c, 'warehouse')) },
      { text: 'Everyone can still reach the <b>printer</b> at <code>192.168.1.20</code>',
        check: c => [...USERS7.map(u => u.tag), 'warehouse'].every(t => NG.Sim.transact(c.T, tagged(c, t).id, PRINTER7).ok) },
    ],
    hints: [
      'Check each computer’s status light and the address under its name. An amber or red light, a red address or a 169.254 address all point to a problem.',
      'Reception: <code>ping 192.168.1.1</code>. Accounts: <code>ipconfig</code> shows “Duplicate”. Which device already has that address?',
      'Design: look at its subnet mask. Manager: compare its address with the office network. Sales: <code>ping 8.8.8.8</code> works, so what about DNS?',
      'Warehouse: Switch2 isn’t connected to anything. Cable it to the free port on Switch1. (Or switch a static device to DHCP. That fixes things too!)',
    ],
    learned: `
      <ul>
        <li>Troubleshoot <b>layer by layer</b>: cable, then address, then local network (gateway), then Internet, then names (DNS).</li>
        <li><b>Wrong gateway</b>: the local network works, but nothing beyond it does.</li>
        <li><b>Duplicate IP</b>: two devices fight over one address. Use a unique address, outside the DHCP pool.</li>
        <li><b>Wrong mask</b> or <b>wrong network</b>: the gateway looks like it’s on a different network, so it can’t be reached.</li>
        <li><b>Bad DNS</b>: numbers work, names don’t.</li>
        <li><b>Isolated switch</b>: no DHCP server answers, so the PC falls back to a 169.254 address.</li>
      </ul>`,
  });

  // ---------- Level 8: port forwarding ----------
  const WEB8 = P('192.168.1.80');
  const web8 = c => tagged(c, 'web');
  const router8 = c => c.net.devices.find(d => d.type === 'homerouter');

  Levels.push({
    id: 'portforward',
    title: 'Open for Business',
    subtitle: 'Host a website the Internet can reach',
    palette: {},
    features: { portForward: true },
    setup(net, M) {
      const inet = M.add(net, 'internet', 110, 290, { locked: true });
      const r = M.add(net, 'homerouter', 330, 290, { locked: true });
      const sw = M.add(net, 'switch', 560, 290, { locked: true });
      const pc = M.add(net, 'pc', 800, 150, { locked: true, tag: 'pc1', hostMode: 'dhcp' });
      const web = M.add(net, 'server', 800, 440, {
        locked: true, tag: 'web', name: 'WebServer', hostMode: 'static',
        config: { ip: '192.168.1.80', mask: '255.255.255.0', gw: '', dns: '8.8.8.8' },
      });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', sw, 'P1', { locked: true });
      M.connect(net, sw, 'P2', pc, 'eth0', { locked: true });
      M.connect(net, sw, 'P3', web, 'eth0', { locked: true });
    },
    briefing: `
      <p>Your company wants to run its own website on <b>WebServer</b>, in the office, and customers must be able to reach it from the Internet.
      There’s a catch: everything inside uses <b>private</b> addresses.</p>
      <div class="concepts">
        <div class="concept"><h5>NAT hides your network</h5>
          <p>The router shares one <b>public</b> WAN address between all your devices. Replies to connections <i>you</i> start come back in automatically,
          but a <b>new</b> connection from the Internet arrives at the router, which doesn’t know which inside device it is for.</p></div>
        <div class="concept"><h5>Port forwarding</h5>
          <p>A rule such as “<b>TCP port 80 → 192.168.1.80</b>” tells the router to pass incoming web connections to the server.
          Web servers listen on <b>port 80</b> (HTTP).</p></div>
        <div class="concept"><h5>The way back</h5>
          <p>The server’s reply has to go back through the router to reach the Internet. So the server needs a correct <b>default gateway</b>.</p></div>
      </div>
      <p class="muted small">Test from outside: click the <b>Internet</b> cloud and press <b>Visit from the Internet</b>. The router’s public address is shown on its WAN interface.</p>`,
    objectives: [
      { text: 'Turn on the <b>web server</b> service on WebServer',
        check: c => !!web8(c).config.services.web },
      { text: 'From PC1, <code>browse 192.168.1.80</code> to test the site inside the office',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'pc1').id && e.host === '192.168.1.80') },
      { text: 'On the router, forward <b>TCP port 80</b> to <code>192.168.1.80</code>',
        check: c => router8(c).config.portForwards.some(r => r.proto === 'tcp' && Number(r.port) === 80 && P(r.ip) === WEB8 && Number(r.toPort || r.port) === 80) },
      { text: 'Customers on the Internet can reach your website',
        check: c => NG.Sim.externalVisit(c.T).ok },
      { text: 'Prove it: Internet cloud → <b>Visit from the Internet</b>',
        check: c => H.ev(c, e => e.type === 'external' && e.ok) },
    ],
    hints: [
      'Click WebServer, tick <b>Web server</b> under Services and press <b>Apply settings</b>. Then test from PC1 with <code>browse 192.168.1.80</code>.',
      'Click the router. Under <b>Port forwarding</b> choose TCP, outside port <code>80</code>, inside IP <code>192.168.1.80</code>, port <code>80</code>, then press <b>Add</b>.',
      'Still failing from outside? Read the event log: the request arrives, but the <b>reply</b> can’t get back. Look at WebServer’s settings.',
      'WebServer has no default gateway. Set it to the router: <code>192.168.1.1</code>.',
    ],
    learned: `
      <ul>
        <li><b>NAT</b> lets many private devices share one public address, but it blocks <i>new</i> connections coming in from the Internet.</li>
        <li><b>Port forwarding</b> opens one door: connections to a chosen port on the public address are passed to one inside device.</li>
        <li>Servers use well-known <b>ports</b>, such as 80 for web (HTTP), 443 for secure web (HTTPS) and 53 for DNS.</li>
        <li>A server that is reached from other networks needs a correct <b>default gateway</b>, or its replies get lost.</li>
        <li>Forwarded servers need a <b>static</b> address, so the rule always points at the right device.</li>
      </ul>`,
  });

  // ---------- Subnetting ----------
  const SIZES_TABLE = `
      <table class="tbl">
        <tr><th>Prefix</th><th>Mask</th><th>Last number in binary</th><th>Addresses</th><th>Usable</th><th>Subnets in a /24</th></tr>
        <tr><td>/24</td><td><code>255.255.255.0</code></td><td><code>00000000</code></td><td>256</td><td>254</td><td>1</td></tr>
        <tr><td>/25</td><td><code>255.255.255.128</code></td><td><code>10000000</code></td><td>128</td><td>126</td><td>2</td></tr>
        <tr><td>/26</td><td><code>255.255.255.192</code></td><td><code>11000000</code></td><td>64</td><td>62</td><td>4</td></tr>
        <tr><td>/27</td><td><code>255.255.255.224</code></td><td><code>11100000</code></td><td>32</td><td>30</td><td>8</td></tr>
        <tr><td>/28</td><td><code>255.255.255.240</code></td><td><code>11110000</code></td><td>16</td><td>14</td><td>16</td></tr>
        <tr><td>/29</td><td><code>255.255.255.248</code></td><td><code>11111000</code></td><td>8</td><td>6</td><td>32</td></tr>
        <tr><td>/30</td><td><code>255.255.255.252</code></td><td><code>11111100</code></td><td>4</td><td>2</td><td>64</td></tr>
      </table>`;
  const helperBtn = block => `<button class="link-btn" data-explorer="${block}">Open the Subnet helper with ${block}/24</button>`;

  // ---------- Level 9: subnetting basics (tutorial in the Subnet helper) ----------
  const sxEv = (c, f) => c.events.some(e => e.type === 'sx' && f(e));
  const sizes = e => e.blocks.map(b => b.p).sort((a, b) => a - b).join(',');

  Levels.push({
    id: 'subnet-basics',
    title: 'Subnetting Basics',
    subtitle: 'Learn to split an address range with the Subnet helper',
    palette: {},
    tutorial: true,
    explorer: '192.168.1.0',
    setup(net, M) {
      const inet = M.add(net, 'internet', 140, 300, { locked: true });
      const r = M.add(net, 'officerouter', 400, 300, { locked: true });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
    },
    briefing: `
      <p>One network is often not enough. Departments, floors or guests each need their <b>own</b> network, but you may only have been
      given one block of addresses. <b>Subnetting</b> means splitting that block into smaller networks. This level is a guided tour.</p>
      <div class="concepts">
        <div class="concept"><h5>32 bits</h5>
          <p>An IPv4 address is 32 bits, written as four numbers of 8 bits each. <code>192.168.1.130</code> is
          <code class="binary">11000000.<wbr>10101000.<wbr>00000001.<wbr>10000010</code></p></div>
        <div class="concept"><h5>Network part + host part</h5>
          <p>The prefix says how many bits, from the left, name the <b>network</b>. In <code>/24</code> the first 24 bits (three numbers) are the network
          and the last 8 bits number the <b>hosts</b>: 2<sup>8</sup> = 256 addresses.</p></div>
        <div class="concept"><h5>Splitting = a longer prefix</h5>
          <p>Make the prefix 1 bit longer and one host bit becomes a <b>subnet bit</b>. It can be 0 or 1, so the block splits into
          <b>two halves</b>, each half the size. Every extra bit doubles the number of subnets and halves their size.</p></div>
        <div class="concept"><h5>Two addresses are reserved</h5>
          <p>In every subnet the <b>first</b> address (host bits all 0) is the <i>network address</i> and the <b>last</b> (host bits all 1) is the
          <i>broadcast address</i>. Devices get the ones in between.</p></div>
      </div>
      <div class="box"><b>Cheat sheet</b>${SIZES_TABLE}</div>
      <p>Press <b>Start</b>, then open the <b>Subnet helper</b> (top bar) and work through the tasks. They are listed inside the helper too.</p>
      ${helperBtn('192.168.1.0')}`,
    objectives: [
      { text: 'Open the <b>Subnet helper</b> from the top bar',
        check: c => sxEv(c, () => true) },
      { text: 'Select the /24 block and press <b>Split in half</b>: two /25s',
        check: c => sxEv(c, e => sizes(e) === '25,25') },
      { text: 'Use <b>Split evenly into</b> to make four /26 subnets',
        check: c => sxEv(c, e => sizes(e) === '26,26,26,26') },
      { text: 'Click the /26 that contains the address <code>.130</code>: its range is <code>.128</code>–<code>.191</code>',
        check: c => sxEv(c, e => { const b = e.blocks[e.sel]; return b.p === 26 && (b.net & 255) === 128; }) },
      { text: 'Make a <b>mixed</b> plan: one /25, one /26 and two /27s (split, then merge where needed)',
        check: c => sxEv(c, e => sizes(e) === '25,26,27,27') },
      { text: 'Split one block all the way down to a /30: just <b>2</b> usable addresses',
        check: c => sxEv(c, e => e.blocks.some(b => b.p === 30)) },
      { text: 'Merge everything back into a single /24',
        check: c => {
          const sx = c.events.filter(e => e.type === 'sx');
          const at30 = sx.findIndex(e => e.blocks.some(b => b.p === 30));
          return at30 >= 0 && sx.slice(at30).some(e => sizes(e) === '24');
        } },
    ],
    hints: [
      'Click <b>Subnet helper</b> in the top bar. The coloured bar is the whole /24: 256 addresses.',
      'Click a block in the bar, or its row in the list under the bar, to select it. <b>Split</b> divides that block in half. <b>Merge with its other half</b> joins it back with the block it came from.',
      'For the mixed plan: split the /24 into two /25s. Leave the first alone. Split the second into two /26s, then split the last /26 into two /27s.',
      'Watch the binary table: every split moves one more bit into the yellow subnet part, and the blue host part shrinks.',
    ],
    learned: `
      <ul>
        <li>The <b>prefix</b> (e.g. /26) is the number of network bits. The rest are host bits.</li>
        <li>Each extra prefix bit <b>doubles</b> the number of subnets and <b>halves</b> their size.</li>
        <li>Size = 2<sup>host bits</sup>. Usable = size − 2 (network and broadcast addresses).</li>
        <li>Subnets start on multiples of their size: /26s at .0, .64, .128 and .192.</li>
        <li>You can <b>mix sizes</b> in one block, as long as the subnets don’t overlap.</li>
      </ul>`,
  });

  // ---------- Department subnet levels (10 and 11) ----------
  function subnetLevel(o) {
    const BLOCK = P(o.block);
    const ys = o.depts.length === 2 ? [170, 430] : [110, 300, 490];
    const fits = (c, dep) => {
      const i = routerIf(c, dep.iface);
      return !!i && i.ip != null && IP.prefix(i.mask) >= 24 && IP.same(i.ip, BLOCK, M24) && IP.usable(i.mask) >= dep.need + 1;
    };
    return {
      id: o.id, title: o.title, subtitle: o.subtitle, palette: {}, explorer: o.block,
      setup(net, M) {
        const inet = M.add(net, 'internet', 90, 300, { locked: true });
        const r = M.add(net, 'officerouter', 280, 300, { locked: true });
        M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
        o.depts.forEach((dep, k) => {
          const sw = M.add(net, 'switch', 540, ys[k], { locked: true, name: dep.name + '-SW' });
          const pc = M.add(net, 'pc', 800, ys[k], { locked: true, name: dep.name + '-PC', tag: dep.tag, hostMode: 'dhcp' });
          M.connect(net, r, dep.iface, sw, 'P1', { locked: true });
          M.connect(net, sw, 'P2', pc, 'eth0', { locked: true });
        });
      },
      briefing: o.briefing,
      objectives: [
        ...o.depts.map(dep => ({
          text: `<b>${dep.name}</b> (${dep.iface}): a subnet of <code>${o.block}/24</code> with room for ${dep.need} devices + the router`,
          check: c => fits(c, dep),
        })),
        { text: 'No two subnets overlap',
          check: c => {
            const ifs = o.depts.map(dep => routerIf(c, dep.iface));
            if (ifs.some(i => !i || i.ip == null)) return false;
            for (let a = 0; a < ifs.length; a++) for (let b = a + 1; b < ifs.length; b++) {
              const m = IP.prefix(ifs[a].mask) < IP.prefix(ifs[b].mask) ? ifs[a].mask : ifs[b].mask;
              if (IP.net(ifs[a].ip, m) === IP.net(ifs[b].ip, m)) return false;
            }
            return true;
          } },
        { text: 'Each DHCP pool offers at least as many addresses as the department needs',
          check: c => o.depts.every(dep => { const s = routerIf(c, dep.iface).dhcpServer; return s && s.valid && s.end - s.start + 1 >= dep.need; }) },
        { text: `${o.depts.length === 2 ? 'Both' : 'All three'} department PCs can <code>browse www.example.com</code>`,
          check: c => o.depts.every(dep => canBrowse(c, tagged(c, dep.tag))) },
      ],
      hints: o.hints,
      learned: o.learned,
    };
  }

  // ---------- Level 10: two equal halves ----------
  Levels.push(subnetLevel({
    id: 'subnet-halves',
    title: 'Half and Half',
    subtitle: 'Split a /24 into two equal subnets',
    block: '192.168.50.0',
    depts: [
      { tag: 'office', name: 'Office', iface: 'Gi0/1', need: 100 },
      { tag: 'lab', name: 'Lab', iface: 'Gi0/2', need: 100 },
    ],
    briefing: `
      <p>Your building has been given one block, <code>192.168.50.0/24</code>, but the <b>Office</b> and the <b>Lab</b> must be separate networks,
      each with up to <b>100</b> devices. One address range can’t be used on two router interfaces, so you need to split it into two equal halves.</p>
      <h4>Worked example: splitting a /24 in half</h4>
      <ol class="steps">
        <li><b>How big must each subnet be?</b> 100 devices + 1 router + network + broadcast = 103 addresses. The next power of two is <b>128</b>.</li>
        <li><b>Which prefix gives 128 addresses?</b> 128 = 2<sup>7</sup>, so 7 host bits. 32 − 7 = <b>/25</b>.
          Its mask has 25 ones: the last number is <code>10000000</code> = <b>128</b>, so the mask is <code>255.255.255.128</code>.</li>
        <li><b>Where does each half start?</b> The one borrowed bit (yellow) is 0 for the first half and 1 for the second:
          <table class="worked">
            <tr><th>Subnet</th><th>Last number in binary</th><th>Range</th><th>Usable (devices)</th><th>Broadcast</th></tr>
            <tr><td><code>192.168.50.0/25</code></td><td class="bits"><span class="nb">0</span><span class="hb">0000000</span> – <span class="nb">0</span><span class="hb">1111111</span></td><td>.0 – .127</td><td>.1 – .126</td><td>.127</td></tr>
            <tr><td><code>192.168.50.128/25</code></td><td class="bits"><span class="nb">1</span><span class="hb">0000000</span> – <span class="nb">1</span><span class="hb">1111111</span></td><td>.128 – .255</td><td>.129 – .254</td><td>.255</td></tr>
          </table></li>
        <li><b>Router addresses:</b> give each router interface the first usable address of its subnet: <code>.1</code> and <code>.129</code>.</li>
        <li><b>DHCP pools</b> must stay inside each subnet, e.g. <code>.10</code>–<code>.120</code> and <code>.138</code>–<code>.248</code>.</li>
      </ol>
      <p class="muted small">Remember this router doesn’t relay DNS, so hand out <code>8.8.8.8</code>. The calculator under each address box checks your subnet as you type.</p>
      ${helperBtn('192.168.50.0')}`,
    hints: [
      'Each department needs a /25: mask <code>255.255.255.128</code>. A /24 would be too big, since both can’t have the whole block.',
      'Office (Gi0/1): <code>192.168.50.1</code> / <code>255.255.255.128</code>. Lab (Gi0/2): <code>192.168.50.129</code> / <code>255.255.255.128</code>.',
      'Turn on DHCP for both, with pools of at least 100 addresses inside each half, and DNS <code>8.8.8.8</code>.',
      'If a pool is rejected, click the router: it says why (for example “the pool is not inside the interface’s network”).',
    ],
    learned: `
      <ul>
        <li>Borrowing <b>one</b> host bit splits a block into <b>two</b> equal halves: a /24 becomes two /25s.</li>
        <li>The mask for /25 is <code>255.255.255.128</code>, because the last number is <code>10000000</code> in binary.</li>
        <li>The second half starts exactly halfway, at <code>.128</code>: the borrowed bit changes from 0 to 1.</li>
        <li>Each half has its own network (<code>.0</code>, <code>.128</code>) and broadcast (<code>.127</code>, <code>.255</code>) address.</li>
      </ul>`,
  }));

  // ---------- Level 11: mixed sizes ----------
  Levels.push(subnetLevel({
    id: 'subnetting',
    title: 'Slice the Block',
    subtitle: 'Split one block into subnets of different sizes',
    block: '172.16.5.0',
    depts: [
      { tag: 'sales', name: 'Sales', iface: 'Gi0/1', need: 50 },
      { tag: 'eng', name: 'Engineering', iface: 'Gi0/2', need: 25 },
      { tag: 'mgmt', name: 'Management', iface: 'Gi0/3', need: 10 },
    ],
    briefing: `
      <p>Head office has given your branch one block, <code>172.16.5.0/24</code>. Three departments each need their own network, but of
      <b>different sizes</b>. Giving everyone a /26 would waste addresses, so size each subnet to fit.</p>
      <div class="box"><b>Requirements</b>
        <table class="kv">
          <tr><th>Sales: Gi0/1</th><td>at least <b>50</b> devices</td></tr>
          <tr><th>Engineering: Gi0/2</th><td>at least <b>25</b> devices</td></tr>
          <tr><th>Management: Gi0/3</th><td>at least <b>10</b> devices</td></tr>
        </table></div>
      <h4>The method (shown with a different example)</h4>
      <p>Say <code>10.0.0.0/24</code> must hold networks of <b>100</b>, <b>40</b> and <b>20</b> devices.</p>
      <ol class="steps">
        <li><b>Size each subnet.</b> Add 1 for the router and 2 for network + broadcast, then round up to a power of two:
          100+3 = 103 → <b>128</b> (/25). 40+3 = 43 → <b>64</b> (/26). 20+3 = 23 → <b>32</b> (/27).</li>
        <li><b>Largest first.</b> Put the biggest subnet at the start of the block: <code>10.0.0.0/25</code> = .0 – .127.</li>
        <li><b>Next one starts where the last ended.</b> The next free address is .128, a multiple of 64, so a /26 fits there:
          <code>10.0.0.128/26</code> = .128 – .191.</li>
        <li><b>Repeat.</b> Next free is .192, a multiple of 32: <code>10.0.0.192/27</code> = .192 – .223. The addresses .224 – .255 are spare.</li>
        <li><b>Router = first usable</b> of each subnet (.1, .129, .193). <b>DHCP pool</b> = the rest of the usable range.</li>
      </ol>
      <p class="small">Why largest first? Every subnet must start on a multiple of its own size. Placing big ones first keeps the small ones from leaving gaps that a big one can’t fit into.</p>
      <div class="box"><b>Cheat sheet</b>${SIZES_TABLE}</div>
      <p class="muted small">Try your plan in the Subnet helper before configuring the router. This router doesn’t relay DNS, so hand out <code>8.8.8.8</code>.</p>
      ${helperBtn('172.16.5.0')}`,
    hints: [
      'Sales: 50+3 = 53 → 64 (/26). Engineering: 25+3 = 28 → 32 (/27). Management: 10+3 = 13 → 16 (/28).',
      'Largest first: Sales <code>172.16.5.0/26</code> (.0–.63), Engineering <code>172.16.5.64/27</code> (.64–.95), Management <code>172.16.5.96/28</code> (.96–.111).',
      'Router addresses: <code>172.16.5.1</code> mask <code>255.255.255.192</code>, <code>172.16.5.65</code> mask <code>255.255.255.224</code>, <code>172.16.5.97</code> mask <code>255.255.255.240</code>.',
      'Pools inside each subnet, e.g. Sales <code>.2</code>–<code>.62</code>, Engineering <code>.66</code>–<code>.94</code>, Management <code>.98</code>–<code>.110</code>, each with DNS <code>8.8.8.8</code>.',
    ],
    learned: `
      <ul>
        <li>Size each subnet as devices + router + 2, rounded up to a power of two. That gives its prefix.</li>
        <li>Allocate the <b>largest</b> subnets first, each starting on a multiple of its size.</li>
        <li>Mixing subnet sizes in one block is called <b>VLSM</b> (Variable Length Subnet Masking). It avoids wasting addresses.</li>
        <li>Here only 112 of the 256 addresses were used. The rest (.112 – .255) is free for future networks.</li>
      </ul>`,
  }));

  // ---------- Office with a Servers network (levels 12 and 13) ----------
  const SRV = P('10.1.99.0'), FS_IP = P('10.1.99.20');
  const DEPTS = [
    { tag: 'sales', name: 'Sales', iface: 'Gi0/1', net: '10.1.10', y: 100 },
    { tag: 'hr', name: 'HR', iface: 'Gi0/2', net: '10.1.20', y: 300 },
  ];
  const deptIf = d => ({ ip: d.net + '.1', mask: '255.255.255.0', dhcp: { enabled: true, start: d.net + '.100', end: d.net + '.199', dns: '10.1.99.53' } });
  const dns1 = c => tagged(c, 'dns1');
  const staff = c => DEPTS.map(d => tagged(c, d.tag));
  const hasRecord = (c, name, ip) => dns1(c).config.dnsRecords.some(r => r.name === name && P(r.ip) === ip);
  const allCan = (c, f) => staff(c).every(d => f(d).ok);
  const fromEach = (c, f) => DEPTS.every(dep => H.ev(c, e => e.dev === tagged(c, dep.tag).id && f(e)));

  // fs: optional ready-made file server. hrfs: add HR's own file server. acl: starting access rules.
  // Gi0/3 is left unconfigured unless serversIf is given.
  function serverOffice(net, M, o) {
    const inet = M.add(net, 'internet', 90, 300, { locked: true });
    const ifaces = {};
    DEPTS.forEach(d => { ifaces[d.iface] = deptIf(d); });
    if (o.serversIf) ifaces['Gi0/3'] = { ip: '10.1.99.1', mask: '255.255.255.0' };
    const r = M.add(net, 'officerouter', 280, 300, { locked: true, config: { ifaces, acl: (o.acl || []).map(x => Object.assign({}, x)) } });
    M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
    DEPTS.forEach(d => {
      const sw = M.add(net, 'switch', 520, d.y, { locked: true, name: d.name + '-SW' });
      const pc = M.add(net, 'pc', 780, d.y, { locked: true, name: d.name + '-PC', tag: d.tag, hostMode: 'dhcp' });
      M.connect(net, r, d.iface, sw, 'P1', { locked: true });
      M.connect(net, sw, 'P2', pc, 'eth0', { locked: true });
    });
    const sw = M.add(net, 'switch', 520, 480, { locked: true, name: 'Servers-SW' });
    const dns = M.add(net, 'server', 780, 410, {
      locked: true, name: 'DNS1', tag: 'dns1', hostMode: 'static',
      config: { ip: '10.1.99.53', mask: '255.255.255.0', gw: '10.1.99.1', dns: '8.8.8.8', services: { dns: true }, dnsRecords: o.records },
    });
    M.connect(net, r, 'Gi0/3', sw, 'P1', { locked: true });
    M.connect(net, sw, 'P2', dns, 'eth0', { locked: true });
    if (o.fs) {
      const fs = M.add(net, 'server', 780, 530, {
        locked: true, name: 'FS1', tag: 'fs', hostMode: 'static',
        config: { ip: '10.1.99.20', mask: '255.255.255.0', gw: '10.1.99.1', dns: '10.1.99.53', services: o.fs },
      });
      M.connect(net, sw, 'P3', fs, 'eth0', { locked: true });
    }
    if (o.hrfs) {
      const hr = M.add(net, 'server', 340, 530, {
        locked: true, lockedConfig: true, name: 'HR-FS', tag: 'hrfs', hostMode: 'static',
        config: { ip: '10.1.99.30', mask: '255.255.255.0', gw: '10.1.99.1', dns: '10.1.99.53', services: { files: true } },
      });
      M.connect(net, sw, 'P4', hr, 'eth0', { locked: true });
    }
  }

  const officePlan = (extra = '') => `
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>Gi0/1: Sales</th><td><code>10.1.10.0/24</code>, router <code>10.1.10.1</code>, DHCP</td></tr>
          <tr><th>Gi0/2: HR</th><td><code>10.1.20.0/24</code>, router <code>10.1.20.1</code>, DHCP</td></tr>
          <tr><th>Gi0/3: Servers</th><td><code>10.1.99.0/24</code>, router <code>10.1.99.1</code>, static addresses only</td></tr>
          <tr><th>DNS1</th><td><code>10.1.99.53</code>: the company’s internal DNS server</td></tr>
          <tr><th>File server</th><td><code>10.1.99.20</code>, name <code>files.office</code></td></tr>
          ${extra}
        </table></div>`;

  // ---------- Level 12: a shared file server ----------
  const fileServer = c => H.devs(c, 'server').find(d => d.tag !== 'dns1');
  const onServersNet = (c, d) => { const i = H.ifc(c, d), g = routerIf(c, 'Gi0/3'); return i.up && g && g.up && i.seg === g.seg; };

  Levels.push({
    id: 'fileserver',
    title: 'The Shared Drive',
    subtitle: 'A file server every department can reach',
    palette: { server: 1 },
    defaultHostMode: 'none',
    setup(net, M) { serverOffice(net, M, { records: [{ name: 'dns1.office', ip: '10.1.99.53' }] }); },
    briefing: `
      <p>The company keeps its servers on their own <b>Servers</b> network. The internal DNS server, <b>DNS1</b>, is already there, but the
      router’s Servers port (Gi0/3) was never set up. Staff can’t open any websites. Your job: fix that, then add a <b>shared file server</b>
      that both Sales and HR can open by name.</p>
      ${officePlan()}
      <div class="concepts">
        <div class="concept"><h5>A network for servers</h5>
          <p>Putting servers on their own network keeps them tidy and easy to protect. Each department reaches them <b>through the router</b>,
          just as staff PCs reached guest laptops in <i>Staff and Guests</i>.</p></div>
        <div class="concept"><h5>Servers need fixed addresses</h5>
          <p>Everyone connects to a server by its address, so it must never change: give servers a <b>static</b> address. A server also needs a
          <b>default gateway</b>, or its replies to other networks get lost.</p></div>
        <div class="concept"><h5>Internal DNS</h5>
          <p>Names like <code>files.office</code> only exist inside the company. DNS1 holds <b>records</b> for them. For any other name, such as
          <i>www.example.com</i>, DNS1 asks its own DNS server (<code>8.8.8.8</code>) and passes the answer back.</p></div>
        <div class="concept"><h5>File sharing</h5>
          <p>A file server shares folders over the <b>SMB</b> protocol, which listens on <b>TCP port 445</b>. Open a share with
          <code>open \\\\files.office</code>: the two backslashes mean “a shared folder on this server”.</p></div>
      </div>`,
    objectives: [
      { text: 'Configure the router’s <b>Gi0/3</b> (Servers) as <code>10.1.99.1</code> / <code>255.255.255.0</code>',
        check: c => ifOk(c, 'Gi0/3', '10.1.99.1') },
      { text: 'Staff can <code>browse www.example.com</code> again (their DNS server is on the Servers network)',
        check: c => staff(c).every(d => canBrowse(c, d)) },
      { text: 'Add a <b>server</b> to Servers-SW with the static address <code>10.1.99.20</code> / <code>255.255.255.0</code>',
        check: c => { const s = fileServer(c); if (!s || s.config.mode !== 'static' || !onServersNet(c, s)) return false; const i = H.ifc(c, s); return i.ip === FS_IP && i.mask === M24 && !i.conflict; } },
      { text: 'Give it the router as its <b>default gateway</b>, and DNS1 as its DNS server',
        check: c => { const s = fileServer(c); if (!s || s.config.mode !== 'static') return false; const i = H.ifc(c, s); return i.gw === P('10.1.99.1') && i.dns.includes(P('10.1.99.53')); } },
      { text: 'Turn on <b>File sharing</b> on the server',
        check: c => { const s = fileServer(c); return !!s && !!s.config.services.files; } },
      { text: 'On DNS1, add the record <code>files.office</code> → <code>10.1.99.20</code>',
        check: c => hasRecord(c, 'files.office', FS_IP) },
      { text: 'Both departments can open the shared drive',
        check: c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) },
      { text: 'Prove it: <code>open \\\\files.office</code> from Sales-PC <b>and</b> HR-PC',
        check: c => fromEach(c, e => e.type === 'open' && e.ok && e.host === 'files.office') },
    ],
    hints: [
      'Click the router. Under <b>Settings: Gi0/3</b> enter <code>10.1.99.1</code> and <code>255.255.255.0</code>, leave DHCP off, and save. Then try <code>browse www.example.com</code> on a PC.',
      'Drag a server near Servers-SW and cable it there. Choose <b>static</b>: IP <code>10.1.99.20</code>, mask <code>255.255.255.0</code>, gateway <code>10.1.99.1</code>, DNS <code>10.1.99.53</code>.',
      'On the server, tick <b>File sharing</b> under Services and press <b>Apply settings</b>. You can already test it by address: <code>open \\\\10.1.99.20</code>.',
      'Click DNS1. Under <b>DNS records</b> add <code>files.office</code> → <code>10.1.99.20</code>. Then run <code>open \\\\files.office</code> on Sales-PC and on HR-PC.',
    ],
    learned: `
      <ul>
        <li>Servers often live on their <b>own network</b>. The router connects every department to it.</li>
        <li>Servers get <b>static</b> addresses so they never move, and a <b>default gateway</b> so their replies reach other networks.</li>
        <li>An <b>internal DNS server</b> holds records for company names like <code>files.office</code> and forwards other questions to a public DNS server.</li>
        <li>File sharing uses <b>SMB</b> on <b>TCP port 445</b>. <code>\\\\server</code> means “a shared folder on that server”.</li>
        <li>If DNS is down, <i>everything</i> by name breaks, even the Internet, which is why DNS1 needed the Servers network to work first.</li>
      </ul>`,
  });

  // ---------- Level 13: ports and services ----------
  const fs13 = c => tagged(c, 'fs');

  Levels.push({
    id: 'ports',
    title: 'One Server, Many Doors',
    subtitle: 'Ports: how one address runs several services',
    palette: {},
    setup(net, M) {
      serverOffice(net, M, {
        serversIf: true,
        fs: { web: true, files: false },
        records: [{ name: 'dns1.office', ip: '10.1.99.53' }, { name: 'files.office', ip: '10.1.99.20' }, { name: 'intranet.office', ip: '10.1.99.20' }],
      });
    },
    briefing: `
      <p>FS1 now runs two things: the shared drive <i>and</i> the company intranet website. After last night’s power cut the help desk is getting calls:
      <i>“The intranet works, but the shared drive has gone.”</i> Same server, same address. How can one work and not the other?</p>
      ${officePlan()}
      <div class="concepts">
        <div class="concept"><h5>Ports are doors</h5>
          <p>An IP address gets a packet to the right <b>device</b>. The <b>port number</b> gets it to the right <b>service</b> on that device.
          One server can run many services, each listening behind its own port.</p></div>
        <div class="concept"><h5>Well-known ports</h5>
          <p>Clients know which door to knock on: web is <b>80</b> (HTTP) or <b>443</b> (HTTPS), file sharing is <b>445</b> (SMB),
          DNS is <b>53</b>, remote login is <b>22</b> (SSH).</p></div>
        <div class="concept"><h5>Open or closed</h5>
          <p>If the device answers but no service is listening, the port is <b>closed</b>: the network is fine and the problem is the service.
          If nothing answers at all, it’s a network problem.</p></div>
        <div class="concept"><h5>Names point to addresses</h5>
          <p>DNS turns a name into an <b>address</b>, never a port. Several names can point at the same server; the program you use
          (browser or file explorer) picks the port.</p></div>
      </div>
      <h4>New commands</h4>
      <ul class="howto">
        <li><code>test files.office 445</code> knocks on one port and reports open or closed.</li>
        <li><code>netstat</code>, run on a server, lists the ports it is listening on.</li>
      </ul>`,
    objectives: [
      { text: 'From a PC, <code>browse intranet.office</code>: the intranet works',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.host === 'intranet.office') },
      { text: 'From a PC, try <code>open \\\\files.office</code> and read why it fails',
        check: c => H.ev(c, e => e.type === 'open' && e.host === 'files.office') },
      { text: 'Knock on both doors: <code>test files.office 80</code> and <code>test files.office 445</code>',
        check: c => H.ev(c, e => e.type === 'test' && e.ip === FS_IP && e.port === 80) && H.ev(c, e => e.type === 'test' && e.ip === FS_IP && e.port === 445) },
      { text: 'On FS1, run <code>netstat</code> to see which ports it is listening on',
        check: c => H.ev(c, e => e.type === 'netstat' && e.dev === fs13(c).id) },
      { text: 'Start the <b>File sharing</b> service on FS1',
        check: c => !!fs13(c).config.services.files },
      { text: 'Give FS1 a third name: on DNS1 add <code>wiki.office</code> → <code>10.1.99.20</code>, then <code>browse wiki.office</code>',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.host === 'wiki.office') },
      { text: 'Both departments can reach the shared drive <b>and</b> the intranet',
        check: c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) && allCan(c, d => NG.Sim.browse(c.T, d.id, 'intranet.office')) },
    ],
    hints: [
      'Click Sales-PC and type <code>browse intranet.office</code>, then <code>open \\\\files.office</code>. The “Why?” line says what FS1 is and isn’t listening on.',
      'Still on Sales-PC: <code>test files.office 80</code> says OPEN, <code>test files.office 445</code> says CLOSED. Same address, different doors.',
      'Click FS1 and type <code>netstat</code> (or press the <b>netstat</b> button). Only port 80 is listed. Tick <b>File sharing</b> and press <b>Apply settings</b>.',
      'Click DNS1 and add <code>wiki.office</code> → <code>10.1.99.20</code>. Then <code>browse wiki.office</code> from a PC: a new name, the same server and the same port 80.',
    ],
    learned: `
      <ul>
        <li>The <b>IP address</b> finds the device. The <b>port</b> finds the service on that device.</li>
        <li>Well-known ports: <b>22</b> SSH, <b>53</b> DNS, <b>80</b> HTTP, <b>443</b> HTTPS, <b>445</b> SMB file sharing.</li>
        <li>A <b>closed</b> port means the device is reachable but the service isn’t running. No answer at all means a network problem.</li>
        <li><code>netstat</code> shows what a server is listening on. <code>test host port</code> checks it from the client’s side.</li>
        <li>DNS maps names to <b>addresses</b>, not ports, so many names can share one server.</li>
        <li>Next, <b>firewall rules</b> will use the same idea: allow or block traffic by address <i>and</i> port.</li>
      </ul>`,
  });

  // ---------- Access rules (levels 14 and 15) ----------
  const HRFS_IP = P('10.1.99.30');
  const HR_RECORDS = [
    { name: 'dns1.office', ip: '10.1.99.53' }, { name: 'files.office', ip: '10.1.99.20' },
    { name: 'intranet.office', ip: '10.1.99.20' }, { name: 'hr.office', ip: '10.1.99.30' },
  ];
  const HR_ROW = '<tr><th>HR-FS</th><td><code>10.1.99.30</code>, name <code>hr.office</code>: HR’s private files</td></tr>';
  const share = (c, tag, name) => NG.Sim.openShare(c.T, tagged(c, tag).id, '\\\\' + name);
  const blocked = t => !t.ok && !!t.fail && t.fail.code === 'acl';
  const onlyHr = c => share(c, 'hr', 'hr.office').ok && blocked(share(c, 'sales', 'hr.office'));
  const everyoneShared = c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) && allCan(c, d => NG.Sim.browse(c.T, d.id, 'intranet.office'));
  const RULES_CONCEPTS = `
        <div class="concept"><h5>Access rules</h5>
          <p>A list on the router that says which <b>new connections</b> may pass between networks. Each rule matches a
          <b>source</b>, a <b>destination</b>, a <b>protocol</b> and a <b>port</b>, and says <span class="acl-permit">permit</span> or <span class="acl-deny">deny</span>.</p></div>
        <div class="concept"><h5>First match wins</h5>
          <p>The router reads the list from the top and stops at the <b>first</b> rule that matches. So order matters: a broad rule high up
          hides every rule below it.</p></div>
        <div class="concept"><h5>Everything else is denied</h5>
          <p>Once a list has any rules, a connection that matches <b>none</b> of them is blocked. To allow “everything else”, end the list with
          <code>permit any → any</code>.</p></div>
        <div class="concept"><h5>Replies get back</h5>
          <p>The router remembers the connections it allowed, so their <b>replies</b> are let back automatically. You only write rules for the
          side that starts the connection.</p></div>`;

  // ---------- Level 14: HR only ----------
  Levels.push({
    id: 'acl',
    title: 'HR Only',
    subtitle: 'Access rules: let HR in and keep everyone else out',
    palette: {},
    features: { acl: true },
    setup(net, M) { serverOffice(net, M, { serversIf: true, fs: { web: true, files: true }, hrfs: true, records: HR_RECORDS }); },
    briefing: `
      <p>HR now has its own file server, <b>HR-FS</b>, full of salaries and personal records. There’s a problem: the router forwards everything
      between networks, so <b>anyone</b> in Sales can open it. Add <b>access rules</b> to the router so only HR can reach HR-FS, without
      breaking anything else.</p>
      ${officePlan(HR_ROW)}
      <div class="concepts">${RULES_CONCEPTS}
        <div class="concept"><h5>Closed vs filtered</h5>
          <p>A <b>closed</b> port answers “nothing here”. A <b>filtered</b> port gives no answer at all, because something on the way dropped the packet.
          <code>test</code> shows the difference.</p></div>
      </div>
      <p class="muted small">Click the router: <b>Access rules</b> is at the top of its settings. Leave the port empty to mean any port.</p>`,
    objectives: [
      { text: 'From Sales-PC, <code>open \\\\hr.office</code>. It works, and it shouldn’t!',
        check: c => H.ev(c, e => e.type === 'open' && e.ok && e.host === 'hr.office' && e.dev === tagged(c, 'sales').id) },
      { text: 'Sales can no longer open <code>\\\\hr.office</code>',
        check: c => blocked(share(c, 'sales', 'hr.office')) },
      { text: 'HR can still open <code>\\\\hr.office</code>',
        check: c => share(c, 'hr', 'hr.office').ok },
      { text: 'Both departments can still open <code>\\\\files.office</code> and browse <code>intranet.office</code>',
        check: everyoneShared },
      { text: 'Both departments can still browse <code>www.example.com</code>',
        check: c => staff(c).every(d => canBrowse(c, d)) },
      { text: 'From Sales-PC, <code>test hr.office 445</code> now says <b>FILTERED</b>',
        check: c => H.ev(c, e => e.type === 'test' && e.dev === tagged(c, 'sales').id && e.ip === HRFS_IP && e.port === 445 && e.code === 'acl') },
      { text: 'Experiment: move your deny rule <b>above</b> the HR permit and watch HR get blocked too. Then put it back',
        check: c => H.ev(c, e => (e.type === 'open' || e.type === 'test') && e.dev === tagged(c, 'hr').id && e.code === 'acl' && (e.host === 'hr.office' || e.ip === HRFS_IP)) },
    ],
    hints: [
      'Click Sales-PC and run <code>open \\\\hr.office</code>. Then click the router and find <b>Access rules</b>.',
      'Rule 1: <b>permit</b>, source <code>10.1.20.0/24</code> (HR), destination <code>10.1.99.30</code>, TCP, port <code>445</code>. Rule 2: <b>deny</b>, source <code>any</code>, destination <code>10.1.99.30</code>, any protocol.',
      'Did the Internet and the shared drive stop working? With two rules, everything else now hits the hidden “deny everything else”. Add rule 3: <b>permit</b> <code>any</code> → <code>any</code>, any protocol.',
      'For the experiment, press ▲ on the deny rule, then run <code>open \\\\hr.office</code> on HR-PC. Read the “Why?” line, then press ▼ to put it back.',
    ],
    learned: `
      <ul>
        <li><b>Access rules</b> (a firewall) decide which connections may pass, by source, destination, protocol and port.</li>
        <li>The <b>first matching rule</b> wins, so put specific rules (permit HR) above broad ones (deny everyone).</li>
        <li>A list with any rules ends in an invisible <b>deny everything else</b>. Add <code>permit any → any</code> if everything else should still work.</li>
        <li>The router lets <b>replies</b> to allowed connections back in automatically. This is called a <b>stateful</b> firewall.</li>
        <li>A <b>filtered</b> port gives no answer at all. A <b>closed</b> one answers “nothing listening here”.</li>
        <li>Separate networks plus rules between them is how real offices protect sensitive servers, and how cloud <b>security groups</b> work too.</li>
      </ul>`,
  });

  // ---------- Level 15: troubleshooting access rules ----------
  const BROKEN_ACL = [
    { action: 'permit', src: '10.1.0.0/16', dst: '10.1.99.30', proto: 'tcp', port: '445' },
    { action: 'deny', src: 'any', dst: '10.1.99.30', proto: 'any', port: '' },
    { action: 'deny', src: 'any', dst: '10.1.99.0/24', proto: 'any', port: '' },
    { action: 'permit', src: 'any', dst: '10.1.99.20', proto: 'tcp', port: '80' },
    { action: 'permit', src: 'any', dst: '10.1.99.53', proto: 'udp', port: '53' },
    { action: 'deny', src: '10.1.10.0/24', dst: '10.1.20.0/24', proto: 'any', port: '' },
  ];

  Levels.push({
    id: 'acl-troubleshoot',
    title: 'Locked Out',
    subtitle: 'Fix a broken set of access rules',
    palette: {},
    features: { acl: true },
    setup(net, M) { serverOffice(net, M, { serversIf: true, fs: { web: true, files: true }, hrfs: true, records: HR_RECORDS, acl: BROKEN_ACL }); },
    briefing: `
      <p>Over the weekend a contractor “tightened security” on the router. On Monday <b>nothing works</b>: no websites, no intranet, no shared drive.
      And the one thing that should be locked down isn’t. Fix the access rules so they match the company policy.</p>
      ${officePlan(HR_ROW)}
      <div class="box"><b>Company policy</b>
        <ol class="steps">
          <li>Everyone may use <b>DNS1</b> (UDP 53), the <b>intranet</b> (FS1, TCP 80) and the <b>shared drive</b> (FS1, TCP 445).</li>
          <li>Only <b>HR</b> (<code>10.1.20.0/24</code>) may open <b>HR-FS</b>.</li>
          <li><b>Sales</b> may not connect to anything in the <b>HR network</b>.</li>
          <li>Nothing else may connect to the Servers network.</li>
          <li>Everything else, including the Internet, is allowed.</li>
        </ol></div>
      <div class="concepts">${RULES_CONCEPTS}</div>
      <h4>How to troubleshoot rules</h4>
      <ul class="howto">
        <li>Test one thing at a time: <code>nslookup</code>, <code>browse</code>, <code>open</code>, <code>test host port</code>, <code>ping</code>.</li>
        <li>When something is blocked, the <b>Why?</b> line names the rule that matched. Ask: <i>should</i> it have matched? Should an earlier rule have caught it?</li>
        <li>Fix the most basic thing first. If names don’t work, nothing by name will.</li>
      </ul>`,
    objectives: [
      { text: 'Names work again: both departments can <code>nslookup intranet.office</code>',
        check: c => staff(c).every(d => NG.Sim.resolve(c.T, d.id, 'intranet.office').ok) },
      { text: 'Both departments can browse <code>intranet.office</code>',
        check: c => allCan(c, d => NG.Sim.browse(c.T, d.id, 'intranet.office')) },
      { text: 'Both departments can open <code>\\\\files.office</code>',
        check: c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) },
      { text: 'Both departments can browse <code>www.example.com</code>',
        check: c => staff(c).every(d => canBrowse(c, d)) },
      { text: '<b>Only</b> HR can open <code>\\\\hr.office</code>',
        check: onlyHr },
      { text: 'Sales still can’t connect to the HR network (e.g. Sales-PC can’t <code>ping</code> HR-PC)',
        check: c => { const hr = H.ifc(c, tagged(c, 'hr')); return hr.ip != null && blocked(NG.Sim.transact(c.T, tagged(c, 'sales').id, hr.ip)); } },
    ],
    hints: [
      'On Sales-PC, <code>nslookup intranet.office</code>. The Why? line blames rule 3. It blocks the whole Servers network, and it sits <b>above</b> the rules that permit DNS1 and FS1. Move it down with ▼, below rule 6.',
      'The intranet works but <code>open \\\\files.office</code> doesn’t: the only rule for FS1 permits port 80. Add <b>permit</b> <code>any</code> → <code>10.1.99.20</code> TCP <code>445</code> and move it above the “deny any → 10.1.99.0/24” rule.',
      'Still no <code>www.example.com</code>? No rule permits Internet traffic, so it falls through to “deny everything else” (DNS1 can’t ask 8.8.8.8 either). Add <b>permit</b> <code>any</code> → <code>any</code> at the very bottom.',
      'Sales can open <code>\\\\hr.office</code> because rule 1’s source <code>10.1.0.0/16</code> covers every <code>10.1.x.x</code> network. Remove it and add <b>permit</b> <code>10.1.20.0/24</code> → <code>10.1.99.30</code> TCP <code>445</code>, then move it to the top.',
    ],
    learned: `
      <ul>
        <li>A rule that is <b>too broad</b> and too high (deny the whole Servers network) hides the permits below it.</li>
        <li>A rule with the <b>wrong port</b> allows one service (web, 80) but not another on the same server (files, 445).</li>
        <li>A source that is <b>too wide</b> (<code>/16</code> instead of <code>/24</code>) lets in people it shouldn’t: subnetting matters for security too.</li>
        <li>Forgetting the final <code>permit any → any</code> blocks everything not listed, including servers that need the Internet, like DNS1.</li>
        <li>Troubleshoot rules like networks: test one thing, read which rule matched, and fix from the most basic service up.</li>
      </ul>`,
  });

  NG.Levels = Levels;
})();

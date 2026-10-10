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
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dst === IP.parse('8.8.8.8')),
        verify: c => H.devs(c, 'pc').some(pc => NG.Sim.transact(c.T, pc.id, P('8.8.8.8')).ok) },
    ],
    hints: [
      'Drag the PC to the right-hand side of the router so the cable is easy to draw.',
      'Pick the <b>Ethernet cable</b> tool, click the PC, then click the router and choose a <b>LAN</b> port (not WAN — that one already goes to the Internet).',
      'Click the PC with the <b>Select</b> tool. Under <b>IPv4 settings</b>, choose “Obtain an IP address automatically (DHCP)” and press <b>Apply settings</b>.',
      'Click in the terminal at the bottom and type <code>ipconfig</code>, then <code>ping 8.8.8.8</code>.',
    ],
    solution: `<ol>
      <li>Drag a <b>PC</b> onto the workspace, to the right of the router.</li>
      <li>Choose <b>Ethernet cable</b>, click the PC, click the router and pick <b>LAN1</b>.</li>
      <li>Click the PC, choose <b>Obtain an IP address automatically (DHCP)</b> and press <b>Apply settings</b>.</li>
      <li>In the terminal: <code>ipconfig</code>, then <code>ping 8.8.8.8</code>.</li></ol>`,
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
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === pc1(c).id && e.dst === P('192.168.1.1')),
        verify: c => tx(c, 'pc1', P('192.168.1.1')).ok },
      { text: 'Check the Internet: <code>ping 8.8.8.8</code>',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === pc1(c).id && e.dst === P('8.8.8.8')),
        verify: c => tx(c, 'pc1', P('8.8.8.8')).ok },
    ],
    hints: [
      'Click PC1, then type <code>ipconfig</code> in the terminal. The 169.254 address shows DHCP failed.',
      'Click the <b>router</b>. Its LAN interface shows <code>192.168.1.1/24</code>. That address is PC1’s default gateway, and <code>/24</code> means the mask is <code>255.255.255.0</code>.',
      'Click PC1, choose <b>Use the following IP address (static)</b>, fill in all four boxes and press <b>Apply settings</b>.',
      'Use the quick-test buttons: <b>ping gateway</b> first, then <b>ping 8.8.8.8</b>.',
    ],
    solution: `<ol>
      <li>On PC1, run <code>ipconfig</code> to see the <code>169.254.x.x</code> address.</li>
      <li>Set PC1 to <b>static</b>: IP <code>192.168.1.50</code>, mask <code>255.255.255.0</code>, gateway <code>192.168.1.1</code>, DNS <code>8.8.8.8</code>. Apply.</li>
      <li><code>ping 192.168.1.1</code>, then <code>ping 8.8.8.8</code>.</li></ol>`,
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
    solution: `<ol>
      <li>Cable a switch to the router’s <b>LAN</b> port.</li>
      <li>Cable three PCs to the switch. They use DHCP already, so they get addresses straight away.</li>
      <li>Cable the server to the switch and set it to static: <code>192.168.1.10</code> / <code>255.255.255.0</code>, gateway <code>192.168.1.1</code>, DNS <code>8.8.8.8</code>.</li>
      <li>From any PC: <code>ping 192.168.1.10</code>.</li></ol>`,
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
    solution: `<ol>
      <li>Click the router. Set the LAN to <code>10.20.30.1</code> / <code>255.255.255.0</code>.</li>
      <li>In the same form, set the DHCP pool to <code>10.20.30.100</code> – <code>10.20.30.150</code> and DNS to <code>1.1.1.1</code>.</li>
      <li>Press <b>Save router settings</b> once, then run <code>ipconfig</code> on a PC.</li></ol>
      <p class="small">Changing everything before saving is quickest: saving the LAN address alone briefly breaks DHCP, because the old pool is no longer inside the network.</p>`,
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
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'pc1').id && e.dst === P('8.8.8.8')),
        verify: c => tx(c, 'pc1', P('8.8.8.8')).ok },
      { text: 'On PC1, try <code>browse www.example.com</code> and read why it fails',
        check: c => H.ev(c, e => e.type === 'browse' && e.dev === tagged(c, 'pc1').id) },
      { text: 'On PC2 (which works), run <code>nslookup www.example.com</code>',
        check: c => H.ev(c, e => e.type === 'nslookup' && e.ok && e.dev === tagged(c, 'pc2').id),
        verify: c => NG.Sim.resolve(c.T, tagged(c, 'pc2').id, 'www.example.com').ok },
      { text: 'Fix PC1’s <b>DNS server</b> setting',
        check: c => NG.Sim.resolve(c.T, tagged(c, 'pc1').id, 'www.example.com').ok },
      { text: 'On PC1, <code>browse www.example.com</code> successfully',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'pc1').id),
        verify: c => canBrowse(c, tagged(c, 'pc1')) },
      { text: 'On PC1, <code>ping www.example.com</code> by name',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'pc1').id && e.name === 'www.example.com'),
        verify: c => { const r = NG.Sim.resolve(c.T, tagged(c, 'pc1').id, 'www.example.com'); return r.ok && tx(c, 'pc1', r.ip).ok; } },
    ],
    hints: [
      'Click PC1 and type <code>ping 8.8.8.8</code>. Replies mean the network path to the Internet works fine.',
      'Now try <code>browse www.example.com</code> on PC1. The “Why?” line explains that its DNS server <code>192.168.1.53</code> doesn’t exist.',
      'Click PC2 and run <code>ipconfig</code>, then <code>nslookup www.example.com</code>. Which DNS server does PC2 use?',
      'Click PC1 and change its DNS server to <code>8.8.8.8</code> (or the router, <code>192.168.1.1</code>). Then press <b>Apply settings</b>.',
    ],
    solution: `<ol>
      <li>PC1: <code>ping 8.8.8.8</code> works, so the network is fine. <code>browse www.example.com</code> fails.</li>
      <li>PC2: <code>nslookup www.example.com</code> works.</li>
      <li>Set PC1’s DNS server to <code>8.8.8.8</code> (or the router, <code>192.168.1.1</code>) and apply.</li>
      <li>PC1: <code>browse www.example.com</code> and <code>ping www.example.com</code>.</li></ol>`,
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
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dst != null && IP.same(e.dst, GUEST, M24) && H.devs(c, 'pc').some(d => d.id === e.dev && inNet(c, d, STAFF))),
        verify: c => H.devs(c, 'pc').filter(d => inNet(c, d, STAFF)).some(pc => H.devs(c, 'laptop').filter(d => inNet(c, d, GUEST)).some(l => NG.Sim.transact(c.T, pc.id, H.ifc(c, l).ip).ok)) },
    ],
    hints: [
      'Click the router. It has a settings section for each interface: Gi0/1, Gi0/2 and Gi0/3 (unused).',
      'For Gi0/1: IP <code>192.168.10.1</code>, mask <code>255.255.255.0</code>, DHCP on, pool <code>192.168.10.100</code> – <code>192.168.10.199</code>, DNS <code>8.8.8.8</code>. Then do the same for Gi0/2 with <code>192.168.20</code>.',
      'Cable one switch to <b>Gi0/1</b> and the other to <b>Gi0/2</b>. Then plug the PCs into the staff switch and the laptops into the guest switch.',
      'Run <code>ipconfig</code> on a laptop to find its address, then ping that address from a staff PC.',
    ],
    solution: `<ol>
      <li>Router <b>Gi0/1</b>: <code>192.168.10.1</code> / <code>255.255.255.0</code>, DHCP on, pool <code>.100</code>–<code>.199</code>, DNS <code>8.8.8.8</code>.</li>
      <li>Router <b>Gi0/2</b>: <code>192.168.20.1</code> / <code>255.255.255.0</code>, DHCP on, pool <code>.100</code>–<code>.199</code>, DNS <code>8.8.8.8</code>. Save.</li>
      <li>One switch on Gi0/1 with the two PCs, one switch on Gi0/2 with the two laptops.</li>
      <li>From a PC, <code>ping 192.168.20.100</code> (a laptop).</li></ol>`,
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
    solution: `<p>Six faults, one per person:</p><ul>
      <li><b>Reception</b>: gateway <code>192.168.1.254</code> → <code>192.168.1.1</code>.</li>
      <li><b>Accounts</b>: <code>192.168.1.20</code> is the printer’s address → use a free one outside the pool, e.g. <code>192.168.1.21</code>.</li>
      <li><b>Design</b>: mask <code>255.255.255.252</code> → <code>255.255.255.0</code>.</li>
      <li><b>Sales</b>: DNS <code>192.168.1.53</code> → <code>8.8.8.8</code>.</li>
      <li><b>Manager</b>: <code>192.168.2.45</code> is in the wrong network → <code>192.168.1.45</code>.</li>
      <li><b>Warehouse</b>: cable Switch2 to a free port on Switch1.</li></ul>
      <p class="small">Most efficient in practice: set the five PCs to <b>DHCP</b>. The router hands out correct settings, which fixes all five in one click each.</p>`,
    review: c => [...USERS7.map(u => tagged(c, u.tag)), tagged(c, 'warehouse')]
      .filter(d => d.config.mode === 'static' && P(d.config.ip) >= POOL[0] && P(d.config.ip) <= POOL[1])
      .map(d => `${d.name} has the static address <code>${d.config.ip}</code>, inside the DHCP pool (<code>.100</code>–<code>.199</code>). DHCP could hand the same address to another device one day. Use an address outside the pool, or set it to DHCP.`),
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
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'pc1').id && e.host === '192.168.1.80'),
        verify: c => NG.Sim.browse(c.T, tagged(c, 'pc1').id, '192.168.1.80').ok },
      { text: 'On the router, forward <b>TCP port 80</b> to <code>192.168.1.80</code>',
        check: c => router8(c).config.portForwards.some(r => r.proto === 'tcp' && Number(r.port) === 80 && P(r.ip) === WEB8 && Number(r.toPort || r.port) === 80) },
      { text: 'Customers on the Internet can reach your website',
        check: c => NG.Sim.externalVisit(c.T).ok },
      { text: 'Prove it: Internet cloud → <b>Visit from the Internet</b>',
        check: c => H.ev(c, e => e.type === 'external' && e.ok),
        verify: c => NG.Sim.externalVisit(c.T).ok },
    ],
    hints: [
      'Click WebServer, tick <b>Web server</b> under Services and press <b>Apply settings</b>. Then test from PC1 with <code>browse 192.168.1.80</code>.',
      'Click the router. Under <b>Port forwarding</b> choose TCP, outside port <code>80</code>, inside IP <code>192.168.1.80</code>, port <code>80</code>, then press <b>Add</b>.',
      'Still failing from outside? Read the event log: the request arrives, but the <b>reply</b> can’t get back. Look at WebServer’s settings.',
      'WebServer has no default gateway. Set it to the router: <code>192.168.1.1</code>.',
    ],
    solution: `<ol>
      <li>WebServer: tick <b>Web server</b>, set its gateway to <code>192.168.1.1</code>, apply.</li>
      <li>From PC1: <code>browse 192.168.1.80</code>.</li>
      <li>Router: add a port forward TCP <code>80</code> → <code>192.168.1.80</code> port <code>80</code>.</li>
      <li>Internet cloud → <b>Visit from the Internet</b>.</li></ol>`,
    review: c => router8(c).config.portForwards.length > 1 ? ['You have more than one port-forwarding rule. Only TCP 80 → <code>192.168.1.80</code> is needed: every extra open port is another way in.'] : [],
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
        check: c => sxEv(c, e => { const b = e.blocks[e.sel]; return !!b && b.p === 26 && (b.net & 255) === 128; }) },
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
    solution: `<ol>
      <li>Open the Subnet helper and press <b>Split</b> on the /24.</li>
      <li><b>Split evenly into</b> → /26.</li>
      <li>Click the block <code>.128/26</code>.</li>
      <li>Choose /25 from <b>Split evenly into</b>, then split the second /25, then split the last /26: one /25, one /26, two /27s.</li>
      <li>Keep splitting one /27 until you reach a /30.</li>
      <li>Choose /24 from <b>Split evenly into</b> (or merge back step by step).</li></ol>`,
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
      id: o.id, title: o.title, subtitle: o.subtitle, palette: {}, explorer: o.block, depts: o.depts,
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
      solution: o.solution,
      review: o.review,
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
    solution: `<ol>
      <li><b>Gi0/1</b> (Office): <code>192.168.50.1</code> / <code>255.255.255.128</code>, DHCP pool <code>.10</code>–<code>.120</code>, DNS <code>8.8.8.8</code>.</li>
      <li><b>Gi0/2</b> (Lab): <code>192.168.50.129</code> / <code>255.255.255.128</code>, DHCP pool <code>.138</code>–<code>.248</code>, DNS <code>8.8.8.8</code>.</li>
      <li>Save. Both PCs get addresses in their own half.</li></ol>`,
    review: c => subnetReview(c, 'subnet-halves'),
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
    solution: `<ol>
      <li><b>Gi0/1</b> (Sales, 50): <code>172.16.5.1</code> / <code>255.255.255.192</code> (/26), pool <code>.2</code>–<code>.62</code>.</li>
      <li><b>Gi0/2</b> (Engineering, 25): <code>172.16.5.65</code> / <code>255.255.255.224</code> (/27), pool <code>.66</code>–<code>.94</code>.</li>
      <li><b>Gi0/3</b> (Management, 10): <code>172.16.5.97</code> / <code>255.255.255.240</code> (/28), pool <code>.98</code>–<code>.110</code>.</li>
      <li>DNS <code>8.8.8.8</code> on all three. This uses <code>.0</code>–<code>.111</code> and leaves <code>.112</code>–<code>.255</code> free in one piece.</li></ol>`,
    review: c => subnetReview(c, 'subnetting'),
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

  // Which DNS server a device asks decides which names it can look up (levels 12 and 16).
  const WHICH_DNS = `
      <div class="box"><b>Which DNS server answers?</b>
        <p class="small">The router doesn’t choose. Each device has its own <b>DNS server</b> setting, typed in or handed out by DHCP,
        and asks that server. The question is an ordinary packet (UDP port 53), routed like any other. What differs is who answers:</p>
        <table class="tbl">
          <tr><th>The device was given</th><th>Who answers</th><th>Knows internal names?</th></tr>
          <tr><td>a public server, e.g. <code>8.8.8.8</code></td><td>Google, across the Internet</td><td>No, only public names</td></tr>
          <tr><td>a home router, e.g. <code>192.168.1.1</code></td><td>the router passes the question to <i>its</i> DNS server</td><td>No</td></tr>
          <tr><td>an internal server, e.g. DNS1</td><td>the company’s own server, from its records; other names it asks <code>8.8.8.8</code></td><td>Yes</td></tr>
        </table>
        <p class="small muted">Try <code>nslookup</code> and <code>ipconfig</code>: they show which server was asked and how the answer came back.</p></div>`;

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
      </div>
      ${WHICH_DNS}`,
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
        check: c => fromEach(c, e => e.type === 'open' && e.ok && e.host === 'files.office'),
        verify: c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) },
    ],
    hints: [
      'Click the router. Under <b>Settings: Gi0/3</b> enter <code>10.1.99.1</code> and <code>255.255.255.0</code>, leave DHCP off, and save. Then try <code>browse www.example.com</code> on a PC.',
      'Drag a server near Servers-SW and cable it there. Choose <b>static</b>: IP <code>10.1.99.20</code>, mask <code>255.255.255.0</code>, gateway <code>10.1.99.1</code>, DNS <code>10.1.99.53</code>.',
      'On the server, tick <b>File sharing</b> under Services and press <b>Apply settings</b>. You can already test it by address: <code>open \\\\10.1.99.20</code>.',
      'Click DNS1. Under <b>DNS records</b> add <code>files.office</code> → <code>10.1.99.20</code>. Then run <code>open \\\\files.office</code> on Sales-PC and on HR-PC.',
    ],
    solution: `<ol>
      <li>Router <b>Gi0/3</b>: <code>10.1.99.1</code> / <code>255.255.255.0</code>, DHCP off. Save.</li>
      <li>Add a server, cable it to Servers-SW. Static: <code>10.1.99.20</code> / <code>255.255.255.0</code>, gateway <code>10.1.99.1</code>, DNS <code>10.1.99.53</code>. Tick <b>File sharing</b>. Apply.</li>
      <li>DNS1: add the record <code>files.office</code> → <code>10.1.99.20</code>.</li>
      <li><code>open \\\\files.office</code> on Sales-PC and on HR-PC.</li></ol>`,
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
          <p>Clients know which door to knock on: web is TCP <b>80</b> (HTTP) or <b>443</b> (HTTPS), file sharing is TCP <b>445</b> (SMB),
          remote login is TCP <b>22</b> (SSH), and DNS is <b>UDP</b> <b>53</b>.</p></div>
        <div class="concept"><h5>TCP, UDP and ICMP</h5>
          <p><b>TCP</b> sets up a connection first, then makes sure everything arrives, in order: right for web pages, files and logins.
          <b>UDP</b> just sends a packet: right for one small question and answer, like DNS. TCP 53 and UDP 53 are different doors.
          <b>Ping</b> uses <b>ICMP</b>, which has no ports at all.</p></div>
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
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.host === 'intranet.office'),
        verify: c => allCan(c, d => NG.Sim.browse(c.T, d.id, 'intranet.office')) },
      { text: 'From a PC, try <code>open \\\\files.office</code> and read why it fails',
        check: c => H.ev(c, e => e.type === 'open' && e.host === 'files.office') },
      { text: 'Knock on both doors: <code>test files.office 80</code> and <code>test files.office 445</code>',
        check: c => H.ev(c, e => e.type === 'test' && e.ip === FS_IP && e.port === 80) && H.ev(c, e => e.type === 'test' && e.ip === FS_IP && e.port === 445) },
      { text: 'On FS1, run <code>netstat</code> to see which ports it is listening on',
        check: c => H.ev(c, e => e.type === 'netstat' && e.dev === fs13(c).id) },
      { text: 'Start the <b>File sharing</b> service on FS1',
        check: c => !!fs13(c).config.services.files },
      { text: 'Give FS1 a third name: on DNS1 add <code>wiki.office</code> → <code>10.1.99.20</code>, then <code>browse wiki.office</code>',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.host === 'wiki.office'),
        verify: c => allCan(c, d => NG.Sim.browse(c.T, d.id, 'wiki.office')) },
      { text: 'Both departments can reach the shared drive <b>and</b> the intranet',
        check: c => allCan(c, d => NG.Sim.openShare(c.T, d.id, '\\\\files.office')) && allCan(c, d => NG.Sim.browse(c.T, d.id, 'intranet.office')) },
    ],
    hints: [
      'Click Sales-PC and type <code>browse intranet.office</code>, then <code>open \\\\files.office</code>. The “Why?” line says what FS1 is and isn’t listening on.',
      'Still on Sales-PC: <code>test files.office 80</code> says OPEN, <code>test files.office 445</code> says CLOSED. Same address, different doors.',
      'Click FS1 and type <code>netstat</code> (or press the <b>netstat</b> button). Only port 80 is listed. Tick <b>File sharing</b> and press <b>Apply settings</b>.',
      'Click DNS1 and add <code>wiki.office</code> → <code>10.1.99.20</code>. Then <code>browse wiki.office</code> from a PC: a new name, the same server and the same port 80.',
    ],
    solution: `<ol>
      <li>Sales-PC: <code>browse intranet.office</code> (works), <code>open \\\\files.office</code> (refused).</li>
      <li>Sales-PC: <code>test files.office 80</code> (OPEN) and <code>test files.office 445</code> (CLOSED).</li>
      <li>FS1: <code>netstat</code>, then tick <b>File sharing</b> and apply.</li>
      <li>DNS1: add <code>wiki.office</code> → <code>10.1.99.20</code>. Then <code>browse wiki.office</code>.</li></ol>`,
    learned: `
      <ul>
        <li>The <b>IP address</b> finds the device. The <b>port</b> finds the service on that device.</li>
        <li>Well-known ports: TCP <b>22</b> SSH, UDP <b>53</b> DNS, TCP <b>80</b> HTTP, TCP <b>443</b> HTTPS, TCP <b>445</b> SMB file sharing.</li>
        <li><b>TCP</b> sets up a connection and guarantees delivery; <b>UDP</b> just sends (DNS uses it for quick questions); <b>ping</b> is ICMP, with no ports.</li>
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
        <div class="concept"><h5>Two ways to write it</h5>
          <p><b>Block what’s bad:</b> deny the danger, then <code>permit any → any</code>. <b>Allow only what’s needed</b> (an allowlist): permit each
          thing people use, and let the built-in deny block the rest. Both are correct. Allowlists are safer, but you must remember everything,
          including DNS.</p></div>
      </div>
      <p class="muted small">Click the router: <b>Access rules</b> is at the top of its settings. Leave the port empty to mean any port.</p>`,
    objectives: [
      { text: 'From Sales-PC, try <code>open \\\\hr.office</code>. Before any rules, it works, and it shouldn’t!',
        check: c => H.ev(c, e => e.type === 'open' && e.host === 'hr.office' && e.dev === tagged(c, 'sales').id) },
      { text: 'Sales can no longer open <code>\\\\hr.office</code>',
        check: c => blocked(share(c, 'sales', 'hr.office')) },
      { text: 'HR can still open <code>\\\\hr.office</code>',
        check: c => share(c, 'hr', 'hr.office').ok },
      { text: 'Both departments can still open <code>\\\\files.office</code> and browse <code>intranet.office</code>',
        check: everyoneShared },
      { text: 'Both departments can still browse <code>www.example.com</code>',
        check: c => staff(c).every(d => canBrowse(c, d)) },
      { text: 'From Sales-PC, <code>test hr.office 445</code> now says <b>FILTERED</b>',
        check: c => H.ev(c, e => e.type === 'test' && e.dev === tagged(c, 'sales').id && e.ip === HRFS_IP && e.port === 445 && e.code === 'acl'),
        verify: c => blocked(share(c, 'sales', 'hr.office')) },
    ],
    hints: [
      'Click Sales-PC and run <code>open \\\\hr.office</code>. Then click the router and find <b>Access rules</b>.',
      'The simplest list: rule 1 <b>permit</b> <code>10.1.20.0/24</code> (HR) → <code>10.1.99.30</code>, TCP, port <code>445</code>. Rule 2 <b>deny</b> <code>any</code> → <code>10.1.99.30</code>, any protocol.',
      'Did names, the Internet and the shared drive stop working? Everything not permitted hits the built-in “deny everything else”, including DNS. Add rule 3: <b>permit</b> <code>any</code> → <code>any</code>, any protocol.',
      'Prefer an allowlist? That works too: keep the HR permit and add permits for DNS (UDP 53), the shared drive and intranet (TCP 445 and 80 to <code>10.1.99.20</code>) and the web (TCP 80). The status lights will turn amber, because they use <code>ping</code>, which your list doesn’t allow.',
    ],
    solution: `<p><b>Shortest list</b> (block what’s bad), 3 rules:</p><ol>
      <li><b>permit</b> <code>10.1.20.0/24</code> → <code>10.1.99.30</code> TCP <code>445</code></li>
      <li><b>deny</b> <code>any</code> → <code>10.1.99.30</code> any protocol</li>
      <li><b>permit</b> <code>any</code> → <code>any</code> any protocol</li></ol>
      <p><b>Allowlist</b> (allow only what’s needed) also passes: permit DNS (UDP 53 to <code>10.1.99.53</code>), HR → HR-FS TCP 445, everyone → FS1 TCP 445 and 80, and web traffic (TCP 80). It is stricter, but longer, and blocks <code>ping</code>.</p>
      <p>Then from Sales-PC: <code>test hr.office 445</code> → FILTERED.</p>`,
    review: c => aclReview(c, 3),
    learned: `
      <ul>
        <li><b>Access rules</b> (a firewall) decide which connections may pass, by source, destination, protocol and port.</li>
        <li>The <b>first matching rule</b> wins, so put specific rules (permit HR) above broad ones (deny everyone).</li>
        <li>A list with any rules ends in a built-in <b>deny everything else</b>. Add <code>permit any → any</code> if everything else should still work.</li>
        <li>You can <b>block what’s bad</b> (deny, then permit the rest) or <b>allow only what’s needed</b> (an allowlist). Allowlists are safer but must include everything, even DNS.</li>
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
    solution: `<p>The shortest list that meets the policy has 7 rules:</p><ol>
      <li><b>permit</b> <code>10.1.20.0/24</code> → <code>10.1.99.30</code> TCP <code>445</code> <small>(was <code>10.1.0.0/16</code>: too wide)</small></li>
      <li><b>permit</b> <code>any</code> → <code>10.1.99.20</code> TCP <code>80</code></li>
      <li><b>permit</b> <code>any</code> → <code>10.1.99.20</code> TCP <code>445</code> <small>(was missing: wrong port)</small></li>
      <li><b>permit</b> <code>any</code> → <code>10.1.99.53</code> UDP <code>53</code></li>
      <li><b>deny</b> <code>10.1.10.0/24</code> → <code>10.1.20.0/24</code> any protocol</li>
      <li><b>deny</b> <code>any</code> → <code>10.1.99.0/24</code> any protocol <small>(was rule 3: too high)</small></li>
      <li><b>permit</b> <code>any</code> → <code>any</code> any protocol <small>(was missing)</small></li></ol>
      <p class="small">The old “deny any → 10.1.99.30” isn’t needed: rule 6 already blocks everyone except HR from HR-FS.</p>`,
    review: c => aclReview(c, 7),
    learned: `
      <ul>
        <li>A rule that is <b>too broad</b> and too high (deny the whole Servers network) hides the permits below it.</li>
        <li>A rule with the <b>wrong port</b> allows one service (web, 80) but not another on the same server (files, 445).</li>
        <li>A source that is <b>too wide</b> (<code>/16</code> instead of <code>/24</code>) lets in people it shouldn’t: subnetting matters for security too.</li>
        <li>Forgetting the final <code>permit any → any</code> blocks everything not listed, including servers that need the Internet, like DNS1.</li>
        <li>Troubleshoot rules like networks: test one thing, read which rule matched, and fix from the most basic service up.</li>
      </ul>`,
  });

  // ---------- Shared helpers for levels 16+ ----------
  const lanCfg = (net, dns, dhcp = true) => ({ ip: net + '.1', mask: '255.255.255.0', dhcp: { enabled: dhcp, start: net + '.100', end: net + '.199', dns } });
  const srv = (M, net, name, tag, x, y, ip, extra = {}) => M.add(net, 'server', x, y, {
    locked: true, name, tag, hostMode: 'static', lockedConfig: !!extra.lockedConfig,
    config: Object.assign({ ip, mask: '255.255.255.0', gw: ip.replace(/\.\d+$/, '.1'), dns: '10.1.99.53' }, extra.config || {}),
  });
  const devIp = (c, tag) => { const d = tagged(c, tag); return d ? H.ifc(c, d).ip : null; };
  const tx = (c, from, ip, proto, port) => (ip == null ? { ok: false } : NG.Sim.transact(c.T, tagged(c, from).id, ip, proto, port));
  const officeRouter = c => c.net.devices.find(d => d.type === 'officerouter');

  // ---------- Solution reviews ----------
  // Things that pass, but could be better. Each returns a list of suggestions (HTML).
  function aclReview(c, best) {
    const r = officeRouter(c);
    if (!r) return [];
    const rules = r.config.acl, out = [];
    NG.Sim.aclLint(rules).forEach(x => out.push(`Rule ${x.index + 1} (<code>${NG.Sim.ruleText(rules[x.index])}</code>) can never match: rule ${x.by + 1} above it already catches everything it would. You can delete it.`));
    if (best && rules.length > best) out.push(`Your list has ${rules.length} rules. It can be done with ${best}: compare with the model solution.`);
    return out.concat(tooWide(c, r, rules));
  }

  // Rule ranges much wider than the networks they actually cover, e.g. 10.0.0.0/8 when every network here is in 10.1.0.0/16.
  // Too wide a deny is safe today, but says more than you mean and can catch networks added later (too wide a permit is a
  // security hole, which the objectives themselves catch).
  function tooWide(c, router, rules) {
    const nets = c.T.byDev[router.id].filter(i => i.role === 'lan' && i.ip != null).map(i => ({ net: IP.net(i.ip, i.mask), p: IP.prefix(i.mask) }));
    const out = [];
    rules.forEach((rule, k) => ['src', 'dst'].forEach(side => {
      const R = NG.Sim.parseRange(rule[side]);
      if (!R || R.any) return;
      const p = IP.prefix(R.mask);
      const inside = nets.filter(n => n.p >= p && IP.same(n.net, R.net, R.mask));
      if (!inside.length) return;
      // The longest prefix every covered network shares, rounded down to a whole number of octets (/8, /16, /24).
      let common = Math.min(...inside.map(n => n.p));
      while (inside.some(n => !IP.same(n.net, inside[0].net, IP.maskFromPrefix(common)))) common--;
      const tight = Math.floor(common / 8) * 8;
      if (tight <= p) return;
      const better = `${IP.str(IP.net(inside[0].net, IP.maskFromPrefix(tight)))}/${tight}`;
      out.push(`Rule ${k + 1}’s ${side === 'src' ? 'source' : 'destination'} <code>${rule[side]}</code> is wider than it needs to be: `
        + `the networks it covers here all fit in <code>${better}</code>. A tighter range says exactly what you mean, and won’t catch other networks by accident later.`);
    }));
    return out;
  }

  // Levels 10 and 11: subnets bigger than needed, routers not on the first address, and wasted gaps.
  function subnetReview(c, id) {
    const L = Levels.find(x => x.id === id), out = [];
    const depts = L.depts || [];
    let end = 0, best = 0;
    depts.forEach(dep => {
      const i = routerIf(c, dep.iface);
      if (!i || i.ip == null) return;
      const p = IP.prefix(i.mask), size = s => Math.pow(2, 32 - s);
      let fit = 30;
      while (size(fit) - 2 < dep.need + 1) fit--;
      best += size(fit);
      if (p < fit) out.push(`<b>${dep.name}</b> uses a /${p} (${size(p) - 2} usable) for ${dep.need} devices. A /${fit} (${size(fit) - 2} usable) is enough and leaves more room for future networks.`);
      if (i.ip !== IP.net(i.ip, i.mask) + 1) out.push(`<b>${dep.name}</b>’s router is <code>${IP.str(i.ip)}</code>. By convention the router takes the <b>first</b> usable address (<code>${IP.str(IP.net(i.ip, i.mask) + 1)}</code>), so anyone can guess the gateway.`);
      end = Math.max(end, (IP.bcast(i.ip, i.mask) & 255) + 1);
    });
    if (best && end > best) out.push(`Your subnets reach up to <code>.${end - 1}</code>. Placed largest first and packed together they fit in <code>.0</code>–<code>.${best - 1}</code>, leaving the rest free in one block.`);
    return out;
  }

  // ---------- Level 16: guest isolation ----------
  Levels.push({
    id: 'guests',
    title: 'Guests Welcome',
    subtitle: 'Guest Wi-Fi that reaches the Internet and nothing else',
    palette: {},
    features: { acl: true },
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 300, { locked: true });
      const r = M.add(net, 'officerouter', 280, 300, {
        locked: true,
        config: { ifaces: { 'Gi0/1': lanCfg('10.1.10', '10.1.99.53'), 'Gi0/2': lanCfg('10.1.50', '10.1.99.53'), 'Gi0/3': { ip: '10.1.99.1', mask: '255.255.255.0' } } },
      });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
      const sw = [['Staff-SW', 'Gi0/1', 100], ['Guest-SW', 'Gi0/2', 300], ['Servers-SW', 'Gi0/3', 480]].map(([name, port, y]) => {
        const s = M.add(net, 'switch', 520, y, { locked: true, name });
        M.connect(net, r, port, s, 'P1', { locked: true });
        return s;
      });
      const pc = M.add(net, 'pc', 780, 100, { locked: true, name: 'Staff-PC', tag: 'staff', hostMode: 'dhcp' });
      const lap = M.add(net, 'laptop', 780, 300, { locked: true, name: 'Guest-Laptop', tag: 'guest', hostMode: 'dhcp' });
      const dns = srv(M, net, 'DNS1', 'dns1', 780, 410, '10.1.99.53', { config: { dns: '8.8.8.8', services: { dns: true },
        dnsRecords: [{ name: 'files.office', ip: '10.1.99.20' }, { name: 'intranet.office', ip: '10.1.99.20' }] } });
      const fs = srv(M, net, 'FS1', 'fs', 780, 530, '10.1.99.20', { lockedConfig: true, config: { services: { web: true, files: true } } });
      M.connect(net, sw[0], 'P2', pc, 'eth0', { locked: true });
      M.connect(net, sw[1], 'P2', lap, 'eth0', { locked: true });
      M.connect(net, sw[2], 'P2', dns, 'eth0', { locked: true });
      M.connect(net, sw[2], 'P3', fs, 'eth0', { locked: true });
    },
    briefing: `
      <p>The office has added <b>guest Wi-Fi</b> on its own network, Gi0/2. Visitors get online, but there are no rules yet, so they can also
      reach staff computers and the company file server. Lock the guest network down so guests get the <b>Internet and nothing else</b>.</p>
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>Gi0/1: Staff</th><td><code>10.1.10.0/24</code>, DHCP</td></tr>
          <tr><th>Gi0/2: Guests</th><td><code>10.1.50.0/24</code>, DHCP</td></tr>
          <tr><th>Gi0/3: Servers</th><td><code>10.1.99.0/24</code>: DNS1 <code>.53</code>, FS1 <code>.20</code> (<code>files.office</code>, <code>intranet.office</code>)</td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>Isolate by default</h5>
          <p>Guest devices are unknown and untrusted. The safe design is that guests can reach the Internet, but can’t <b>start</b> a connection to
          anything inside, not even to see what is there.</p></div>
        <div class="concept"><h5>One rule, many networks</h5>
          <p>Every inside network here starts <code>10.1</code>, so they all fit in <code>10.1.0.0/16</code>. One rule with that destination
          covers Staff, Servers and any office network added later. That is subnetting working for you.</p></div>
        <div class="concept"><h5>Don’t forget DNS</h5>
          <p>Guests need a DNS server too. If theirs is inside the company, blocking the inside blocks their DNS. Hand guests a <b>public</b>
          DNS server instead, so they never learn internal names.</p></div>
      </div>
      <div class="box"><b>How wide should the range be?</b>
        <p class="small">The same rule, “deny guests → <i>range</i>”, with three different widths:</p>
        <table class="tbl">
          <tr><th>Range</th><th>Covers</th><th>Result</th></tr>
          <tr><td><code>10.1.10.0/24</code></td><td>Staff only (<code>10.1.10.x</code>)</td><td class="bad">Too narrow: guests can still reach the servers</td></tr>
          <tr><td><code>10.1.0.0/16</code></td><td>every <code>10.1.x.x</code> network: Staff, Guests, Servers</td><td class="good">Just right: all the office’s networks, nothing else</td></tr>
          <tr><td><code>10.0.0.0/8</code></td><td>every <code>10.x.x.x</code> address there is</td><td class="warn">Works, but too wide: it also covers networks that aren’t yours</td></tr>
        </table>
        <p class="small muted">Aim for the tightest range that covers what you mean. Too wide matters most on a <b>permit</b>, where it
        lets in people it shouldn’t, as in <i>Locked Out</i>.</p></div>
      ${WHICH_DNS}`,
    objectives: [
      { text: 'From Guest-Laptop, try <code>open \\\\files.office</code>. Before any rules, it works, and it shouldn’t!',
        check: c => H.ev(c, e => e.type === 'open' && e.dev === tagged(c, 'guest').id) },
      { text: 'Guests can’t reach the file server or the intranet',
        check: c => blocked(tx(c, 'guest', P('10.1.99.20'), 'tcp', 445)) && blocked(tx(c, 'guest', P('10.1.99.20'), 'tcp', 80)) },
      { text: 'Guests can’t reach staff computers (try <code>ping</code> to Staff-PC)',
        check: c => blocked(tx(c, 'guest', devIp(c, 'staff'))) },
      { text: 'Guests can still browse <code>www.example.com</code>',
        check: c => canBrowse(c, tagged(c, 'guest')) },
      { text: 'Guests can’t even look up internal names like <code>files.office</code>',
        check: c => { const d = tagged(c, 'guest'); return H.ifc(c, d).ip != null && !NG.Sim.resolve(c.T, d.id, 'files.office').ok && canBrowse(c, d); } },
      { text: 'Staff can still open <code>\\\\files.office</code> and browse <code>www.example.com</code>',
        check: c => NG.Sim.openShare(c.T, tagged(c, 'staff').id, '\\\\files.office').ok && canBrowse(c, tagged(c, 'staff')) },
    ],
    hints: [
      'On Guest-Laptop, run <code>open \\\\files.office</code> and <code>ping</code> Staff-PC’s address. Both work: nothing stops guests yet.',
      'On the router, add <b>deny</b> <code>10.1.50.0/24</code> → <code>10.1.0.0/16</code>, any protocol: every office network starts <code>10.1</code>. Then <b>permit</b> <code>any</code> → <code>any</code> so everything else keeps working.',
      'Now guests can’t browse at all. <code>browse www.example.com</code> on Guest-Laptop: the Why? line shows their DNS server, 10.1.99.53, is inside and blocked.',
      'In the router’s <b>Gi0/2</b> settings, change the DHCP <b>DNS server</b> to <code>8.8.8.8</code> and save. Guests get a public DNS server, which also knows nothing about <code>files.office</code>.',
    ],
    solution: `<ol>
      <li>Router access rules: <b>deny</b> <code>10.1.50.0/24</code> → <code>10.1.0.0/16</code> any protocol, then <b>permit</b> <code>any</code> → <code>any</code>.</li>
      <li>Router <b>Gi0/2</b>: change the DHCP DNS server to <code>8.8.8.8</code> and save.</li></ol>`,
    review: c => aclReview(c, 2),
    learned: `
      <ul>
        <li>A guest network should reach the <b>Internet only</b>: deny guests → every inside network, then permit the rest.</li>
        <li>One rule with a shorter prefix (<code>10.1.0.0/16</code>) covers many networks at once, including future ones. Use the tightest range that covers them.</li>
        <li>Guests need DNS too. Give them a <b>public</b> DNS server rather than opening a hole to an internal one.</li>
        <li>Rules only stop guests <i>starting</i> connections. Staff browsing the web still works because replies always get back.</li>
      </ul>`,
  });

  // ---------- Level 17: DMZ ----------
  const WEB_OLD = P('10.1.99.80'), WEB_NEW = P('10.1.200.80');
  const web17 = c => tagged(c, 'web');

  Levels.push({
    id: 'dmz',
    title: 'Demilitarised Zone',
    subtitle: 'Move the public web server into a DMZ',
    palette: {},
    features: { acl: true, portForward: true },
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 300, { locked: true });
      const r = M.add(net, 'officerouter', 280, 300, {
        locked: true,
        config: {
          ifaces: { 'Gi0/1': lanCfg('10.1.10', '10.1.99.53'), 'Gi0/2': { ip: '10.1.99.1', mask: '255.255.255.0' } },
          portForwards: [{ proto: 'tcp', port: '80', ip: '10.1.99.80', toPort: '80' }],
        },
      });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
      const sw = [['Staff-SW', 'Gi0/1', 100], ['Servers-SW', 'Gi0/2', 300], ['DMZ-SW', 'Gi0/3', 500]].map(([name, port, y]) => {
        const s = M.add(net, 'switch', 520, y, { locked: true, name });
        M.connect(net, r, port, s, 'P1', { locked: true });
        return s;
      });
      const pc = M.add(net, 'pc', 780, 100, { locked: true, name: 'Staff-PC', tag: 'staff', hostMode: 'dhcp' });
      const dns = srv(M, net, 'DNS1', 'dns1', 780, 230, '10.1.99.53', { config: { dns: '8.8.8.8', services: { dns: true },
        dnsRecords: [{ name: 'files.office', ip: '10.1.99.20' }, { name: 'shop.office', ip: '10.1.99.80' }] } });
      const fs = srv(M, net, 'FS1', 'fs', 780, 340, '10.1.99.20', { lockedConfig: true, config: { services: { files: true } } });
      const web = srv(M, net, 'WebServer', 'web', 780, 470, '10.1.99.80', { config: { services: { web: true } } });
      M.connect(net, sw[0], 'P2', pc, 'eth0', { locked: true });
      M.connect(net, sw[1], 'P2', dns, 'eth0', { locked: true });
      M.connect(net, sw[1], 'P3', fs, 'eth0', { locked: true });
      M.connect(net, sw[1], 'P4', web, 'eth0');
    },
    briefing: `
      <p>The company website runs on <b>WebServer</b>, and the router forwards web traffic from the Internet to it. But WebServer sits on the
      <b>Servers</b> network, right next to the file server. Public servers are the ones attackers try hardest to break into. If someone takes over
      WebServer, nothing stops them reaching your files. Move it into a <b>DMZ</b>.</p>
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>Gi0/1: Staff</th><td><code>10.1.10.0/24</code></td></tr>
          <tr><th>Gi0/2: Servers</th><td><code>10.1.99.0/24</code>: DNS1 <code>.53</code>, FS1 <code>.20</code></td></tr>
          <tr><th>Gi0/3: DMZ</th><td><code>10.1.200.0/24</code>, router <code>10.1.200.1</code> (new)</td></tr>
          <tr><th>WebServer</th><td>moves to <code>10.1.200.80</code>, DNS <code>8.8.8.8</code>. Staff know it as <code>shop.office</code></td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>DMZ</h5>
          <p>A <b>demilitarised zone</b> is a network for servers the Internet can reach. It sits between the Internet and your inside networks,
          with rules on both sides.</p></div>
        <div class="concept"><h5>Trust flows one way</h5>
          <p>Inside → DMZ: allowed (staff can use the website). DMZ → inside: <b>denied</b>. A web server never needs to start a connection to your
          file server, so if it is hacked, the attacker is stuck in the DMZ.</p></div>
        <div class="concept"><h5>Moving a server touches everything</h5>
          <p>A new address means updating every place that points at the old one: the <b>port forward</b>, the <b>DNS record</b> and the server’s own
          settings.</p></div>
      </div>`,
    objectives: [
      { text: 'Pretend WebServer was hacked: from its terminal, try <code>open \\\\10.1.99.20</code>. Right now, the attacker can reach your files!',
        check: c => H.ev(c, e => e.type === 'open' && e.dev === web17(c).id) },
      { text: 'Configure <b>Gi0/3</b> (DMZ) as <code>10.1.200.1</code> / <code>255.255.255.0</code>',
        check: c => ifOk(c, 'Gi0/3', '10.1.200.1') },
      { text: 'Move WebServer to DMZ-SW with the address <code>10.1.200.80</code>',
        check: c => { const i = H.ifc(c, web17(c)), g = routerIf(c, 'Gi0/3'); return i.ip === WEB_NEW && g && i.seg === g.seg && i.gw === P('10.1.200.1'); } },
      { text: 'Customers on the Internet can reach the website again (update the port forward)',
        check: c => NG.Sim.externalVisit(c.T).ok },
      { text: 'Staff can <code>browse shop.office</code> (update DNS1’s record)',
        check: c => NG.Sim.browse(c.T, tagged(c, 'staff').id, 'shop.office').ok && hasRecord(c, 'shop.office', WEB_NEW) },
      { text: 'WebServer can’t start connections to the Servers or Staff networks',
        check: c => blocked(tx(c, 'web', P('10.1.99.20'), 'tcp', 445)) && blocked(tx(c, 'web', devIp(c, 'staff'))) && blocked(tx(c, 'web', P('10.1.99.53'), 'udp', 53)) },
      { text: 'Everyone can still reach the Internet, and staff can still open <code>\\\\files.office</code>',
        check: c => canBrowse(c, tagged(c, 'staff')) && tx(c, 'web', P('8.8.8.8')).ok && NG.Sim.openShare(c.T, tagged(c, 'staff').id, '\\\\files.office').ok },
      { text: 'Prove it: from WebServer, <code>test 10.1.99.20 445</code> is now <b>FILTERED</b>',
        check: c => H.ev(c, e => e.type === 'test' && e.dev === web17(c).id && e.ip === P('10.1.99.20') && e.port === 445 && e.code === 'acl'),
        verify: c => blocked(tx(c, 'web', P('10.1.99.20'), 'tcp', 445)) },
    ],
    hints: [
      'Click WebServer and run <code>open \\\\10.1.99.20</code>. Then click the router and give <b>Gi0/3</b> the address <code>10.1.200.1</code> / <code>255.255.255.0</code> (no DHCP: servers are static).',
      'Click WebServer’s cable to Servers-SW and press <b>Unplug cable</b>. Cable WebServer to DMZ-SW. Set its IP to <code>10.1.200.80</code>, gateway <code>10.1.200.1</code>, DNS <code>8.8.8.8</code>.',
      'On the router, remove the old port forward and add TCP <code>80</code> → <code>10.1.200.80</code> port <code>80</code>. On DNS1, remove <code>shop.office</code> and add it again with <code>10.1.200.80</code>.',
      'Access rules: <b>deny</b> <code>10.1.200.0/24</code> → <code>10.1.0.0/16</code>, then <b>permit</b> <code>any</code> → <code>any</code>. Staff → DMZ and Internet → DMZ still work. Test from WebServer with <code>test 10.1.99.20 445</code>.',
    ],
    solution: `<ol>
      <li>WebServer: <code>open \\\\10.1.99.20</code> (it works: the problem).</li>
      <li>Router <b>Gi0/3</b>: <code>10.1.200.1</code> / <code>255.255.255.0</code>. Save.</li>
      <li>Unplug WebServer, cable it to DMZ-SW. Static <code>10.1.200.80</code> / <code>255.255.255.0</code>, gateway <code>10.1.200.1</code>, DNS <code>8.8.8.8</code>.</li>
      <li>Router: remove the old port forward, add TCP <code>80</code> → <code>10.1.200.80</code> port <code>80</code>.</li>
      <li>DNS1: remove <code>shop.office</code>, add it again → <code>10.1.200.80</code>.</li>
      <li>Access rules: <b>deny</b> <code>10.1.200.0/24</code> → <code>10.1.0.0/16</code>, then <b>permit</b> <code>any</code> → <code>any</code>.</li></ol>`,
    review: c => {
      const out = aclReview(c, 2), r = officeRouter(c), w = web17(c);
      if (r.config.portForwards.some(f => P(f.ip) === WEB_OLD)) out.push('There is still a port forward to the old address <code>10.1.99.80</code>. Nothing lives there now: remove it.');
      if ((IP.parseList(w.config.dns) || []).some(ip => IP.same(ip, P('10.1.0.0'), IP.maskFromPrefix(16)))) out.push('WebServer still uses an inside DNS server, which the DMZ is (rightly) not allowed to reach. Give it <code>8.8.8.8</code>.');
      return out;
    },
    learned: `
      <ul>
        <li>Servers the Internet can reach belong in a <b>DMZ</b>, separate from inside networks.</li>
        <li>Rules let the inside reach the DMZ, but stop the DMZ <b>starting</b> connections inward. A hacked web server is contained.</li>
        <li>Port forwarding and access rules work together: the forward picks the server, the rules decide what that server may do.</li>
        <li>Moving a server means updating its address, the <b>port forward</b> and its <b>DNS record</b>.</li>
        <li>DMZ servers should use <b>public</b> DNS, so they don’t need a hole through to internal servers.</li>
      </ul>`,
  });

  // ---------- Level 18: VLANs ----------
  const SALES18 = P('10.1.10.0'), HR18 = P('10.1.20.0');
  const trunkOk = (c, name) => {
    const sw = c.net.devices.find(d => d.name === name), v = sw && NG.Sim.portVlan(sw, 'P8');
    return !!v && v.trunk && (v.allowed == null || (v.allowed.includes(10) && v.allowed.includes(20)));
  };

  Levels.push({
    id: 'vlans',
    title: 'Two Floors, One Cable',
    subtitle: 'VLANs: several networks on the same switches',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 330, { locked: true });
      const r = M.add(net, 'officerouter', 280, 330, {
        locked: true,
        config: { ifaces: { 'Gi0/1': lanCfg('10.1.10', '8.8.8.8'), 'Gi0/2': lanCfg('10.1.20', '8.8.8.8') } },
      });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
      const f1 = M.add(net, 'mswitch', 540, 190, { locked: true, name: 'Floor1-SW' });
      const f2 = M.add(net, 'mswitch', 540, 470, { locked: true, name: 'Floor2-SW' });
      M.connect(net, r, 'Gi0/1', f1, 'P1', { locked: true });
      M.connect(net, r, 'Gi0/2', f1, 'P2', { locked: true });
      M.connect(net, f1, 'P8', f2, 'P8', { locked: true });
      [['Sales-PC1', 'sales1', 'pc', f1, 'P3', 800, 90], ['HR-PC1', 'hr1', 'laptop', f1, 'P4', 800, 260],
        ['Sales-PC2', 'sales2', 'pc', f2, 'P3', 800, 400], ['HR-PC2', 'hr2', 'laptop', f2, 'P4', 800, 560]].forEach(([name, tag, type, sw, port, x, y]) => {
        const d = M.add(net, type, x, y, { locked: true, name, tag, hostMode: 'dhcp' });
        M.connect(net, sw, port, d, 'eth0', { locked: true });
      });
    },
    briefing: `
      <p>Sales and HR are spread over <b>two floors</b>, with one switch per floor and a single cable between them. Sales and HR must be
      <b>separate networks</b>, but nobody wants to buy a second set of switches and run a second cable. Right now everything is one big network:
      HR’s laptops are getting Sales addresses.</p>
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>VLAN 10: Sales</th><td><code>10.1.10.0/24</code>, router Gi0/1 (Floor1-SW P1)</td></tr>
          <tr><th>VLAN 20: HR</th><td><code>10.1.20.0/24</code>, router Gi0/2 (Floor1-SW P2)</td></tr>
          <tr><th>P8 on both switches</th><td>the cable between the floors</td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>VLAN</h5>
          <p>A <b>virtual LAN</b> splits one switch into several. Ports in VLAN 10 only talk to other VLAN 10 ports, as if they were on a
          separate switch. Every port starts in VLAN 1, which is why everything is one network now.</p></div>
        <div class="concept"><h5>Access ports</h5>
          <p>A port for one device: a PC, a printer or a router interface. It belongs to exactly <b>one</b> VLAN, and the device doesn’t
          know VLANs exist.</p></div>
        <div class="concept"><h5>Trunk ports</h5>
          <p>A link between switches that carries <b>several</b> VLANs. Each frame gets a small <b>tag</b> (802.1Q) with its VLAN number, so the
          switch at the other end knows which VLAN it belongs to. Both ends must be trunks carrying the same VLANs.</p></div>
        <div class="concept"><h5>VLANs still need a router</h5>
          <p>Each VLAN is its own network with its own subnet. Traffic between VLANs goes through the router, just like between two
          physical networks, which is where access rules can control it.</p></div>
      </div>
      <p class="muted small">Click a switch to set each port’s mode and VLAN, then press <b>Save switch settings</b>. Cable labels show each port’s VLAN.</p>`,
    objectives: [
      { text: 'Run <code>ipconfig</code> on HR-PC1. It got a <b>Sales</b> address!',
        check: c => H.ev(c, e => e.type === 'ipconfig' && e.dev === tagged(c, 'hr1').id && e.ip != null && IP.same(e.ip, SALES18, M24)) },
      { text: 'On Floor1-SW, put P1 (router Gi0/1) and Sales-PC1 in <b>VLAN 10</b>, and P2 (router Gi0/2) and HR-PC1 in <b>VLAN 20</b>',
        check: c => inNet(c, tagged(c, 'sales1'), SALES18) && inNet(c, tagged(c, 'hr1'), HR18) },
      { text: 'Make P8, the cable between the floors, a <b>trunk</b> carrying VLANs 10 and 20 on <b>both</b> switches',
        check: c => trunkOk(c, 'Floor1-SW') && trunkOk(c, 'Floor2-SW') },
      { text: 'On Floor2-SW, put Sales-PC2 in VLAN 10 and HR-PC2 in VLAN 20',
        check: c => inNet(c, tagged(c, 'sales2'), SALES18) && inNet(c, tagged(c, 'hr2'), HR18) },
      { text: 'Everyone can browse <code>www.example.com</code>',
        check: c => ['sales1', 'hr1', 'sales2', 'hr2'].every(t => canBrowse(c, tagged(c, t))) },
      { text: 'From Sales-PC2, <code>ping</code> HR-PC1: different VLANs, so the packet goes up to the router and back',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'sales2').id && e.dst === devIp(c, 'hr1') && IP.same(e.dst, HR18, M24)),
        verify: c => tx(c, 'sales2', devIp(c, 'hr1')).ok },
    ],
    hints: [
      'Click HR-PC1 and run <code>ipconfig</code>: <code>10.1.10.x</code> is the Sales network. Both router interfaces are in VLAN 1 on the same switch, so they share one network.',
      'Click Floor1-SW. Leave every port on <b>access</b>. Set P1 and P3 to <code>10</code>, P2 and P4 to <code>20</code>, then save.',
      'Floor 2 has no addresses now: its PCs are still in VLAN 1. On <b>both</b> switches set P8 to <b>trunk</b> with VLANs <code>10,20</code>. Then on Floor2-SW set P3 to <code>10</code> and P4 to <code>20</code>.',
      'Run <code>ipconfig</code> on HR-PC1 to find its address, then <code>ping</code> it from Sales-PC2. Watch the packet travel up the trunk to the router and back down.',
    ],
    solution: `<ol>
      <li>Floor1-SW: P1 and P3 access <code>10</code>, P2 and P4 access <code>20</code>, P8 <b>trunk</b> <code>10,20</code>. Save.</li>
      <li>Floor2-SW: P3 access <code>10</code>, P4 access <code>20</code>, P8 <b>trunk</b> <code>10,20</code>. Save.</li>
      <li>From Sales-PC2: <code>ping 10.1.20.100</code> (HR-PC1).</li></ol>`,
    review: c => ['Floor1-SW', 'Floor2-SW'].filter(n => { const sw = c.net.devices.find(d => d.name === n); return NG.Sim.portVlan(sw, 'P8').allowed == null; })
      .map(n => `${n}’s trunk carries <b>all</b> VLANs. It works, but it is safer to list only the VLANs that need to cross it (<code>10,20</code>).`),
    learned: `
      <ul>
        <li><b>VLANs</b> split one physical switch into several separate networks.</li>
        <li><b>Access</b> ports carry one VLAN to a device. <b>Trunk</b> ports carry many VLANs between switches, each frame <b>tagged</b> with its VLAN number (802.1Q).</li>
        <li>Both ends of a trunk must agree on which VLANs it carries.</li>
        <li>Each VLAN is a separate network with its own subnet. Traffic between VLANs is <b>routed</b>, so access rules still apply.</li>
        <li>Every port starts in <b>VLAN 1</b>. A switch that has never been configured is one big network.</li>
      </ul>`,
  });

  // ---------- Level 19: virtual machines ----------
  const OFFICE19 = P('192.168.1.0'), HOSTONLY = P('192.168.56.0');
  const vmPort = (c, tag) => { const d = tagged(c, tag), l = c.net.links.find(x => x.a.dev === d.id || x.b.dev === d.id); return l ? (l.a.dev === d.id ? l.b : l.a).port : ''; };

  Levels.push({
    id: 'vms',
    title: 'Virtual Lab',
    subtitle: 'Virtual machines: bridged, NAT and host-only networks',
    palette: {},
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 300, { locked: true });
      const r = M.add(net, 'homerouter', 270, 300, { locked: true, lockedConfig: true });
      const sw = M.add(net, 'switch', 460, 300, { locked: true });
      const pc = M.add(net, 'pc', 680, 120, { locked: true, name: 'Colleague-PC', tag: 'colleague', hostMode: 'dhcp' });
      const lap = M.add(net, 'vmhost', 640, 400, { locked: true, name: 'DevLaptop', tag: 'laptop' });
      const web = M.add(net, 'vm', 880, 300, { locked: true, name: 'WebVM', tag: 'webvm', hostMode: 'dhcp', config: { services: { web: true } } });
      const test = M.add(net, 'vm', 880, 500, { locked: true, name: 'TestVM', tag: 'testvm', hostMode: 'dhcp' });
      M.connect(net, inet, 'ISP', r, 'WAN', { locked: true });
      M.connect(net, r, 'LAN1', sw, 'P1', { locked: true });
      M.connect(net, sw, 'P2', pc, 'eth0', { locked: true });
      M.connect(net, sw, 'P3', lap, 'eth0', { locked: true });
      M.connect(net, lap, 'nat1', web, 'eth0', { locked: true });
      M.connect(net, lap, 'nat2', test, 'eth0', { locked: true });
    },
    briefing: `
      <p>A developer runs two <b>virtual machines</b> on their laptop. <b>WebVM</b> hosts a test website that colleagues need to see. <b>TestVM</b> is
      used to open suspicious email attachments, so it must <b>never</b> reach the Internet or the office network. Both VMs currently use the
      hypervisor’s default network, NAT. Give each VM the right kind of network.</p>
      <div class="concepts">
        <div class="concept"><h5>Virtual machines</h5>
          <p>A VM is a whole computer running as a program inside another computer (the <b>host</b>). It has a <b>virtual network card</b>, and the
          host’s <b>hypervisor</b> (VirtualBox, VMware, Hyper-V…) decides what that card is plugged into.</p></div>
        <div class="concept"><h5>Bridged</h5>
          <p>The VM is plugged straight into the host’s own network, as if it had its own cable to the switch. It gets an address from the office
          router and everyone can reach it. <i>You’ve seen this: it’s Growing Office.</i></p></div>
        <div class="concept"><h5>NAT</h5>
          <p>The hypervisor acts as a little home router inside the laptop: VMs get private <code>10.0.2.x</code> addresses and share the laptop’s address
          to get out. Nothing outside can start a connection in. <i>That’s Hello, Internet and Open for Business again.</i></p></div>
        <div class="concept"><h5>Host-only</h5>
          <p>A private network with only the laptop and its VMs (<code>192.168.56.x</code>). It isn’t routed anywhere, so no Internet. <i>It’s like a
          switch with nothing else plugged in.</i></p></div>
      </div>
      <p class="muted small">Click a VM to change its <b>Network adapter</b>. Virtual cables are drawn dotted. DevLaptop’s labels show its three networks.</p>`,
    objectives: [
      { text: 'From WebVM, <code>browse www.example.com</code>: a NAT VM can reach the Internet',
        check: c => H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'webvm').id && e.host === 'www.example.com'),
        verify: c => canBrowse(c, tagged(c, 'webvm')) },
      { text: 'From Colleague-PC, try to <code>browse</code> WebVM’s address (find it with <code>ipconfig</code> on WebVM). NAT hides it',
        check: c => H.ev(c, e => e.type === 'browse' && !e.ok && e.dev === tagged(c, 'colleague').id && /^10\.0\.2\.\d+$/.test(e.host)) },
      { text: 'Set WebVM’s network adapter to <b>Bridged</b>',
        check: c => vmPort(c, 'webvm').startsWith('br') },
      { text: 'Colleague-PC can browse WebVM at its new office address',
        check: c => { const ip = devIp(c, 'webvm'); return ip != null && IP.same(ip, OFFICE19, M24) && H.ev(c, e => e.type === 'browse' && e.ok && e.dev === tagged(c, 'colleague').id && e.host === IP.str(ip)); },
        verify: c => { const ip = devIp(c, 'webvm'); return ip != null && NG.Sim.browse(c.T, tagged(c, 'colleague').id, IP.str(ip)).ok; } },
      { text: 'Set TestVM’s network adapter to <b>Host-only</b>: no Internet, no office',
        check: c => { const ip = devIp(c, 'testvm'); return vmPort(c, 'testvm').startsWith('ho') && ip != null && IP.same(ip, HOSTONLY, M24) && !tx(c, 'testvm', P('8.8.8.8')).ok; } },
      { text: 'From TestVM, <code>ping 8.8.8.8</code> and read why it fails',
        check: c => H.ev(c, e => e.type === 'ping' && !e.ok && e.dev === tagged(c, 'testvm').id && e.code === 'hostonly') },
      { text: 'From DevLaptop, <code>ping</code> TestVM: the host can still reach its host-only VMs',
        check: c => H.ev(c, e => e.type === 'ping' && e.ok && e.dev === tagged(c, 'laptop').id && e.dst != null && IP.same(e.dst, HOSTONLY, M24) && e.dst === devIp(c, 'testvm')),
        verify: c => tx(c, 'laptop', devIp(c, 'testvm')).ok },
    ],
    hints: [
      'Click WebVM and run <code>browse www.example.com</code>, then <code>ipconfig</code>: its address is <code>10.0.2.x</code>, the hypervisor’s NAT network.',
      'Click Colleague-PC and run <code>browse 10.0.2.15</code> (or whatever WebVM’s address was). The office router has never heard of 10.0.2.x: it only exists inside DevLaptop.',
      'Click WebVM and choose <b>Bridged</b> under Network adapter. It gets a <code>192.168.1.x</code> address from the office router. Browse that address from Colleague-PC.',
      'Click TestVM and choose <b>Host-only</b>. Run <code>ping 8.8.8.8</code> on it, then click DevLaptop and <code>ping</code> TestVM’s <code>192.168.56.x</code> address.',
    ],
    solution: `<ol>
      <li>WebVM: <code>browse www.example.com</code>, then <code>ipconfig</code> (<code>10.0.2.15</code>).</li>
      <li>Colleague-PC: <code>browse 10.0.2.15</code> (fails: NAT hides it).</li>
      <li>WebVM → Network adapter <b>Bridged</b>. Colleague-PC: <code>browse</code> its new <code>192.168.1.x</code> address.</li>
      <li>TestVM → Network adapter <b>Host-only</b>. TestVM: <code>ping 8.8.8.8</code> (fails). DevLaptop: <code>ping</code> TestVM’s <code>192.168.56.x</code> address.</li></ol>`,
    learned: `
      <ul>
        <li>A <b>virtual machine</b> has a virtual network card. The <b>hypervisor</b> chooses what it is plugged into.</li>
        <li><b>Bridged</b>: the VM is a full member of the host’s network, gets an address there and can be reached by everyone.</li>
        <li><b>NAT</b>: the hypervisor is a mini router. The VM can get out, but nothing can get in (unless you add a port forward, just like on a home router).</li>
        <li><b>Host-only</b>: an isolated network for the host and its VMs. Good for testing things that must not escape.</li>
        <li>Nothing here was new: switches, NAT and isolated networks, just inside one computer. Containers and the cloud reuse the same ideas.</li>
      </ul>`,
  });

  // ---------- Level 20: SSH and a jump host ----------
  const JUMP = P('10.1.99.10');
  const sshEv = (c, from, to) => H.ev(c, e => e.type === 'ssh' && e.ok && e.dev === tagged(c, from).id && e.to === tagged(c, to).id);
  const onlyFromJump = (c, tag) => { const d = tagged(c, tag); return NG.Sim.sshAllowed(d, JUMP) && !NG.Sim.sshAllowed(d, P('10.1.99.77')) && !NG.Sim.sshAllowed(d, P('10.1.30.100')); };

  Levels.push({
    id: 'ssh',
    title: 'The Jump Box',
    subtitle: 'SSH, and one locked door to the servers',
    palette: {},
    features: { acl: true },
    setup(net, M) {
      const inet = M.add(net, 'internet', 90, 300, { locked: true });
      const r = M.add(net, 'officerouter', 280, 300, {
        locked: true,
        config: {
          ifaces: { 'Gi0/1': lanCfg('10.1.10', '10.1.99.53'), 'Gi0/2': lanCfg('10.1.30', '10.1.99.53'), 'Gi0/3': { ip: '10.1.99.1', mask: '255.255.255.0' } },
          acl: [
            { action: 'permit', src: 'any', dst: '10.1.99.20', proto: 'tcp', port: '445' },
            { action: 'permit', src: 'any', dst: '10.1.99.53', proto: 'udp', port: '53' },
            { action: 'permit', src: 'any', dst: '10.1.99.0/24', proto: 'tcp', port: '22' },
            { action: 'deny', src: 'any', dst: '10.1.99.0/24', proto: 'any', port: '' },
            { action: 'permit', src: 'any', dst: 'any', proto: 'any', port: '' },
          ],
        },
      });
      M.connect(net, inet, 'ISP', r, 'Gi0/0', { locked: true });
      const sw = [['Staff-SW', 'Gi0/1', 100], ['IT-SW', 'Gi0/2', 280], ['Servers-SW', 'Gi0/3', 470]].map(([name, port, y]) => {
        const s = M.add(net, 'switch', 520, y, { locked: true, name });
        M.connect(net, r, port, s, 'P1', { locked: true });
        return s;
      });
      const pc = M.add(net, 'pc', 780, 100, { locked: true, name: 'Staff-PC', tag: 'staff', hostMode: 'dhcp' });
      const it = M.add(net, 'laptop', 780, 280, { locked: true, name: 'IT-Laptop', tag: 'it', hostMode: 'dhcp' });
      const jump = srv(M, net, 'Jump1', 'jump', 780, 400, '10.1.99.10', { config: { services: { ssh: true } } });
      const fs = srv(M, net, 'FS1', 'fs', 780, 535, '10.1.99.20', { config: { services: { files: true, ssh: true } } });
      const dns = srv(M, net, 'DNS1', 'dns1', 340, 530, '10.1.99.53', { config: { dns: '8.8.8.8', services: { dns: true, ssh: true },
        dnsRecords: [{ name: 'jump1.office', ip: '10.1.99.10' }, { name: 'fs1.office', ip: '10.1.99.20' }, { name: 'files.office', ip: '10.1.99.20' }, { name: 'dns1.office', ip: '10.1.99.53' }] } });
      M.connect(net, sw[0], 'P2', pc, 'eth0', { locked: true });
      M.connect(net, sw[1], 'P2', it, 'eth0', { locked: true });
      M.connect(net, sw[2], 'P2', jump, 'eth0', { locked: true });
      M.connect(net, sw[2], 'P3', fs, 'eth0', { locked: true });
      M.connect(net, sw[2], 'P4', dns, 'eth0', { locked: true });
    },
    briefing: `
      <p>IT manages the servers remotely with <b>SSH</b>. To make life easy, someone added a rule that lets <b>anyone</b> SSH to the Servers network.
      The auditors are not happy. Lock it down: only IT may log in, only through one hardened <b>jump host</b>, and the servers must refuse SSH from
      anywhere else.</p>
      <div class="box"><b>Network plan</b>
        <table class="kv">
          <tr><th>Gi0/1: Staff</th><td><code>10.1.10.0/24</code></td></tr>
          <tr><th>Gi0/2: IT</th><td><code>10.1.30.0/24</code></td></tr>
          <tr><th>Gi0/3: Servers</th><td><code>10.1.99.0/24</code>: Jump1 <code>.10</code> (<code>jump1.office</code>), FS1 <code>.20</code> (<code>fs1.office</code>), DNS1 <code>.53</code></td></tr>
        </table></div>
      <div class="concepts">
        <div class="concept"><h5>SSH</h5>
          <p><b>Secure Shell</b> (TCP port 22) gives you a command line on another computer, over an <b>encrypted</b> connection. Type
          <code>ssh jump1.office</code>, and the terminal is now on Jump1. <code>exit</code> brings you back.</p></div>
        <div class="concept"><h5>Jump host</h5>
          <p>Instead of exposing SSH on every server, you expose <b>one</b> well-guarded machine. Admins SSH to it first, then hop from there to the
          servers. One door is far easier to watch than ten. (Also called a <b>bastion host</b>.)</p></div>
        <div class="concept"><h5>The router can’t see inside a subnet</h5>
          <p>Jump1 and FS1 are on the same network, so their traffic never passes the router, and router rules can’t filter it. Each server needs its
          own rule: <b>Allow SSH from</b> Jump1 only. That’s a <b>host firewall</b>.</p></div>
        <div class="concept"><h5>Defence in depth</h5>
          <p>Router rules <i>and</i> host rules. If someone gets one wrong, the other still holds.</p></div>
      </div>`,
    objectives: [
      { text: 'From Staff-PC, try <code>ssh fs1.office</code>. Right now anyone can log in to the file server! (<code>exit</code> to come back)',
        check: c => H.ev(c, e => e.type === 'ssh' && e.dev === tagged(c, 'staff').id && (e.to === tagged(c, 'fs').id || e.ip === P('10.1.99.20'))) },
      { text: 'Router: only the IT network may SSH, and only to Jump1 (<code>10.1.99.10</code>)',
        check: c => tx(c, 'it', JUMP, 'tcp', 22).ok && blocked(tx(c, 'staff', JUMP, 'tcp', 22))
          && blocked(tx(c, 'it', P('10.1.99.20'), 'tcp', 22)) && blocked(tx(c, 'it', P('10.1.99.53'), 'tcp', 22)) && blocked(tx(c, 'staff', P('10.1.99.20'), 'tcp', 22)) },
      { text: 'FS1 and DNS1 only accept SSH from Jump1 (<b>Allow SSH from</b> on each server)',
        check: c => onlyFromJump(c, 'fs') && onlyFromJump(c, 'dns1') },
      { text: 'Hop: from IT-Laptop <code>ssh jump1.office</code>, then from Jump1 <code>ssh fs1.office</code>',
        check: c => sshEv(c, 'it', 'jump') && sshEv(c, 'jump', 'fs'),
        verify: c => tx(c, 'it', JUMP, 'tcp', 22).ok && tx(c, 'jump', P('10.1.99.20'), 'tcp', 22).ok },
      { text: 'Staff can still open <code>\\\\files.office</code> and browse <code>www.example.com</code>',
        check: c => NG.Sim.openShare(c.T, tagged(c, 'staff').id, '\\\\files.office').ok && canBrowse(c, tagged(c, 'staff')) },
    ],
    hints: [
      'Click Staff-PC and type <code>ssh fs1.office</code>. The terminal is now on FS1. Type <code>exit</code> to go back.',
      'On the router, remove rule 3 (<code>permit any → 10.1.99.0/24 TCP 22</code>). Add <b>permit</b> <code>10.1.30.0/24</code> → <code>10.1.99.10</code> TCP <code>22</code>, then move it above the deny rule.',
      'Click FS1, type <code>10.1.99.10</code> in <b>Allow SSH from</b> and press <b>Apply settings</b>. Do the same on DNS1.',
      'Click IT-Laptop: <code>ssh jump1.office</code>. Now on Jump1, type <code>ssh fs1.office</code>. Try <code>ssh fs1.office</code> straight from IT-Laptop too: the router stops it.',
    ],
    solution: `<ol>
      <li>Router access rules, 5 in total: delete <code>permit any → 10.1.99.0/24 TCP 22</code>, add <b>permit</b> <code>10.1.30.0/24</code> → <code>10.1.99.10</code> TCP <code>22</code>, and move it above the deny.</li>
      <li>FS1 and DNS1: <b>Allow SSH from</b> <code>10.1.99.10</code>. Apply.</li>
      <li>Jump1 (extra safety): <b>Allow SSH from</b> <code>10.1.30.0/24</code>.</li>
      <li>IT-Laptop: <code>ssh jump1.office</code>, then <code>ssh fs1.office</code>.</li></ol>`,
    review: c => {
      const out = aclReview(c, 5);
      if (!String(tagged(c, 'jump').config.sshAllow || '').trim()) out.push('Jump1 itself accepts SSH from anyone; only the router protects it. Set its <b>Allow SSH from</b> to <code>10.1.30.0/24</code> for defence in depth.');
      return out;
    },
    learned: `
      <ul>
        <li><b>SSH</b> (TCP 22) gives an encrypted command line on another computer.</li>
        <li>A <b>jump host</b> (bastion) is the single, well-guarded way in. Admins hop through it to reach everything else.</li>
        <li>Router rules only see traffic <b>between</b> networks. Traffic inside one subnet needs a <b>host firewall</b> on each server.</li>
        <li>Using both is <b>defence in depth</b>: one mistake doesn’t open everything.</li>
        <li>Cloud networks work the same way: a bastion host, plus security groups that only allow SSH from it.</li>
      </ul>`,
  });

  // ---------- Judging a level (shared by the game and the tests) ----------
  const safe = (f, c) => { try { return !!f(c); } catch (e) { console.warn(e); return false; } };

  NG.Objectives = {
    // did[i]: the step has been done ("check"). ok[i]: it was done and still holds now ("verify", where given).
    // A level is complete when every ok[i] is true at the same time.
    evaluate(L, c) {
      const did = L.objectives.map(o => safe(o.check, c));
      const ok = L.objectives.map((o, i) => did[i] && (!o.verify || safe(o.verify, c)));
      return { did, ok, complete: ok.every(Boolean) };
    },
    // Suggestions on a working solution (HTML strings). Empty means nothing to improve.
    review(L, c) {
      if (!L.review) return [];
      try { return L.review(c) || []; } catch (e) { console.warn(e); return []; }
    },
  };

  NG.Levels = Levels;
})();

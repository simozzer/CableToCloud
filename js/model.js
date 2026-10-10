// Device catalogue and the network data model (devices + cables).
(function () {
  const range = (pfx, n) => Array.from({ length: n }, (_, i) => pfx + (i + 1));
  const hostCfg = mode => ({ mode: mode || 'dhcp', ip: '', mask: '', gw: '', dns: '' });
  const wanIf = () => ({ mode: 'dhcp', ip: '', mask: '', gw: '', dns: '' });
  const lanIf = (ip, mask, dhcp) => ({ ip, mask, dhcp: Object.assign({ enabled: false, start: '', end: '', dns: '' }, dhcp || {}) });
  const homeCfg = () => ({
    ifaces: {
      WAN: wanIf(),
      LAN: lanIf('192.168.1.1', '255.255.255.0', { enabled: true, start: '192.168.1.100', end: '192.168.1.199', dns: '192.168.1.1' }),
    },
    nat: true, dnsProxy: true, portForwards: [],
  });

  const Types = {
    pc: { label: 'PC', kind: 'host', prefix: 'PC', ports: ['eth0'], desc: 'A desktop computer with one Ethernet port.', cfg: m => hostCfg(m) },
    laptop: { label: 'Laptop', kind: 'host', prefix: 'Laptop', ports: ['eth0'], desc: 'A laptop with one Ethernet port.', cfg: m => hostCfg(m) },
    server: {
      label: 'Server', kind: 'host', prefix: 'Server', ports: ['eth0'], desc: 'A server. It can run web, file-sharing and DNS services.',
      cfg: m => Object.assign(hostCfg(m), { services: { web: false, files: false, dns: false, ssh: false }, dnsRecords: [], sshAllow: '' }),
    },
    printer: { label: 'Printer', kind: 'host', prefix: 'Printer', ports: ['eth0'], desc: 'A network printer.', cfg: m => hostCfg(m) },
    switch: { label: 'Switch', kind: 'switch', prefix: 'Switch', ports: range('P', 8), desc: 'An 8-port switch: joins devices into one local network.', cfg: () => ({}) },
    mswitch: {
      label: 'Managed Switch', kind: 'switch', prefix: 'Switch', ports: range('P', 8),
      desc: 'A managed 8-port switch: each port can be in its own VLAN, or be a trunk that carries several VLANs.',
      cfg: () => ({ ports: {} }),
    },
    homerouter: {
      label: 'Home Router', kind: 'router', prefix: 'Router', ports: ['WAN', ...range('LAN', 4)],
      desc: 'A home router: 1 WAN port, 4 LAN ports, DHCP server, DNS relay and NAT.',
      ifaces: [{ name: 'WAN', ports: ['WAN'], role: 'wan' }, { name: 'LAN', ports: range('LAN', 4), role: 'lan' }],
      cfg: homeCfg,
    },
    isprouter: {
      label: 'ISP Router', kind: 'router', prefix: 'Router', ports: ['WAN', 'LAN'],
      desc: 'A basic ISP-supplied router with a single LAN port.',
      ifaces: [{ name: 'WAN', ports: ['WAN'], role: 'wan' }, { name: 'LAN', ports: ['LAN'], role: 'lan' }],
      cfg: homeCfg,
    },
    officerouter: {
      label: 'Office Router', kind: 'router', prefix: 'Router', ports: ['Gi0/0', 'Gi0/1', 'Gi0/2', 'Gi0/3'],
      desc: 'A business router: every port is a separate network (interface).',
      ifaces: [
        { name: 'Gi0/0', ports: ['Gi0/0'], role: 'wan' },
        { name: 'Gi0/1', ports: ['Gi0/1'], role: 'lan' },
        { name: 'Gi0/2', ports: ['Gi0/2'], role: 'lan' },
        { name: 'Gi0/3', ports: ['Gi0/3'], role: 'lan' },
      ],
      cfg: () => ({
        ifaces: { 'Gi0/0': wanIf(), 'Gi0/1': lanIf('', ''), 'Gi0/2': lanIf('', ''), 'Gi0/3': lanIf('', '') },
        nat: true, dnsProxy: false, portForwards: [], acl: [],
      }),
    },
    // A laptop running a hypervisor (like VirtualBox). Inside it are three virtual networks that VMs plug into:
    // bridged ports join the laptop's own network port, NAT hides VMs behind the laptop, host-only goes nowhere else.
    vmhost: {
      label: 'VM Host Laptop', kind: 'router', prefix: 'Laptop', ports: ['eth0', 'br1', 'br2', 'nat1', 'nat2', 'ho1', 'ho2'],
      desc: 'A laptop running virtual machines. Its hypervisor provides bridged, NAT and host-only networks.',
      ifaces: [
        { name: 'eth0', ports: ['eth0', 'br1', 'br2'], role: 'wan' },
        { name: 'NAT', ports: ['nat1', 'nat2'], role: 'lan' },
        { name: 'Host-only', ports: ['ho1', 'ho2'], role: 'lan', hostOnly: true },
      ],
      cfg: () => ({
        ifaces: {
          eth0: wanIf(),
          NAT: lanIf('10.0.2.2', '255.255.255.0', { enabled: true, start: '10.0.2.15', end: '10.0.2.30', dns: '8.8.8.8' }),
          'Host-only': lanIf('192.168.56.1', '255.255.255.0', { enabled: true, start: '192.168.56.101', end: '192.168.56.199', dns: '' }),
        },
        nat: true, dnsProxy: false, portForwards: [], acl: [],
      }),
    },
    vm: {
      label: 'Virtual Machine', kind: 'host', prefix: 'VM', ports: ['eth0'],
      desc: 'A virtual machine: a whole computer running inside another one.',
      cfg: m => Object.assign(hostCfg(m), { services: { web: false, files: false, dns: false, ssh: false }, dnsRecords: [], sshAllow: '' }),
    },
    internet: { label: 'Internet', kind: 'internet', prefix: 'Internet', ports: ['ISP'], desc: 'Your Internet Service Provider and the rest of the Internet.', cfg: () => ({}) },
  };

  function merge(t, s) {
    for (const k in s) {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') merge(t[k], s[k]);
      else t[k] = s[k];
    }
    return t;
  }

  const Model = {
    create: () => ({ devices: [], links: [], leases: {}, seq: 1 }),

    nextName(net, prefix) {
      let i = 1;
      while (net.devices.some(d => d.name === prefix + i)) i++;
      return prefix + i;
    },

    add(net, type, x, y, o = {}) {
      const def = Types[type];
      const d = {
        id: 'd' + net.seq++, type, x, y,
        name: o.name || Model.nextName(net, def.prefix),
        ports: def.ports.slice(),
        config: def.cfg(o.hostMode),
        locked: !!o.locked, lockedConfig: !!o.lockedConfig, fromPalette: !!o.fromPalette,
        tag: o.tag || null,
      };
      merge(d.config, o.config);
      net.devices.push(d);
      return d;
    },

    connect(net, a, ap, b, bp, o = {}) {
      const l = { id: 'l' + net.seq++, a: { dev: a.id || a, port: ap }, b: { dev: b.id || b, port: bp }, locked: !!o.locked };
      net.links.push(l);
      return l;
    },

    linkAt: (net, devId, port) => net.links.find(l => (l.a.dev === devId && l.a.port === port) || (l.b.dev === devId && l.b.port === port)),
    peer: (l, devId) => (l.a.dev === devId ? l.b : l.a),
    removeLink(net, id) { net.links = net.links.filter(l => l.id !== id); },
    removeDevice(net, id) {
      net.links = net.links.filter(l => l.a.dev !== id && l.b.dev !== id);
      net.devices = net.devices.filter(d => d.id !== id);
    },
    setPath(obj, path, val) {
      const ks = path.split('.');
      let o = obj;
      ks.slice(0, -1).forEach(k => { o = o[k]; });
      o[ks[ks.length - 1]] = val;
    },
    getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); },
  };

  NG.Types = Types;
  NG.Model = Model;
})();

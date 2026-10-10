// The model solution for every level, as code. Each one plays the level the way the in-game
// "Model solution" describes, using the same commands a player would type.
//
// When you add a level, add its solution here: test/unit/levels.test.js checks that it
// completes the level and that the solution review has nothing to complain about.
'use strict';
const { Model, rule, lan } = require('./load');

const pcAt = (g, type, x, y, mode = 'dhcp') => Model.add(g.net, type, x, y, { fromPalette: true, hostMode: mode });
const wire = (g, a, ap, b, bp) => Model.connect(g.net, g.dev(a), ap, g.dev(b), bp);
const setHost = (g, t, cfg) => { Object.assign(g.dev(t).config, cfg); g.rebuild(`${t}: ${Object.entries(cfg).map(([k, v]) => `${k} ${v || '(none)'}`).join(', ')}`); };
const setIfaces = (g, ifaces) => {
  const r = g.router();
  Object.entries(ifaces).forEach(([name, v]) => { Object.assign(r.config.ifaces[name], v); });
  g.rebuild(`router: ${Object.keys(ifaces).join(', ')} configured`);
};
const setRules = (g, rules) => { g.router().config.acl = rules; g.rebuild(`access rules: ${rules.length} rules`); };
const relink = (g, vm, port) => {
  const d = g.dev(vm), l = g.net.links.find(x => x.a.dev === d.id || x.b.dev === d.id);
  (l.a.dev === d.id ? l.b : l.a).port = port;
  g.rebuild(`${vm}: network adapter → ${port}`);
};
const share = '\\\\';

module.exports = {
  dhcp(g) {
    pcAt(g, 'pc', 700, 290, 'none');
    wire(g, 'Router1', 'LAN1', 'PC1', 'eth0');
    setHost(g, 'PC1', { mode: 'dhcp' });
    g.act.ipconfig('PC1');
    g.act.ping('PC1', '8.8.8.8');
  },

  static(g) {
    g.act.ipconfig('pc1');
    setHost(g, 'pc1', { mode: 'static', ip: '192.168.1.50', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' });
    g.act.ping('pc1', '192.168.1.1');
    g.act.ping('pc1', '8.8.8.8');
  },

  switch(g) {
    Model.add(g.net, 'switch', 560, 290, { fromPalette: true });
    wire(g, 'Router1', 'LAN', 'Switch1', 'P1');
    [1, 2, 3].forEach(k => { pcAt(g, 'pc', 800, 100 + k * 120); wire(g, 'Switch1', 'P' + (k + 1), 'PC' + k, 'eth0'); });
    pcAt(g, 'server', 560, 480, 'static');
    wire(g, 'Switch1', 'P5', 'Server1', 'eth0');
    setHost(g, 'Server1', { ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.1', dns: '8.8.8.8' });
    g.act.ping('PC1', '192.168.1.10');
  },

  router(g) {
    setIfaces(g, { LAN: lan('10.20.30.1', '255.255.255.0', { start: '10.20.30.100', end: '10.20.30.150', dns: '1.1.1.1' }) });
    g.act.ipconfig('PC1');
  },

  dns(g) {
    g.act.ping('pc1', '8.8.8.8');
    g.act.browse('pc1', 'www.example.com');
    g.act.nslookup('pc2', 'www.example.com');
    setHost(g, 'pc1', { dns: '8.8.8.8' });
    g.act.browse('pc1', 'www.example.com');
    g.act.ping('pc1', 'www.example.com');
  },

  subnets(g) {
    setIfaces(g, {
      'Gi0/1': lan('192.168.10.1', '255.255.255.0', { start: '192.168.10.100', end: '192.168.10.199', dns: '8.8.8.8' }),
      'Gi0/2': lan('192.168.20.1', '255.255.255.0', { start: '192.168.20.100', end: '192.168.20.199', dns: '8.8.8.8' }),
    });
    Model.add(g.net, 'switch', 560, 150, { fromPalette: true });
    Model.add(g.net, 'switch', 560, 450, { fromPalette: true });
    wire(g, 'Router1', 'Gi0/1', 'Switch1', 'P1');
    wire(g, 'Router1', 'Gi0/2', 'Switch2', 'P1');
    [1, 2].forEach(k => {
      pcAt(g, 'pc', 800, k * 100); wire(g, 'Switch1', 'P' + (k + 1), 'PC' + k, 'eth0');
      pcAt(g, 'laptop', 800, 300 + k * 100); wire(g, 'Switch2', 'P' + (k + 1), 'Laptop' + k, 'eth0');
    });
    g.rebuild('two switches, two PCs, two laptops cabled');
    g.act.ping('PC1', g.ip('Laptop1'));
  },

  troubleshoot(g) {
    setHost(g, 'reception', { gw: '192.168.1.1' });
    setHost(g, 'accounts', { ip: '192.168.1.21' });
    setHost(g, 'design', { mask: '255.255.255.0' });
    setHost(g, 'sales', { dns: '8.8.8.8' });
    setHost(g, 'manager', { ip: '192.168.1.45' });
    wire(g, 'Switch1', 'P8', 'Switch2', 'P2');
    g.rebuild('Switch2 cabled to Switch1');
  },

  portforward(g) {
    setHost(g, 'web', { gw: '192.168.1.1' });
    g.dev('web').config.services.web = true;
    g.rebuild('WebServer: web server on');
    g.act.browse('pc1', '192.168.1.80');
    g.router().config.portForwards.push({ proto: 'tcp', port: '80', ip: '192.168.1.80', toPort: '80' });
    g.rebuild('port forward TCP 80 → 192.168.1.80');
    g.act.visit();
  },

  'subnet-basics'(g) {
    const h = g.act.subnetHelper;
    h([['192.168.1.0', 25], ['192.168.1.128', 25]]);
    h([['192.168.1.0', 26], ['192.168.1.64', 26], ['192.168.1.128', 26], ['192.168.1.192', 26]]);
    h([['192.168.1.0', 26], ['192.168.1.64', 26], ['192.168.1.128', 26], ['192.168.1.192', 26]], 2);
    h([['192.168.1.0', 25], ['192.168.1.128', 26], ['192.168.1.192', 27], ['192.168.1.224', 27]]);
    h([['192.168.1.0', 25], ['192.168.1.128', 26], ['192.168.1.192', 27], ['192.168.1.224', 30], ['192.168.1.228', 30], ['192.168.1.232', 29], ['192.168.1.240', 28]]);
    h([['192.168.1.0', 24]]);
  },

  'subnet-halves'(g) {
    setIfaces(g, {
      'Gi0/1': lan('192.168.50.1', '255.255.255.128', { start: '192.168.50.10', end: '192.168.50.120', dns: '8.8.8.8' }),
      'Gi0/2': lan('192.168.50.129', '255.255.255.128', { start: '192.168.50.138', end: '192.168.50.248', dns: '8.8.8.8' }),
    });
  },

  subnetting(g) {
    setIfaces(g, {
      'Gi0/1': lan('172.16.5.1', '255.255.255.192', { start: '172.16.5.2', end: '172.16.5.62', dns: '8.8.8.8' }),
      'Gi0/2': lan('172.16.5.65', '255.255.255.224', { start: '172.16.5.66', end: '172.16.5.94', dns: '8.8.8.8' }),
      'Gi0/3': lan('172.16.5.97', '255.255.255.240', { start: '172.16.5.98', end: '172.16.5.110', dns: '8.8.8.8' }),
    });
  },

  fileserver(g) {
    setIfaces(g, { 'Gi0/3': { ip: '10.1.99.1', mask: '255.255.255.0' } });
    pcAt(g, 'server', 900, 560, 'static');
    wire(g, 'Servers-SW', 'P3', 'Server1', 'eth0');
    setHost(g, 'Server1', { ip: '10.1.99.20', mask: '255.255.255.0', gw: '10.1.99.1', dns: '10.1.99.53' });
    g.dev('Server1').config.services.files = true;
    g.dev('dns1').config.dnsRecords.push({ name: 'files.office', ip: '10.1.99.20' });
    g.rebuild('Server1: file sharing on, DNS record files.office');
    g.act.open('sales', share + 'files.office');
    g.act.open('hr', share + 'files.office');
  },

  ports(g) {
    g.act.browse('sales', 'intranet.office');
    g.act.open('sales', share + 'files.office');
    g.act.test('sales', 'files.office', 80);
    g.act.test('sales', 'files.office', 445);
    g.act.netstat('fs');
    g.dev('fs').config.services.files = true;
    g.dev('dns1').config.dnsRecords.push({ name: 'wiki.office', ip: '10.1.99.20' });
    g.rebuild('FS1: file sharing on, DNS record wiki.office');
    g.act.browse('sales', 'wiki.office');
  },

  acl(g) {
    g.act.open('sales', share + 'hr.office');
    setRules(g, [rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'), rule('deny', 'any', '10.1.99.30'), rule('permit', 'any', 'any')]);
    g.act.test('sales', 'hr.office', 445);
  },

  'acl-troubleshoot'(g) {
    setRules(g, [
      rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'),
      rule('permit', 'any', '10.1.99.20', 'tcp', '80'),
      rule('permit', 'any', '10.1.99.20', 'tcp', '445'),
      rule('permit', 'any', '10.1.99.53', 'udp', '53'),
      rule('deny', '10.1.10.0/24', '10.1.20.0/24'),
      rule('deny', 'any', '10.1.99.0/24'),
      rule('permit', 'any', 'any'),
    ]);
  },

  guests(g) {
    g.act.open('guest', share + 'files.office');
    setRules(g, [rule('deny', '10.1.50.0/24', '10.0.0.0/8'), rule('permit', 'any', 'any')]);
    setIfaces(g, { 'Gi0/2': { dhcp: Object.assign(g.router().config.ifaces['Gi0/2'].dhcp, { dns: '8.8.8.8' }) } });
  },

  dmz(g) {
    g.act.open('web', share + '10.1.99.20');
    setIfaces(g, { 'Gi0/3': { ip: '10.1.200.1', mask: '255.255.255.0' } });
    const w = g.dev('web');
    g.net.links = g.net.links.filter(l => l.a.dev !== w.id && l.b.dev !== w.id);
    wire(g, 'DMZ-SW', 'P2', 'web', 'eth0');
    setHost(g, 'web', { ip: '10.1.200.80', gw: '10.1.200.1', dns: '8.8.8.8' });
    g.router().config.portForwards = [{ proto: 'tcp', port: '80', ip: '10.1.200.80', toPort: '80' }];
    const recs = g.dev('dns1').config.dnsRecords;
    recs.find(r => r.name === 'shop.office').ip = '10.1.200.80';
    setRules(g, [rule('deny', '10.1.200.0/24', '10.1.0.0/16'), rule('permit', 'any', 'any')]);
    g.act.test('web', '10.1.99.20', 445);
  },

  vlans(g) {
    g.act.ipconfig('hr1');
    g.dev('Floor1-SW').config.ports = {
      P1: { mode: 'access', vlan: 10 }, P3: { mode: 'access', vlan: 10 },
      P2: { mode: 'access', vlan: 20 }, P4: { mode: 'access', vlan: 20 },
      P8: { mode: 'trunk', allowed: '10,20' },
    };
    g.dev('Floor2-SW').config.ports = { P3: { mode: 'access', vlan: 10 }, P4: { mode: 'access', vlan: 20 }, P8: { mode: 'trunk', allowed: '10,20' } };
    g.rebuild('switch ports: VLANs 10/20, trunk on P8');
    g.act.ping('sales2', g.ip('hr1'));
  },

  vms(g) {
    g.act.browse('webvm', 'www.example.com');
    g.act.browse('colleague', g.ip('webvm'));
    relink(g, 'webvm', 'br1');
    g.act.browse('colleague', g.ip('webvm'));
    relink(g, 'testvm', 'ho1');
    g.act.ping('testvm', '8.8.8.8');
    g.act.ping('laptop', g.ip('testvm'));
  },

  ssh(g) {
    g.act.ssh('staff', 'fs1.office');
    setRules(g, [
      rule('permit', 'any', '10.1.99.20', 'tcp', '445'),
      rule('permit', 'any', '10.1.99.53', 'udp', '53'),
      rule('permit', '10.1.30.0/24', '10.1.99.10', 'tcp', '22'),
      rule('deny', 'any', '10.1.99.0/24'),
      rule('permit', 'any', 'any'),
    ]);
    setHost(g, 'fs', { sshAllow: '10.1.99.10' });
    setHost(g, 'dns1', { sshAllow: '10.1.99.10' });
    setHost(g, 'jump', { sshAllow: '10.1.30.0/24' });
    g.act.ssh('it', 'jump1.office');
    g.act.ssh('jump', 'fs1.office');
  },
};

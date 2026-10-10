// Browser tests: the parts of the game that only exist in the page (terminal, settings panels, screens).
// The simulation and the levels themselves are tested much faster in test/unit/.
const { test, expect } = require('@playwright/test');
const { APP, openLevel, deviceId, select, run, terminalText, objectives } = require('./helpers');
const { play } = require('../load');

test('a first visit shows the welcome once, then the briefing; the game lists every level', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP);
  await expect(page.locator('#modal .welcome h2')).toHaveText('Welcome to CableToCloud');
  await expect(page.locator('#modal .welcome')).toContainText('© 2026 Simon Moscrop');
  await page.getByRole('button', { name: 'Start Level 1 ▶' }).click();
  await expect(page.locator('#modal .brief h2')).toHaveText('Hello, Internet');
  await page.getByRole('button', { name: 'Start ▶' }).click();
  await page.locator('#btn-levels').click();
  const count = await page.evaluate(() => NG.Levels.length);
  await expect(page.locator('.lvl-card')).toHaveCount(count);
  await page.reload();
  await expect(page.locator('#modal .brief h2')).toHaveText('Hello, Internet', { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('the About page lists every level, links to the game and shows the copyright', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP.replace('index.html', 'about.html'));
  await expect(page.locator('h1')).toContainText('Learn networking by');
  const titles = await page.evaluate(() => NG.Levels.map(L => L.title));
  await expect(page.locator('#chapters li')).toHaveCount(titles.length);
  await expect(page.locator('#chapters li b').first()).toHaveText(titles[0]);
  await expect(page.locator('#chapters li b').last()).toHaveText(titles[titles.length - 1]);
  await expect(page.locator('footer')).toContainText('© 2026 Simon Moscrop');
  await page.getByRole('link', { name: 'Start playing ▶' }).click();
  await page.getByRole('button', { name: 'Start Level 1 ▶' }).click();
  await page.getByRole('button', { name: 'Start ▶' }).click();
  await page.locator('#btn-about').click();
  await expect(page).toHaveURL(/about\.html$/);
  expect(errors).toEqual([]);
});

test('terminal commands record the same events the unit tests simulate', async ({ page }) => {
  // The unit tests replay levels with test/load.js instead of the real terminal. This keeps the two in step.
  const errors = await openLevel(page, 12);
  const BS = '\\';
  const commands = [
    ['sales', 'browse intranet.office', a => a.browse('sales', 'intranet.office')],
    ['sales', `open ${BS}${BS}files.office`, a => a.open('sales', `${BS}${BS}files.office`)],
    ['sales', 'test files.office 445', a => a.test('sales', 'files.office', 445)],
    ['sales', 'nslookup wiki.office', a => a.nslookup('sales', 'wiki.office')],
    ['sales', 'ping intranet.office', a => a.ping('sales', 'intranet.office')],
    ['sales', 'ipconfig', a => a.ipconfig('sales')],
    ['fs', 'netstat', a => a.netstat('fs')],
  ];
  const g = play(12);
  for (const [dev, cmd, act] of commands) {
    await select(page, dev);
    await run(page, cmd);
    act(g.act);
  }
  const strip = evs => evs.filter(e => e.type !== 'sx').map(e => JSON.stringify(e));
  const browserEvents = await page.evaluate(() => NG.Game.events);
  expect(strip(browserEvents)).toEqual(strip(g.events));
  expect(errors).toEqual([]);
});

test('static IP settings from the settings panel take effect', async ({ page }) => {
  await openLevel(page, 1);
  await select(page, 'pc1');
  await page.locator('input[name=mode][value=static]').check();
  await page.locator('[data-path=ip]').fill('192.168.1.50');
  await page.locator('[data-path=mask]').fill('255.255.255.0');
  await page.locator('[data-path=gw]').fill('192.168.1.1');
  await page.locator('[data-path=dns]').fill('8.8.8.8');
  await expect(page.locator('#calc')).toContainText('Network 192.168.1.0/24');
  await page.getByRole('button', { name: /Apply settings/ }).click();
  await run(page, 'ping 8.8.8.8');
  await expect(page.locator('#term-out')).toContainText('Reply from 8.8.8.8');
});

test('the access rules form adds, explains and refuses rules', async ({ page }) => {
  await openLevel(page, 13);
  await select(page, 'Router1');
  const add = async (action, src, dst, proto, port = '') => {
    await page.selectOption('#acl-action', action);
    await page.selectOption('#acl-proto', proto);
    await page.fill('#acl-src', src);
    await page.fill('#acl-dst', dst);
    await page.fill('#acl-port', port);
    await page.click('#acl-add');
  };
  await add('permit', '10.1.20.0', '10.1.99.30', 'tcp', '445');
  await expect(page.locator('#acl-err')).toContainText('on its own means just that one address');
  await add('permit', '10.1.20.0/24', '10.1.99.30', 'any', '445');
  await expect(page.locator('#acl-err')).toContainText('Ports belong to TCP or UDP');
  await add('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445');
  await expect(page.locator('.acl-list li')).toHaveCount(2);
  await expect(page.locator('.acl-implicit')).toContainText('Built in, not one of your rules');
  await expect(page.locator('.acl-warn')).toContainText('including DNS lookups');
  await add('deny', 'any', '10.1.99.30', 'any');
  await add('permit', 'any', 'any', 'any');
  await expect(page.locator('.acl-warn')).toHaveCount(0);
  await page.locator('[data-acl-up="1"]').click();
  const rules = await page.evaluate(() => NG.Game.net.devices.find(d => d.type === 'officerouter').config.acl.map(r => r.action));
  expect(rules).toEqual(['deny', 'permit', 'permit']);
});

test('a level timer: starts with the briefing, stops on completion, keeps personal bests', async ({ page }) => {
  await page.clock.install();
  await openLevel(page, 14);
  // openLevel closes the briefing without pressing Start, so the clock hasn't started.
  await expect(page.locator('#timer')).toHaveText('⏱ 0:00');
  const solve = () => page.evaluate(() => {
    const r = NG.Game.net.devices.find(d => d.type === 'officerouter');
    const rule = (action, src, dst, proto = 'any', port = '') => ({ action, src, dst, proto, port });
    r.config.acl = [rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'), rule('permit', 'any', '10.1.99.20', 'tcp', '80'),
      rule('permit', 'any', '10.1.99.20', 'tcp', '445'), rule('permit', 'any', '10.1.99.53', 'udp', '53'),
      rule('deny', '10.1.10.0/24', '10.1.20.0/24'), rule('deny', 'any', '10.1.99.0/24'), rule('permit', 'any', 'any')];
    NG.Game.recompute();
  });
  const play = async (seconds) => {
    await page.evaluate(() => NG.Game.loadLevel(14));
    await page.getByRole('button', { name: 'Start ▶' }).click();
    await page.clock.runFor(seconds * 1000);
    await expect(page.locator('#timer b')).toHaveText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    await solve();
    await page.clock.runFor(2000);
    await expect(page.locator('#modal .win h2')).toHaveText('Level complete!');
  };
  await play(95);
  await expect(page.locator('#modal .run-time')).toContainText('Your time 1:35 · your first best time');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await expect(page.locator('#timer')).toContainText('1:35 · best 1:35');
  await play(70);
  await expect(page.locator('#modal .run-time')).toContainText('Your time 1:10 · New personal best! (was 1:35)');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await play(80);
  await expect(page.locator('#modal .run-time')).toContainText('Your time 1:20 · best 1:10');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  // Looking at the model solution first: the time shows but can't be a best.
  await page.evaluate(() => NG.Game.loadLevel(14));
  await page.getByRole('button', { name: 'Start ▶' }).click();
  await page.evaluate(() => NG.Game.showSolution());
  await page.getByRole('button', { name: 'Close' }).click();
  await page.clock.runFor(30000);
  await solve();
  await page.clock.runFor(2000);
  await expect(page.locator('#modal .run-time')).toContainText('doesn’t count as a best');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await page.locator('#btn-levels').click();
  await expect(page.locator('.lvl-card').nth(14)).toContainText('best 1:10');
});

test('the rules form warns once about a well-known port with the wrong protocol', async ({ page }) => {
  await openLevel(page, 13);
  await select(page, 'Router1');
  await page.selectOption('#acl-proto', 'tcp');
  await page.fill('#acl-src', 'any');
  await page.fill('#acl-dst', '10.1.99.53');
  await page.fill('#acl-port', '53');
  await page.click('#acl-add');
  await expect(page.locator('#acl-err')).toContainText('Port 53 is DNS, which uses UDP, not TCP');
  await expect(page.locator('.acl-list li:not(.acl-implicit)')).toHaveCount(0);
  await page.click('#acl-add');
  await expect(page.locator('.acl-list li:not(.acl-implicit)')).toHaveCount(1, { timeout: 5000 });
});

test('nslookup explains who answered, and ipconfig says what kind of DNS server it uses', async ({ page }) => {
  await openLevel(page, 12);
  await select(page, 'sales');
  await run(page, 'ipconfig');
  await expect(page.locator('#term-out')).toContainText('(10.1.99.53: DNS1, an internal DNS server)');
  await run(page, 'nslookup www.example.com');
  await expect(page.locator('#term-out')).toContainText('DNS1 had no record for www.example.com, so it asked its own DNS server, 8.8.8.8');
  await run(page, 'nslookup intranet.office');
  await expect(page.locator('#term-out')).toContainText('DNS1 answered from its own records: intranet.office is 10.1.99.20.');
});

test('the Subnet helper list splits and merges any block', async ({ page }) => {
  await openLevel(page, 8);
  await page.locator('#btn-subnet').click();
  await page.locator('[data-split="0"]').click();
  await page.locator('[data-split="1"]').click();
  await expect(page.locator('.sx-row')).toHaveCount(3);
  await page.locator('.sx-row[data-i="2"]').click();
  await expect(page.locator('.sx-head b')).toHaveText('192.168.1.192/26');
  await page.locator('[data-merge="2"]').click();
  await expect(page.locator('.sx-row')).toHaveCount(2);
});

test('managed switch ports can be put in VLANs and trunks', async ({ page }) => {
  await openLevel(page, 17);
  await select(page, 'Floor1-SW');
  const port = p => page.locator(`.vlan-tbl tr[data-port="${p}"]`);
  await port('P2').locator('[data-f=vlan]').fill('20');
  await port('P4').locator('[data-f=vlan]').fill('20');
  await port('P8').locator('[data-f=mode]').selectOption('trunk');
  await port('P8').locator('[data-f=vlan]').fill('10,20');
  await page.getByRole('button', { name: /Save switch settings/ }).click();
  await expect(page.locator('.port-label', { hasText: 'P8 trunk' })).toHaveCount(1);
  const hr = await page.evaluate(() => NG.IP.str(NG.Game.T.byDev[NG.Game.net.devices.find(d => d.tag === 'hr1').id][0].ip));
  expect(hr).toBe('10.1.20.100');
});

test('a VM’s network adapter re-plugs it into another virtual network', async ({ page }) => {
  await openLevel(page, 18);
  await select(page, 'webvm');
  await page.locator('input[name=vm-mode][value=br]').check();
  await run(page, 'ipconfig');
  await expect(page.locator('#term-out')).toContainText('192.168.1.');
});

test('ssh moves the terminal to the other computer and exit comes back', async ({ page }) => {
  await openLevel(page, 19);
  await select(page, 'staff');
  await run(page, 'ssh fs1.office');
  await expect(page.locator('#term-title')).toHaveText('Terminal: FS1 (SSH from Staff-PC)');
  await run(page, 'exit');
  await expect(page.locator('#term-title')).toHaveText('Terminal: Staff-PC');
  expect(await terminalText(page)).toContain('Connection to FS1 closed.');
});

test('a step broken by a later change turns red', async ({ page }) => {
  await openLevel(page, 12);
  await select(page, 'sales');
  await run(page, 'browse intranet.office');
  expect((await objectives(page))[0]).toBe('done');
  await select(page, 'fs');
  await page.locator('[data-svc=web]').uncheck();
  await page.getByRole('button', { name: /Apply settings/ }).click();
  expect((await objectives(page))[0]).toBe('broken');
  await expect(page.locator('#objectives .broken-note')).toContainText('a later change broke it');
});

test('finishing a level shows the review and the model solution; Show solution asks first', async ({ page }) => {
  await openLevel(page, 14);
  await page.locator('#btn-solution').click();
  await expect(page.locator('#modal')).toContainText('Show the solution?');
  await page.getByRole('button', { name: 'Show solution', exact: true }).last().click();
  await expect(page.locator('#modal .solution')).toContainText('The shortest list that meets the policy has 7 rules');
  await page.getByRole('button', { name: 'Close' }).click();
  // Apply the model answer directly, then wait for the win screen.
  await page.evaluate(() => {
    const r = NG.Game.net.devices.find(d => d.type === 'officerouter');
    const rule = (action, src, dst, proto = 'any', port = '') => ({ action, src, dst, proto, port });
    r.config.acl = [rule('permit', '10.1.20.0/24', '10.1.99.30', 'tcp', '445'), rule('permit', 'any', '10.1.99.20', 'tcp', '80'),
      rule('permit', 'any', '10.1.99.20', 'tcp', '445'), rule('permit', 'any', '10.1.99.53', 'udp', '53'),
      rule('deny', '10.1.10.0/24', '10.1.20.0/24'), rule('deny', 'any', '10.1.99.0/24'), rule('permit', 'any', 'any')];
    NG.Game.recompute();
  });
  await expect(page.locator('#modal .win h2')).toHaveText('Level complete!', { timeout: 5000 });
  await expect(page.locator('#modal .review')).toContainText('nothing to tidy up');
  await page.getByRole('button', { name: 'Model solution' }).click();
  await expect(page.locator('#modal .solution h2')).toHaveText('Model solution');
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.locator('#modal .win h2')).toHaveText('Level complete!');
  expect(await deviceId(page, 'hr')).toBeTruthy();
});

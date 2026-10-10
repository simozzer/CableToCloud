// Shared helpers for the browser tests.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { expect } = require('@playwright/test');

const APP = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;

// Open the game, fail the test on any page error, and start the given level (0-based) with its briefing closed.
async function openLevel(page, index) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP);
  await page.evaluate(i => { NG.Game.loadLevel(i); NG.Game.closeModal(); }, index);
  return errors;
}

const deviceId = (page, nameOrTag) => page.evaluate(t => NG.Game.net.devices.find(d => d.tag === t || d.name === t).id, nameOrTag);

// Click a device on the workspace (opens its settings and terminal).
async function select(page, nameOrTag) {
  const id = await deviceId(page, nameOrTag);
  await page.locator(`[data-dev="${id}"]`).click();
}

// Type a command into the terminal of the selected device and wait for it to finish.
async function run(page, command) {
  const input = page.locator('#term-input');
  await expect(input).toBeEnabled();
  await input.fill(command);
  await input.press('Enter');
  await page.waitForFunction(() => !NG.Terminal.busy);
}

const terminalText = page => page.locator('#term-out').innerText();
const objectives = page => page.evaluate(() => [...document.querySelectorAll('#objectives li')].map(li => li.className.includes('done') ? 'done' : li.className.includes('broken') ? 'broken' : 'todo'));

module.exports = { APP, openLevel, deviceId, select, run, terminalText, objectives };

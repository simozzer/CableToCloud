// IPv4 address maths (js/ip.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IP } = require('../load');
const P = IP.parse;

test('parse and print addresses', () => {
  assert.equal(P('192.168.1.10'), 0xC0A8010A);
  assert.equal(IP.str(P('10.0.0.1')), '10.0.0.1');
  assert.equal(P(' 8.8.8.8 '), P('8.8.8.8'));
  for (const bad of ['256.1.1.1', '1.2.3', 'abc', '', '1.2.3.4.5', null, undefined]) assert.equal(P(bad), null, String(bad));
  assert.equal(IP.str(null), '');
});

test('masks and prefixes', () => {
  assert.equal(IP.str(IP.maskFromPrefix(24)), '255.255.255.0');
  assert.equal(IP.maskFromPrefix(0), 0);
  assert.equal(IP.prefix(IP.maskFromPrefix(26)), 26);
  assert.equal(IP.isMask(P('255.255.255.192')), true);
  assert.equal(IP.isMask(P('255.0.255.0')), false);
  assert.equal(IP.isMask(null), false);
  assert.equal(IP.parseMask('/24'), IP.maskFromPrefix(24));
  assert.equal(IP.parseMask('25'), IP.maskFromPrefix(25));
  assert.equal(IP.parseMask('255.255.255.128'), IP.maskFromPrefix(25));
  for (const bad of ['33', '255.0.255.0', 'x', null]) assert.equal(IP.parseMask(bad), null, String(bad));
});

test('address lists', () => {
  assert.deepEqual(IP.parseList('8.8.8.8, 1.1.1.1'), [P('8.8.8.8'), P('1.1.1.1')]);
  assert.deepEqual(IP.parseList(' 8.8.8.8;;1.1.1.1  9.9.9.9 '), [P('8.8.8.8'), P('1.1.1.1'), P('9.9.9.9')], 'any mix of separators and spaces');
  assert.deepEqual(IP.parseList(''), []);
  assert.deepEqual(IP.parseList('   '), []);
  assert.deepEqual(IP.parseList(null), []);
  assert.equal(IP.parseList('8.8.8.8 nope'), null);
});

test('masks are trimmed and must be real masks', () => {
  assert.equal(IP.parseMask(' 255.255.255.0 '), IP.maskFromPrefix(24));
  assert.equal(IP.parseMask(' /8 '), IP.maskFromPrefix(8));
  assert.equal(IP.parseMask('255.255.0.255'), null);
  assert.equal(IP.parseMask(undefined), null);
});

test('/31 and /32 have no network or broadcast address', () => {
  const m31 = IP.maskFromPrefix(31), m32 = IP.maskFromPrefix(32), m30 = IP.maskFromPrefix(30);
  assert.equal(IP.reserved(P('10.0.0.0'), m31), false);
  assert.equal(IP.reserved(P('10.0.0.1'), m31), false);
  assert.equal(IP.reserved(P('10.0.0.5'), m32), false);
  assert.equal(IP.reserved(P('10.0.0.4'), m30), true, '/30 still has them');
  assert.equal(IP.reserved(P('10.0.0.7'), m30), true);
  assert.equal(IP.info('10.0.0.0', '31').ok, true);
  assert.deepEqual(IP.info('10.0.0.1', '31'), { ok: true, text: 'Network 10.0.0.0/31', warn: '' }, 'the upper /31 address is usable too');
  assert.deepEqual(IP.info('10.0.0.1', '32'), { ok: true, text: 'Network 10.0.0.1/32', warn: '' });
  assert.equal(IP.info('10.0.0.4', '30').warn.includes('network address'), true);
  assert.equal(IP.info('10.0.0.7', '30').warn.includes('broadcast address'), true);
  assert.match(IP.info('10.0.0.5', '30').text, /usable 10\.0\.0\.5 – 10\.0\.0\.6 \(2 hosts\)/);
});

test('networks', () => {
  const m = IP.maskFromPrefix(24);
  assert.equal(IP.str(IP.net(P('192.168.1.77'), m)), '192.168.1.0');
  assert.equal(IP.str(IP.bcast(P('192.168.1.77'), m)), '192.168.1.255');
  assert.equal(IP.same(P('192.168.1.1'), P('192.168.1.200'), m), true);
  assert.equal(IP.same(P('192.168.1.1'), P('192.168.2.1'), m), false);
  assert.equal(IP.cidr(P('10.1.2.3'), IP.maskFromPrefix(16)), '10.1.0.0/16');
  assert.equal(IP.usable(m), 254);
  assert.equal(IP.usable(IP.maskFromPrefix(31)), 2);
  assert.equal(IP.usable(IP.maskFromPrefix(32)), 1);
  assert.equal(IP.reserved(P('192.168.1.0'), m), true);
  assert.equal(IP.reserved(P('192.168.1.255'), m), true);
  assert.equal(IP.reserved(P('192.168.1.1'), m), false);
});

test('private and self-assigned ranges', () => {
  for (const a of ['10.9.9.9', '172.16.0.1', '172.31.255.1', '192.168.0.1']) assert.equal(IP.isPrivate(P(a)), true, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '11.0.0.1']) assert.equal(IP.isPrivate(P(a)), false, a);
  assert.equal(IP.isApipa(P('169.254.3.4')), true);
  assert.equal(IP.isApipa(P('169.253.3.4')), false);
});

test('the live calculator under address boxes', () => {
  assert.equal(IP.info('', ''), null);
  assert.match(IP.info('10.0.0.1', '').text, /valid subnet mask/, 'only an address typed so far');
  assert.match(IP.info('', '24').text, /valid IP address/, 'only a mask typed so far');
  assert.equal(IP.info('nope', '24').ok, false);
  assert.equal(IP.info('10.0.0.1', 'nope').ok, false);
  const good = IP.info('192.168.1.10', '255.255.255.0');
  assert.equal(good.ok, true);
  assert.match(good.text, /Network 192\.168\.1\.0\/24 · usable 192\.168\.1\.1 – 192\.168\.1\.254 \(254 hosts\)/);
  assert.match(IP.info('192.168.1.0', '24').warn, /network address/);
  assert.match(IP.info('192.168.1.255', '24').warn, /broadcast address/);
  assert.equal(IP.info('10.0.0.1', '32').text, 'Network 10.0.0.1/32');
});

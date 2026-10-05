// IPv4 address maths. Addresses and masks are unsigned 32-bit numbers.
(function () {
  const IP = {};

  IP.parse = function (s) {
    if (s == null) return null;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    if (!m) return null;
    let n = 0;
    for (let i = 1; i <= 4; i++) {
      const o = Number(m[i]);
      if (o > 255) return null;
      n = n * 256 + o;
    }
    return n;
  };

  IP.str = n => n == null ? '' : [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

  IP.maskFromPrefix = p => p <= 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;

  // A valid mask is a run of 1s followed by a run of 0s.
  IP.isMask = m => {
    if (m == null) return false;
    const inv = (~m) >>> 0;
    return ((inv + 1) & inv) === 0;
  };

  IP.prefix = m => {
    let p = 0;
    for (let i = 31; i >= 0; i--) {
      if ((m >>> i) & 1) p++; else break;
    }
    return p;
  };

  // Accepts "255.255.255.0", "/24" or "24".
  IP.parseMask = function (s) {
    if (s == null) return null;
    s = String(s).trim();
    const m = /^\/?(\d{1,2})$/.exec(s);
    if (m) {
      const p = Number(m[1]);
      return p <= 32 ? IP.maskFromPrefix(p) : null;
    }
    const n = IP.parse(s);
    return n != null && IP.isMask(n) ? n : null;
  };

  IP.parseList = function (s) {
    s = (s || '').trim();
    if (!s) return [];
    const out = s.split(/[\s,;]+/).filter(Boolean).map(IP.parse);
    return out.some(x => x == null) ? null : out;
  };

  IP.net = (ip, m) => (ip & m) >>> 0;
  IP.bcast = (ip, m) => ((ip & m) | (~m)) >>> 0;
  IP.same = (a, b, m) => IP.net(a, m) === IP.net(b, m);
  IP.cidr = (ip, m) => IP.str(IP.net(ip, m)) + '/' + IP.prefix(m);
  IP.usable = m => {
    const p = IP.prefix(m);
    if (p >= 32) return 1;
    if (p === 31) return 2;
    return Math.pow(2, 32 - p) - 2;
  };

  const P10 = IP.maskFromPrefix(8), P12 = IP.maskFromPrefix(12), P16 = IP.maskFromPrefix(16);
  IP.isPrivate = ip => IP.same(ip, 0x0A000000, P10) || IP.same(ip, 0xAC100000, P12) || IP.same(ip, 0xC0A80000, P16);
  IP.isApipa = ip => IP.same(ip, 0xA9FE0000, P16);

  // Is this address the network or broadcast address of its subnet?
  IP.reserved = (ip, m) => IP.prefix(m) <= 30 && (ip === IP.net(ip, m) || ip === IP.bcast(ip, m));

  // Human-readable subnet summary used by the live calculator in forms.
  IP.info = function (ipS, maskS) {
    if (!ipS && !maskS) return null;
    const ip = IP.parse(ipS), m = IP.parseMask(maskS);
    if (ip == null) return { ok: false, text: 'Enter a valid IP address (four numbers from 0 to 255).' };
    if (m == null) return { ok: false, text: 'Enter a valid subnet mask, e.g. 255.255.255.0 (or /24).' };
    const p = IP.prefix(m), n = IP.net(ip, m), b = IP.bcast(ip, m);
    let warn = '';
    if (p <= 30 && ip === n) warn = 'That is the network address — it can’t be given to a device.';
    else if (p <= 30 && ip === b) warn = 'That is the broadcast address — it can’t be given to a device.';
    const text = p <= 30
      ? `Network ${IP.str(n)}/${p} · usable ${IP.str(n + 1)} – ${IP.str(b - 1)} (${IP.usable(m)} hosts) · broadcast ${IP.str(b)}`
      : `Network ${IP.str(n)}/${p}`;
    return { ok: !warn, text, warn };
  };

  NG.IP = IP;
})();

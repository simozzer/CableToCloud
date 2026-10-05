// Shared namespace + tiny helpers
window.NG = {};

NG.util = {
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  $: (s, r = document) => r.querySelector(s),
  $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
};

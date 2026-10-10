// The About page: lists every level, grouped into chapters, straight from js/levels.js.
(function () {
  const { esc } = NG.util;

  // Chapters, each starting at the first level id listed. A new level joins the chapter before it automatically.
  const CHAPTERS = [
    ['dhcp', 'Getting connected', 'Cables, addresses, DHCP, gateways and DNS.'],
    ['subnets', 'Networks and troubleshooting', 'Several networks on one router, fixing faults, and reaching in from the Internet.'],
    ['subnet-basics', 'Subnetting', 'Splitting an address block into networks of the right size.'],
    ['fileserver', 'Servers and services', 'File servers, internal DNS, and ports.'],
    ['acl', 'Security', 'Firewall rules, guest isolation and a DMZ.'],
    ['vlans', 'Switching, virtual machines and remote access', 'VLANs, hypervisor networks, SSH and jump hosts.'],
  ];

  const levels = NG.Levels.map((L, i) => ({ n: i + 1, L }));
  const starts = CHAPTERS.map(([id]) => levels.findIndex(x => x.L.id === id));
  const html = CHAPTERS.map(([, title, blurb], c) => {
    const from = starts[c], to = c + 1 < starts.length ? starts[c + 1] : levels.length;
    if (from < 0) return '';
    return `<div class="chapter">
      <h3>${esc(title)}</h3><p class="muted small">${esc(blurb)}</p>
      <ol start="${from + 1}">${levels.slice(from, to).map(({ L }) =>
        `<li><b>${esc(L.title)}</b><span>${esc(L.subtitle)}</span></li>`).join('')}</ol>
    </div>`;
  }).join('');
  document.getElementById('chapters').innerHTML = html;
})();

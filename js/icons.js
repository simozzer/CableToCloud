// SVG device artwork, drawn around (0,0). Colours come from CSS (per device type).
(function () {
  const I = {};

  I.pc = () => `<g class="ic">
    <rect class="ic-body" x="-28" y="-24" width="40" height="30" rx="3"/>
    <rect class="ic-screen" x="-25" y="-21" width="34" height="23" rx="1.5"/>
    <path class="ic-shine" d="M-23 -19 L-12 -19 L-23 -8 Z"/>
    <rect class="ic-body" x="-11" y="6" width="6" height="6"/>
    <rect class="ic-body" x="-18" y="11" width="20" height="4" rx="2"/>
    <rect class="ic-body" x="16" y="-24" width="12" height="39" rx="2"/>
    <circle class="ic-led" cx="22" cy="-17" r="1.8"/>
    <rect class="ic-detail" x="19" y="-10" width="6" height="1.6" rx=".8"/>
    <rect class="ic-detail" x="19" y="-6" width="6" height="1.6" rx=".8"/>
  </g>`;

  I.laptop = () => `<g class="ic">
    <rect class="ic-body" x="-21" y="-22" width="42" height="29" rx="3"/>
    <rect class="ic-screen" x="-18" y="-19" width="36" height="23" rx="1.5"/>
    <path class="ic-shine" d="M-16 -17 L-6 -17 L-16 -7 Z"/>
    <path class="ic-body" d="M-29 9 H29 L25 16 H-25 Z"/>
    <rect class="ic-detail" x="-6" y="10.5" width="12" height="2" rx="1"/>
  </g>`;

  I.server = () => `<g class="ic">
    <rect class="ic-body" x="-19" y="-26" width="38" height="50" rx="3"/>
    ${[0, 1, 2].map(k => `
      <rect class="ic-bay" x="-15" y="${-22 + k * 15}" width="30" height="11" rx="1.5"/>
      <circle class="ic-led" cx="10" cy="${-16.5 + k * 15}" r="1.7"/>
      <rect class="ic-detail" x="-11" y="${-17.3 + k * 15}" width="14" height="1.6" rx=".8"/>`).join('')}
  </g>`;

  I.printer = () => `<g class="ic">
    <rect class="ic-paper" x="-14" y="-25" width="28" height="14" rx="1"/>
    <rect class="ic-body" x="-26" y="-13" width="52" height="24" rx="4"/>
    <rect class="ic-paper" x="-14" y="5" width="28" height="14" rx="1"/>
    <rect class="ic-detail" x="-10" y="10" width="20" height="1.6" rx=".8" style="fill:#94a3b8"/>
    <circle class="ic-led" cx="19" cy="-6" r="1.8"/>
  </g>`;

  I.switch = () => `<g class="ic">
    <rect class="ic-body" x="-34" y="-14" width="68" height="28" rx="4"/>
    <path class="ic-arrow" d="M-22 -8 H18 M13 -11.5 L18 -8 L13 -4.5 M22 -1 H-18 M-13 -4.5 L-18 -1 L-13 2.5"/>
    ${Array.from({ length: 8 }, (_, k) => `<rect class="ic-port" x="${-28 + k * 7}" y="5" width="5" height="5" rx="1"/>`).join('')}
  </g>`;

  I.mswitch = () => I.switch().replace('</g>', '<text class="ic-badge" x="0" y="-18">VLAN</text></g>');

  const routerBox = antennas => `<g class="ic">
    ${antennas ? `<line class="ic-ant" x1="-18" y1="-4" x2="-23" y2="-26"/><line class="ic-ant" x1="18" y1="-4" x2="23" y2="-26"/>
    <path class="ic-wave" d="M-6 -15 Q0 -20 6 -15 M-11 -20 Q0 -29 11 -20"/>` : ''}
    <rect class="ic-body" x="-30" y="-6" width="60" height="22" rx="6"/>
    ${[0, 1, 2, 3, 4].map(k => `<circle class="ic-led" cx="${-18 + k * 7}" cy="5" r="1.8"/>`).join('')}
    <rect class="ic-detail" x="14" y="3.5" width="10" height="3" rx="1.5"/>
  </g>`;
  I.homerouter = () => routerBox(true);
  I.isprouter = () => routerBox(false);

  I.officerouter = () => `<g class="ic">
    <path class="ic-body" d="M-30 -6 V8 A30 10 0 0 0 30 8 V-6 Z"/>
    <ellipse class="ic-top" cx="0" cy="-6" rx="30" ry="10"/>
    <path class="ic-arrow" d="M-22 -6 H-8 M-12 -9 L-8 -6 L-12 -3 M22 -6 H8 M12 -9 L8 -6 L12 -3"/>
  </g>`;

  I.internet = () => `<g class="ic">
    <path class="ic-cloud" d="M-28 18 C-44 18 -44 -2 -28 -2 C-30 -20 -6 -27 2 -13 C9 -27 33 -22 30 -4 C46 -4 46 18 30 18 Z"/>
    <text class="ic-cloud-text" y="9">ISP</text>
  </g>`;

  NG.Icons = I;
})();

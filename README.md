# CableToCloud

A browser game that teaches networking by building it: plug in cables, configure IP addresses, routers, DHCP and DNS,
and watch packets travel (or fail, with an explanation of why).

## Play

Open `index.html` in a web browser. There is nothing to install or build, and it works straight from the file system.

## How it works

- Drag devices from the **Toolbox**, connect them with the **Ethernet cable** tool, and click a device to configure it.
- Each computer and router has a **terminal**: `ipconfig`, `ping`, `nslookup`, `browse`, `open \\server`, `test <host> <port>`, `netstat`, `ssh <host>`.
- When something doesn't work, the terminal explains **why**, for example "PC1 sent the packet to its gateway 192.168.1.254, but nothing answered".
- The **Subnet helper** (top bar) shows how an address block splits into subnets, in decimal and binary.
- A level completes only when every objective holds at the same time. If a later change breaks a step you had already done, it turns red.
- The win screen reviews your solution (unused rules, oversized subnets, addresses inside a DHCP pool…), and every level has a **model solution**.
- Progress is saved in your browser. Levels unlock in order (tick *Unlock all levels* in the Levels menu for teacher mode).

## Levels

1. **Hello, Internet**: connect a PC with a cable and DHCP
2. **Set in Stone**: configure a static IP address
3. **Growing Office**: connect several devices with a switch
4. **Fresh Out of the Box**: configure the router's LAN and DHCP server
5. **Names, Not Numbers**: how DNS turns names into IP addresses
6. **Staff and Guests**: two networks on one router
7. **Help Desk Hero**: find and fix six network faults
8. **Open for Business**: port forwarding, so the Internet can reach your website
9. **Subnetting Basics**: a guided tour of splitting an address range
10. **Half and Half**: split a /24 into two equal subnets
11. **Slice the Block**: split one block into subnets of different sizes (VLSM)
12. **The Shared Drive**: a file server on its own network, found by name through an internal DNS server
13. **One Server, Many Doors**: ports and services: why the intranet works but the shared drive doesn't
14. **HR Only**: access rules (a firewall) so only HR can reach HR's file server
15. **Locked Out**: troubleshoot a broken set of access rules
16. **Guests Welcome**: guest Wi-Fi that reaches the Internet and nothing else
17. **Demilitarised Zone**: move the public web server into a DMZ
18. **Two Floors, One Cable**: VLANs, access ports and trunks on managed switches
19. **Virtual Lab**: virtual machines on bridged, NAT and host-only networks
20. **The Jump Box**: SSH, a jump host, and host firewalls inside a subnet

## Code

Plain HTML, CSS and JavaScript. The game itself has no dependencies; Node.js is only needed to run the tests.

| File | Purpose |
| --- | --- |
| `js/ip.js` | IPv4 address and subnet maths |
| `js/model.js` | Device types and the network data model |
| `js/sim.js` | The simulation: DHCP, ARP, routing, NAT, port forwarding, DNS, services and ports, access rules, VLANs, and failure explanations |
| `js/levels.js` | Level definitions: setup, briefing, objectives, hints, model solution, solution review; and how a level is judged |
| `js/canvas.js` | SVG workspace, dragging, cabling and packet animation |
| `js/inspector.js` | Device settings panel |
| `js/terminal.js` | Terminal commands |
| `js/explorer.js` | Subnet helper |
| `js/game.js` | Game controller: levels, objectives, progress |
| `js/fx.js` | Sound effects and confetti |

## Tests

Install once with `npm install` (needs Node.js 22 or newer). Then:

| Command | What it runs | Time |
| --- | --- | --- |
| `npm test` | Unit and level tests, with a coverage report. Fails if any test fails **or coverage drops** below the thresholds in `package.json`. | ~1 s |
| `npm run test:quick` | The same tests without coverage. | ~1 s |
| `npm run test:e2e` | Browser tests of the interface, using your installed Google Chrome. | ~30 s |
| `npm run test:all` | Both. | |
| `npm run test:mutation` | Mutation testing: checks the tests themselves (see below). Fails if the score drops below 95%. | ~5 min |
| `npm run test:update-snapshots` | Rewrites the snapshot files after an intended change (read the diff first). | ~1 s |

Every push to GitHub runs all three (`.github/workflows/test.yml`); the mutation report is attached to the run.

| File | Tests |
| --- | --- |
| `test/unit/ip.test.js` | Address maths |
| `test/unit/model.test.js` | The network data model, and every device type’s default settings |
| `test/unit/sim.test.js` | The simulation: each feature, on small purpose-built networks |
| `test/unit/sim-details.test.js` | Finer simulation details, plus two catalogues: the route packets take, and every “Why?” explanation word for word |
| `test/unit/sim-edges.test.js` | Edge cases found by mutation testing (pool boundaries, unplugged interfaces, odd input…) |
| `test/unit/levels.test.js` | Every level: its starting network, its model solution completing it step by step, a clean review; regression tests for bugs players found |
| `test/unit/sensitivity.test.js` | For every level, what breaks each objective (each cable unplugged, each setting changed, each command altered) |
| `test/unit/wrong-answers.test.js` | Plausible wrong answers that must fail, and other right answers that must pass |
| `test/solutions.js` | The model solution for every level, written as code |
| `test/load.js` | Loads the game’s core in Node, and replays terminal commands without a browser |
| `test/e2e/game.spec.js` | The interface: terminal, settings panels, rule editor, switch ports, VMs, SSH, screens |
| `*.snapshot` files | The stored catalogues and traces the tests compare against. They are meant to be read |

The unit tests run the game’s real code in Node: `js/ip.js`, `model.js`, `sim.js` and `levels.js` never touch the page.
The interface files are covered by the browser tests, which also check that the real terminal records exactly the same events
as the replay helpers in `test/load.js`.

### Changing the game safely

- **Fixing a bug**: first add a test that fails because of it (in `sim.test.js`, or `levels.test.js` for a level), then fix it.
- **Adding a level**: add it to `js/levels.js` with a `solution` (shown in the game) and add the same solution as code to
  `test/solutions.js`. The level tests then check it automatically. Add a `review` if there are good-but-not-ideal answers worth pointing out.
- **Changing what a terminal command records**: change `test/load.js` to match; the browser contract test will fail until you do.
- **Changing a level, an explanation or how packets move on purpose**: a snapshot test fails and shows the difference.
  Read it (does each objective now tick at the right step? does each change break what it should?), then run
  `npm run test:update-snapshots` and commit the updated `.snapshot` file with your change.
- If a change lowers coverage, `npm test` says which lines aren’t tested any more.

### Mutation testing: are the tests any good?

Coverage only shows that code *ran* during the tests. Mutation testing ([Stryker](https://stryker-mutator.io)) checks that the
tests would *notice* if it were wrong: it makes thousands of small changes to the code, one at a time (`<` to `<=`, `&&` to `||`,
a condition to `true`, a line removed…), runs the tests against each, and reports any change that no test caught (a “survivor”).
The report is in `reports/mutation/mutation.html` and shows each survivor in place.

- A survivor usually means a missing test: add one that the change would break.
- Sometimes the change can’t make any difference (for example, a check that an earlier check already guarantees). Either
  simplify the code, or mark it with a comment giving the reason, as `js/sim.js` does:
  `// Stryker disable next-line ConditionalExpression: <why it can't matter>`.
- Words players read (briefings, hints, descriptions) aren’t mutated: `test/stryker-prose-ignorer.js` skips them.

The current score is about 97%. The remaining survivors are mostly extra safety checks inside level objectives.

## Ideas for the future

Containers (bridge networks and published ports), SSH tunnels and cloud networking (VPCs, security groups, load balancers).

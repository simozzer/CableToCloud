# CableToCloud

A browser game that teaches networking by building it: plug in cables, configure IP addresses, routers, DHCP and DNS,
and watch packets travel (or fail, with an explanation of why).

## Play

Open `index.html` in a web browser. There is nothing to install or build, and it works straight from the file system.

## How it works

- Drag devices from the **Toolbox**, connect them with the **Ethernet cable** tool, and click a device to configure it.
- Each computer and router has a **terminal**: `ipconfig`, `ping`, `nslookup`, `browse`, `open \\server`, `test <host> <port>`, `netstat`.
- When something doesn't work, the terminal explains **why**, for example "PC1 sent the packet to its gateway 192.168.1.254, but nothing answered".
- The **Subnet helper** (top bar) shows how an address block splits into subnets, in decimal and binary.
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

## Code

Plain HTML, CSS and JavaScript, with no dependencies.

| File | Purpose |
| --- | --- |
| `js/ip.js` | IPv4 address and subnet maths |
| `js/model.js` | Device types and the network data model |
| `js/sim.js` | The simulation: DHCP, ARP, routing, NAT, port forwarding, DNS, services and ports, and failure explanations |
| `js/levels.js` | Level definitions: setup, briefing, objectives, hints |
| `js/canvas.js` | SVG workspace, dragging, cabling and packet animation |
| `js/inspector.js` | Device settings panel |
| `js/terminal.js` | Terminal commands |
| `js/explorer.js` | Subnet helper |
| `js/game.js` | Game controller: levels, objectives, progress |
| `js/fx.js` | Sound effects and confetti |

## Ideas for the future

Firewalls, VLANs, containers and cloud networking (VPCs, security groups, load balancers).

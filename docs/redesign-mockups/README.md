# Cheng Station — redesign mockups

Static HTML and CSS only. Nothing in the apps, the sync servers, or the installers is changed. Open `index.html` in a browser. The thin bar on each screen switches the night theme, the day theme, and which product’s menu you are looking at (ChEng AIO, Voyage Chief, Tank Chief). Screenshots in `screenshots/` were taken with that bar hidden.

Figures are one sample watch on MV GIORGIS so the same noon, the same ROB and the same soundings can be compared across screens. They are not a real ship’s book.

## Direction

The work is an engine-control-room console, not a flat consumer screen. A chief engineer should recognise the surfaces before reading a label.

Night is painted plate over blue-black steel (`#0b1218`). The ground carries a faint chart grid and a brushed-metal grain. Panels are raised: a light edge on top, a dark edge underneath, a soft drop shadow, and a rivet at each corner. Inputs sit in a recessed well, the way a meter window sits in a gauge. Day keeps the same consoles on chart paper (`#e6e0d2`), with a paper grain and a brown chart grid so the board stays readable in sun. Amber, teal and red are the lamp colours: caution, calculated, alarm. Fuel, distillate, lube and fresh water keep the pipe colours the suite already uses.

Buttons are push-buttons. A rim, a highlight along the top edge, and a shadow under the button make them stand off the plate. Pressing one (or leaving it on) sinks it and lights a lamp: amber for the active control, green when a state is in date, red for the OWS alarm. On a phone, Noon and Soundings are solid brass console keys on the bottom bar and again as the two large keys at the top of Home. The offline pill is a lamp bezel, not a flat chip.

The maritime marks are structural, not pictures. Section titles are stencil-style plate stamps (wide mono capitals, a brass rule). The ship name carries a small load-line disc. The watch strip gives course and a noon position. The voyage progress chart is a passage line on a faint grid: departure, arrival, miles run in brass, miles remaining dashed, and a small hull marker at the ship’s position. It is a chart symbol, not the old animated hull, waves and rain. Fuel on Home is a vertical gauge for each grade, in the pipe colour, with the opening ROB as a tick.

Type is Inter for reading and JetBrains Mono for figures and plate stamps. Nothing on screen is under 12px. Touch targets stay 44px on a phone or tablet, and tighten on Windows so a 768px-tall laptop still has room for the form.

## Navigation

Windows keeps today’s menu, in today’s order, as a left sidebar:

Home, Voyage, Tanks, Consumption Plan, Bunkering Plan, ECA, e-ORB, Performance, Spares, Notes, Vessel Setup, Backup & Sync, License, About.

Opening Noon or ROB also shows Voyage Chief’s own groups on one scrolling row: Watch, Voyage, Books, Ship, with the same page names. Opening Soundings or Calibration shows Tank Chief’s groups: Summary, Tanks, Fuel Management, Reference, System. That second row is how the modules work today; it is restyled, not renamed. From 1366px wide upward the sidebar does not turn into a bottom bar. At 1920px the sidebar stays the same width and the board uses the extra room for another column of figures.

Phones and tablets do not use that sidebar. Noon report and Soundings are the two primary items, one tap away.

| Width | Typical shot | Navigation |
| --- | --- | --- |
| 320–599, portrait | 320×568 and 360×800 | Bottom bar: Home, Noon, Soundings, and More. From 360px wide, e-ORB is on the bar as well. More opens a sheet grouped Watch / Voyage / Tanks / Ship. Every Windows item is in that sheet. |
| Short landscape (height under 500) | 800×360, and a 568×320 phone turned sideways | The bottom bar is removed so the short screen keeps its height. A single row of chips stays: Noon, Soundings, Home, e-ORB, More. More is the same full sheet. |
| 600–1365, portrait | 800×1280 tablet | Same bottom bar as a phone, with room for two or three columns of figures. Still no Windows sidebar. |
| 600–1365, landscape, tall enough to be a tablet | 1280×800 | A left rail, not the Windows list. Noon, Soundings and Home are the large items. Under them, the same sections as the Windows sidebar, grouped, with 44px rows. |
| 1366 and up | 1366×768, and checked at 1920×1080 | Windows sidebar, plus the module’s own group row when you are inside Voyage or Tank. |

Today’s apps switch to the phone bar when the short side of the window is under about 900px. A 1366×768 laptop already loses the full menu. This proposal keeps the Windows sidebar from 1366px wide, including that short laptop.

A watch strip sits under the top bar on every size: ship’s clock, next ports, ROB by grade, sludge percent, and the e-ORB weekly-inventory line. That is the strip the AIO shell already shows. On a very narrow phone it scrolls sideways rather than stacking.

The top bar carries the ship, the condition (L or B), an offline lamp that opens Backup & Sync, the clock, and Day / Night. The lamp is amber when the device is offline. The open voyage leg is called out on the home board; sync is not allowed to drop it.

## Menu icons

Every item in the Windows sidebar, the tablet rail, the phone and tablet bottom bar, the landscape chips, and the More sheet uses the same line icon. Today’s phone bar uses emoji; the Windows lists are mostly plain text, and Tank Chief’s own menu uses a mix of emoji and single characters. Those are replaced by one stroke set: [Lucide](https://lucide.dev) 0.468.0 where a general symbol already exists, and a few marine glyphs drawn for this mockup in the same 24px stroke. The SVGs are inlined in `icons.js`, so nothing is fetched at sea and there is no build step.

Lucide is the ISC license (Copyright Lucide Contributors). The custom glyphs are original drawings for these mockups.

| Menu item | Where it sits | Current mark | New icon | Plate colour | Source | License |
| --- | --- | --- | --- | --- | --- | --- |
| Home | Sidebar, bar, sheet | 🏠 on the phone More sheet | house | Steel | Lucide | ISC |
| Voyage / Summary | Sidebar “Voyage”, voyage Watch | 🧭 on the phone bar | compass | Nautical blue | Lucide | ISC |
| Noon report / Log Entry | Phone bar, voyage Watch | text only | sextant | Nautical blue, lighter | Custom | Original |
| ROB | Voyage Watch, sheet | text only | gauge | Fuel amber | Lucide | ISC |
| Tanks / Tank summary | Sidebar “Tanks” | ⛽ on the phone bar | tank-gauge | Fuel amber | Custom | Original |
| Soundings / Monitoring | Phone bar, tank Fuel management | ⛽ Monitor, 📇 Sounding | sounding-tape | Fuel amber | Custom | Original |
| Consumption Plan | Sidebar, voyage | 📈 | trending-up | Nautical blue | Lucide | ISC |
| Bunkering Plan / Bunker Plan | Sidebar, tank menu | 📥 | bunker-hose | Oil bronze | Custom | Original |
| Bunkering | Tank Fuel management | 📥 | bunker-hose | Oil bronze | Custom | Original |
| Bunker Consumption | Tank menu | 📊 | trending-up | Oil bronze | Lucide | ISC |
| Bunker Summary | Tank menu | 📑 | clipboard-list | Oil bronze | Lucide | ISC |
| ECA | Sidebar, voyage | 🌊 | waves | Sea green | Lucide | ISC |
| e-ORB | Sidebar, bar, voyage Books | 📕 | orb-book | Signal red | Custom | Original |
| Performance | Sidebar | 📊 | gauge | Brass | Lucide | ISC |
| Spares | Sidebar, voyage Watch | 🔩 | nut | Steel | Lucide | ISC |
| Notes | Sidebar, both modules | 📝 | notebook-pen | Brass | Lucide | ISC |
| Vessel Setup / Vessel Data | Sidebar, voyage Ship, tank System | 🚢 | anchor | Brass | Lucide | ISC |
| Voyage Setup | Voyage Ship | text only | route | Nautical blue | Lucide | ISC |
| Setup (flowmeters, MCR) | Voyage Ship | text only | settings | Brass | Lucide | ISC |
| Backup & Sync | Sidebar, tank System | ⇅ | arrow-up-down | Signal green | Lucide | ISC |
| License | Sidebar | 🔑 | key-round | Brass | Lucide | ISC |
| About | Sidebar, voyage Books, tank System | ℹ | info | Steel | Lucide | ISC |
| Consumption | Voyage | text only | flame | Oil bronze | Lucide | ISC |
| Voyage Abstract | Voyage | text only | scroll-text | Nautical blue | Lucide | ISC |
| Range Totals | Voyage | text only | sigma | Nautical blue | Lucide | ISC |
| Trends | Voyage | text only | chart-line | Nautical blue | Lucide | ISC |
| Receipts | Voyage | text only | receipt | Oil bronze | Lucide | ISC |
| Reports / Voyage Report | Voyage, tank menu | 📋 | files | Blue for voyage reports, amber for the tank voyage report | Lucide | ISC |
| Reference | Voyage Books | text only | book-open | Nautical blue | Lucide | ISC |
| Fuel Oil | Tank Tanks | ⛽ | droplet | Fuel amber | Lucide | ISC |
| Lube Oil | Tank Tanks | 🛢 | lube-drum | Lube yellow | Custom | Original |
| Misc / Bilge | Tank Tanks | 🔧 | wrench | Steel | Lucide | ISC |
| Fresh Water | Tank Tanks | 💧 | glass-water | Water blue | Lucide | ISC |
| Add Tank | Tank Tanks | + | plus | Fuel amber | Lucide | ISC |
| Calibration DB | Tank Tanks | ☰ | ruler | Fuel amber | Lucide | ISC |
| Sounding Card | Tank menu | 📇 | file-text | Fuel amber | Lucide | ISC |
| VCF / WCF Calc | Tank Reference | Σ | calculator | Brass | Lucide | ISC |
| ISO 8217 Specs | Tank Reference | ▤ | badge-check | Brass | Lucide | ISC |
| More | Phone and tablet bar | ⋯ | ellipsis | Steel | Lucide | ISC |

Each mark sits in a small raised plate: a two-tone gradient, a light top edge, a dark lower edge, and a drop shadow, so it reads as a console indicator rather than a flat stroke. Dark plates use a light glyph. Amber, brass and lube yellow use a dark glyph so they stay readable in sun and in a dim control room. The same plate colour follows the item on Windows, tablet and phone.

Standalone Voyage Chief uses the same chrome with the tank items removed (no Soundings on the bar, no tank groups). Standalone Tank Chief removes Noon, ROB and e-ORB. On Windows the standalone apps do not show the AIO sidebar: Voyage Chief keeps its four groups, Tank Chief keeps its five. The product switch on the mockup bar demonstrates that. Inside AIO, Vessel Setup remains the only editor of the shared identity.

## Where each Windows item goes on a phone or tablet

| Windows sidebar | Phone portrait | Phone landscape | Tablet portrait | Tablet landscape |
| --- | --- | --- | --- | --- |
| Home | Bottom bar | Chip | Bottom bar | Rail, first group |
| Voyage (summary) | More → Voyage — Watch → Summary | More | More | Rail, under All sections |
| Tanks (summary) | More → Tanks — Summary | More | More | Rail |
| Consumption Plan | More → Voyage | More | More | Rail |
| Bunkering Plan | More → Tanks — Fuel management | More | More | Rail |
| ECA | More → Voyage | More | More | Rail |
| e-ORB | Bottom bar from 360px wide; otherwise More | Chip | Bottom bar | Rail |
| Performance | More → Voyage, and the figures are on Home | More | More | Rail |
| Spares | More → Watch | More | More | Rail |
| Notes | More → Ship | More | More | Rail |
| Vessel Setup | More → Ship | More | More | Rail |
| Backup & Sync | More → Ship, and the offline lamp | More, and the lamp | More, and the lamp | Rail, and the lamp |
| License | More → Ship | More | More | Rail |
| About | More → Ship | More | More | Rail |

Voyage Chief’s other pages (Log Entry, ROB, Consumption, Voyage Abstract, Range Totals, Trends, Receipts, Reports, Reference, Setup, Voyage Setup, Vessel Data) are in the phone sheet under Voyage, in the same four groups. Log Entry is also the Noon button. ROB has its own screen in this set.

Tank Chief’s other pages (Fuel Oil, Lube Oil, Misc / Bilge, Fresh Water, Add Tank, Calibration DB, Monitoring, Bunker Plan, Bunker Consumption, Bunkering, Bunker Summary, Sounding Card, Voyage Report, VCF / WCF, ISO 8217) are in the sheet under Tanks. Monitoring is the Soundings button. Calibration DB has its own screen.

Pages other than Home, Noon, Soundings, ROB, Calibration and Vessel Setup open a short placeholder so the menu can be checked. They are not redesigned here.

## How dense screens behave from 320px up

Noon report, on a phone in portrait, is four steps: When, Meters, Oil & water, Review. Each step is one screen, with a sticky Next or Save. Calculated boxes stay dashed. The previous meter reading sits under the input. On a tablet in landscape and on Windows the same sections are all visible at once, which is how Log Entry works today. The Windows “Enter Flowmeters…” popup is the Meters step on a phone.

ROB is one card per grade (opening, received, consumed, present), with a sticky total. The survey-minus-log comparison is under them. There is no sideways table on a 320px phone.

Soundings, on a phone, opens on the tanks. The draft, trim, heel and temperatures are one summary line; tap it for the full header. Each tank is a card: the centimetres and the temperature are the large inputs, the weight in air is the large figure, and VCF / GSV / WCF sit in the small line. A total for VLSFO, distillate and the log difference sticks to the top. From tablet landscape upward (about 1100px) the cards give way to the full monitoring grid, the same columns as the fuel-oil report. That grid is the one place a sideways scroll is still honest, and the tank name stays pinned.

Calibration, on a phone, is one trim column down the page, chosen from a list. The sounding-by-trim grid appears from tablet landscape up, with the sounding column pinned if the grid must scroll.

## Dashboard inventory

Today there are three home screens. ChEng AIO Home, Voyage Chief’s Summary, and Tank Chief’s Vessel Tank Overview. The new Home keeps every card, metric, control and alert from all three. The voyage picture is a chart passage with a hull marker. The animated waves and rain are not repeated.

### ChEng AIO shell and Home

| Today | On the new Home |
| --- | --- |
| Watch strip: ship’s clock, next ports, ROB by grade, sludge %, e-ORB weekly line | The strip under the top bar, on every screen |
| First-run “Set up this vessel” when no ship exists | Empty state of this same board. Not drawn on the working sample. The note at the bottom of the tank section says so |
| Voyage progress: Voyage Chief, Log Entry, Consumption Plan | Passage band, button row |
| Voyage progress picture: departure, 0 nm, arrival, total nm, ship on the track, nm sailed, percent complete, nm to go, speed, RPM, slip, kW, % MCR, average speed | The chart directly under the Noon and Soundings keys. Visible on the 1366×768 desktop, the 360×800 phone, and tablet landscape |
| Days at sea, days to go, ETA | Strip under the voyage chart, and again in the voyage-figures list |
| Wind from, Beaufort, knots, Beaufort name, sea state | Line under the chart. Beaufort sample buttons are in Voyage figures |
| License warning if Voyage or Tanks is not on the key | Not on this sample (the sample is licensed). The sentence stays available where today’s warning sits, under the passage or the tank band |
| Calculated ROB: ROB button, per-fuel gauge with present, opening tick, used, survey correction, fuel colour | Vertical fuel gauges in the top band, beside the chart on a wide screen and directly under it on a phone. The same three grades are repeated as numbers in Calculated ROB, with the lube and fresh-water gauges |
| Vessel tank overview: Tank Chief, Monitoring, Bunkering Plan, Rearrange, Reset layout | Tank band, button row. Rearrange reveals the same hint |
| HFO/VLSFO volume, logged count, % full | HFO / VLSFO card |
| HFO/VLSFO weight in air | The weight line on that card, and the separate weight card |
| MDO/MGO/LSMGO volume and weight, fuel readings | The distillate cards and the fuel-readings card |
| Four-column tank drawing: HFO port, HFO starboard, distillate port, distillate starboard | Same four columns. On a phone they stack. Each tank still shows name, grade, role, fill, m³, MT, temperature, and the 85% line |
| “Moved” when a tank is counted under distillate this voyage | The card title can carry it. This sample has no moved tank |
| Drag grip while rearranging | The grip marks on the port column; Rearrange toggles the hint |

### Voyage Chief Summary

| Today | On the new Home |
| --- | --- |
| Beaufort sample buttons BF 0, 3, 5, 7, 8, 10, 12, and Live | Disclosure under the weather line. Open on Windows, one tap on a phone |
| Performance averages, Recalculate, Undo | Performance band |
| RPM, slip, load kW, load % MCR, engine distance, engine speed, ship distance, ship speed | That band’s figures |
| SFOC @ 100% MCR, reference at the average load, actual ISO SFOC, delta, hour-weighted % MCR | Fuel efficiency band, including the +3% investigation note |
| Machinery running hours: M/E steaming, each A/E, boiler, incinerator, LO purifier | Running-hours band |
| BDN and sample retention: delivered, BDN no., grade, quantity, port, sample until, BDN until; Refresh; Print | BDN band |
| PMS: Add unit, Offer hours, Print due list; unit counter; falling-due table | Maintenance band |
| Departure / arrival ROB: Opening, Received, Consumed, Present; Recalculate; Undo; Print; Export weekly abstract | Departure / arrival band. On a phone each grade is a card instead of a wide row |
| CII ship type, year, manual required CII; total fuel, CO₂, distance, DWT, attained, required, rating | Carbon intensity band |
| Voyage time averages: days at sea, hour-weighted MCR, generator load, generator kW, per A/E | Voyage time averages band |
| Consumption per day: M/E, G/E, boiler; at sea and port/anchorage, rates and totals; by grade; CYL HIGH, CYL LOW, ME SYS, GE SYS; fresh water | Average consumption band |
| Calculated ROB for lube (with the lube total) and fresh water (with the fresh-water total) | Calculated ROB band, under the fuel gauges. AIO Home only drew the fuel gauges; the lube and water gauges from Voyage Summary are here too |
| Latest noon’s distance, RPM, slip, weather, engine-room and tank temperatures, bilge and sludge | Latest noon band. This was inside the voyage summary form rather than a separate card; it is called out because the owner asked for the latest noon on the board |

### Tank Chief Summary (Vessel Tank Overview)

| Today | On the new Home |
| --- | --- |
| Title line: ship, port, date | Tank band subtitle, plus last sounding time |
| Print Tank Summary, Save | Button row |
| Total weight, total volume, readings n / n | Three cards at the top of the band |
| HFO/VLSFO and MDO/MGO/LSMGO cards: weight, m³ / capacity, logged, % full | Family cards. AIO’s separate volume and weight cards are the same numbers, so they share these cards rather than being drawn twice |
| Lube oil, Misc / Bilge, Fresh water cards | The three cards beside the fuel |
| Graphical tanks / Table toggle | Both, plus a Both control so a review can see them together. The live app still shows one at a time. Phone leads with the drawing; the table follows |
| Table columns: Tank, Role, Side, 100% m³, 85% m³, Reading, Vol m³, Fill, MT, repeated per category | The tables under the drawing, including lube, fresh water and misc |
| Tank groups on the drawing: All, Fuel, Storage, Settling, Service, Overflow, Lube, Water, Misc | Roles are on each card and in the table. The phone does not add a second filter row on top of the four columns |
| Tank Summary Report fold: Saved, Type / voy, Port, Date, Result, Print, Load, Delete, and the draft row | The fold at the bottom of the tank band. Open on Windows |
| Draft vs filed | The draft chip on the first history row |

### Alerts and other state the owner asked to see

These are not all separate cards today. They are the statuses the programs already compute, gathered at the top so a phone in portrait shows them before the long board.

| State | Where |
| --- | --- |
| Noon not filed for today | First alert. Today’s noon is the open log entry |
| Weekly 15 ppm / OWS test due | Red alert. On the live book this flashes once a second |
| Service tank low | Amber alert, and the service card in the tank drawing |
| e-ORB weekly inventory in date, last date, next due, Panama Part III | Green alert, and the watch-strip line uses the app’s own wording |
| Offline, last sync, open leg kept, unpushed monitoring draft | Top-bar lamp and the Ship and sync band |
| Vessel name, IMO, call sign, flag, type, DWT, company, Chief Engineer | Ship and sync band. Editing stays on Vessel Setup |
| Last bunker: date, BDN, grade, quantity, port, sulphur | One line under the tank totals, from the receipt fields |
| Survey minus log | On the VLSFO gauge, the grade-check on Soundings, and the ROB page |

## Screens

| File | What it is |
| --- | --- |
| `index.html` | List of the mockups |
| `dashboard.html` | Home board |
| `noon.html` | Noon report / log entry |
| `soundings.html` | Tank monitoring |
| `rob.html` | ROB |
| `calibration.html` | Calibration database |
| `vessel.html` | Vessel Setup |
| `soon.html` | Placeholder for every other menu item |
| `station.css`, `station.js` | Shared chrome. No framework, no build |

## Screenshots

`screenshots/` holds a PNG of each mockup at the sizes below, plus a few of the current apps. Night is the working theme. Day is included for Home, Noon and Soundings at laptop and phone size. Home is also captured as a tall board (`dashboard-full-1366.png`, `dashboard-full-360.png`) so the cards below the first screen can be checked, and with the phone More sheet open.

| Screen | Files |
| --- | --- |
| Home | `dashboard-desktop-1366x768.png`, `dashboard-phone-360x800.png`, `dashboard-phone-landscape-800x360.png`, `dashboard-phone-320x568.png`, `dashboard-tablet-800x1280.png`, `dashboard-tablet-landscape-1280x800.png` |
| Noon | `noon-` with the same six size suffixes |
| Soundings | `soundings-` with the same six |
| ROB | `rob-` with the same six |
| Calibration | `calibration-` with the same six |
| Vessel Setup | `vessel-` with the same six |

Day: `dashboard-desktop-1366x768-day.png`, `dashboard-phone-360x800-day.png`, and the same pair for `noon` and `soundings`.

Scale check: `dashboard-desktop-1920x1080.png`, `noon-desktop-1920x1080.png`, `soundings-desktop-1920x1080.png`.

Current apps, from this machine with no ship and no license server: `before-aio-shell-desktop-1366x768.png` (the flat sidebar and Vessel Setup), `before-aio-phone-360x800.png` (emoji bottom bar), `before-aio-desktop-1366x768.png` (boot splash), `before-voyage-log-desktop-1366x768.png` and `before-voyage-log-phone-360x800.png` (log entry; the license wall was closed so the form could be seen), `before-tank-nav-desktop-1366x768.png` (Tank Chief with no vessel). `before-voyage-desktop-1366x768.png` and `before-tank-desktop-1366x768.png` are the license wall a fresh device shows first.

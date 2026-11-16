# AIS vessel position — plan only (not built)

Status: **plan for future reference. Nothing here is implemented.** Facts below come from a quick
read of public documentation in November 2026 and must be re-checked before building.

## Goal

Add a ship by IMO number and flag, hold its MMSI, and show its live position and basic AIS data
(speed, course, destination, ETA) in ChEng AIO — without breaking the offline-first behaviour.

## What AIS needs

AIS identifies a ship by **MMSI**, not IMO. Vessel Setup needs an MMSI field next to IMO and flag.
Ship particulars (owner, tonnage, etc.) are not available from free AIS feeds; they stay typed in
Vessel Setup. Equasis has no API and forbids scraping.

## Sources considered

| Source | Use | Notes / risks |
|---|---|---|
| AISStream (aisstream.io) | Free live worldwide terrestrial AIS over WebSocket, free API key | Beta, no SLA, format "not stable". Subscription must be sent within 3 s of connecting. Reported limit of 3 connections per IP (unverified). Docs warn that putting the key in a public web page exposes it. Do not resell the stream without checking terms. |
| Own receiver: AIS-catcher | RTL-SDR dongle + VHF antenna, or ship AIS NMEA output; JSON/NMEA over UDP/TCP/HTTP | No internet needed, no key, no per-IP limit. Range about 20–40 nm (VHF line of sight). Hardware and, on a ship, cyber/ISM approval to connect to AIS network; a separate receiver with its own antenna avoids touching ship systems. AIS-catcher does not fetch internet data itself. |
| aiscatcher.org website | Community map fed by members' receivers | No public data API found, terms not read. Do **not** scrape. Possible: a "View on aiscatcher.org" link, and asking the maintainers about an official route. |
| Kystverket / BarentsWatch (Norway) | Open real-time AIS for Norwegian waters | Open government licence; regional only. |
| Digitraffic (Finland), Danish Maritime Authority | Open regional AIS | Existence known; terms not checked. |
| NOAA MarineCadastre | Historical AIS | No live feed. |
| AISHub | Data in exchange for sharing your own receiver feed | Terms not confirmed. |
| MarineTraffic, VesselFinder, MyShipTracking, Spire, Kpler | Paid APIs | Paid; scraping prohibited by their terms. |

Not acceptable: scraping paid or community sites, or sharing one key among many users.

## Architecture options

1. **Per device, user's own AISStream key (simplest).** Each Android/Windows install opens one
   WebSocket, following only that user's MMSIs. Key stored privately on the device and left out of
   backups, exports and printouts. Devices on the same ship or office share one public IP, so keep one
   connection per device and offer a "ship relay" (one device or the Cheng-Pro server holds the
   connection and shares it on board).
2. **Relay in Cheng-Pro (one connection per ship or office).** Holds the key, follows the fleet's
   MMSIs, caches the latest position, and serves it to the apps on the LAN. The Cheng-Pro Proxmox
   installer can host it.
3. **Own AIS receiver feed.** AIS-catcher (or the ship's AIS NMEA) read by the Cheng-Pro server, which
   keeps the latest position of each ship. Works offline; nearby traffic only.
4. **Central service for thousands of users (only if ever needed).** One ingest service with one or
   two connections, matching registered MMSIs, caching the latest position, and serving apps from the
   cache. Needs a hosted server and database, written permission from the data provider for
   redistribution, and a swappable source with a paid provider as fallback.

All options write to the same "latest position of each ship" store, so the apps do not depend on
which source supplied it.

## Build order (when approved)

1. Trial: connect with a test key, follow one MMSI, confirm both Android and Windows apps receive a
   position (also confirms whether AISStream accepts the Android app's origin, how many MMSIs one
   filter holds, and the current message format).
2. Vessel Setup: MMSI field, AIS key box, Test key button; guide topic "how to get your key".
3. Shared AIS module in Cheng-Pro: open only while a position is shown, reconnect with back-off,
   close when leaving.
4. Home card: last position, speed, course, destination, age of the data.
5. Store the last known position per ship on the device; show "last seen … ago" offline.
6. Map page (needs map tiles, so online).
7. Optional: ship relay, then AIS-catcher / NMEA input.

## Limits to keep in mind

- Terrestrial AIS only reaches near coasts. Offshore ships show an old position or none; satellite AIS
  is paid.
- Ship internet is slow and intermittent; filter by MMSI to keep traffic small.
- A free beta service can change or disappear; always show the age of the data and "AIS unavailable"
  when the source is down.
- Check each provider's terms before shipping, especially for use across many users.

## Open questions

- Own ship only, or other ships too (sister ships, the vessel being relieved)?
- Does the key live on the ship or office server, or is it entered per user?
- Do any ships have a spare AIS NMEA output, or would a standalone receiver be needed?
- Which regions do the ships trade in (decides whether a regional open feed is worth adding)?

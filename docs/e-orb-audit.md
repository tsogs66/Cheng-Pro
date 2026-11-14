# e-ORB audit — what was checked, what was found, what is still open

Voyage Chief / ChEng AIO `eorb.js`. Updated 14 Nov 2026 after a research pass on the Cheng Marine Suite environment. The full findings, each marked VERIFIED or UNVERIFIED with its link, are in [`docs/eorb-flag-research/`](eorb-flag-research/README.md).

## Checked and fixed in the program

| Area | Result |
|---|---|
| Every entry type × every flag | `tests/test_eorb_flags_sweep.js` builds every item and scenario for all 10 flags (1,935 combinations): nothing throws, every entry produces record lines, no `undefined`/`NaN`, signatory rules follow each flag's policy. It found that Part II Code D (crude oil washing) items 13 and 14 were run through the Part I bilge wording and threw. Fixed. |
| Appendix III, Part I | Compared with the official form (Hong Kong and Liberian reproductions): every code letter A–I and item number matches. |
| Appendix III, Part II | Items 1–84 match. **Added** the missing item **85** (R: date, signature and stamp of port authority official); **R 84** now reads "Total quantity of ballast water discharged"; titles of F, J and L and items 37 and 50 follow the official wording. |
| Part III | Part III is **not** an IMO form. Only Panama's book has one (MMC-215, 6 Mar 2026). It is now offered, supplemented and followed on **only for flags that require it** (`partIII: true`, Panama). Other flags get Parts I and II; Part III entries already saved stay in the book. |
| Burning of waste | Sludge in an incinerator: Code C 12.3; in a **boiler**: C 12.4 (Circ.736 example 7). Paper, wood, domestic garbage, **oily rags and used filters**: Garbage Record Book only (MEPC.1/Circ.736; Annex V Reg. 10). Panama MMC-215 para 5.6.6 also wants each incinerator use in ORB Part I and Part III, so the "Garbage incinerated" entry is offered on Panama-flag ships only. |
| Signatories | **Liberia** (Marine Operations Note 7/2010) and **Malta** (Technical Notice MARPOL.7): the officer in charge signs, the Master each page. They were set to "officer + Chief Engineer" (Liberia) and "Chief Engineer only" (Malta); both corrected. **Cyprus** "Chief Engineer only" could not be traced to any document and now follows the Convention default. Marshall Islands keeps the officer + Chief Engineer layout, which is unverified (MG 2-13-3 could not be read). |
| Flag notes | Corrected: Liberia POL-012 is **Rev. 08/24**; RMI "MI-402A" removed; RMI Declaration is issued on application (form MI-334A); Singapore: a Recognised Organisation approves the book and issues the Declaration; Hong Kong: English, or English and Chinese; Bahamas: MN056 added, MN010 is v2.3 of 2 Oct 2025. |
| Flag guide | Entry Codes › Flag guide lists each flag's publications with a "Read" or "Listed only" tag, links to the originals and the history of changes (IMO, Liberia, Marshall Islands, Panama, Bahamas, Singapore, Malta, Hong Kong, Cyprus, UK), and a "which book records the burning of each kind of waste" table. A reference list with links, not a copy. |

## Still open

1. **RMI** MG 2-13-3 and MN 2-013-3 (the register-iri.com TLS certificate failed through the proxy), **Cyprus**, **UK** (MIN 644) and **Norway** could not be read; they are "Listed only" or absent.
2. **Panama Part III item numbers.** The Part III form is a non-public file. Letter E for the incinerator is confirmed (Oct 2018 log); items 6–8 and the fuel-changeover items C 1–4 are the program's own design. ODS, vapour-collection and NOx Tier III records are not modelled.
3. **Other flags and Part III.** No document read for Liberia, Bahamas, Malta or Hong Kong has one. Marshall Islands, Singapore, Cyprus, UK and Norway are unknown; a flag is added with `partIII: true` once its circular says so.
4. **MEPC.1/Circ.736/Rev.2** itself was not read (the original circular was, via Liberia).
5. **Panama language** "English / Spanish" and the Marshall Islands "officer + Chief Engineer" layout are unverified.

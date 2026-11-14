# e-ORB audit — what was checked, what was found, what is still open

Voyage Chief / ChEng AIO `eorb.js`. Written 14 Nov 2026.

## Checked and fixed

| Area | Result |
|---|---|
| Every entry type × every flag (Part I, II, III items and all scenarios, 10 flags) | `tests/test_eorb_flags_sweep.js` builds each one with sample values: 1,970 combinations, nothing throws, every entry produces record lines, no `undefined`/`NaN` in the wording, signatory rules follow each flag's policy. |
| **Fault found by the sweep** | Part II Code D (crude oil washing) items 13 and 14 were run through the *Part I* Code D wording (bilge water, start/stop time), which reads fields those items do not have. A crude-oil-washing entry could not be built. Part I wording is now applied to Part I only. |
| Changing the flag | Changes the signatory policy (officer in charge / Chief Engineer only / both), the notes and tips, the ERB note and which flag-only scenarios apply (Part III is Panama's). It never blocks writing an entry. |
| Burning of waste | MEPC.1/Circ.736/Rev.2: incineration or landing ashore of oily garbage and used filters is recorded in the **Garbage Record Book only**. Paper, wood and other domestic garbage: Garbage Record Book (MARPOL Annex V Reg. 10). Sludge burned in the incinerator: ORB Part I Code C item 12.3. **Panama** MMC-215 (revision of 6 March 2026) asks for every use of the incinerator in the Garbage Record Book *and* in the Oil Record Book and Emissions Part I and Part III. The "Garbage incinerated" entry and the Flag guide now say this. |
| Flag guide | Entry Codes › Flag guide: publication list per flag (title, number, date, link to the original), history of changes, and the "which book" table for waste. A reference list with links, not a copy of the publications. |
| Browse & Print | The record book's table with no heading or footer, 10 lines then scroll, nothing ticked by default. |

## Checked against sources only by title / number / date

These were found in search results and the administrations' own publication lists. The documents themselves were **not** read in full in this session, because the registry sites are outside the session's network allow-list:

- IMO: MARPOL Annex I Reg. 17 / Reg. 36 / Appendix III (MEPC.187(59), in force 1 Jan 2011); MEPC.1/Circ.736 (8 Nov 2010), Rev.1 (25 Aug 2011), Rev.2 (6 Oct 2011); MEPC.312(74) (electronic record books); MARPOL Annex V Reg. 10.
- Liberia: POL-012 (Rev. 11/21 latest found; Declaration of MARPOL ERB; first entry after the Declaration date); Marine Operations Note 07/2010.
- Marshall Islands: MG 2-13-3; MN 2-013-3; MN 7-041-5 (May 2020); MI-334C (11 May 2020).
- Panama: MMC-215 Oil Record Book and Emissions (editions Jul 2014, Oct 2017, Oct 2018, Dec 2021, Sep/Oct 2023, 6 Mar 2026; the 2026 edition replaces MMC-23, 83, 148, 154, 177); MMC-193 electronic books (Mar 2020, Sep 2023, 2026).
- Bahamas: Marine Notice MN010 (MARPOL Electronic Record Books, 2021).

## Still open — needs the primary documents

1. **Item-by-item comparison with Appendix III.** The codes and the item numbers of Part I C–I match the structure of Appendix III and MEPC.1/Circ.736/Rev.2. Part I A and B (items 1–10) and Part II (A–R) were **not** compared word-for-word with the amended form.
2. **Panama Part III.** The program's Part III has C (fuel changeover) and E (incinerator: position, time, oxygen %, combustion chamber temperature). The 2026 circular reportedly uses Part III for the incinerator; its code letters and item numbers were not read. One unofficial copy calls the incinerator entry "III-D".
3. **Part III on other flags.** The program asks for the incinerator follow-on (Part III E) whenever sludge is burned, for every flag. MARPOL does not ask for it, and only Panama is confirmed to. It is left as the author built it; decide whether it should be optional outside Panama once the primary documents are read.
4. **Flag notes the program prints** that could not be traced to a document: RMI "MI-402A item list", the Cyprus and Malta "Chief Engineer only" signatory policy, and the Singapore, Hong Kong, UK and Norway notes. No circulars for Singapore, Cyprus, Malta, Hong Kong, the UK or Norway are in the Flag guide yet.
5. **Signatures.** Which flags want the officer in charge, the Chief Engineer or both is the program's reading of each administration's practice; it was not confirmed against a circular.

To close 1–5, run a session on the **Cheng Marine Suite** environment (it allows the registry hosts), read the documents listed above and compare them with `PART_I`, `PART_II`, `PART_III` and `FLAGS` in `eorb.js`.

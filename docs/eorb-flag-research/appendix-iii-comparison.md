# Appendix III comparison: official item list vs `PART_I` / `PART_II` / `PART_III` in `eorb.js`

Researched 14 Nov 2026. Research only: `eorb.js` was not changed.

## Sources used for the official list

| Source | What it gave | Status |
|---|---|---|
| UK MCA draft MIN XXX (M), 25 Oct 2018, [PDF](https://assets.publishing.service.gov.uk/media/5bfbffcce5274a0fb45eed47/181025_MIN_XXX_M__MARPOL_Annex_I_-_Draft.pdf) | Text of MEPC.187(59): Part I Sections A-H and Part II Section J as replaced | VERIFIED, secondary reproduction of the resolution. The IMO original was not on an allowed host. |
| Hong Kong Marine Department [Part I form](https://www.mardep.gov.hk/filemanager/en/share/publications/pdf/marpol_oil_record_1.pdf) and [Part II form](https://www.mardep.gov.hk/filemanager/en/share/publications/pdf/marpol_oil_record_2.pdf) | Full English item lists, Part I A-I and Part II A-R | VERIFIED |
| Liberia [Marine Operations Note 7/2010 Revised](https://www.liscr.com/marketing/liscr/media/liscr/online%20library/maritime/marine-operations-note-07_2010.pdf) (10 Dec 2010) | Part I and Part II item lists; Circ.736 (original) worked examples 1-27 | VERIFIED. It reproduces the original Circ.736, not Rev.2. |
| MEPC.1/Circ.736/Rev.2 | Not read. The only host (dco.uscg.mil) is blocked | UNVERIFIED |

Part II Sections A-I and K-R were not amended by MEPC.187(59) (only J was). Their wording is checked against the Hong Kong and Liberian reproductions only.

## Part I (Codes A-I)

Result: **every code letter and item number in `PART_I` matches the official list.** There are no missing, extra or wrongly numbered items. The remaining differences are wording only.

| Code | Official title | App title | Items 1-26 | Wording notes |
|---|---|---|---|---|
| A | Ballasting or cleaning of oil fuel tanks | same | 1, 2, 3.1-3.3, 4.1-4.2 match | Labels are shortened. Official 3.2 reads "identify tank(s) in which one or another method has been employed (...)"; app 3.2 reads "Cleaning method / chemicals". |
| B | Discharge of dirty ballast or cleaning water from oil fuel tanks referred to under Section (A) | drops "referred to under Section (A)" | 5-10 incl. 9.1, 9.2 match | Title shortened. |
| C | Collection, transfer and disposal of oil residues (sludge) | same (Liberia's 2010 copy says "Collection and disposal"; HK, UK draft and Bahamas MN056 say "Collection, transfer and disposal") | 11.1-11.4, 12.1-12.4 match | Official 12 is "Methods of transfer or disposal of oil residues (sludge)", with 12.1-12.4 beneath it. The app has no row for the parent item 12 (not a fault). Official 12.3 "incinerated (indicate total time of operation)". |
| D | Non-automatic starting of discharge overboard, transfer or disposal otherwise of bilge water which has accumulated in machinery spaces | shortened | 13, 14, 15.1-15.3 match | Official 15.3: "to slop tank or holding tank or other tank(s) (indicate tank(s); state quantity retained in tank(s), in m3)". The app's "To slop/holding/other tank(s)" is a shortening. |
| E | Automatic starting of ... bilge water | shortened | 16, 17, 18 match | Official 16 has time and position; the app label omits "time and position" but the fields (Time, Position) cover it. Official 17 "Time when the system has been put into automatic mode of operation for transfer of bilge water to holding tank (identify tank)". |
| F | Condition of the oil filtering equipment | same | 19, 20, 21 match | Footnote 4: covers the alarm and automatic stopping devices. |
| G | Accidental or other exceptional discharges of oil | same | 22-25 match | |
| H | Bunkering of fuel or bulk lubricating oil | same | 26.1-26.4 match | Official 26.3 "Type and quantity of fuel oil and identity of tank(s) (state quantity added, in tonnes and total content of tank(s))". The app label "Fuel oil bunkered" is a shortening; its fields cover type, quantity, tanks and content. |
| I | Additional operational procedures and general remarks | same | no item numbers | OK |

Footnotes in the official form that the app does not carry in labels: the weekly rule on item 11 ("the quantity must be recorded once a week even if the voyage lasts more than one week"), footnote 1 (only tanks listed in IOPP item 3.1), footnote 3 (holding-tank identity, capacity and quantity retained on D13). The app's tips mention the weekly rule.

## Part II (Codes A-R)

Result: codes A-R and items 1-84 match. **One missing item, one wrong label.**

| # | Code / item | Finding | Severity |
|---|---|---|---|
| 1 | R **85** | **Missing in the app.** Official: "Date, signature and stamp of port authority official." Present in HK Part II form and in Liberia's Part II list. The app's R stops at 84. | Missing item |
| 2 | R 84 | **Wrong wording.** App: "Quantity discharged (m³) and tank(s)". Official: "Total quantity of ballast water discharged in cubic metres." | Wrong label |
| 3 | J (title) | App: "Collection, transfer and disposal of residues/oily mixtures". Official: "...of residues and oily mixtures not otherwise dealt with". | Shortened |
| 4 | D 9 | App: "Port or ship's position". Official: port where COW was carried out, or ship's position if carried out between two discharge ports. | Shortened |
| 5 | E 18/19 | Official has item 18 (position at start and end) and 19.1-19.3. App matches. | OK |
| 6 | B 4.1 / 4.2 | Official item 4 has sub-items .1 "from" and .2 "to". App shows them as 4.1 and 4.2. Same convention elsewhere (57.x, 66.x). | OK |
| 7 | H 37, I 50 | Official: "Was the discharge monitoring and control system in operation...?" App: "ODME in operation?" | Shortened (ODME is the usual name for the same equipment) |
| 8 | Titles | Official Section F is "Ballasting of dedicated clean ballast tanks (CBT tankers only)"; L is "Discharge of ballast from dedicated clean ballast tanks (CBT tankers only)". App drops "(CBT tankers only)" in F and L. | Shortened |
| 9 | P-R | The official Part II puts P, Q and R under the heading "Tankers engaged in specific trades". App labels them "Specific trades - ...". | OK |

All other item numbers 1-84, with sub-items 4.1-4.2, 19.1-19.3, 31.1-31.2, 57.1-57.4 and 66.1-66.2, match.

## Part III

The Appendix III form has **no Part III**. Part III exists only in Panama's own book. The Panama circular ([MMC-215, 6 Mar 2026](https://www.panamashipregistry.com/wp-content/uploads/2026/03/MMC-215-CM-Rev.-RB-1-06-03-2026.pdf)) says Part III is "Regulations for the prevention of air pollution from ships (all ships)". It names these topics as its purpose (para 2): ozone-depleting substances, low sulphur fuel oil, vapour collection systems (tankers), incinerators, and NOx Tier III records.

| App Part III | Official / source check | Status |
|---|---|---|
| Code **E** "Use of incinerator for garbage" | The circular's log (Oct 2018) corrects the incinerator's Part III letter to **E** instead of D. This matches the app letter. The circular does not give the item numbers. | Letter VERIFIED |
| E items **6, 7, 8** (start/stop position and time; oxygen %; combustion chamber temperature) | The Part III text is a hyperlink to a non-public file server and could not be fetched (the 2023 public path returns 404). A web-search summary of a third-party copy gives oxygen as item 7 and temperature as item 8 (expected oxygen range 6-12%). The app's item 6 (start/stop position and time) and its label "for garbage" are not confirmed. | UNVERIFIED (secondary, search summary only) |
| Code **C** "Fuel oil changeover", items 1-4 | Not in the circular. MMC-215 para 2.3 lists "Low Sulphur Fuel Oil" as a Part III subject, but no letter or item number is given. Items 1-4 (commence/complete, both directions) are the app's own design, with MARPOL Annex VI Reg. 14.6 as basis. | UNVERIFIED |
| Missing from the app | ODS record (MMC-215 para 5.4: ships of 400 GT and above make ODS entries in Part III), vapour collection, NOx Tier III records | Not modelled |
| App says Part III E also applies to non-Panama flags | No document read for Liberia, Bahamas, Malta, HK or Singapore mentions a Part III. See README. | Open |

## MEPC.1/Circ.736 worked examples (original circular as reproduced by Liberia, 10 Dec 2010)

Rev.2 was **not** read. Panama MMC-215 para 5.8 says Rev.2 has 27 operational examples, the same number seen here (plus 16bis). Titles below are from the Liberian copy.

| Code | Examples |
|---|---|
| C.11 | 1 weekly inventory of sludge tanks (IOPP 3.1); 2 manual collection into a 3.1 tank |
| C.12 | 3 disposal via shore connection; 4 draining water from a sludge tank to a bilge holding tank (3.3); 5 transfer between two 3.1 tanks; 6 incineration of sludge in the incinerator (item 12.3, with hours:minutes); 7 burning sludge in a **boiler (item 12.4)**; 8 evaporation of water; 9 regeneration of fuel from sludge |
| D | 10 bilge wells to a 3.3 tank; 11 transfer between 3.3 tanks; 12 pumping overboard via 15 ppm from a 3.3 tank; 13 3.3 tank to a sludge tank |
| E | 14 automatic overboard via 15 ppm; 15 wells to 3.3 tank |
| F | 16 failure of OFE / OCM / stopping device; 16bis restoration |
| G | 17 accidental pollution |
| H | 18 bunkering fuel oil; 19 bunkering bulk lubricating oil |
| I | 20 cargo-hold bilge holding tank to 3.3 tank; 21 earlier missed entry; 22 de-bunkering of fuel oil; 23 sludge to deck/cargo slop tank; 24 bilge water to deck/cargo slop tank (D13/14/15.3); 25 voluntary weekly inventory of bilge holding tanks (MEPC.1/Circ.640); 26 optional sealing of a valve or equipment; 27 breaking of the optional seal |

Points relevant to the app:

- Sludge burned in a **boiler** is C 12.4, not C 12.3 (example 7). Sludge burned in an **incinerator** is C 12.3 (example 6).
- Instruction 9 of the Liberian copy: incineration or landing ashore of oily garbage and used filters is recorded "in the Garbage Record Book only". Panama MMC-215 para 5.6.6 repeats this sentence and then adds its own requirement to record each incinerator use in the ORB and Emissions Parts I and III.
- Example 25 confirms that recording holding-tank quantities is voluntary.

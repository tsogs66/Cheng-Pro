# e-ORB flag research: findings for Voyage Chief `eorb.js`

Researched 14 Nov 2026 on branch `claude/eorb-flag-research`. Research only: no app code was changed.
Companion files: [`flag-publications.json`](flag-publications.json) and [`appendix-iii-comparison.md`](appendix-iii-comparison.md).

Legend: **VERIFIED** = I read the document at the URL given. **UNVERIFIED** = not read, or only seen in a search snippet or listing. Nothing below is filled in from memory.

## 0. What could and could not be read

| Source | Result |
|---|---|
| liscr.com (POL-012, MON 7/2010) | Read |
| panamashipregistry.com (MMC-215 Mar 2026, MMC-193 Jul 2026) | Read. The Part III file linked from MMC-215 is **not public** (links point at an internal `file://` server; the 2023 public path returns 404). |
| bahamasmaritime.com (MN056 v1.2, MN010 v2.3) | Read |
| mpa.gov.sg (Shipping Circular 10/2020) | Read |
| mardep.gov.hk (ORB Part I and II forms, MSIN 22/2019, MSIN list) | Read |
| irclass.org mirrors (RMI MN 7-041-5 and MI-334C, Malta MARPOL.7, Liberia TC 43/2016) | Read |
| **register-iri.com** (RMI MG 2-13-3, MN 2-013-3) | **Blocked in practice**: TLS verification fails through the proxy. I did not disable verification. A subagent fetch was denied by the sandbox and I did not retry. RMI MG 2-13-3 is therefore **UNVERIFIED**. |
| dms.gov.cy (Cyprus) | **Blocked**: redirects to www.gov.cy (proxy 403). Nothing from the primary source. |
| www.gov.uk (UK MIN 644) | **Blocked**. `assets.publishing.service.gov.uk` only served unrelated documents and an unofficial 2018 draft. |
| amsa.gov.au | 403 |
| dco.uscg.mil (MEPC.1/Circ.736/Rev.2) | **Blocked** (not on the allow list). Rev.2 was **not read**. |
| Malta (Transport Malta) and Norway (NMA / sdir.no) | Not on the allowed list. Malta read only through the IRClass mirror; **Norway has no source at all**. |

## 1. Publications per flag

Full detail, URLs and history timelines are in `flag-publications.json`. Summary:

| Flag | Current documents found | Status |
|---|---|---|
| Liberia | **POL-012 Rev. 08/24** (supersedes Rev. 08/21) [PDF](https://www.liscr.com/sites/default/files/online_library/POL-012.pdf); **Marine Operations Note 7/2010 - Revised, 10 Dec 2010** [PDF](https://www.liscr.com/marketing/liscr/media/liscr/online%20library/maritime/marine-operations-note-07_2010.pdf) (revises the note of 8 Dec 2010; Liberian ORB RLM-121 / RLM-121A Rev 2010) | VERIFIED |
| Marshall Islands | **MN 7-041-5, May 2020** (supersedes version 11/06) [mirror](https://www.irclass.org/media/4949/mn-7-041-5-05-2020pdf.pdf); MI-334C list as of 11 May 2020 [mirror](https://www.irclass.org/media/4948/mi-334c.pdf); MG 2-13-3 and MN 2-013-3 | MN 7-041-5 and MI-334C VERIFIED; **MG 2-13-3 and MN 2-013-3 UNVERIFIED** |
| Panama | **MMC-215, 6 Mar 2026** (replaces MMC-23, 83, 148, 154, 177) [PDF](https://www.panamashipregistry.com/wp-content/uploads/2026/03/MMC-215-CM-Rev.-RB-1-06-03-2026.pdf); **MMC-193** (latest log entry Jul 2026) [PDF](https://www.panamashipregistry.com/wp-content/uploads/2026/04/MMC-193-Julio-2026-rev-2026.pdf) | VERIFIED |
| Bahamas | **MN056 v1.2, 5 Apr 2022** (supersedes Information Bulletin 84) [PDF](https://www.bahamasmaritime.com/wp-content/uploads/2022/04/MN056-MARPOL-Oil-Record-Books-v1.2.pdf); **MN010 v2.3, 2 Oct 2025** [PDF](https://www.bahamasmaritime.com/wp-content/uploads/2025/10/MN010-MARPOL-Electronic-Record-Books-v2.3-ID-20602598.pdf) | VERIFIED |
| Singapore | **Shipping Circular 10/2020, 5 May 2020** [PDF](https://www.mpa.gov.sg/api/media/74ccfc31-5f35-4d66-afcd-345b98b8719d/-sc_no_10_of_2020.pdf) | VERIFIED |
| Cyprus | Circular 22/2020 (4 Nov 2020) and 36/2010, titles from a search listing only | UNVERIFIED |
| Malta | **Technical Notice MARPOL.7, 15 Jun 2018** [mirror](https://www.irclass.org/media/3763/technical-notice-marpol-7-electronic-record-books-for-marpol-related.pdf) | VERIFIED as of 2018; currency UNVERIFIED |
| Hong Kong | Official ORB [Part I](https://www.mardep.gov.hk/filemanager/en/share/publications/pdf/marpol_oil_record_1.pdf) and [Part II](https://www.mardep.gov.hk/filemanager/en/share/publications/pdf/marpol_oil_record_2.pdf) forms; **MSIN 22/2019, 12 Aug 2019** [PDF](https://www.mardep.gov.hk/en/msnote/pdf/msin1922.pdf); MSIN 42/2023 (title only) | Forms and MSIN 22/2019 VERIFIED; MSIN 42/2023 UNVERIFIED |
| United Kingdom | MIN 644 (M+F), seen only in a search snippet | UNVERIFIED |
| Norway (NIS) | Nothing found | UNVERIFIED |

Corrections to what the app's Flag guide (`FLAG_PUBLICATIONS`) currently says:

1. **Liberia POL-012**: the app says "Rev. 11/21 is the latest found". The live file is **Rev. 08/24**, which supersedes Rev. 08/21. A "11/21" revision was not found in any document I read. The app's history entry "Nov 2021 POL-012 Rev. 11/21" is UNVERIFIED and probably a mix-up with 11/16 (IRClass TC 43/2016, 2016) or 08/21.
2. **Liberia MON 7/2010**: the document at that URL is the **revised** note dated 10 Dec 2010. The app lists it as "2010" and does not mention the revision.
3. **Bahamas**: the app lists only MN010 and uses a 2021 URL that now returns **404**. The current MN010 is **v2.3 of 2 Oct 2025**. The app omits **MN056 MARPOL Oil Record Books**, the document the app's own Bahamas tips come from.
4. **Panama MMC-215 history**: the circular's own revision log reads Dec 2010, Jun 2011, Oct 2013, Jun 2014, May 2016, Oct 2017, Nov 2017, Oct 2018, Dec 2021, Sep 2023, Oct 2023, Mar 2026. The app's "Jul 2014 first edition found" and "Oct 2017 / Oct 2018 reissued" are UNVERIFIED as stated. In the March 2026 revision the incinerator wording is in para 5.6.6 and the amended paragraphs are 5.6.11 and the new 5.8.
5. **Panama MMC-193**: the app says "Rev. 2026 is the latest found (earlier: March 2020, amendment September 2023)". The circular's own revision log confirms March 2020 (template update), Sep 2020, Jul 2022, May 2023, Sep 2023, Jan 2024, Oct 2024, Aug/Sep/Oct 2025, Mar/Apr 2026 and **Jul 2026** (latest). The app's summary is consistent with that. The log (Mar 2020 entry) also says the electronic Oil Record Book and Emissions Parts I, II and III were described as "(optional)" in the e-book circular; the current MMC-193 text read does not restate this.
6. **RMI**: MN 7-041-5 supersedes version **11/06**. MI-334C is a May 2020 snapshot; the notice says the current list is linked from the notice.

## 2. Flag-specific ORB rules (questions 2)

| Topic | Liberia | Marshall Is. | Panama | Bahamas | Singapore | Cyprus | Malta | Hong Kong | UK | Norway |
|---|---|---|---|---|---|---|---|---|---|---|
| Language | English ([MON 7/2010](https://www.liscr.com/marketing/liscr/media/liscr/online%20library/maritime/marine-operations-note-07_2010.pdf) instr. 6) VERIFIED | English: UNVERIFIED (secondary summary of MG 2-13-3) | English / Spanish: UNVERIFIED (circular silent; says a Spanish version exists) | Not stated in MN056 | Not stated | UNVERIFIED | Not stated in MARPOL.7 | English only, or English and Chinese ([form](https://www.mardep.gov.hk/filemanager/en/share/publications/pdf/marpol_oil_record_1.pdf)) VERIFIED | UNVERIFIED | UNVERIFIED |
| Who signs entries | Officer(s) in charge VERIFIED | Officer in charge; CE/SMS reviewer checks: UNVERIFIED | Officer(s) in charge ([MMC-215](https://www.panamashipregistry.com/wp-content/uploads/2026/03/MMC-215-CM-Rev.-RB-1-06-03-2026.pdf) 5.6.7) VERIFIED | Person responsible for the operation makes the entry; CE or Master **checks** within 24 h (MN056 3.5, 3.8) VERIFIED | Officer in Charge ([SC 10/2020](https://www.mpa.gov.sg/api/media/74ccfc31-5f35-4d66-afcd-345b98b8719d/-sc_no_10_of_2020.pdf) para 7) VERIFIED | UNVERIFIED | **Officer in Charge** ([MARPOL.7](https://www.irclass.org/media/3763/technical-notice-marpol-7-electronic-record-books-for-marpol-related.pdf)) VERIFIED | Officer(s) in charge VERIFIED | UNVERIFIED | UNVERIFIED |
| Master countersign | Each page VERIFIED | Each page: UNVERIFIED | Each page VERIFIED | Each page, presented without undue delay (MN056 3.8.4) VERIFIED | Each page VERIFIED | UNVERIFIED | Each page VERIFIED | Each page VERIFIED | UNVERIFIED | UNVERIFIED |
| Retention | 3 years after last entry VERIFIED | UNVERIFIED | 3 years VERIFIED | Not less than 3 years (MN056 3.1.5) VERIFIED | n/a in SC 10/2020 | UNVERIFIED | n/a in MARPOL.7 | 3 years VERIFIED | UNVERIFIED | UNVERIFIED |
| Date format | dd-MONTH-yyyy VERIFIED | UNVERIFIED | DD-MONTH-YYYY VERIFIED | dd-MONTH-yyyy VERIFIED | n/a | UNVERIFIED | n/a | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Weekly sludge inventory C 11.x | Required by the form (applies to every flag); the form text is VERIFIED in the HK form, Liberian note and the UK draft of MEPC.187(59) | same | same; Panama's circular adds nothing | MN056 4.5.4 VERIFIED | same | same | same | same | same | same |
| Oily bilge holding tanks | Recording retained quantity voluntary (Circ.736 example 25) VERIFIED in original Circ.736 | UNVERIFIED | MMC-215 5.6.11: not required by the Convention; if fitted, list in IOPP 3.3 and record disposals in Part I VERIFIED | not covered | not covered | UNVERIFIED | not covered | not covered | UNVERIFIED | UNVERIFIED |
| OWS / 15 ppm tests, valve sealing | Examples 26 and 27 of Circ.736 (optional sealing, code I) VERIFIED in original Circ.736 | MN 2-013-3 reportedly covers inoperative equipment and sealing: UNVERIFIED | MMC-215 5.6.12: general OWS maintenance recording is voluntary VERIFIED | Not covered beyond MN056 4.3.3-4.3.4 (15 ppm alarm time zone note) VERIFIED | not covered | UNVERIFIED | not covered | not covered | UNVERIFIED | UNVERIFIED |
| De-bunkering | Circ.736 example 22 (code I) VERIFIED in original | UNVERIFIED | not covered in MMC-215 text | not covered | not covered | UNVERIFIED | not covered | not covered | UNVERIFIED | UNVERIFIED |
| e-ORB approval / Declaration | Only Administration-approved ERBs; **Declaration of MARPOL ERB** from LISCR; official use only after the Declaration is received (POL-012 s13.2, 13.3, 14.6) VERIFIED | Administrator-approved software; **Declaration** via form MI-334A (MN 7-041-5 s2.2, 2.3) VERIFIED | Voluntary; licensed system from an AMP-authorised manufacturer, one-year licence; Declaration from an RO (MMC-193 s4.5) VERIFIED | BMA Document of Approval; system approved by a BMA RO or a Contracting Government (MN010 s5.1) VERIFIED | **RO approves** and issues the Declaration; official use only after the Declaration; new Declaration for any version upgrade (SC 10/2020 paras 4, 5) VERIFIED | UNVERIFIED | Printout is the official record; approval pending IMO guidance, as of 2018 (MARPOL.7) | MSIN 22/2019: Administration-approved ERB as alternative VERIFIED | MIN 644: UNVERIFIED | UNVERIFIED |
| First-entry date rule | Official use only after the Declaration is received (POL-012 14.6). The app's "first entry dated after the Declaration date" is a reasonable reading but not the document's wording. | Not stated in MN 7-041-5 | Not stated | Not stated | Not stated: only "officially used after the ship is issued with a Declaration" | UNVERIFIED | n/a | n/a | UNVERIFIED | UNVERIFIED |

Bahamas-specific points worth noting for the app (MN056):

- Operations that can discharge overboard or overflow must be carried out by a responsible officer (3.3.1).
- Several similar transfers in one watch can be a single entry, up to six hours (3.4.2).
- Sulphur content of fuel is **not** required in code H; it may be added (4.4).
- BMA tells crews to be cautious with Circ.736 and industry guidance (4.2.1).

## 3. Part III and burning of waste (question 3)

**Which flags require a Part III in the Oil Record Book**

| Flag | Part III required? | Basis |
|---|---|---|
| **Panama** | **Yes.** The official book is the "Oil Record Book and Emissions" with Part III "prevention of air pollution from ships (all ships)". Part III covers ODS, low-sulphur fuel oil, vapour collection (tankers), incinerators and NOx Tier III records (MMC-215 paras 2.2-2.6, 5.4, 5.5.3). | VERIFIED (circular read) |
| Liberia | No Part III found. MON 7/2010 describes the Liberian book as Part I (RLM-121) and Part II (RLM-121A) only. POL-012 lists ODS, fuel changeover and NOx records as separate recordings. | `false`, based on documents read |
| Bahamas | No. MN056 covers Part I (Revision 6) and Part II (Revision 3) only. Fuel sulphur and changeover go in the Annex VI record book (Information Notice 011, cited but not read). | `false`, based on documents read |
| Hong Kong | No. The Marine Department publishes Part I and Part II forms only. | `false`, based on documents read |
| Malta | No. MARPOL.7 requires printouts of Appendix III Parts I and II. | `false`, based on documents read |
| Marshall Islands | No document read mentions it; MG 2-13-3 not readable | `unknown` |
| Singapore | Circular silent | `unknown` |
| Cyprus, UK, Norway | Not readable / not found | `unknown` |

**Which book records burning**

| Waste | Baseline (MEPC.1/Circ.736 as reproduced by Liberia; Rev.2 not read) | Flag additions found |
|---|---|---|
| (a) Sludge in incinerator | ORB Part I **Code C 12.3**, with total time (example 6). In a **boiler**: C **12.4** (example 7) | Panama: also Part III (letter **E**, items UNVERIFIED) |
| (b) Paper, wood, domestic garbage | Garbage Record Book (Annex V) | Panama: each incinerator use also goes in the ORB and Emissions Parts I and III (MMC-215 5.6.6). The circular's wording is about "each time incinerator is use"; it does not name paper or wood separately. |
| (c) Oily rags and used filters | "Garbage Record Book only" (Liberian instruction 9; Panama 5.6.6 repeats it) | Panama: as above, the incinerator use is also logged in the ORB. No flag document read adds an ORB entry for oily rags themselves. |

## 4. IMO baseline vs the app lists (question 4)

Full tables are in [`appendix-iii-comparison.md`](appendix-iii-comparison.md). In short:

- **Part I**: codes A-I and item numbers 1-26 (with sub-items) all match. Differences are wording only (shortened titles and labels).
- **Part II**: codes A-R and items 1-84 match. **Item 85 (R, "Date, signature and stamp of port authority official") is missing** and **R 84's label is wrong**.
- **Part III**: not an IMO form; only Panama's. The app's E (items 6-8) letter matches Panama's circular (letter E); item numbers and the C changeover items are **UNVERIFIED**. ODS, vapour-collection and NOx Part III records are not modelled.

## 5. Claims in `FLAGS` (question 5)

| Flag | Claim in app | Verdict |
|---|---|---|
| Liberia | Signatory = officer in charge **+ Chief Engineer** ("approved e-ORB printouts commonly show the duty engineer and Chief Engineer") | **WRONG as a Liberian rule.** MON 7/2010 and the form require officer(s) in charge to sign and the Master to countersign pages. The Chief Engineer is not named. The "commonly show" remark is UNVERIFIED. |
| Liberia | "Marine Operations Note 07/2010 and POL-012" | VERIFIED to exist (see §1 for revision details) |
| Liberia | "Only Administration-approved ERBs ... must carry a Declaration of MARPOL ERB (POL-012)" | VERIFIED (s13.2, 13.3) |
| Liberia tip | Weekly C.11 inventory, recording retained quantity in 3.3 tanks voluntary | VERIFIED (form; Circ.736 example 25) |
| Liberia tip | "Use D (manual start) vs E (automatic mode)" | VERIFIED but it is Bahamas MN056 4.6, not Liberian guidance |
| Liberia tip | "Part III C item 3 supplements ... all flag states" | UNVERIFIED. No Part III exists outside Panama in the documents read. |
| Marshall Is. | Signatory: officer in charge signs; Chief Engineer / SMS reviewer checks (MG 2-13-3) | UNVERIFIED (only a search summary; document unreadable) |
| Marshall Is. | "RMI publishes approved ERB vendors (Marine Notice 7-041-5). Ship must hold ERB Declaration(s) from the registry portal." | Vendor list and Declaration VERIFIED (MN 7-041-5 s2.2, 2.3). The Declaration is issued by the Administrator on application with form MI-334A by email; "registry portal" is not in the notice. |
| Marshall Is. | "ORB Part I entries ... shall be in English" | UNVERIFIED |
| Marshall Is. | "Follow **MI-402A** item list" | **UNVERIFIED, likely wrong.** No document numbered MI-402A was found. A search result lists the RMI ORB instructions as **MI-332A (Rev. 4/11)**. |
| Marshall Is. | C.12.3 incineration with total time | VERIFIED (form) |
| Panama | Book is "Oil Record Book and Emissions (MMC-215)"; e-books under MMC-193 with MEPC.312(74), AMP-authorised manufacturers, licence/declaration | VERIFIED |
| Panama | Signatory: officer in charge; Master countersigns each page | VERIFIED (5.6.7) |
| Panama | Retain 3 years after last entry | VERIFIED (4.3) |
| Panama | "Language: English / Spanish" | UNVERIFIED |
| Panama | Incinerator use goes in the Garbage Record Book and ORB Parts I and III | VERIFIED (5.6.6) |
| Panama | "OWS / 15 ppm failure under code F" | VERIFIED as MARPOL practice (form item F); not a Panama-specific statement |
| Bahamas | Follows Appendix III list; MN010 for electronic books; "acceptance where applicable" | VERIFIED; MN010 requires a BMA Document of Approval |
| Bahamas tips | C.11.4, C.12.2, D vs E with E.18 | VERIFIED (MN056 4.5, 4.6). Note MN056 4.5.3 also says transfers **from** a 3.1 tank to a non-3.1 tank use C 12.2; the app's tip mentions only transfers between 3.1 tanks. |
| Singapore | "Electronic books require **MPA acceptance**" | **Partly wrong.** Under SC 10/2020 a Recognised Organisation approves the ERB and issues the Declaration on MPA's behalf. |
| Cyprus | Signatory = **Chief Engineer only** ("Cyprus SMS / PSC practice") | **UNVERIFIED.** No Cyprus document was readable. The default rule in the Convention is officer in charge plus Master. |
| Malta | Signatory = **Chief Engineer only** ("normally signed by the Chief Engineer") | **WRONG.** Malta MARPOL.7 (15 Jun 2018): each printed entry physically signed by the **Officer in Charge**; each page by the Master. |
| Malta | "ERB requires Administration approval process" | Consistent with MARPOL.7 (2018). Whether MARPOL.7 is current is UNVERIFIED. |
| Hong Kong | Language "English / Chinese as applicable" | VERIFIED: English only, or English and Chinese |
| Hong Kong | "electronic alternatives need MD acceptance" | Consistent with MSIN 22/2019 ("approved by the Administration"). No HK-specific procedure stated. |
| UK | "ERB must meet MCA/flag policy and MEPC.312(74)" | UNVERIFIED (MIN 644 not readable) |
| Norway | All notes | UNVERIFIED |
| UK tip | "Cross-check OWS seal/status remarks under code I" | Code I is correct for optional sealing (Circ.736 examples 26-27); not a UK requirement |

## 6. Suggested follow-ups (not done)

1. Run a session on an environment that allows `register-iri.com` (TLS), `www.gov.uk`, `www.gov.cy`, `www.transport.gov.mt` and `www.sdir.no` to close the RMI, UK, Cyprus, Malta and Norway gaps, and to read MEPC.1/Circ.736/Rev.2.
2. Obtain the real Panama Part III form (the printed book, or a Panama Registry link) to confirm letters and item numbers for fuel changeover and the incinerator, and whether ODS / VCS / NOx lines are needed.
3. Decide whether Part III E and the "incinerator-garbage" code I scenario should be Panama-only. Under MARPOL both belong in the Garbage Record Book only.
4. Fix (when the code is next touched): Part II R item 85 and R 84 label; Liberia, Malta and Cyprus signatory policies; MI-402A; POL-012 revision; Bahamas publications (add MN056, update MN010).

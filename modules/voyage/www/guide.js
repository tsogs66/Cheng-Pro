/* Voyage Chief operating guide. Searchable from the About tab. */
(function () {
  const ITEMS = [
    {
      group: 'Start',
      q: 'Where do I start the first time?',
      purpose: 'Voyage Chief is the engine log: watches, the noon sheet, ROB, receipts, abstracts, and the voyage library. It keeps working with no internet after the ship is on this device.',
      steps: [
        'Open the app. If a sign-in card is showing and you have no server yet, press Work offline.',
        'Open Vessel Data. Press Add New Vessel… and name the ship. Press Save Vessel Details for the IMO, company, flag, and Chief Engineer.',
        'Open Voyage Setup. Set the voyage number, B (ballasted) or L (laden), ports, and the initial date and time. Press Update Voyage Details.',
        'Open Log Entry and add the first watch.',
        'Inside ChEng AIO the ship name, IMO, signature, and stamp are saved in AIO Vessel Setup, and those panels are hidden here. The voyage number and the log stay on these tabs.'
      ],
      buttons: [
        'Work offline — opens the program with no vessel assigned so you can add one',
        'Add New Vessel… — creates a ship on this device',
        'Save Vessel Details — stores the identity, the signature, and the stamp',
        'Update Voyage Details — stores the voyage number, condition, and ports'
      ],
      undo: [
        'Work offline does not delete a ship you already have. Open Vessel Data and Load Selected Vessel.',
        'A wrong ship name is corrected on Vessel Data with Save Vessel Details. Do not delete the vessel to fix a typo.'
      ]
    },
    {
      group: 'Start',
      q: 'What is each tab for?',
      purpose: 'The tabs split one voyage. On a phone the same pages are under More.',
      steps: [
        'Summary — the noon, departure, or arrival sheet for one log entry.',
        'Log Entry — the watch. Add Entry stores it.',
        'ROB — remaining on board from the log, and Print ROB Sheet.',
        'Spares — spare and store requisitions: the form, what was sent, and what was received.',
        'Cons Plan — whether the bunkers last, and whether to stem.',
        'Consumption, Voyage Abstract, Range Totals — printouts of entries already saved.',
        'Trends — charts of fuel by grade, main engine / generators / boiler, speed, RPM and load, distance and slip, lube oil and fresh water, and the running burn. View by Daily, Weekly (seven-day blocks from the first report) or Entire voyage leg; show a rate per day or the total for the period; sea passage only. Tap a chart to read each point. Last 7 Days shows the seven-day average of each figure, a small trend, and how it moved against the seven days before. Compare puts two days, two weeks or two voyage legs side by side with the difference and the change.',
        'Receipts — bunker and lube deliveries that feed the ROB.',
        'Reports — supplementary reports.',
        'Reference — weather, NOx, fuel, and SFOC tables.',
        'About — this page.',
        'Notes — a note or reminder for this ship, with a deadline. Tick Show at open and it appears when the program opens.',
        'e-ORB — the oil record book, when the license includes it. A wrong line is voided, not deleted.',
        'Setup — sync, database backup, and the deleted-entry list.',
        'Voyage Setup — voyage number, ballast or laden, ports, distance, opening ROB.',
        'Vessel Data — the ship, and the library of saved B and L legs.'
      ],
      buttons: [
        'More — on a phone, the rest of the tabs',
        'Bright — daylight colours. Press it again to walk the themes. The log is unchanged'
      ],
      undo: [
        'Changing tabs does not delete a watch. A log line you have started is kept with this ship when you load another ship, and it is put back on the form when you return. Add Entry stores it in the log.'
      ]
    },
    {
      group: 'Start',
      q: 'How do I keep a note or a reminder?',
      purpose: 'Notes holds something you must not forget for this ship. A ticked line appears when Voyage Chief opens, with its deadline. Inside ChEng AIO the same job is the Notes page on the suite menu, and this tab is hidden.',
      steps: [
        'Open Notes on the tab bar, or under More on a phone.',
        'Type the title and the note. Set the deadline date and time.',
        'Leave Show when the program opens ticked if it should appear at startup.',
        'Press Save note.',
        'The next open lists the ticked lines. Close leaves them set. Stop reminding unticks that line.'
      ],
      buttons: [
        'Show when the program opens — the checkbox on the form and at the start of each line',
        'Save note — stores the line on this device for the active ship',
        'Edit — puts that line back in the form',
        'Delete — removes the line after you confirm',
        'Stop reminding — unticks that line without deleting it'
      ],
      undo: [
        'Untick Show at open to stop the startup list and keep the note.',
        'A wrong deadline: press Edit, set the date and time, and Save changes.',
        'Delete asks you to confirm. After that the line is gone from this device.'
      ]
    },
    {
      group: 'Daily log',
      q: 'How do I set the voyage number and ballast or laden?',
      purpose: 'Every watch belongs to a voyage number and a condition. B is ballasted. L is laden. The two legs are stored separately so the working log stays short.',
      steps: [
        'Open Voyage Setup.',
        'Type Voyage No., choose B or L, set the initial date and time, the time zone, departure, arrival, and distance.',
        'Enter opening ROB only while this leg has no watches. After the first entry those fields show the live ROB.',
        'Press Update Voyage Details.',
        'Open Vessel Data and press Save Current Leg to Library so the leg is kept if you later load another one.'
      ],
      buttons: [
        'Update Voyage Details — writes the number, condition, ports, and opening figures',
        'Create New Voyage… — starts another voyage. Save the current leg first',
        'Save Types & Opening ROB — on Vessel Data, the fuel, lube, and fresh-water names and opening quantities'
      ],
      undo: [
        'No watches yet: type the right number and press Update Voyage Details again.',
        'Watches already saved under the wrong number: Export Active Leg on Setup before you change the number, so you can put the file back.'
      ]
    },
    {
      group: 'Daily log',
      q: 'How do I write a watch?',
      purpose: 'Log Entry is the watch. The summary, ROB, abstract, and consumption all read saved lines. A form that was not added is not in the log.',
      steps: [
        'Open Log Entry.',
        'Set the date and time, the operation, and the meters. Enter Flowmeters… fills meters, main-engine runtime, the revolution counter, fuel types, and TBN, then applies them to this form.',
        'Read the consumption preview.',
        'Press Add Entry.',
        'Open Summary when you need the noon sheet, a photo, or a print.'
      ],
      buttons: [
        'Add Entry — stores the form as a new log line',
        'Clear Form — empties the form. It does not remove a saved line',
        'Enter Flowmeters… — fills the meter part of the form',
        'Undo Last Save — one step back, only just after a save',
        'Delete Entry — removes the open line and keeps a copy under Deleted Entry Backup',
        'Cancel Edit — closes the edit and leaves the saved line'
      ],
      undo: [
        'Still typing, not added: Clear Form.',
        'Just saved: Undo Last Save while it is on screen.',
        'Found later: open the line, correct it, and save, or Delete Entry. Restore a deleted line from Setup → Deleted Entry Backup.'
      ]
    },
    {
      group: 'Daily log',
      q: 'How do I complete the noon, departure, or arrival sheet?',
      purpose: 'Summary is the sheet for one log entry: performance, ROB, a survey correction, a photo, and the print. It writes back onto that entry.',
      steps: [
        'Open Summary and the entry you are reporting.',
        'Fill the engine and ROB figures. After a tank survey, press Apply Survey — Correct R.O.B.',
        'Take Picture if the sheet should carry a photo. Remove Photo drops it before you save.',
        'Press Save only, or Print & Save (A4 Portrait).',
        'Recalculate Averages rebuilds totals from the log. Use it when the averages look stale, not to correct one typo.'
      ],
      buttons: [
        'Save only — stores the open summary',
        'Print & Save (A4 Portrait) — stores, then prints',
        'Recalculate Averages — rebuilds averages from the saved entries',
        'Undo Recalculate — restores the entries from before the last recalculate',
        'Apply Survey — Correct R.O.B. — uses the survey as the corrected ROB',
        'Remove Survey — drops that correction',
        'Reset Lube ROB Cons. to Calculated — discards a hand-typed lube consumption',
        'Close — leaves the summary. Save first if the sheet should keep what you typed'
      ],
      undo: [
        'Before Save only: edit the fields, or Close and reopen.',
        'After a bad Recalculate Averages: press Undo Recalculate immediately.',
        'A survey applied by mistake: Remove Survey, then Save only.'
      ]
    },
    {
      group: 'Daily log',
      q: 'How do I save this voyage, and how do I open an older one?',
      purpose: 'The library on Vessel Data holds each voyage number as a B leg and an L leg. The screen shows only the active leg. A large leg, photos included, is stored in small pieces so saving it does not close the app.',
      steps: [
        'Confirm the voyage number and B or L on Voyage Setup. Press Update Voyage Details if you changed them.',
        'Open Vessel Data and press Save Current Leg to Library.',
        'To open an older leg, choose the voyage number and the condition, then press Load Selected Leg. You can also press the row.',
        'If the leg on screen is not in the library, the program asks you to save it, discard it, or cancel before it loads the other one.'
      ],
      buttons: [
        'Save Current Leg to Library — stores the working log, receipts, documents, and setup',
        'Load Selected Leg — makes the chosen leg the working log',
        'Refresh List — re-reads the library',
        'New Voyage — archives this leg and starts the next voyage from the last entry'
      ],
      undo: [
        'Loaded the wrong leg: if you saved first, load the previous voyage again from the list.',
        'If you loaded without saving, that working set is gone. Re-type it, or restore an export.',
        'Save Current Leg again after a correction. The same voyage number and condition is replaced by what is on screen.'
      ]
    },
    {
      group: 'Daily log',
      q: 'How do I record a receipt, print the ROB, or print an abstract?',
      purpose: 'Receipts are fuel and lube taken. ROB is what remains from the log. Abstracts and range totals print entries you already saved.',
      steps: [
        'Receipts: fill the delivery and press Log Receipt.',
        'ROB: it follows the latest entry unless you pick another report. Print ROB Sheet prints that report. Back to latest returns to the newest entry.',
        'Voyage Abstract: check the rows, Download CSV if the office wants a file.',
        'Range Totals: set the range, or press Whole voyage, then Print Totals & Averages.',
        'Reports: complete the sheet and press Save Supplementary Report.'
      ],
      buttons: [
        'Log Receipt — adds the delivery to this voyage',
        'Print ROB Sheet — prints the ROB you are viewing',
        'Whole voyage — the range becomes every entry on this leg',
        'Export Weekly Abstract (CSV) — a file, not a second log'
      ],
      undo: [
        'A wrong receipt: open it and correct it, or delete that receipt row. Deleting a receipt does not delete watches.',
        'A wrong print is only paper. Correct the entry, then print again.'
      ]
    },
    {
      group: 'Fix a mistake',
      q: 'I saved the wrong watch. How do I take it back?',
      purpose: 'Clear Form, Cancel Edit, and Delete Entry do different jobs. Only Delete Entry removes a saved line.',
      steps: [
        'The bad typing is still on the form and you have not pressed Add Entry: press Clear Form.',
        'You just saved: press Undo Last Save if it is visible.',
        'The line is in the log: open it, correct it, and save. Or press Delete Entry.',
        'You are editing and the saved line should stay: press Cancel Edit.'
      ],
      buttons: [
        'Clear Form — clears typing that is not yet a log line',
        'Undo Last Save — one step back, just after a save',
        'Cancel Edit — abandons this edit',
        'Delete Entry — removes the open line and keeps a device-only copy'
      ],
      undo: [
        'After Delete Entry, open Setup → Deleted Entry Backup and restore that row. The line returns to the active voyage.',
        'Refresh List re-reads the trash. Clear Old Backups… deletes old trash copies. Leave them until you are sure.'
      ]
    },
    {
      group: 'Fix a mistake',
      q: 'Recalculate changed the figures.',
      purpose: 'Recalculate from opening meters & ROB rebuilds every watch from the opening meters and opening ROB. Recalculate Averages only rebuilds summary totals. Both can be undone immediately.',
      steps: [
        'Just pressed Recalculate Averages: press Undo Recalculate.',
        'Just rebuilt from opening meters: press the Undo Recalculate that appeared for that action.',
        'If the undo is gone, load the library copy of this leg, if you saved it before the recalculate.'
      ],
      buttons: [
        'Recalculate from opening meters & ROB — rebuilds the whole leg. Use it when the chain is wrong, not for one typo',
        'Undo Recalculate — restores the entries from before the last recalculate',
        'Use last log entry as next-report reference — sets the next form. It does not rewrite history'
      ],
      undo: [
        'One wrong meter is an edit of that watch, not a full recalculate.',
        'If the library was overwritten too, use Setup → Replace Active Leg from Backup with a JSON file you exported earlier.'
      ]
    },
    {
      group: 'Fix a mistake',
      q: 'I loaded another leg or started a new voyage, and I want the previous one.',
      purpose: 'The screen holds one working leg. The library holds the saved legs. Loading changes the screen. A leg already in the library is still there.',
      steps: [
        'Open Vessel Data. If the voyage number is listed, select it and press Load Selected Leg.',
        'Save the leg now on screen if it is worth keeping, or discard a mistaken start.',
        'Press cancel on that question if you are unsure. You stay where you are.'
      ],
      buttons: [
        'Load Selected Leg — replaces the working set with the library leg',
        'New Voyage — archives the current leg when it can, then opens the next one',
        'Create New Voyage… — starts another number from Voyage Setup'
      ],
      undo: [
        'A leg that was never saved, and was discarded at the warning, cannot be reopened. Export Active Leg before you load another voyage that matters.'
      ]
    },
    {
      group: 'Fix a mistake',
      q: 'Push or Pull replaced a voyage, or this device and the server disagree.',
      purpose: 'Push Active Leg and Pull Active Leg copy one leg and overwrite that same leg on the other side. Keep Data Persistent looks at every leg.',
      steps: [
        'Open Setup → Server Sync. Press Save Sync Settings and Test Connection.',
        'For one leg you mean to overwrite: Push Active Leg sends this device’s active leg. Pull Active Leg replaces this device’s active leg with the server’s. Read the confirm text.',
        'For many legs: press Keep Data Persistent. The first press lists the legs and ticks the ones that differ. Untick any leg that should stay put. The second press merges. Both sides then hold the selected legs. Nothing is deleted. The voyage you have open is saved and sent as well, and it stays open.',
        'List Remote Voyages and Pull Selected Voyage Leg fetch one named leg.'
      ],
      buttons: [
        'Push Active Leg — this device overwrites that one leg on the server',
        'Pull Active Leg — the server overwrites that one leg on this device',
        'Keep Data Persistent — compare every leg, choose, then both sides keep the selection',
        'Pull Selected Voyage Leg — one voyage number and condition from the server list'
      ],
      undo: [
        'A push or pull that overwrote a good leg is undone only from a backup taken before it.',
        'Keep Data Persistent does not delete a leg that exists on only one side. A leg you untick is left as it was.'
      ]
    },
    {
      group: 'Spares',
      q: 'How do I keep a requisition?',
      purpose: 'Spares is the requisition log for this ship. A line is a spare requisition or a store requisition. It stays on Sent while the status is Sent, For follow up, or For receiving. Mark it Received and it moves to the Received list. The photo or PDF stays with the line on this device.',
      steps: [
        'Open Spares.',
        'Under Requisition, choose Spare requisition or Store requisition, the status, the sent date, and the description.',
        'Set the receive date when the status is Received.',
        'Attach a PDF or photo, or Take picture. Press Save requisition.',
        'Sent, For follow up, and For receiving stay on the Sent list. Received moves the line to the Received list.'
      ],
      buttons: [
        'Save requisition — stores the request and its files',
        'Cancel edit — drops an edit in progress',
        'Take picture — a photo of the papers',
        'Edit — opens that line in the form',
        'Delete — removes the line and its files after you confirm'
      ],
      undo: [
        'A wrong description still in the form: press Cancel edit, or change the text before Save requisition.',
        'Marked Received too early: open it, set Sent, For follow up, or For receiving, and save. It returns to the Sent list.',
        'A requisition that should not exist: delete it. The program asks you to confirm. The line and its files leave this device.'
      ]
    },
    {
      group: 'Bunkers and ROB',
      q: 'How do I use the consumption plan?',
      purpose: 'Cons Plan answers whether the bunkers last and whether to stem. It reads the ROB you give it. The voyage receipt is a separate record and is what the log consumes.',
      steps: [
        'Open Cons Plan. Load Voyage ROB when you want the plan to start from the log.',
        'On each line type the route once, pick the fuel burned and its MT per day, and give the distance and speed (or the days). Add a margin % for a reserve on that line.',
        'Press Save, or Save & Print.',
        'When fuel is delivered, log it on Receipts so the voyage ROB includes it.'
      ],
      buttons: [
        'Load Voyage ROB — fills the plan from the log',
        'Clear — clears the figures on screen',
        'Save, Print, Save & Print — keep or print the plan'
      ],
      undo: [
        'Clear before Save leaves the last saved plan stored. Save after Clear replaces the stored plan, so type the figures again and Save.',
        'A bad receipt is corrected on Receipts, not by clearing the plan.'
      ]
    },
    {
      group: 'e-ORB',
      q: 'How do I make an Oil Record Book entry, and how do I correct one?',
      purpose: 'e-ORB is the machinery-space oil record book. Lines are coded and signed. A mistake is struck through with a reason. The line stays in the book. The license must include e-ORB.',
      steps: [
        'Open e-ORB. Complete the ship particulars. Prefill from Voyage Chief vessel copies the ship you already saved. Press Save ORB Setup.',
        'Add the engine officers who may sign.',
        'Start an entry, choose the operation, or Advanced — choose by MARPOL code. Fill the quantities and read Refresh Preview.',
        'The officer name is required. Answer the warnings before Save Entry.',
        'Weekly inventory uses Save Weekly Inventory. Cancel leaves that form.',
        'Fetch Records lists a period. Print Selected Period is the inspection print. Export JSON keeps a file.'
      ],
      buttons: [
        'Save ORB Setup — the book’s ship particulars',
        'Save Entry — writes the operation into the book',
        'Refresh Preview — the line as it will read, without saving',
        'Cancel — drops a form you have not saved',
        'Void / correct selected — strikes through the ticked lines. It does not delete them'
      ],
      undo: [
        'Not saved yet: Cancel.',
        'Already saved and wrong: tick the line, press Void / correct selected, and type the reason. Then Save Entry with the correct operation.',
        'Dismissing the reason question voids nothing.'
      ]
    },
    {
      group: 'Backup',
      q: 'Which backup do I use, and how do I undo a restore?',
      purpose: 'Backup Entire Database is every ship and every leg on this device. Export Active Leg is only the working voyage. Restore replaces. Merge keeps local records and copies in anything newer or missing.',
      steps: [
        'Open Setup.',
        'Before a PC change or a risky restore, press Backup Entire Database and keep the file.',
        'Export Active Vessel is one ship. Export Active Leg (JSON) is the working voyage. Export Setup Only is the setup without the watches.',
        'Restore Database replaces this browser’s voyage database with the file.',
        'Merge Database Backup combines. The same record keeps the newer time. A record that exists on only one side is kept.',
        'Replace Active Leg from Backup replaces only the working leg. Other library legs stay.'
      ],
      buttons: [
        'Backup Entire Database — the full file',
        'Restore Database… — this device becomes the file',
        'Merge Database Backup… — combines the file with this device',
        'Export Active Leg (JSON) — the working voyage',
        'Replace Active Leg from Backup — the working voyage becomes the file',
        'Import Setup Only — setup without replacing the watches'
      ],
      undo: [
        'Take a backup of this device before you restore. If the restore was wrong, restore that file.',
        'Merge can let a newer bad row win. Restore the backup you took before the merge.',
        'Replace Active Leg does not remove other library legs. Load the good leg from the library if it is still listed.'
      ]
    },
    {
      group: 'Backup',
      q: 'How do I hand the voyage to the relief?',
      purpose: 'The relief needs the file and, on a licensed install, their own seat. The license key is not inside the backup.',
      steps: [
        'On your device, Setup → Backup Entire Database. Copy the file to a USB stick. Export Active Vessel as well if you want one ship only.',
        'On the relief’s device, add or load the same ship on Vessel Data.',
        'Merge Database Backup if that device should keep anything already on it. Restore Database if it should become a copy of yours.',
        'Open the latest leg from Vessel Data and confirm the last watch.',
        'Press Save Current Leg to Library on the machine that will stay in use.'
      ],
      buttons: [
        'Backup Entire Database — the file you hand over',
        'Merge Database Backup… — when the new device already has records',
        'Restore Database… — when the new device should match your file'
      ],
      undo: [
        'Keep your file until the relief has opened the latest voyage and agrees the figures.',
        'Leave your app installed until that check is done.'
      ]
    },
    {
      group: "ECA and changeover",
      q: "How do I log the ECA operations and the position?",
      purpose: "The ECA group in the Operation list marks each step of an ECA passage. A position box appears only for these operations, so the ECA report carries where the ship was.",
      steps: [
        "Open Log Entry and set the date and time.",
        "In Operation open the ECA group. The order is: ECA - CHANGEOVER START, ECA - CHANGEOVER COMPLETE, ECA - ENTRY, ECA - DEPARTURE, ECA - EXIT.",
        "When one of these is chosen the ECA position appears. Type the latitude (degrees, minutes, N or S) and longitude (degrees, minutes, E or W).",
        "Add the flowmeters as for any watch and press Add Entry.",
        "Open the entry in the Voyage Summary. The ECA / Fuel Changeover panel shows the grade in use, the changeover window, the ROB at entry and exit, and the distance in the ECA.",
        "Choose a normal operation again and the position box disappears."
],
      buttons: [
        "Operation — the list; ECA is its own group",
        "ECA position — latitude and longitude, only for ECA operations",
        "Add Entry — stores the watch"
],
      undo: [
        "A wrong position: open the entry from Edit a previous entry, correct it, and press Update Entry.",
        "An entry saved under the wrong operation: edit it and choose the right operation."
]
    },
    {
      group: "ECA and changeover",
      q: "How do I plan the fuel changeover and keep the changeover log?",
      purpose: "The ECA page works out how long before the ECA boundary the changeover must start. The changeover log is the record of what was done, stage by stage, with the time, the position, the consumption and the quantity in each compliant tank.",
      steps: [
        "Open ECA. Enter the sulphur now in service, the sulphur of the new fuel, the limit at the engine inlet, the service system volume, the consumption at planned load in MT/hr, the density and the planned crossing time of the ECA boundary. Press Calculate.",
        "Read the time the changeover must start. Copy window to Voyage Setup stores the planned times. Print changeover plan prints the plan.",
        "Press New ECA record in the changeover log and give it a title, for example the area.",
        "The record has five stages: changeover commenced, changeover completed, entered ECA, departed ECA, after departure. For each stage press Fetch from log entry, or press Fetch all stages from the voyage log once.",
        "Fetching copies the time, the position and the total consumption of the matching ECA log entry (CHANGEOVER START, COMPLETE, ENTRY, DEPARTURE, EXIT).",
        "Type the quantity of compliant fuel in each tank at each stage, or press Fill tanks from tank ROB.",
        "Check the warnings under the record, then press Print log.",
        "Where the flag keeps the ORB Part III, Add to ORB Part III C (item 4) carries the stage into the e-ORB."
],
      buttons: [
        "Calculate — the changeover plan",
        "Copy window to Voyage Setup — keeps the planned times",
        "New ECA record / New EU port record — a log for this passage",
        "Fetch from log entry / Fetch all stages from the voyage log — takes the time, position and consumption from the log",
        "Fill tanks from tank ROB — fills the tank columns",
        "Print log — prints the changeover log on A4 landscape, with the date, time in LT and UTC and position in one column, and a note on each stage saying when to make the entry; Print blank form — an empty one"
],
      undo: [
        "A stage that has no log entry says so. Add the ECA entry in Log Entry, then fetch again.",
        "Fetch again after correcting the log entry and the stage is updated.",
        "Delete record removes the log; the plan on the ECA page stays."
]
    },
    {
      group: "Daily log",
      q: "The period hours or the time zone look wrong.",
      purpose: "Period hours are the hours since the previous entry. They follow the ship's clock, so a clock change must be recorded.",
      steps: [
        "In Log Entry set the Date & Time to the ship's clock and pick the Time zone.",
        "When the watch actually changes the clocks, press Change clocks: -1 hour, -30 min, +30 min or +1 hour. Period hours then count the real time.",
        "Check the Period Hrs box. It is calculated and cannot be typed.",
        "To insert an entry between two others, set its date and time first. The log sorts by time."
],
      buttons: [
        "Change clocks — records a clock change in this period"
],
      undo: [
        "Edit a previous entry and correct the date, time or clock change. Press Update Entry."
]
    },
    {
      group: "Daily log",
      q: "The flowmeter reading is lower than the last one, or consumption is negative.",
      purpose: "Consumption is the difference between two flowmeter readings. A reading lower than the last one is a typing error or a meter reset.",
      steps: [
        "Check the meter number against the last entry.",
        "Press Enter Flowmeters to type the flowmeter, rev counter and RPM again in the pop-up.",
        "If the meter really was changed or reset, record the new start reading as agreed with the Chief Engineer and note it in the remarks.",
        "Open the Voyage Summary and read the consumption review before you save."
],
      buttons: [
        "Enter Flowmeters — quick entry pop-up"
],
      undo: [
        "Edit the entry and correct the reading. Recalculate later if the figures were stale."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I name a saved plan or calculation and find it again?",
      purpose: "When you save a bunkering plan or a consumption plan the program asks for a name or short description. Saved lists have a search box, so an old plan is found by date, name or description.",
      steps: [
        "Press Save, or Save & Print, on the Consumption Plan or the Bunkering Plan.",
        "Type a name or description, for example the voyage or the port. The box can be left empty.",
        "Press Save. Cancel stores nothing.",
        "Scroll to Saved Calculations (consumption plan) or Saved plans (bunkering plan). The new entry is at the top.",
        "Type part of a date, a name, the voyage number or the port in the search box. Only matching rows stay. Clear the box to see them all.",
        "Press Load to bring a saved plan back to the page, Print to reprint it, or Del / Delete to remove it."
],
      buttons: [
        "Save / Save only — stores the plan under a name",
        "Save & Print / Print & Save — stores it, then prints",
        "Print / Print only — prints without storing",
        "Load, Print, Del — on each saved row"
],
      undo: [
        "To rename a saved plan, load it, press Save, and enter the new name.",
        "A deleted saved plan cannot be brought back. Export a backup first if it matters."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How are days and quantities worked out in the consumption plan?",
      purpose: "Each line is one leg or stay. The quantity is the daily consumption times the days. The days come from distance and speed unless you type them or the line is a port stay.",
      steps: [
        "Tick P/A for a port or anchorage stay. Distance and speed are then not used; type the days.",
        "For a sea leg type Distance (nm) and Speed (kn). Days = distance ÷ (speed × 24). Clear the distance or the speed and the days clear with them.",
        "You may type the days yourself on a sea leg. That figure is kept until you change the distance or the speed.",
        "On each line pick the Fuel (the vessel's own fuels; Residual and Distillate when none are set up) and type its MT per day. Quantity = MT per day × Days. + Fuel column puts a third fuel on every line.",
        "If Distance, Speed and Days are blank or 0 and both From and To are filled in, the MT per day typed is taken as the quantity for that line.",
        "If From or To is empty and nothing else is entered, the quantity stays empty.",
        "Use Margin % on a line for a reserve on that line only; it applies to every fuel on the line. Add destination / stay adds the next line. Remove last line removes the last one.",
        "Each fuel in use has its own block under the table: enter its Current ROB and Quantity to Receive to see Arrival ROB and Next Departure ROB. Load Voyage ROB or Load Tank ROB fill the ROB for you.",
        "Enter the Delivery / Redelivery ROB to see two excess figures. Excess (Margin) Quantity = Next Departure ROB − Delivery ROB. Excess (Actual) Quantity = ((Current ROB + Quantity to Receive) − Total Consumption) − Delivery ROB, with no margin. A negative figure makes its box glow red.",
        "The result boxes are in three columns with the tablet upright and six sideways. Days are shown to two decimals (for example 3.47); the quantity still uses the exact days.",
        "Saved Calculations is folded away. Tap its heading to open it, then search by date or name."
],
      buttons: [
        "Add destination / stay — next line",
        "Remove last line — takes off the last line",
        "Load Voyage ROB / Load Tank ROB — current ROB from the log or the tanks",
        "Clear — empties the whole plan on screen"
],
      undo: [
        "A figure that looks wrong: check the P/A tick, the distance, the speed, and the days on that line.",
        "Clear asks before it empties the plan. Save the plan first if you may need it again."
]
    },
    {
      group: "e-ORB",
      q: "How do I get the fuel and lube oil tanks into the e-ORB?",
      purpose: "Inside ChEng AIO the e-ORB can take the ship's fuel and lube oil tanks from Tank Chief, so the tank list is not typed twice.",
      steps: [
        "Make sure the tanks exist in Tank Chief (Tanks) for this ship.",
        "Open e-ORB, then Vessel Setup, and scroll to IOPP / ORB Tanks.",
        "Press Get fuel & lube oil tanks from Tank Chief.",
        "Wait while Tank Chief opens the ship. Then each fuel and lube tank appears with its name, capacity (m³), frame number, ROB (m³) and, for fuel, Residual or Distillate.",
        "Tanks already in the list are updated, and new ones are added. Tanks you typed yourself are not removed.",
        "Tank Chief has no frame number of its own, so type the frame number or position in the e-ORB list if the Supplement needs it.",
        "Press Save ORB Setup."
],
      buttons: [
        "Get fuel & lube oil tanks from Tank Chief — only inside ChEng AIO",
        "Save ORB Setup — stores the list"
],
      undo: [
        "If it says Tank Chief is still loading, wait a moment and press the button again.",
        "If it says Tank Chief has no fuel or lube oil tanks, add them in Tank Chief first.",
        "Check the Residual / Distillate choice on each fuel tank; correct it in the list if it is wrong."
]
    },
    {
      group: "e-ORB",
      q: "An e-ORB entry was saved wrongly, or the officer or tank list is missing.",
      purpose: "The Oil Record Book keeps every line. A mistake is struck through with a reason, never deleted, and the officer and tanks come from Vessel Setup.",
      steps: [
        "Open e-ORB → Vessel Setup. Check the flag, the ship particulars, the IOPP / ORB tanks and the engine officers, and press Save ORB Setup.",
        "In ChEng AIO press Get fuel & lube oil tanks from Tank Chief to fill the fuel and lube oil tanks.",
        "An entry needs an officer name. Add the officer under Engine Officers if the list is empty.",
        "A wrong saved line: tick it in Browse / Print, press Void / correct selected and type the reason, then Save Entry with the correct operation.",
        "The weekly sludge inventory (C.11) is saved with Save Weekly Inventory.",
        "Entry Codes lists the MARPOL codes if you are unsure which one to use."
],
      buttons: [
        "Save ORB Setup",
        "Void / correct selected — strikes the line through, it does not delete it",
        "Entry Codes — the code list"
],
      undo: [
        "Not saved yet: Cancel.",
        "Dismissing the reason question voids nothing."
]
    },
    {
      group: "Start",
      q: "How do the Back button and Full screen work on Android?",
      purpose: "Inside ChEng AIO every page you open is remembered, so Back steps back through the pages you visited instead of closing the program. Full screen hides the Android status and navigation bars. It is off until you switch it on.",
      steps: [
        "Press Back (the Android Back button or gesture) to return to the page you were on before.",
        "If the More menu is open, Back closes the menu first.",
        "From the first page, Back shows \"Press Back again to exit\". Press Back again within about two seconds to leave the program.",
        "For full screen open More and press Full screen: Off. It changes to Full screen: On, and the bars hide. Swipe in from the screen edge to bring them back for a moment.",
        "Press the switch again to bring the bars back for good. The choice is remembered.",
        "Back goes through the pages of ChEng AIO. Inside Voyage Chief or Tank Chief, use their own bottom menu to change tabs."
],
      buttons: [
        "Full screen — in More, switches the Android bars off or on",
        "Back — one page back; twice on the first page leaves the program"
],
      undo: [
        "If the bars do not come back, swipe from the top or bottom edge, or turn Full screen off in More.",
        "The switch only shows where the device can do it (the Android app, or Android Chrome)."
]
    },
    {
      group: "Start",
      q: "Where is the Guide? It is now called About.",
      purpose: "The Guide page is now the About page. It shows who wrote the program, what it does, the version, the update check and the searchable guide.",
      steps: [
        "On a tablet open the About tab. On a phone open More and press About.",
        "Press Check for latest release to see whether a newer version exists.",
        "Search the guide for the question you have."
],
      buttons: [
        "About — this page",
        "Check for latest release — compares this version with GitHub"
]
    },
    {
      group: "Problems",
      q: "A page keeps showing \"Loading…\" or is blank.",
      purpose: "A page opens inside a frame. It shows Loading… while the program before it finishes saving or while the ship is opening. On a big ship, or a slow tablet, that can take a little while.",
      steps: [
        "Wait about ten seconds. The program you left is saving your work, and the next page opens by itself.",
        "If it is still blank, press the same menu button once more.",
        "Open Home and then the page again.",
        "Check that a ship is chosen in the top bar. Choose the ship in Vessel Setup if the bar says No vessel.",
        "Open About and read the version. Press Check for latest release, and install the new app if one is offered.",
        "Last resort: close the app from the Android recent-apps list and open it again. Saved data is kept on the device."
],
      buttons: [
        "Home — the dashboard; a safe page to start again from",
        "Check for latest release — on About"
],
      undo: [
        "Closing and reopening does not delete the ship, the log or the tanks. Export a backup first if you are unsure."
]
    },
    {
      group: "Problems",
      q: "The page is off to one side, has a blank band, or the menu is missing.",
      purpose: "On a tablet held sideways the menu runs down the left edge and the page fills the rest. Held upright the menu is along the bottom. Older versions could leave a blank band beside the menu.",
      steps: [
        "Turn the tablet fully to landscape or portrait and wait a second.",
        "Open About and check the version, then Check for latest release. The band beside the menu was removed in the latest versions.",
        "ECA, Spares, Consumption Plan, Bunkering Plan and e-ORB show the main menu too. Press the menu button of the page you want.",
        "The Bright, Astrolabe and Prism colour button is in the More menu, not at the top.",
        "If it still looks wrong, close the app and open it again."
],
      buttons: [
        "More — the rest of the menu, the colour button and Full screen"
],
      undo: [
        "Layout changes never alter your data."
]
    },
    {
      group: "Problems",
      q: "The keyboard is up and I cannot tap the next box.",
      purpose: "On a tablet the box you tap next must take the keyboard at once. Older versions redrew the table when you left a box, which swallowed the tap.",
      steps: [
        "Tap the next box directly. You no longer have to close the keyboard first.",
        "If a tap still does not land, tap it a second time.",
        "Open About and check the version, then Check for latest release.",
        "The keyboard's down-arrow closes it if it covers a button."
],
      undo: [
        "Nothing is lost when the keyboard closes. Numbers typed are kept."
]
    },
    {
      group: "Problems",
      q: "Printing or saving a file does nothing on Android.",
      purpose: "The Android app prints through the tablet's own print service and saves files into the Downloads folder.",
      steps: [
        "Press Print. Choose a printer, or choose Save as PDF in the print window.",
        "Files such as backups are saved in Downloads/ChEngAIO. The program shows the exact path when it is done.",
        "If nothing opens, wait a few seconds, then press Print once more. Do not press it repeatedly.",
        "Make sure the tablet has a print service installed (Default Print Service), or use Save as PDF.",
        "If you still cannot print, save the PDF and print it from another device."
],
      buttons: [
        "Print — opens the Android print window"
],
      undo: [
        "Printing never changes the record. A Save & Print has already saved it before the print window opens."
]
    },
    {
      group: "Problems",
      q: "The numbers on the summary look old or frozen.",
      purpose: "Figures can be held from an older recalculation or from a typed override.",
      steps: [
        "Open the entry in the Voyage Summary and check for a typed value in the consumption boxes.",
        "Press Recalculate Averages on the Summary page.",
        "If you see a prompt about frozen ME / GE / boiler overrides, read it and clear them only if the typed figures were not intended.",
        "Use Undo Recalculate to restore the previous figures if that was a mistake."
],
      buttons: [
        "Recalculate Averages — rebuilds the totals from the saved entries",
        "Undo Recalculate — restores the previous figures"
],
      undo: [
        "Undo Recalculate restores the figures. Export a backup before a large recalculation."
]
    },
    {
      group: "Problems",
      q: "A figure I typed in the Voyage Summary will not stay.",
      purpose: "Some boxes are calculated and cannot be typed. Others keep what you type only after the entry is saved.",
      steps: [
        "Boxes with a dashed outline are calculated by the program.",
        "Type only in the plain boxes and press Save on the summary.",
        "After saving, press Recalculate Averages if a total depends on it."
],
      undo: [
        "Reopen the entry and retype the figure."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I choose which tank the fuel is drawn from, and why does it matter?",
      purpose: "SFOC is corrected for the heating value (LCV) of the fuel actually burned. Each grade (HFO, LSFO, MDO/MGO, LSMGO) is drawn from one storage tank for the whole entry, so the entry takes that tank's LCV and sulphur. You choose the tank once per grade, not per engine.",
      steps: [
        "Open Log Entry. Under Fuel in use — storage tank there is one box for each grade the entry burns, for example HFO drawn from.",
        "Open the box and pick the storage tank being drawn from. Tanks are listed with their estimated MT. Settling, service and overflow tanks are not offered, and a tank estimated empty is left off.",
        "The line under the box shows the figures that will be kept: S in %, LCV in kJ/kg, density, and the BDN. A blend of several BDN says so.",
        "If the tank has no LCV the line turns red and the SFOC uses the Setup LCV for this entry. Type the figure on the tank in Setup (see the LCV question).",
        "Add Entry or Update Entry saves the chosen tank and a copy of its figures on the entry, so a later correction of the tank cannot rewrite old SFOC.",
        "The next entry starts with the tank you chose last time for that grade."
],
      buttons: [
        "Fuel in use — storage tank — one box per grade burned",
        "— not chosen — — the entry uses the Setup LCV (Bunker LCV)",
        "Add Entry / Update Entry — keeps the tank and its figures with the entry"
],
      undo: [
        "A wrong tank on a saved entry: open it from Edit a previous entry, choose the right tank, and press Update Entry.",
        "Choose — not chosen — to go back to the Setup LCV for that entry."
]
    },
    {
      group: "Bunkers and ROB",
      q: "What do the tank estimate, the empty-tank warning and the monitoring warning mean?",
      purpose: "Between two Tank Chief monitorings the program keeps an estimate of each storage tank: the last monitored MT, plus what was loaded since, minus what the saved entries that named that tank burned. It is only an estimate and is replaced at the next monitoring.",
      steps: [
        "The est. figure beside a tank name is that estimate in MT.",
        "If the estimate cannot cover the entry being typed the line says the tank is estimated empty. Choose another tank, or sound this one.",
        "If the tank has about a day left, or less, the line says how many hours remain at the recent burn.",
        "When a new monitoring arrives from Tank Chief it is compared with the estimate. A difference of more than 2 % of the tank (or 2 MT on a small one) is listed in Setup under Fuel in the storage tanks as The last monitoring differs from the log's estimate.",
        "The usual cause is a tank chosen wrongly in the entries since the previous monitoring. Open those entries and correct the tank, or accept the monitoring as the new truth."
],
      buttons: [
        "Warning line under the tank box — empty or low tank",
        "Setup › Ship Details › Fuel in the storage tanks — the monitoring difference list"
],
      undo: [
        "Correct the tank on the entries concerned and press Update Entry on each. The estimate follows."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I log a receipt with sulphur and LCV, and correct it afterwards?",
      purpose: "A receipt records a bunker, lube or fresh-water delivery and adds it to the ROB. For fuel it can also carry the figures of the delivery, so the tank gets its sulphur and LCV.",
      steps: [
        "Open Receipts. Enter the date, and the time on the ship's clock if known. A receipt with a time joins the first report at or after that time. A receipt with a date only counts from the first report of that day.",
        "Choose the category and the tank, and type the quantity (MT for fuel, litres for lube, m³ for fresh water).",
        "For fuel type the BDN no., company, location, density at 15 °C, sulphur content (% m/m), LCV (kJ/kg, if it is on the BDN) and viscosity.",
        "Press Log Receipt. The message names the log entry the receipt goes into and what happened to the tank's figures.",
        "In ChEng AIO the tank's figures come from Tank Chief. Without Tank Chief the receipt is blended into the typed tank: bunkered into an empty tank it takes the delivery figures; into a tank that holds fuel it is blended by mass (density by volume).",
        "To correct a receipt press Edit on its row. It loads into the form and the button becomes Save changes. Change what is wrong and press Save changes; the same receipt is updated, it is not added twice. Cancel edit leaves it as it was."
],
      buttons: [
        "Log Receipt — adds a receipt",
        "Edit — loads a saved receipt into the form",
        "Save changes / Cancel edit — keeps or drops the correction",
        "✕ — deletes the receipt"
],
      undo: [
        "Editing does not blend the tank figures a second time. If you changed the quantity, density, sulphur, LCV, BDN or tank on a fuel receipt, check the tank's figures in Setup.",
        "Receipts made by a bunker survey have no Edit button: change them on the log entry that carries the survey."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I put LCV, sulphur, density and BDN on my storage tanks?",
      purpose: "The log entry takes its LCV and sulphur from the tank the fuel is drawn from, so each storage tank needs its figures. They come from Tank Chief in ChEng AIO, or are typed in Setup.",
      steps: [
        "Open Setup, press Ship Details, and find Fuel in the storage tanks.",
        "In ChEng AIO press Get fuel from Tank Chief. Every storage tank that holds fuel is listed by the name it has in Tank Chief, whether or not it was bunkered. The figures Tank Chief holds show faintly in the boxes.",
        "Type a tank's S (%), LCV (kJ/kg), ρ @15 or BDN in its row. What you type is used for the log entry in place of the Tank Chief figure. Clearing a box brings the Tank Chief figure back.",
        "Without Tank Chief, or for a tank that is not in it, press Add a tank by hand. Give the tank name, the grade, the ROB, the BDN, the LCV, the sulphur and the density.",
        "Under Voyage tank (receipts blend into it) link the hand-typed row to the Voyage tank. Receipts logged to that tank then blend into its figures by themselves.",
        "The figures are saved as you type. Open Log Entry and the tank shows its figures under Fuel in use."
],
      buttons: [
        "Get fuel from Tank Chief — takes the tank names and monitoring (ChEng AIO)",
        "Add a tank by hand — a row you type yourself",
        "Remove — deletes a hand-typed row",
        "S / LCV / ρ / BDN boxes — your figures for a Tank Chief tank"
],
      undo: [
        "Clear a box to return to the Tank Chief figure.",
        "Remove deletes a hand-typed row; entries already saved keep the figures they were saved with."
]
    },
    {
      group: "ECA and changeover",
      q: "Why does the ECA calculator ask for consumption in MT/hr, and how do I recheck a saved plan?",
      purpose: "The ECA page works on MT/hr, the same basis as the fuel-oil changeover calculator, so the plan, the printout and every later figure follow from one rate. A consumer's MT/day is divided by 24.",
      steps: [
        "Open ECA and type Consumption at planned load in MT/hr, for example 1.02. In port the consumption is also MT/hr.",
        "Press Calculate. The time the changeover must start, the volume and the tank figures follow from that rate.",
        "A saved plan or an older row that was kept in MT/day is read as MT/day divided by 24, so the answer is the same. Press Calculate again to refresh it.",
        "Each consumer can have its own service volume; the result lists the consumers one by one.",
        "Print changeover plan prints the basis as MT/hr."
],
      buttons: [
        "Consumption at planned load (MT/hr)",
        "Calculate — works out the changeover time",
        "Print changeover plan"
],
      undo: [
        "If a saved plan gives a different figure from before, press Calculate again and compare the MT/hr shown on the printout."
]
    },
    {
      group: "Problems",
      q: "The calculated ROB on the ChEng AIO dashboard differs from Voyage Chief.",
      purpose: "The dashboard shows the same ROB as Voyage Chief's current ROB: the opening or survey figure, plus the receipts that have joined, minus the consumption in the log. If the two differ, something in the data is read differently.",
      steps: [
        "Open Voyage Chief and read the current ROB on the ROB page.",
        "Make sure the last log entry is saved and ChEng AIO has the same ship active.",
        "A bunker survey made on an entry is that entry's Previous ROB: the measured figure is the opening of the period, and the period's receipts and consumption are then applied. It is not the closing ROB.",
        "A receipt with a time joins the first report at or after that time. A receipt later than the last entry does not count yet.",
        "If no carry-over has been saved, the opening meters come from Vessel Setup (the flowmeter readings and the date and time of the voyage start). Check them.",
        "Open ChEng AIO again so the dashboard re-reads the log."
],
      buttons: [
        "ROB page in Voyage Chief — the current ROB",
        "Dashboard — Calculated ROB"
],
      undo: [
        "Correct the receipt, survey or meter on the Voyage side. The dashboard follows the next time it is opened."
]
    },
    {
      group: "Bunkers and ROB",
      q: "The LCV is not on my BDN or fuel specs, only “net specific energy”. What do I enter?",
      purpose: "LCV (lower calorific value) is the same quantity as net specific energy, net calorific value or lower heating value. A bunker delivery note often does not show it. The supplier's quality certificate or the independent sample test report gives it as Net specific energy, normally in MJ/kg. Type that figure as it is.",
      steps: [
        "Find Net specific energy on the fuel test report or the supplier's certificate. That is the LCV.",
        "Type it in any LCV box in MJ/kg (for example 40.5) or in kJ/kg (40500). A figure below 100 is read as MJ/kg and converted: 40.5 becomes 40 500 kJ/kg. The box shows the converted figure when you leave it.",
        "Where to type it: Voyage Chief — Receipts (LCV / net specific energy), Setup › Ship Details › Fuel in the storage tanks, and Setup › Bunker LCV. Tank Chief — Bunker Summary (delivery note) and the boxes on After Bunkering.",
        "If you do not have the figure yet, leave the box empty. The entry then uses the Setup LCV for the SFOC, and the line under the tank says so. Nothing is blocked.",
        "For a first estimate the Reference page lists typical values: HFO about 40 000–41 000, VLSFO about 41 000–42 000, MDO about 42 000–43 000, MGO and LSMGO about 42 700 kJ/kg. Replace them with the report's figure when it arrives.",
        "The sulphur content and the density at 15 °C are on the BDN and on the same test report: type them with the LCV."
],
      buttons: [
        "LCV / net specific energy boxes — MJ/kg or kJ/kg",
        "Bunker LCV (Voyage Setup) — used when no tank is chosen or the tank has no LCV"
],
      undo: [
        "A wrong figure: retype it in the same box. Entries already saved keep the figure they were saved with; open the entry, choose the tank again and press Update Entry to refresh it.",
        "A figure typed as 40.5 when you meant 40 500 is the same thing: both are stored as 40 500 kJ/kg."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I enter two fuels on one voyage, and LSMGO that is burned as needed?",
      purpose: "The route is typed once. Each line then carries the fuels burned on it, each with its own MT per day, so a second fuel needs no second table. A fuel used as demand arises, such as LSMGO, is entered as its average MT per day.",
      steps: [
        "Type each destination or stay as one line: From, To, distance and speed (or the days for a port stay).",
        "On the line pick Fuel 1, for example HFO, and type its MT per day. Pick Fuel 2, for example LSMGO, and type its MT per day. The fuels offered are the grades of the vessel's fuel tanks; with none set up they are Residual and Distillate.",
        "A fuel burned as needed (LSMGO for generators, boiler or other uses) is typed as its average MT per day. The plan multiplies it by the days of the line like any other fuel. Leave the box empty on a line where it is not burned.",
        "Suggest MT/day from log (Voyage Chief) fills the empty MT/day boxes from what the ship really burned: sea lines from the sea days and port lines from the port days of the last 7 days (30 days when there was none in 7). A figure you typed is never changed; check the filled ones.",
        "For a fuel changeover during the voyage use two lines, before and after, and pick the different fuel on each line.",
        "+ Fuel column adds a third fuel to every line (up to four); − Fuel column takes the last one off.",
        "The days and the distance are worked out once. Below the table each fuel has its own block: Current ROB, Quantity to Receive, unpumpable, weather reserve, Delivery ROB, the result boxes and the stem advice.",
        "The margin % of a line applies to every fuel on that line.",
        "A calculation saved with the earlier layout opens converted: its residual and distillate figures sit side by side on the same lines."
],
      buttons: [
        "Fuel 1 / Fuel 2 — the fuel picked from the vessel's grades, with its MT per day",
        "+ Fuel column / − Fuel column — another fuel on every line",
        "Add destination / stay, Remove last line — the lines of the route"
],
      undo: [
        "A wrong fuel on a line: pick the right one in that box; the totals move to it.",
        "A fuel column with figures asks before it is removed."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I plan two voyage legs one after the other in the consumption plan?",
      purpose: "A voyage that follows another is added as a next voyage leg. It has its own route and quantities, starts with the ROB the leg before it ends with, and every leg is shown side by side with the combined total.",
      steps: [
        "Fill in leg 1 as usual: its route lines, fuels and MT per day, Current ROB and Quantity to Receive.",
        "Press + Next voyage leg. Leg 2 appears below with its own route lines; its fuels start as the last line of leg 1 used.",
        "Type leg 2's route, fuels and MT per day. Its Current ROB cannot be typed: it is the Next Departure ROB of leg 1, so a change in leg 1 moves leg 2 at once.",
        "Quantity to Receive, unpumpable, weather reserve and delivery ROB are kept for each leg, because each leg ends at its own port.",
        "Give a leg a name (optional) to recognise it, for example Singapore → Rotterdam.",
        "The table All voyage legs side by side shows, for every leg and for the combined total: days at port and at sea, distance, and for each fuel the starting ROB, consumption, margin, required quantity, quantity to receive, arrival ROB, next departure ROB and the stem still needed. A shortage shows in red and carries into the next leg.",
        "Combined: days, distance, consumption, margin, required quantity and quantity to receive are added up; the starting ROB is that of leg 1; the arrival, next departure ROB and stem are those at the end of the last leg.",
        "Print and Save & Print give each leg its own pages followed by the combined total. Up to six legs can be planned."
],
      buttons: [
        "+ Next voyage leg — add a leg that continues from the one above",
        "− Last voyage leg — take off the last leg (asks first when it has figures)",
        "Leg name — an optional label shown in the table and the printout"
],
      undo: [
        "A leg added by mistake: − Last voyage leg removes it.",
        "A calculation with one leg looks and prints exactly as before."
]
    },
    {
      group: "Bunkers and ROB",
      q: "How do I get the distance of a voyage line automatically, and avoid a canal or an area?",
      purpose: "The consumption plan can work out the distance between two ports offline, from a built-in list of ports and a network of sea lanes. It is a planning estimate, not for navigation.",
      steps: [
        "On a sea line, type a few letters of the From port and pick it from the list; do the same for To. The distance is filled in at once and shown in italics with a dashed border.",
        "The days follow from the distance and the speed you type, and the quantities follow from the days, as for any other line.",
        "Under the table, Distance from ports · route options lets you avoid passages (Suez, Panama, Bab-el-Mandeb, Malacca, Hormuz, Cape of Good Hope and others) and keep out of areas (Gulf of Aden, Red Sea, Somali Basin, Gulf of Guinea, Black Sea, Taiwan Strait). The areas are approximate boxes that you choose; they are not official designations.",
        "Changing an option recalculates the automatic distances. Press Recalculate automatic distances to do it again by hand.",
        "A distance you type yourself is never replaced. Typing over an automatic distance makes it yours.",
        "A note under the line says which passages the route uses. A warning appears when the From or To port is inside an avoided area, or far from the nearest sea lane.",
        "Approach: published distance tables often run from pilot station to pilot station. Under Route options, Add N nm at each end adds a port-approach allowance to every automatic distance (empty = the shortest route).",
  "Shortest route: the distance follows a network of sea lanes and is then shortened with great-circle legs wherever the sea is open (checked against a generalised coastline, keeping clear of land, never through a canal or a passage you chose to avoid). Open water gives the great circle itself; the note says how many nm the great-circle legs saved. Untick Shortest route under Route options to see the lane distance. Weather, currents and traffic schemes are not considered.",
  "The route map is printed on its own page after the plan (tick or untick Include the route map on the printout under Route options).",
  "ECA: when the automatic route passes through an Emission Control Area, the note under the line says how many nm are inside (for example Mediterranean 1,935 nm, North Sea & English Channel 418 nm), and a Distance in ECA box appears beside the distance boxes. North America, US Caribbean, North-East Atlantic, Canadian Arctic and Norwegian Sea follow the coordinates in the IMO resolutions (MEPC.190(60), 202(62), 407(84), 392(82) and MARPOL Annex II 13.9.4); the Mediterranean follows the boundary wording of MEPC.361(79) (Gibraltar and Canakkale lines, Suez entrance excluded); Baltic and North Sea & English Channel are drawn from the wording of the regulations; the Chinese domestic ECA follows the coordinates in the Ministry of Transport scheme (Hainan waters 0.10% sulphur from 1 January 2022; the rest of the Chinese coast is 0.50%, the same as the global cap, so it is counted only when you tick it). Areas that take effect later are counted only for a plan dated on or after that day, or when you tick them under Route options: the North-East Atlantic from 1 September 2027 (adopted 1 May 2026) and the Canadian Arctic and Norwegian Sea fuel limit from 1 March 2027. You can switch any zone off there. Port data: Port reference data is derived from the World Port Index (Pub. 150) published by the National Geospatial-Intelligence Agency (NGA) Maritime Safety Information portal (msi.nga.mil), produced as a U.S. Government work (public domain under 17 U.S.C. § 105). Pursuant to 10 U.S.C. § 456, this geospatial information is provided \"as is\" with no warranty as to accuracy, currency, or completeness. This application is for general informational and planning purposes only—it is not an official NGA navigational product and must not be used for primary navigation or passage planning. Mariners must consult current official nautical charts, Sailing Directions, Notice to Mariners, and local port authorities. In accordance with 10 U.S.C. § 425, reference to NGA data does not imply U.S. Government or NGA endorsement, sponsorship, or affiliation. Sea lanes: Eurostat SeaRoute network (EUPL-1.2, based on Oak Ridge National Laboratory data, 2000).",
  "Split into ECA / non-ECA lines (button in the note) replaces the line by one line per stretch, each with its own distance, days and quantity. Under Route options, Fuel 1 on the ECA lines becomes lets you pick the compliant fuel for those lines (for example LSMGO). MT/day, speed and margin carry over; check them. Split lines are not recalculated when you change the route options.",
  "Map: the Map button on a line's note, or Show map of all lines under Route options, opens the route on an offline map: the route in colour (one colour per voyage leg), the ECA stretches in orange, the ports, the passages it uses, and the ECA zones and the areas you chose to avoid shaded. Drag to move, pinch or scroll to zoom, Fit to see the whole route. It is a planning picture from a generalised coastline (Natural Earth, public domain), not a chart.",
  "The printout marks automatic distances with * and says how they were made. Arctic routes are never used.",
        "The port list is the NGA World Port Index (3,669 ports, edition of 2017). Compare with your own passage plan or distance tables before relying on a figure."
],
      buttons: [
        "Route options — avoid passages and areas",
        "Recalculate automatic distances — redo all lines whose distance is automatic"
],
      undo: [
        "Wrong port picked: pick another; the distance follows.",
        "Do not want the automatic figure: type your own distance."
]
    }
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function list(title, rows) {
    if (!rows || !rows.length) return '';
    return '<h3 class="op-guide-sub">' + esc(title) + '</h3><ol class="op-guide-steps">' +
      rows.map((row) => '<li>' + esc(row) + '</li>').join('') + '</ol>';
  }

  function ensureStyle() {
    if (document.getElementById('op-guide-style')) return;
    const style = document.createElement('style');
    style.id = 'op-guide-style';
    style.textContent = [
      '.op-guide-search{width:100%;box-sizing:border-box;margin:8px 0;padding:10px 12px;border-radius:8px;border:1px solid var(--line-strong, rgba(255,255,255,.2));background:transparent;color:inherit;font:inherit;}',
      '.op-guide-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}',
      '.op-guide-chip{border:1px solid var(--line-strong, rgba(255,255,255,.2));background:transparent;color:inherit;border-radius:999px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer;}',
      '.op-guide-chip.is-on{background:var(--teal, #1f8a8a);color:#041618;border-color:transparent;font-weight:700;}',
      '.op-guide-item{border-top:1px solid var(--line, rgba(255,255,255,.12));padding:8px 0;}',
      '.op-guide-item summary{cursor:pointer;font-weight:700;line-height:1.4;}',
      '.op-guide-purpose{margin:8px 0 0;line-height:1.55;}',
      '.op-guide-sub{margin:14px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;}',
      '.op-guide-steps{margin:0 0 8px;padding-left:1.25rem;line-height:1.55;}',
      '.op-guide-steps li{margin-bottom:4px;}'
    ].join('');
    document.head.appendChild(style);
  }

  /* Search: every word must be found somewhere in a topic (any order); best matches first; related words
     (for example "calorific" finds LCV) are matched too. When no topic has all the words, the closest ones are shown. */
  const SYNONYMS = {
    lcv: 'calorific heating value energy net specific energy mj/kg kj/kg sfoc', sulphur: 'sulfur s% sox', sulfur: 'sulphur', bdn: 'bunker delivery note',
    blend: 'mix mixed mixing', ullage: 'dip sounding', sounding: 'ullage dip', empty: 'low run out estimate estimated',
    receipt: 'bunker delivery received receipts', interpolation: 'interpolate table book correction trim heel',
    eca: 'seca emission control area changeover', seca: 'eca', 'mt/hr': 'consumption rate hourly', rob: 'remaining on board stock',
    backup: 'restore export save', delete: 'remove erase', edit: 'change correct amend fix', correct: 'edit fix amend change',
    density: 'sg specific gravity', warning: 'alert alarm', print: 'printout pdf'
  };
  function guideHay(item) {
    const base = [item.group, item.q, item.purpose].concat(item.steps || [], item.buttons || [], item.undo || []).join(' ').toLowerCase();
    let extra = '';
    Object.keys(SYNONYMS).forEach((k) => { if (base.indexOf(k) !== -1) extra += ' ' + SYNONYMS[k]; });
    return { base: base, extra: extra };
  }
  function guideSearch(items, query) {
    const tokens = String(query || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (!tokens.length) return { list: items.slice(), tokens: tokens, partial: false };
    const scored = items.map((item) => {
      const h = item._h || (item._h = guideHay(item));
      const title = String(item.q).toLowerCase(), grp = String(item.group).toLowerCase(), pur = String(item.purpose).toLowerCase();
      let score = 0, hits = 0;
      tokens.forEach((t) => {
        let s = 0;
        if (title.indexOf(t) !== -1) s += 6;
        if (grp.indexOf(t) !== -1) s += 3;
        if (pur.indexOf(t) !== -1) s += 2;
        if (h.base.indexOf(t) !== -1) s += 1; else if (h.extra.indexOf(t) !== -1) s += 0.5;
        if (s > 0) hits++;
        score += s;
      });
      return { item: item, score: score, hits: hits };
    });
    let found = scored.filter((x) => x.hits === tokens.length);
    let partial = false;
    if (!found.length) { found = scored.filter((x) => x.hits > 0); partial = true; }
    found.sort((a, b) => b.score - a.score);
    return { list: found.map((x) => x.item), tokens: tokens, partial: partial };
  }
  function guideMark(escaped, tokens) {
    let out = escaped;
    (tokens || []).forEach((t) => {
      const e = esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!e) return;
      out = out.replace(new RegExp('(?![^<]*>)(' + e + ')', 'gi'), '<mark style="background:rgba(255,200,80,.38);color:inherit;border-radius:3px;padding:0 1px">$1</mark>');
    });
    return out;
  }

  function render(host) {
    if (!host) return;
    ensureStyle();
    const groups = ['All'].concat(ITEMS.map((item) => item.group).filter((name, i, all) => all.indexOf(name) === i));
    host.innerHTML =
      '<label for="voyageGuideSearch">Search the guide</label>' +
      '<input id="voyageGuideSearch" class="op-guide-search" type="search" placeholder="Search (press /), e.g. lcv sulphur, edit receipt, empty tank, interpolation, eca mt/hr" autocomplete="off">' +
      '<button type="button" class="op-guide-clear" id="voyageGuideClear" hidden style="margin-left:6px;">Clear</button>' +
      '<div class="op-guide-chips" id="voyageGuideChips"></div>' +
      '<p class="hint" id="voyageGuideCount"></p>' +
      '<div id="voyageGuideList"></div>';
    const search = host.querySelector('#voyageGuideSearch');
    const chips = host.querySelector('#voyageGuideChips');
    const listEl = host.querySelector('#voyageGuideList');
    const countEl = host.querySelector('#voyageGuideCount');
    let active = 'All';

    groups.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'op-guide-chip' + (name === active ? ' is-on' : '');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        active = name;
        chips.querySelectorAll('.op-guide-chip').forEach((el) => {
          el.classList.toggle('is-on', el.textContent === active);
        });
        draw();
      });
      chips.appendChild(btn);
    });

    const clearBtn = host.querySelector('#voyageGuideClear');
    function draw() {
      const qraw = search.value.trim();
      const pool = ITEMS.filter((item) => active === 'All' || item.group === active);
      const res = guideSearch(pool, qraw);
      const shown = res.list, toks = res.tokens;
      if (clearBtn) clearBtn.hidden = !qraw;
      if (!shown.length) {
        listEl.innerHTML = '<p class="hint">Nothing matches. Try fewer words, or voyage, receipt, lcv, eca, or backup.</p>';
      } else {
        let html = '';
        let last = '';
        if (qraw && res.partial) html += '<p class="hint">No topic has all those words. These are the closest, matching some of them:</p>';
        shown.forEach((item) => {
          if (!qraw && item.group !== last) {
            html += '<h3 class="op-guide-sub">' + esc(item.group) + '</h3>';
            last = item.group;
          }
          html += '<details class="op-guide-item"' + (qraw && shown.length <= 3 ? ' open' : '') + '><summary>' + guideMark(esc(item.q), toks) +
            (qraw ? ' <small style="opacity:.65;">· ' + esc(item.group) + '</small>' : '') + '</summary>' +
            '<p class="op-guide-purpose">' + guideMark(esc(item.purpose), toks) + '</p>' +
            list('Steps', item.steps) + list('Buttons', item.buttons) + list('If this was a mistake', item.undo) +
            '</details>';
        });
        listEl.innerHTML = html;
      }
      countEl.textContent = shown.length + (shown.length === 1 ? ' topic' : ' topics') + (qraw ? (res.partial ? ' partly match the search.' : ' match the search, best first.') : ' in this list.');
    }
    if (clearBtn) clearBtn.addEventListener('click', () => { search.value = ''; draw(); search.focus(); });
    search.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && search.value) { search.value = ''; draw(); } });
    /* "/" or Ctrl+K jumps to the search box while this guide is on screen (not while typing in another box). */
    if (!host.dataset.searchKey) {
      host.dataset.searchKey = '1';
      document.addEventListener('keydown', (ev) => {
        if (!host.isConnected || !host.offsetParent) return;
        const t = ev.target, tag = t && t.tagName;
        const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
        if ((ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')) {
          ev.preventDefault(); search.focus(); search.select();
        }
      });
    }
    search.addEventListener('input', draw);
    draw();
  }

  window.VoyageGuide = { render: render, items: ITEMS };
  function boot() {
    const host = document.getElementById('voyageGuideHost');
    if (host && !host.dataset.ready) {
      host.dataset.ready = '1';
      render(host);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

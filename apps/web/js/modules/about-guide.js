/* Operational guide for the About page. First-time users search a question
   and get the purpose, the steps, what the buttons do, and how to undo. */
window.ChengProAboutGuide = (function () {
  const GROUPS = [
    'Start',
    'Notes',
    'License',
    'Vessel',
    'Voyage Chief',
    'Fix a voyage mistake',
    'Tank Chief',
    'Fix a tank mistake',
    'Spares',
    'Bunkers',
    'e-ORB',
    'Performance',
    'Backup and handover'
  ];

  const ITEMS = [
    {
      group: 'Start',
      q: 'Where do I start the first time I open ChEng AIO?',
      purpose: 'ChEng AIO is the menu for the whole suite. One license and one active ship are shared by Voyage Chief, Tank Chief, the bunker plans, e-ORB, Spares, and Performance.',
      steps: [
        'Open the app. On a phone the menu is along the bottom. More puts Notes directly above Setup, with Home, Spares, Backup & Sync, License, and About beside them. On a wide desktop the left sidebar runs Home, Voyage, Tanks, the plans, e-ORB, Performance, then Spares, Notes, Vessel Setup, and Backup & Sync.',
        'Open License. If the Android app asks for a server, enter the ship ChEng AIO address (usually http://the-server:8080), then Save server URL and Test connection.',
        'Enter the email and the key from the office, then Activate this device.',
        'Open Vessel Setup. Type the ship name and IMO, then Create vessel. That ship becomes the active vessel in the top bar.',
        'Open Voyage or Tanks from the menu. They use the license and the ship you just set. You do not activate again inside them.'
      ],
      buttons: [
        'License — the seat for this phone or this PC',
        'Vessel Setup — the ship name, IMO, Chief Engineer, signature, and stamp used by the other programs',
        'About — this guide',
        'Bright — day colours for sunlight. It sits with the version on a desktop, and on the bar above Voyage or Tanks on a phone'
      ],
      undo: [
        'A wrong key shows an error and does not replace a working license. Check the email and the key, then activate again.',
        'A wrong server URL is corrected by typing the right address and pressing Save server URL.'
      ]
    },
    {
      group: 'Start',
      q: 'What is each menu item for?',
      purpose: 'Each button opens one job. The ship in the top bar is the ship every job uses.',
      steps: [
        'Home — the dashboard: voyage progress, calculated ROB, and the tank overview for the active ship.',
        'Voyage — Voyage Chief: the log, noon summary, ROB, receipts, abstracts, reports, and the voyage library.',
        'Tanks — Tank Chief: soundings, calibration, monitoring, bunkering, and saved tank reports.',
        'Cons Plan — how long the present bunkers last, and whether to stem.',
        'Bnk Plan — the bunkering sequence: which tanks, how much, and the surveys around delivery.',
        'e-ORB — Oil Record Book Part I. Lines are coded, signed, and kept. A wrong line is voided, not deleted.',
        'Perf — performance between two times: slip, consumption, run hours.',
        'Spares (under More on a phone) — spare and store requisitions: sent and received.',
        'Setup — Vessel Setup for the suite.',
        'Backup & Sync — files and the server: export, restore, merge, and the comparison of voyage legs and tank reports.',
        'License — activate, pair the PC, or move a lost seat.',
        'About — this guide, and Check for latest release.'
      ],
      buttons: [
        '‹ Dashboard — the bar that appears above Voyage or Tanks. It names the module and the active ship, and returns to Home',
        'Active vessel — the list in the top bar. Changing it changes the ship for the whole suite'
      ],
      undo: [
        'Opening the wrong module does not change data. Press ‹ Dashboard or Home and open the right one.'
      ]
    },
    {
      group: 'Start',
      q: 'The page is hard to read in sunlight, or I am looking for night colours.',
      purpose: 'Bright is the daylight theme. Night is the dark bridge theme. Prism and Astrolabe are further colour sets. The choice is stored on this device.',
      steps: [
        'On the desktop sidebar, press Bright. Press it again to walk the themes.',
        'Inside Voyage or Tanks, the same Bright button is on the bar with ‹ Dashboard.',
        'Inside Tank Chief, More also has the theme button.'
      ],
      buttons: [
        'Bright — switch toward daylight colours',
        'Night — return to the dark theme after you have walked the other sets'
      ],
      undo: [
        'Keep pressing the theme button until the screen is comfortable. Nothing in the log or the tanks changes.'
      ]
    },
    {
      group: 'Notes',
      q: 'How do I keep a note or a reminder?',
      purpose: 'Notes holds something you must not forget: a survey, a certificate, a spare, a call to the office. Each line belongs to the active ship. A ticked line appears when the program opens, with its deadline.',
      steps: [
        'Open Notes in the sidebar, or under More on a phone.',
        'Type the title and the note. Set the deadline date and time.',
        'Leave Show when the program opens ticked if it should appear at startup. Untick it for a note you only want on this page.',
        'Press Save note.',
        'The next time the program opens, the ticked lines are listed. An overdue deadline is marked. Close leaves them set for the following open. Stop reminding unticks that line. Open notes goes to the page.'
      ],
      buttons: [
        'Show when the program opens — the checkbox on the form and at the start of each line',
        'Save note — stores the line on this device for the active ship',
        'Edit — puts that line back in the form',
        'Delete — removes the line after you confirm',
        'Close — leaves the startup list until the next open',
        'Stop reminding — unticks that line without deleting it'
      ],
      undo: [
        'Untick Show at open to stop the startup list and keep the note.',
        'A wrong deadline: press Edit, set the date and time, and Save changes.',
        'Delete asks you to confirm. After that the line is gone from this device.'
      ]
    },
    {
      group: 'Start',
      q: 'Why does the phone browser stay on the mobile layout?',
      purpose: 'The forms and the bottom menu are built for a phone and a tablet. A desktop-site zoom clips the menu and pushes the page sideways.',
      steps: [
        'Use the app as it opens. The bottom menu is Voyage, Tanks, Cons Plan, Bnk Plan, e-ORB, Perf, and More.',
        'Turn the phone sideways if you want a wider log. The same menu stays.'
      ],
      buttons: [],
      undo: [
        'If a browser still offers Desktop site, leave it off. Reload the page if the menu was already clipped.'
      ]
    },
    {
      group: 'Start',
      q: 'What still works when the ship has no internet?',
      purpose: 'After activation, the daily log, soundings, spares, ORB, and bunker plans stay on the device. The server is only for a copy and for the license check.',
      steps: [
        'Keep working. Entries save on the device as you press Save.',
        'Sync, the database consistency check, and Check for latest release need a connection. They wait until the link is up.',
        'The license has a grace window. When the device next reaches the license server, Refresh check now on the License page updates it.'
      ],
      buttons: [
        'Refresh check now — asks the license server whether this seat is still valid'
      ],
      undo: [
        'A failed sync does not wipe the device. The local log and the local tanks remain. Try again when the link is back.'
      ]
    },
    {
      group: 'License',
      q: 'How do I activate this phone or this PC?',
      purpose: 'One email and one key unlock the programs the office included. A ChEng AIO key covers the suite. A standalone Voyage or Tank install uses its own key and is a different app.',
      steps: [
        'Open License.',
        'On an APK, set ChEng AIO server URL to the ship server and press Save server URL, then Test connection. In a browser already opened on that server, the URL can stay blank.',
        'Type the office email and the key. Press Activate this device.',
        'Read Programs on this key. Voyage, tanks, e-ORB, and the plans appear only when the key includes them.'
      ],
      buttons: [
        'Save server URL — remembers where activation is sent',
        'Test connection — checks that the server answers',
        'Activate this device — binds this phone or this PC to the email',
        'Refresh check now — repeats the online check without typing the key again'
      ],
      undo: [
        'If activation fails, the previous seat stays. Fix the email, the key, or the server URL and activate again.',
        'Key prefixes from the office: CA- is ChEng AIO, VC- is Voyage Chief alone, TC- is Tank Chief alone, MA- is a master key.'
      ]
    },
    {
      group: 'License',
      q: 'Voyage or Tanks says the program is not on this license.',
      purpose: 'The menu item is visible, but the key the office issued does not include that program.',
      steps: [
        'Open License and read Programs on this key.',
        'Ask the office to issue the key again with Voyage Chief, Tank Chief, or e-ORB ticked, or to add that program to the existing key.',
        'Activate again with the new key on this device.'
      ],
      buttons: [
        'Open License — the button on the warning panel',
        'Back to Home — leave the locked program without changing data'
      ],
      undo: [
        'Opening a locked program does not delete voyage or tank records.'
      ]
    },
    {
      group: 'License',
      q: 'How do I put the same license on the Windows PC from the Android phone?',
      purpose: 'The key allows one Android seat and one Windows seat. Pairing copies the seat to the PC with a short code so you do not retype the key.',
      steps: [
        'On the phone that already activated, open License and press Create pairing code (Android).',
        'On the PC, open License, type the 6-digit code, and press Redeem code on this PC.',
        'Confirm Programs on this key on the PC match the phone.'
      ],
      buttons: [
        'Create pairing code (Android) — makes a code that expires; use it promptly',
        'Redeem code on this PC — takes the Windows seat'
      ],
      undo: [
        'A wrong code is rejected. Create a new code on the phone and redeem that one. The phone seat stays.'
      ]
    },
    {
      group: 'License',
      q: 'The phone or the PC was lost. How do I move the seat?',
      purpose: 'A seat transfer frees the lost device so a replacement can activate. The office can also clear the seat.',
      steps: [
        'On a device that can still open License, press Request seat transfer.',
        'Read the note on that page: a cooldown applies (14 days, and at most two transfers a year).',
        'When the seat is free, activate the replacement device with the same email and key.',
        'If the lost device was the only one and you cannot open License, ask the office to clear the seat in license admin.'
      ],
      buttons: [
        'Request seat transfer — starts the cooldown and frees the seat when the rules allow'
      ],
      undo: [
        'Transfer does not delete the log or the tanks on a device you still have. Copy a backup before you rely on a new device. See Backup and handover.'
      ]
    },
    {
      group: 'Vessel',
      q: 'How do I create the ship and select it?',
      purpose: 'Vessel Setup is the one place in ChEng AIO for the ship name, IMO, call sign, flag, company, type, DWT, Chief Engineer, signature, and stamp. Voyage Chief and Tank Chief read that record. They match on IMO first, then on the name. The prefixes MV, M/V, and M.V. are ignored.',
      steps: [
        'Open Vessel Setup from the menu (Setup on a phone).',
        'Fill Name and IMO. Add the Chief Engineer name if it should print on sheets.',
        'Press Create vessel the first time, or Save vessel after that.',
        'In Fleet register, press Activate on the ship you are standing. The top bar changes to that name.',
        'Or choose the ship in the Vessel list in the top bar, then press Load vessel data. The ship you leave is saved first, including a log line you had started but not yet added. That opens the selected ship’s latest voyage log, its tank readings, and the notes and other records kept for that ship.',
        'Open Voyage or Tanks. The bar above the program shows the same ship.'
      ],
      buttons: [
        'Create vessel / Save vessel — writes the form to this device',
        'New vessel — clears the form so you can add another ship. It does not delete the current one',
        'Activate — makes that row the ship every program uses',
        'Load vessel data — opens the ship chosen in the top bar: its latest voyage leg, tank readings, notes, and the other records for that ship',
        'Take photo / Sign on screen — the Chief Engineer signature stored under the name in the form',
        'Remove background now — drops a white paper background so the stamp or signature prints cleanly'
      ],
      undo: [
        'New vessel only clears the form. If you have not pressed Create vessel, the fleet is unchanged. Open Fleet register and Activate the previous ship.',
        'A wrong name or IMO is corrected by activating that ship, editing the fields, and pressing Save vessel.'
      ]
    },
    {
      group: 'Vessel',
      q: 'I need two ships on one tablet.',
      purpose: 'Each ship keeps its own voyage log, voyage library, tanks, and spares. Only one ship is active at a time.',
      steps: [
        'Create the second ship with New vessel, then Create vessel.',
        'Choose the ship in the Vessel list in the top bar, then press Load vessel data. The open ship is saved first. A log line that was not finished stays with that ship and is put back on the form when you open it again. Voyage Chief then opens the selected ship’s latest saved voyage leg, Tank Chief opens its tank readings, and notes and the other records follow that ship.',
        'Activate in the fleet register also makes that row the ship the suite is on.',
        'Check the ship name on the bar above Voyage or Tanks before you type a log or a sounding.'
      ],
      buttons: [
        'Load vessel data — loads the selected ship’s latest voyage, tanks, and other records into the suite',
        'Activate — the same ship, from the fleet table'
      ],
      undo: [
        'If you logged an entry on the wrong ship, switch back to that ship, open Voyage, and use Delete Entry or the Deleted Entry Backup. See Fix a voyage mistake. Do not delete the vessel to undo one entry.'
      ]
    },
    {
      group: 'Vessel',
      q: 'I pressed Delete vessel. What is gone, and what is not?',
      purpose: 'Delete vessel removes that ship from the ChEng AIO fleet register. Voyage legs and tank history that were saved inside Voyage Chief or Tank Chief are separate stores. Deleting the shell vessel does not by itself empty those programs, and it is the wrong tool for a bad log line.',
      steps: [
        'If you have not confirmed the delete, press cancel and stay.',
        'If the ship disappeared from the fleet, create it again with the same name and the same IMO, then Activate it. Voyage and Tanks match IMO first, so the old records can line up again.',
        'If a program still cannot see the records, use Backup and import the vessel file you exported earlier.'
      ],
      buttons: [
        'Delete vessel — removes the fleet row. Export a backup first if this ship has history you need'
      ],
      undo: [
        'There is no undo button on Delete vessel. Recreate the ship with the same IMO, or restore from a backup file.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'What is each Voyage Chief tab for?',
      purpose: 'Voyage Chief is the engine log. The tabs along the top (or More on a small screen) split the work. In ChEng AIO the ship identity itself is edited in Vessel Setup, so the vessel-selection panels inside Voyage are hidden.',
      steps: [
        'Summary — the voyage picture and the noon / departure / arrival sheet for the open entry.',
        'Log Entry — the watch: date, operation, flowmeters, and Add Entry.',
        'ROB — remaining on board from the log, and Print ROB Sheet.',
        'Spares — spare and store requisitions, sent and received. The same page opens from the AIO Spares menu.',
        'Consumption Plan — the stem view inside Voyage. The AIO menu opens the same job as Cons Plan.',
        'Consumption, Voyage Abstract, Range Totals — figures and printouts from the entries already saved.',
        'Receipts — bunker and lube receipts that feed the ROB.',
        'Reports — supplementary reports.',
        'Reference — certificate reminders and calculators.',
        'e-ORB — the oil record book, when the license includes it. The AIO menu opens the same book.',
        'Setup — sync, database backup, deleted-entry backup, and export of the active leg. In the AIO Backup page these jobs are also gathered in one place.',
        'Voyage Setup — voyage number, ballast or laden, ports, distance, and opening ROB.',
        'Vessel Data — the voyage library: save the current leg, or load an older leg. Ship-detail panels here are hidden in ChEng AIO because Vessel Setup owns them.'
      ],
      buttons: [
        '‹ Dashboard — leave Voyage and return to the AIO home without closing the log'
      ],
      undo: [
        'Switching tabs does not delete entries. Unsaved typing in an open form is kept only after you press that form’s Save or Add Entry.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'How do I set the voyage number, the ports, and ballast or laden?',
      purpose: 'Every log line belongs to a voyage number and a condition. B is ballasted. L is laden. The program stores those two legs separately so the working log stays short.',
      steps: [
        'Open Voyage, then the Voyage Setup tab.',
        'Type Voyage No., choose B or L, set the initial date and time, the time zone, departure, arrival, and distance.',
        'Enter opening ROB only when the log for this leg is still empty. Once entries exist, those fields show the live ROB and are not a second opening.',
        'Press Update Voyage Details.',
        'On Vessel Data, press Save Current Leg to Library so this leg is kept even if you later load another one.'
      ],
      buttons: [
        'Update Voyage Details — writes the voyage number, condition, ports, and opening figures into the working leg',
        'Create New Voyage… — starts another voyage. It asks before it replaces the working set. Save the current leg first',
        'Save Types & Opening ROB — on Vessel Data, stores the fuel, lube, and fresh-water names and the opening quantities'
      ],
      undo: [
        'If you saved the wrong voyage number and you have not logged watches yet, type the right number and press Update Voyage Details again.',
        'If watches are already saved under the wrong number, save the leg to the library, then load it back after you correct the number only if you intend that library row to change. When in doubt, export the active leg from Setup first.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'How do I write a log entry for the watch?',
      purpose: 'Log Entry is the watch record. The summary, ROB, abstract, and consumption all read these saved lines. A line that is only typed on the form is not in the log until you add it.',
      steps: [
        'Open Log Entry.',
        'Set the date and time, the operation, and the meters. Enter Flowmeters… opens a short popup for meters, main-engine runtime, the revolution counter, fuel types, and TBN, then applies them to this form.',
        'Check the consumption preview before you save.',
        'Press Add Entry. The line joins the active voyage.',
        'Open Summary if you need the noon sheet, the photo, or Print & Save.'
      ],
      buttons: [
        'Add Entry — stores the form as a new log line',
        'Clear Form — empties the form. It does not remove a line already in the log',
        'Enter Flowmeters… — fills the meter part of the form',
        'Undo Last Save — appears after a save and puts back the previous version of that save',
        'Delete Entry — appears when a saved line is open. Removes it from the active log and keeps a copy under Deleted Entry Backup',
        'Cancel Edit — closes the edit and leaves the saved line as it was'
      ],
      undo: [
        'Wrong figures still on the form, not yet added: press Clear Form and type them again.',
        'Wrong figures just saved: press Undo Last Save while it is on screen.',
        'Wrong figures found later: open that line from the log, correct it, and save again, or Delete Entry and enter it again. A deleted line can be restored from Setup → Deleted Entry Backup.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'How do I complete the noon, departure, or arrival summary?',
      purpose: 'The summary is the sheet for one log entry: engine performance, ROB, a survey correction, a photo, and the printout. It writes back onto that entry.',
      steps: [
        'Open Summary and the entry you are reporting.',
        'Fill the engine and ROB figures. If a survey was taken, use Apply Survey — Correct R.O.B. so the present stock follows the measured tanks.',
        'Take Picture if the sheet should carry a photo. Remove Photo drops it before you save.',
        'Press Save only to keep it, or Print & Save (A4 Portrait) to print and keep it.',
        'Recalculate Averages rebuilds totals from the log. Use it when the averages look stale, not as a way to type a correction.'
      ],
      buttons: [
        'Save only — stores the open summary and leaves you able to continue',
        'Print & Save (A4 Portrait) — stores, then prints',
        'Recalculate Averages — rebuilds averages from the saved entries',
        'Undo Recalculate — appears after a recalculate and restores the entries from before it',
        'Apply Survey — Correct R.O.B. — uses the survey as the corrected ROB',
        'Remove Survey — drops that correction',
        'Reset Lube ROB Cons. to Calculated — discards a hand-typed lube consumption and uses the calculated figure',
        'Close — leaves the summary. Save first if the sheet should keep what you typed'
      ],
      undo: [
        'Before Save only: Close and reopen, or edit the fields and save the right figures.',
        'After a bad Recalculate Averages: press Undo Recalculate immediately. It restores the entries from before that recalculate.',
        'A survey applied by mistake: press Remove Survey, then Save only.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'How do I save this voyage into the library, and how do I open an older one?',
      purpose: 'The library on Vessel Data holds each voyage number as a B leg and an L leg. The log on screen is only the active leg. Saving copies the working leg into the library on this device, including photos and documents, in small pieces so a large leg does not close the app.',
      steps: [
        'Confirm the voyage number and B or L on Voyage Setup, and press Update Voyage Details if you changed them.',
        'Open Vessel Data.',
        'Press Save Current Leg to Library. The list gains that voyage number, with the entry count under B or L.',
        'To open an older leg, choose it in Voyage No. (library), choose the condition, and press Load Selected Leg. You can also press the row in the list.',
        'If the leg on screen is not in the library yet, the program asks you to save it, discard it, or cancel before it loads the other one.'
      ],
      buttons: [
        'Save Current Leg to Library — stores the working log, receipts, documents, and setup for this voyage number and condition',
        'Load Selected Leg — makes the chosen library leg the working log',
        'Refresh List — re-reads the library for the selected ship',
        'New Voyage — on the log, archives this leg and starts the next voyage from the last entry'
      ],
      undo: [
        'Loaded the wrong leg: the warning is the safety. If you chose save, the previous leg is in the library. Load it again from the list.',
        'If you chose to load without saving, the unsaved working set is replaced. It is not in the library. Re-type it, or restore from an export if you made one.',
        'Save Current Leg again after you correct the working log. The library row for that same voyage number and condition is replaced by what is on screen.'
      ]
    },
    {
      group: 'Voyage Chief',
      q: 'How do I record a bunker receipt, print the ROB, or print an abstract?',
      purpose: 'Receipts are fuel and lube taken. ROB is what remains, calculated from the log. Abstracts and range totals are printouts of entries you already saved. They do not invent figures.',
      steps: [
        'Receipts: open Receipts, fill the delivery, press Log Receipt.',
        'ROB: open ROB. It follows the latest entry unless you pick another report. Print ROB Sheet prints that report. Back to latest returns to the newest entry.',
        'Voyage Abstract: open the abstract, check the rows, Download CSV if the office wants a file, or use the print control on that page.',
        'Range Totals: set the from and to entries, or press Whole voyage, then Print Totals & Averages.',
        'Reports: open Reports, complete the supplementary report, and press Save Supplementary Report.'
      ],
      buttons: [
        'Log Receipt — adds the delivery to this voyage',
        'Print ROB Sheet — prints the ROB for the report you are viewing',
        'Back to latest — leaves an older ROB view',
        'Whole voyage — sets the range to every entry on this leg',
        'Export Weekly Abstract (CSV) — a file of the weekly abstract, not a second log'
      ],
      undo: [
        'A wrong receipt: open that receipt from the list and correct it, or delete that receipt row if the page offers delete, then log the right delivery. Deleting a receipt does not delete log entries.',
        'A wrong print is only paper. Correct the entry, then print again.'
      ]
    },
    {
      group: 'Fix a voyage mistake',
      q: 'I saved the wrong watch. How do I take it back?',
      purpose: 'Three different buttons look similar. Only one of them removes a saved line.',
      steps: [
        'The form still shows the bad typing and you have not pressed Add Entry: press Clear Form. The log is unchanged.',
        'You just pressed Add Entry or saved: press Undo Last Save if it is visible.',
        'The line is already in the log: open it, correct the fields, and save. Or press Delete Entry.',
        'You are editing and you want the old saved line kept: press Cancel Edit. Do not press Delete Entry.'
      ],
      buttons: [
        'Clear Form — clears typing that is not yet a log line',
        'Undo Last Save — one step back, only just after a save',
        'Cancel Edit — abandons this edit',
        'Delete Entry — removes the open line from the active voyage and keeps a device-only copy'
      ],
      undo: [
        'After Delete Entry, go to the Setup tab, Deleted Entry Backup, and restore that row. Restoring puts it back on the active voyage. The trash copy itself is not sent to the server as its own store.',
        'Refresh List re-reads the trash. Clear Old Backups… deletes old trash copies. Do not clear the trash until you are sure you do not need the line.'
      ]
    },
    {
      group: 'Fix a voyage mistake',
      q: 'Recalculate changed the voyage and the figures look wrong.',
      purpose: 'Recalculate from opening meters & ROB rebuilds every log entry from the opening meters and the opening ROB on Vessel Data. Recalculate Averages only rebuilds the summary totals. Both can be undone immediately.',
      steps: [
        'If you just pressed Recalculate Averages on the summary, press Undo Recalculate. The same button appears at the top of the summary.',
        'If you just rebuilt from opening meters, press the Undo Recalculate that appeared for that action.',
        'If the undo button is already gone, load the library copy of this leg from Vessel Data, if you saved the leg before the recalculate. That replaces the working log with the library copy.'
      ],
      buttons: [
        'Recalculate from opening meters & ROB — rebuilds the whole leg from the opening figures. Use it when the chain is wrong, not for a single typo',
        'Undo Recalculate — restores the entries from the moment before the last recalculate',
        'Use last log entry as next-report reference — sets the next form from the last line. It does not rewrite history'
      ],
      undo: [
        'One wrong meter on one watch is an edit of that entry, not a full recalculate.',
        'If both the working log and the library were recalculated, restore an exported JSON of the leg: Setup → Replace Active Leg from Backup. That replaces the working leg with the file.'
      ]
    },
    {
      group: 'Fix a voyage mistake',
      q: 'I loaded another leg, or I started a new voyage, and I want the previous one back.',
      purpose: 'The screen holds one working leg. The library holds the saved legs. Loading and New Voyage change what is on screen. They do not erase a leg that was already saved.',
      steps: [
        'Open Vessel Data and read the library. If the voyage number is listed, select it and press Load Selected Leg.',
        'When asked, save the leg now on screen if it is worth keeping, or discard it if it was only a mistaken start.',
        'Press cancel on that question if you are unsure. You stay on the current leg.'
      ],
      buttons: [
        'Load Selected Leg — replaces the working set with the library leg',
        'New Voyage — archives the current leg when it can, then opens the next voyage from the last entry',
        'Create New Voyage… — the voyage-setup path that starts another number'
      ],
      undo: [
        'A leg that was never saved to the library and was discarded at the warning cannot be reopened. Export the active leg from Setup whenever a voyage matters and you are about to load another.'
      ]
    },
    {
      group: 'Fix a voyage mistake',
      q: 'The server and this device disagree about a voyage.',
      purpose: 'Every copy between this device and the server goes through Database consistency. It looks at every leg, not only the open one, so voyages that moved while the ship was offline are all found.',
      steps: [
        'Open Backup & Sync in the AIO menu.',
        'Under Cheng Suite server, Save & connect and Test connection first.',
        'Under Database consistency, press Check voyage legs. Each leg shows what this device and the server hold, and which is newer.',
        'Untick any leg that should not be copied, then press Update to the newest of both. Newer copy wins. A leg that exists on only one side is copied. Nothing is deleted.'
      ],
      buttons: [
        'Check voyage legs — lists what is newer, local or server',
        'Check saved tank reports — the same comparison for Tank Chief reports',
        'Check miscellaneous data — requisitions, the consumption plan and the oil record book',
        'Update to the newest of both — applies the comparison. It stays off until a check has run'
      ],
      undo: [
        'Update to the newest of both does not delete a leg that exists on only one side. A leg you untick is left as it was.',
        'If a newer copy replaced one you wanted, restore it from a database backup or a vessel export made before the update.'
      ]
    },
    {
      group: 'Tank Chief',
      q: 'What is each Tank Chief page for?',
      purpose: 'Tank Chief turns soundings into volume and weight, using trim, list, and the calibration tables. In ChEng AIO the bunker planning pages live on the AIO menu, so they are not repeated inside Tank Chief.',
      steps: [
        'Summary — the tank overview for the active ship.',
        'Monitoring — the fuel-oil condition report from the current tanks.',
        'Bunkering — the after-delivery survey.',
        'Bunker Summary — the bunker delivery note summary.',
        'Voyage Report — the voyage tank report.',
        'Sounding — the sounding card.',
        'More → Fuel Oil, Lube Oil, Misc / Bilge, Fresh Water — the tanks in that group. Open a tank to enter the sounding.',
        'More → Add Tank — a tank that is not on the ship yet.',
        'More → Calibration — the sounding table for a tank.',
        'More → VCF/WCF — volume and weight correction factors.',
        'More → ISO 8217 — the grade reference.',
        'More → Backup — export, import, and the tank sync settings. The AIO Backup page covers the same files together with Voyage.'
      ],
      buttons: [
        '‹ Dashboard — back to the AIO home. The tanks stay as you saved them'
      ],
      undo: [
        'Changing page does not delete a tank. An unsaved sounding on an open tank is kept only after that tank’s save.'
      ]
    },
    {
      group: 'Tank Chief',
      q: 'How do I add a tank and its calibration table?',
      purpose: 'A tank without a calibration table cannot turn a sounding into cubic metres. The table is the ship’s sounding book, stored per tank.',
      steps: [
        'Open Tanks, then More, then Add Tank.',
        'Name the tank, choose the group (fuel oil, lube, water, or misc), the side, and the role (storage, settling, service, overflow).',
        'Save the tank, then open Calibration for that tank.',
        'Type the sounding and volume rows, or import the ship’s Excel or PDF table when the import control is on that page.',
        'Press Save calibration. Take a known sounding and compare the volume with the paper book before you trust the table.'
      ],
      buttons: [
        'Add Tank — creates an empty tank on this ship',
        'Save calibration — stores the table you are editing',
        'Delete tank — on the tank itself. Removes that tank from this ship'
      ],
      undo: [
        'A wrong row in the table: edit the row and press Save calibration again.',
        'A tank added by mistake: open it and press Delete tank. Export the vessel from Backup first if the tank already has history you might need.',
        'There is no undo on Delete tank. Add the tank again and restore the calibration if you saved a copy.'
      ]
    },
    {
      group: 'Tank Chief',
      q: 'How do I take a sounding with trim and list?',
      purpose: 'The reading on the tape is not yet the volume. Tank Chief applies heel (list) and trim, then the calibration table, then density and temperature when you need weight in air.',
      steps: [
        'Open the tank from Summary or from its group under More.',
        'Enter the sounding or ullage, the trim, and the list, in the sense the form asks (port or starboard, by the head or by the stern).',
        'Enter temperature and density at 15 °C when the result should be metric tons.',
        'Read the corrected sounding, the observed volume, and, when density is present, the weight in air.',
        'Save the tank. The summary and the home overview use that reading.'
      ],
      buttons: [
        'The save control on the open tank — writes this reading onto the tank',
        'VCF/WCF under More — a standalone check of the correction factors when a figure looks odd'
      ],
      undo: [
        'A wrong tape figure before you save: change the number and leave the form, or save the corrected reading over it.',
        'A saved wrong reading: open the same tank, type the right sounding, trim, and list, and save again. The latest save is the tank’s current reading.',
        'Do not recalculate the whole voyage log to fix a tank sounding. The log and the tanks are separate until you choose to bring a survey into the voyage summary.'
      ]
    },
    {
      group: 'Tank Chief',
      q: 'How do I make the monitoring sheet, the bunkering survey, and the sounding card?',
      purpose: 'These are reports built from the tanks as they stand. Monitoring is the fuel condition sheet. Bunkering is the survey after delivery. Bunker Summary is the delivery-note totals. Voyage Report is the voyage tank report. Sounding is the card you can take to the deck.',
      steps: [
        'Correct the tank readings first. The report copies them.',
        'Open Monitoring, Bunkering, Bunker Summary, Voyage Report, or Sounding.',
        'Check the totals against the tape book.',
        'Use the page’s Save, and Print when you need paper. On the fuel report, Save keeps the sheet and Print & Save keeps a snapshot and prints.',
        'A snapshot is a saved report. Later edits to the live tanks do not rewrite that snapshot.'
      ],
      buttons: [
        'Save — stores the sheet you are looking at',
        'Print & Save — stores a snapshot and prints',
        'Save only — on the voyage tank report, stores without printing'
      ],
      undo: [
        'If the live tanks were wrong, correct the tanks, then save the report again.',
        'An older snapshot stays in the saved reports. The consistency check on the AIO Backup page can compare those saved reports with the server. It does not delete them.',
        'A reading you take after a saved report is left as it is. Loading the latest report does not roll that newer reading backwards.'
      ]
    },
    {
      group: 'Fix a tank mistake',
      q: 'The home tank overview is in the wrong order, or a tank shows the wrong quantity.',
      purpose: 'Rearrange on the home page only changes the drawing on the dashboard. It does not move fuel. A wrong quantity is a sounding on that tank, or a calibration row.',
      steps: [
        'On Home, press Rearrange and drag the tanks. Press Reset layout to put them back to the default port and starboard arrangement.',
        'If the tonnes are wrong, open Tank Chief, open that tank, and correct the sounding, trim, list, temperature, or density.',
        'If every sounding on that tank is wrong by the same amount, open Calibration and compare the table with the ship’s book.'
      ],
      buttons: [
        'Rearrange — drag tanks on the home overview only',
        'Reset layout — restores the default overview. Tank contents stay',
        'Monitoring — opens the fuel sheet if you want the full condition report'
      ],
      undo: [
        'Reset layout undoes a rearrange. It does not undo a sounding.',
        'The last saved sounding is corrected by saving the tank again with the right reading.'
      ]
    },
    {
      group: 'Spares',
      q: 'How do I keep a requisition?',
      purpose: 'Spares is the requisition log for the active ship. A line is a spare requisition or a store requisition. It stays on Sent while the status is Sent, For follow up, or For receiving. Mark it Received and it moves to the Received list. The photo or PDF stays with the line on this device.',
      steps: [
        'Open Spares from More, or the Spares tab inside Voyage. It is the same page for the active ship.',
        'Under Requisition, choose Spare requisition or Store requisition. Set the status, the sent date, and the description.',
        'Set the receive date when the status is Received.',
        'Attach a PDF or photo with the file field, or Take picture.',
        'Press Save requisition. Sent, For follow up, and For receiving stay on the Sent list. Received moves the line to the Received list.'
      ],
      buttons: [
        'Save requisition — stores the request and its files',
        'Cancel edit — appears while you are editing and drops the edit',
        'Take picture — a photo of the requisition or the store papers',
        'Edit — opens that line in the form',
        'Delete — removes the line and its files after you confirm',
        'Download / Close — on an open PDF or photo'
      ],
      undo: [
        'A wrong description still in the form: press Cancel edit if you were editing, or change the text before Save requisition.',
        'A requisition marked Received too early: open it, set the status back to Sent, For follow up, or For receiving, and save. It returns to the Sent list.',
        'A requisition that should not exist: delete it from its row. The program asks you to confirm. Delete removes the line and its files from this device.'
      ]
    },
    {
      group: 'Bunkers',
      q: 'How do I use Consumption Plan (stem) and Bunkering Plan?',
      purpose: 'Consumption Plan answers whether the bunkers last to the next port and whether to stem. Bunkering Plan is the delivery itself: which tanks, the sequence, the survey before and after, and the link to the delivery note. Both read the active ship.',
      steps: [
        'Open Cons Plan. Check the ROB it is using. Load Voyage ROB or the tank ROB when the page offers those buttons, so the plan starts from the figures you trust.',
        'Enter the daily consumption, the days or the distance, and the reserve you keep. Read the stem advice. Save, and Save & Print if the office wants the sheet.',
        'When a barge is arranged, open Bnk Plan. Follow the plan page for the tank order and the quantities.',
        'After the hose is finished, open Tanks → Bunkering for the after survey, then Bunker Summary for the delivery-note totals.',
        'Log the same delivery in Voyage → Receipts so the voyage ROB includes it. The plan and the receipt are two records; the receipt is what the log consumes.'
      ],
      buttons: [
        'Stem, Plan, After survey, BDN summary, Voyage receipt — the links along the bunker pages. Each opens that step',
        'Load Voyage ROB / Load Tank ROB — fills the plan from Voyage or from Tank Chief',
        'Clear — clears the plan figures on screen. Save afterwards if the stored plan should change',
        'Save, Print, Save & Print — on the consumption plan'
      ],
      undo: [
        'Clear before Save leaves the last saved plan in storage. Save after Clear replaces the stored plan with the empty one, so type the figures again and Save.',
        'A receipt logged in error is corrected on Voyage → Receipts, not by clearing the plan.',
        'A bunkering survey saved too early: correct the tank readings and save the bunkering page again.'
      ]
    },
    {
      group: 'e-ORB',
      q: 'How do I make an Oil Record Book entry?',
      purpose: 'e-ORB is the machinery-space oil record book. Entries are coded operations with the officer and the Chief Engineer. The book is kept for inspection. A mistake is struck through with a reason. The line stays in the book.',
      steps: [
        'Open e-ORB from the menu. The license must include e-ORB.',
        'Complete the ship particulars for the book. Prefill from Voyage Chief vessel copies the ship you already saved. Press Save ORB Setup.',
        'Add the engine officers who may sign.',
        'Start an entry, choose the operation (or Advanced — choose by MARPOL code if you already know the code), fill the quantities and the times, and read the preview.',
        'The officer name is required. Fix any warning the page shows before Save Entry. Capacity and overboard warnings are there to stop a line the book should not carry.',
        'For the weekly inventory, use Save Weekly Inventory. Cancel leaves that form.',
        'To show the book: set the dates, Fetch Records, then Print Selected Period. Export JSON keeps a file of the book.'
      ],
      buttons: [
        'Save ORB Setup — stores the book’s ship particulars',
        'Prefill from Voyage Chief vessel — copies the ship identity you already keep',
        'Save Entry — writes the operation into the book',
        'Refresh Preview — shows the line as it will read, without saving',
        'Cancel — drops the entry or the weekly form you have not saved',
        'Fetch Records — lists the period you asked for',
        'Print Selected Period — the inspection printout',
        'Void / correct selected — strikes through the ticked lines. It does not delete them',
        'Export JSON — a file of the book'
      ],
      undo: [
        'Not saved yet: press Cancel.',
        'Already saved and wrong: tick that line, press Void / correct selected, and type the reason. The line stays, marked void. Then Save Entry with the correct operation. The book does not have a delete.',
        'A void needs a reason. If you dismiss the question, nothing is voided.'
      ]
    },
    {
      group: 'Performance',
      q: 'How do I calculate slip, consumption, and run hours for a period?',
      purpose: 'Performance uses the main-engine basis on Vessel Setup (MCR, CSR, pitch, SFOC, densities) and the hours, distance, and consumption you type for this period. It does not change the voyage log.',
      steps: [
        'Open Vessel Setup and fill Main engine & performance basis if the results say the basis is missing. Save vessel.',
        'Open Performance. Set the period start and end, and any clock change in the period.',
        'Enter distance, revolutions or run hours, and consumption.',
        'Press Calculate. The results panel shows slip and the related figures. Only those result numbers are the answer; the inputs stay as you typed them.',
        'Demo from MCR 85% fills an example so you can see the sheet. Clear inputs empties the form.'
      ],
      buttons: [
        'Calculate — runs the period you typed',
        'Clear inputs — empties the form. It does not change Vessel Setup or the voyage log',
        'Demo from MCR 85% — example figures, not your voyage',
        'Edit vessel engine data — jumps to Vessel Setup'
      ],
      undo: [
        'A wrong hour or distance: type the right figure and press Calculate again. The previous result is only what was on screen.',
        'If Demo from MCR 85% replaced your typing, type your own figures again. The demo is not saved into the log.',
        'Clear inputs before Calculate if you want a clean form.'
      ]
    },
    {
      group: 'Backup and handover',
      q: 'Which backup do I use, and what does restore do compared with merge?',
      purpose: 'A backup is a file on this device or a USB stick. Restore replaces what this device has with the file. Merge keeps local records and copies in anything newer or missing. Export of one leg or one ship is smaller than the whole program.',
      steps: [
        'Open Backup & Sync.',
        'Whole suite, this device: Export entire program. That file is Tank Chief, Voyage Chief, notes, the ship clock, the server addresses, spare and store requisitions, the consumption plan and its snapshots, and the oil record book.',
        'Miscellaneous data: Export miscellaneous data. That file is the requisitions, the consumption plan, the oil record book, and this device’s theme and screen layout, without the voyage log or the tank soundings.',
        'One ship, tanks: Export active vessel. One ship, voyage: Export selected vessel.',
        'The voyage log alone, the working leg: inside Voyage → Setup, Export Active Leg (JSON). Export Setup Only is the ship setup without the watches.',
        'To put a file back: Restore replaces this device’s copy of that store. Read the confirm text. Merge combines. The same id keeps the newer time. Records that exist on only one side are kept. Merge does not delete your local-only rows.',
        'Inside Voyage → Setup, Backup Entire Database, Restore Database, and Merge Database Backup are the voyage database on their own. Deleted Entry Backup is the accident list for log lines, not a full backup.'
      ],
      buttons: [
        'Export entire program — Tank Chief, Voyage Chief, notes, the ship clock, server addresses, requisitions, the consumption plan, and the oil record book',
        'Export miscellaneous data — requisitions, the consumption plan, the oil record book, and display settings, without the log or the soundings',
        'Restore miscellaneous data… — those lists on the ships named in the file become the file',
        'Merge miscellaneous data… — combines those lists; the same id keeps the newer time',
        'Restore entire program… — replaces the suite data with the file',
        'Merge entire program… — combines the file with this device',
        'Download full backup / Import backup — Tank Chief’s own file',
        'Download voyage database / Restore database / Merge database — Voyage Chief’s own file',
        'Export Active Leg (JSON) — the working voyage only',
        'Replace Active Leg from Backup — the working voyage becomes the file. Other library legs stay',
        'Import Setup Only — brings setup without replacing the watches'
      ],
      undo: [
        'Restore cannot be undone from inside the button. Export a fresh file of this device before you restore, and keep that file. If the restore was wrong, restore that file.',
        'Merge keeps both sides. A bad row that is newer will win. If that happens, restore the backup you took before the merge.',
        'Replace Active Leg changes only the working leg. Load the library copy if the library still has the good leg.'
      ]
    },
    {
      group: 'Backup and handover',
      q: 'How do I hand the ship to the relief Chief Engineer?',
      purpose: 'The relief needs the records and a seat. The records travel as a backup file. The seat is the license, which is not inside the backup.',
      steps: [
        'On your device, open Backup & Sync and Export entire program. Copy the file to a USB stick or to the ship server. Export miscellaneous data as well when the relief needs the requisitions, the consumption plan, and the oil record book called out on their own. Also export the active vessel from tanks and from voyage if you want a ship-only file.',
        'On the relief’s device, activate License with the office key. If your device still holds the only seat, use Request seat transfer or ask the office to clear it.',
        'Create or activate the same ship (same IMO) under Vessel Setup.',
        'Open Backup & Sync and Merge entire program from the file if the new device should keep anything already on it, or Restore if the new device should become a copy of yours.',
        'Open Voyage and confirm the latest leg. Open Tanks and confirm the latest readings and the latest sounding report.',
        'On Voyage → Vessel Data, Save Current Leg to Library on the machine that will stay in use.'
      ],
      buttons: [
        'Export entire program — the file you hand over',
        'Merge entire program… — use this when the new device already has some records',
        'Restore entire program… — use this when the new device should match your file and has nothing to keep',
        'Request seat transfer — frees your seat for the relief’s device'
      ],
      undo: [
        'Keep your export file until the relief has opened the latest voyage and the tanks and agrees the figures.',
        'Do not uninstall your app until that check is done. Uninstalling can drop the on-device database.'
      ]
    },
    {
      group: 'Backup and handover',
      q: 'How do I update the Android app without losing the log?',
      purpose: 'A newer APK installs over the existing app. The on-device records stay when you do not uninstall first. Uninstall is only for a very old debug-signed build that Android refuses to replace.',
      steps: [
        'Connect when you can. Open About and press Check for latest release.',
        'If it names a newer version, download the APK it offers.',
        'Open the APK and allow install from this source if the phone asks. Android updates in place.',
        'Open the app, confirm the ship in the top bar, then open Voyage and Tanks and confirm the latest entries are still there.'
      ],
      buttons: [
        'Check for latest release — asks GitHub which APK is current and whether this device is older',
        'Download — the link that appears when a release can be fetched'
      ],
      undo: [
        'If you already uninstalled, the on-device database is gone. Restore or merge the backup file you exported before the uninstall.',
        'If the new app opens on an empty ship, activate the license again if asked, then Activate the ship in the fleet register. The records follow the IMO.'
      ]
    },
    {
      group: 'Backup and handover',
      q: 'How do I sync two devices on the ship with no internet or server?',
      purpose: 'Live sync compares this device with another one on the same Wi-Fi or phone hotspot, directly, and lists what differs for Tank Chief, Voyage Chief and the other reports (requisitions, consumption plan snapshots, e-ORB). Nothing is copied until you tick it. Both devices must use the same email and license.',
      steps: [
        'Put both devices on the same Wi-Fi, or put one on the other\'s phone hotspot. A ship Wi-Fi with a login page or with devices kept apart will not work: use a hotspot or a small router with no internet.',
        'Open Backup & Sync on both devices, then Sync with a nearby device. On the PC press Show pairing code.',
        'On the phone or tablet press Find devices, or type the address the PC shows (for example http://192.168.0.20:47617) and the six-digit code, then Pair. A phone always makes the connection, so start from the phone or tablet.',
        'Press Check differences. Each line is one thing: a vessel, a voyage leg, requisitions, plan snapshots or e-ORB entries. It shows what each device has and suggests pull (copy to this device), push (send to the other) or both.',
        'Tick the lines you want, change the action if you disagree, then press Copy ticked items. Check again: lines that were copied are gone from the list.',
        'For requisitions, plan snapshots and e-ORB, open the same vessel in Voyage Chief on both devices. ChEng AIO must stay open on the other device while you check.',
        'If Find devices finds nothing: the Wi-Fi may keep devices apart (guest or login Wi-Fi). Use a phone hotspot instead, or type the address.',
        'If it says Voyage Chief on the other device did not answer: open ChEng AIO on that device and keep it open, then check again.',
        'If a voyage leg says the vessel is not on the other device: create or import that vessel there first (Vessel Setup), then check again.'
      ],
      buttons: [
        'Show pairing code — makes a code that works once, for five minutes',
        'Find devices — looks for the other device on the Wi-Fi; or type its address',
        'Check differences — lists what differs; moves nothing',
        'Copy ticked items — moves only the lines you ticked; nothing is ever deleted'
      ],
      undo: [
        'Checking changes nothing. A copy you did not want is undone only from a backup taken before it, so export a file first before a big copy.',
        'Forget removes a paired device. Pair again to bring it back.'
      ]
    },
    {
      group: 'Bunkers',
      q: 'How do I fill in soundings and log entries from a photo of the data card?',
      purpose: 'Capture from photo reads a filled Tank Sounding Card or Log Entry Data Card from a photo, on the device, with no internet, and fills the same boxes typing would. You always check every value against a picture of what was read before anything is filled in. Nothing is saved by the capture: you check the page and save it yourself.',
      steps: [
        'Print the card from ChEng AIO (Tank Chief: Tank Sounding Card, Voyage Chief: Log Entry Data Card). The newer cards have four black squares in the corners. Cards printed before this version do not, so reprint them.',
        'Fill the card by hand. Write each number clearly inside its box, with the decimal point. Tick Ullage or Depth for each tank on the sounding card.',
        'Open the page the values belong on: Bunkering Plan (monitoring), Tank Monitoring After Bunkering, New Log Entry, or the Voyage Summary of a saved entry, and press Capture from photo.',
        'Take the photo with the card flat, in good light, with all four black squares in the picture. One card half at a time. If the squares are not found, drag the four circles onto them.',
        'Check the list. Each line shows the cut-out of what was written next to what was read. Orange lines were hard to read or look wrong (for example a decimal point that was missed), so check those first. Correct anything, then press Use these values.',
        'On New Log Entry the date and time, the flowmeter readings, the rev counter and the fresh water ROB are filled. Save the entry, then open its Voyage Summary, press Capture from photo and Use the card read earlier to fill the temperatures, cylinders, turbochargers, auxiliaries, bilge and sludge.',
        'On Bunkering Plan each tank\'s sounding goes into that tank\'s row. A tank that is not in the plan is left out, and so is a tank whose card says Ullage when the plan reads it by Dip (or the other way round).',
        'If a value looks wrong after it is filled in, correct it on the page the way you always do.'
      ],
      buttons: [
        'Capture from photo — opens the camera or a picture and reads the card on this device',
        'Use these values — fills the page with what is in the list, as corrected by you',
        'Retake — starts again with another photo',
        'Use the card read earlier — on the Voyage Summary, reuses the last card without another photo'
      ],
      undo: [
        'Nothing is saved by the capture. Leave the page without saving, or correct the boxes by hand.',
        'The operation and the wind direction are not read: pick them on the form.',
        'The reader is built for neat block digits. Messy writing is read less well; the orange marks and your check are the safeguard.'
      ]
    },
    {
      group: 'Bunkers',
      q: 'Can I watch a bunkering from two devices while the pump is running?',
      purpose: 'Yes. Once two devices are paired (see syncing two devices with no internet), a bunkering that has started is mirrored between them every few seconds. The bunker plan and monitoring page on either device shows the pump clock, each tank and its soundings, and either device can type.',
      steps: [
        'Pair the two devices on the same Wi-Fi or hotspot first. In Backup & Sync leave Mirror a bunkering that is running on both devices ticked.',
        'Open the same vessel on both devices, then open Bunkering Plan on both.',
        'Press the pump start on either device. The other shows Live now in Backup & Sync and the pump clock starts on its screen within a few seconds.',
        'Type soundings on whichever device is at the manifold. Each tank is its own record: two people entering different tanks at the same time both keep their figures. If both change the same tank, the later entry wins on both devices.',
        'A page that is being typed in is not redrawn under you. It updates when you leave the field, and a line under the title says when it was last updated from the other device.',
        'Keep ChEng AIO open and the screen awake on both devices during the operation.'
      ],
      buttons: [
        'Mirror a bunkering that is running on both devices — switches the live mirror on or off; it works only between paired devices that have the same vessel open',
        'Live now / Waiting for a pump start — shows whether a bunkering is running'
      ],
      undo: [
        'Switch the mirror off to stop sharing. Each device then keeps its own plan.',
        'A figure typed by mistake is corrected by typing the right one: the newer entry wins on both devices.',
        'Alarms sound on each device on its own. Silencing one does not silence the other.'
      ]
    },
    {
      group: 'Backup and handover',
      q: 'Where is the data, and who can see the server copy?',
      purpose: 'The working copy is on the device. A server copy exists only after you push, sync, or save to the ship server. The license email is the folder for that user. A master key can open user folders on the host.',
      steps: [
        'Day to day, assume the phone or the PC is the record. Export a file before a handover, a reinstall, or a long stay offline if the server might be behind.',
        'One server holds Tank Chief and Voyage Chief. Set its address and token once under Backup & Sync → Cheng Suite server.',
        'Save & connect stores them for both programs, checks that each answers, and brings down the tank files uploaded for the ship that is open.',
        'Voyage legs, saved tank reports and miscellaneous data move through Database consistency: check, then Update to the newest of both.'
      ],
      buttons: [
        'Save & connect — stores the one server address and token for Tank Chief and Voyage Chief',
        'Test connection — checks that Tank Chief and Voyage Chief both answer',
        'Check … / Update to the newest of both — compares this device with the server and keeps the newer copy of each record'
      ],
      undo: [
        'A failed test connection changes nothing. Correct the URL or the token and test again.',
        'An update you did not want is undone only from a backup taken before it.'
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
      group: "Start",
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
      group: "Start",
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
      group: "Backup and handover",
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
      group: "Start",
      q: "Where did the Bright / Astrolabe / Prism colour button go?",
      purpose: "On a tablet or phone the colour button is in the More menu so the pages have more room.",
      steps: [
        "Press More in the bottom menu (or the left menu on a tablet held sideways).",
        "Press the colour button under the grid. Each press changes the colours: Night, Bright, Prism, Astrolabe.",
        "The colour you pick is used by every program in ChEng AIO."
],
      buttons: [
        "Colour button — in More"
],
      undo: [
        "Press it again until the colours you want come back."
]
    },
    {
      group: "Bunkers",
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
      group: "Bunkers",
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
      group: "Bunkers",
      q: "How do I run a bunkering plan and the pumping clock?",
      purpose: "Bnk Plan opens Tank Chief's bunkering plan: fill sequence, target ullage, delivery rate and the pumping clock with a valve warning.",
      steps: [
        "Open Bnk Plan. The bunker file bar has Stem, Plan, After survey, BDN summary and Voyage receipt.",
        "In Plan enter the header (date, voyage, port, drafts, heel, fuel, density @15, delivery rate, quantity).",
        "Press Fill sequence, then Target all to 85% if every tank should fill to 85%.",
        "Press Start pumping when the hose is on and type the current sounding of each tank as it fills.",
        "Test alarm checks the valve warning. Finish bunkering ends the delivery.",
        "Save only, Print & Save, Print only. Saved plans lists the saved ones; search finds them by date, name, voyage or port.",
        "After the delivery open After survey, then BDN summary to compare the delivery note with the tank figures, and Voyage receipt to record the delivery in the log."
],
      buttons: [
        "Fill sequence, Target all to 85%, Clear current soundings",
        "Start pumping, Reset, Finish bunkering, Test alarm",
        "Save only, Print & Save, Print only, NEW PLAN"
],
      undo: [
        "Clear current soundings empties the sounding boxes only.",
        "NEW PLAN does not delete saved plans."
]
    },
    {
      group: "Voyage Chief",
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
      group: "Voyage Chief",
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
      group: "Voyage Chief",
      q: "The Guide is now called About.",
      purpose: "In Voyage Chief the Guide tab is About, with the authors, what the program does, the version and the guide.",
      steps: [
        "Open Voyage, then the About tab (on a phone: More → About).",
        "Press Check for latest release. The same button is in ChEng AIO About for the whole suite."
],
      buttons: [
        "About"
]
    },
    {
      group: "Tank Chief",
      q: "Clear current soundings did nothing, or a saved plan did not appear.",
      purpose: "Both are fixed in the latest version.",
      steps: [
        "Open About and Check for latest release. Install the update.",
        "After Save only the saved plan appears at the top of Saved plans without leaving the page.",
        "Clear the search box if rows seem to be missing."
]
    },
    {
      group: "Tank Chief",
      q: "The e-ORB says Tank Chief has no tanks.",
      purpose: "The e-ORB tank button reads the tanks of the ship in the top bar.",
      steps: [
        "Check the ship in the top bar.",
        "Add the fuel and lube oil tanks in Tanks (More → Add Tank) if they are missing.",
        "In e-ORB → Vessel Setup press Get fuel & lube oil tanks from Tank Chief.",
        "If it says Tank Chief is still loading, wait and press again."
]
    },
    {
      group: "Start",
      q: "What is each bottom-menu item for, and where do ECA and Spares open?",
      purpose: "The bottom menu (left edge on a tablet held sideways) opens the programs. More holds the rest.",
      steps: [
        "Voyage — the log, reports, ROB and totals.",
        "Tanks — soundings, monitoring and reports.",
        "Cons Plan — the voyage consumption plan.",
        "Bnk Plan — the bunkering plan and bunker file.",
        "E-ORB — the Oil Record Book.",
        "Perf — performance.",
        "More — Notes, Home, Spares, Setup, ECA, Backup & Sync, License, About, the colour button and Full screen.",
        "The menu stays on Consumption Plan, Bunkering Plan, e-ORB, ECA and Spares, so you can move between programs without going Home."
],
      buttons: [
        "Home — the dashboard"
]
    },
    {
      group: "Start",
      q: "What do I do if something does not work and I cannot tell why?",
      purpose: "Most problems are an old version, a ship that is still loading, or a field that was left empty.",
      steps: [
        "Open About and read the version. Press Check for latest release and install the update.",
        "Check the ship in the top bar and the licence in License.",
        "Search this guide for the page you are on.",
        "Wait ten seconds after opening a page on a big ship.",
        "Export a backup (Backup & Sync) before you try anything drastic.",
        "Close and reopen the app. Saved data stays on the device.",
        "Tell the support contact the version number shown in About and what you pressed."
],
      buttons: [
        "Backup & Sync — export before a risky step"
],
      undo: [
        "Closing the app or pressing Back never deletes saved data."
]
    },
    {
      group: "Voyage Chief",
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
      group: "Voyage Chief",
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
      group: "Voyage Chief",
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
      group: "Voyage Chief",
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
      group: "Voyage Chief",
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
      group: "Fix a voyage mistake",
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
      group: "Tank Chief",
      q: "How do I record the sulphur, LCV and density of a bunkering, tank by tank?",
      purpose: "The delivery note (BDN) gives the sulphur, LCV and density of what was delivered. Tank Chief keeps them for each tank, so Voyage Chief can use the LCV of the fuel actually burned. A tank bunkered empty takes the delivery note as it is; a tank that already held fuel gets the mass-weighted blend of the old fuel and the delivery (density by volume).",
      steps: [
        "After the delivery, open Bunker Summary and enter the delivery note: the BDN number, grade, quantity, density, sulphur and LCV.",
        "Open Bunkering (the survey after delivery). The table lists each tank with Before (MT), Loaded (MT) and After (MT), and the resulting S, LCV, ρ and BDN.",
        "In the last column, a tank that already held fuel with no figures on record shows boxes for BDN, S %, LCV and ρ. Type the figures of the fuel that was already in the tank and the blend follows.",
        "Distillate is normally mixed into whatever is in the tank, so it is blended. Residual is normally put into an empty tank and the BDN stays with that tank.",
        "Save the survey. The tank loads and the monitoring are kept so ChEng AIO can pass them to Voyage Chief."
],
      buttons: [
        "Bunker Summary — the delivery note figures",
        "Bunkering — the survey and the per-tank figures",
        "BDN / S % / LCV / ρ boxes — figures of the fuel already in the tank"
],
      undo: [
        "A wrong figure: reopen the survey, correct the box and save again; the blend is recalculated.",
        "A tank with no prior figures stays unknown until you type them."
]
    },
    {
      group: "Tank Chief",
      q: "How does Voyage Chief get the fuel in each tank from Tank Chief?",
      purpose: "Tank Chief records, tank by tank, the figures of each delivery and the latest monitoring. In ChEng AIO Voyage Chief asks for them in the background, so no typing is needed.",
      steps: [
        "Save the bunkering survey and the monitoring in Tank Chief.",
        "Open Voyage Chief in ChEng AIO. It asks Tank Chief for the tanks about every half hour, and again when you press Get fuel from Tank Chief in Setup.",
        "The tanks appear in Fuel in use on the Log Entry and in Setup › Ship Details › Fuel in the storage tanks, with their sulphur, LCV and BDN.",
        "Only storage tanks that hold fuel are offered. Settling, service and overflow tanks are left out.",
        "A tank with no figures can have them typed in Voyage Chief's Setup, on top of the Tank Chief figures."
],
      buttons: [
        "Get fuel from Tank Chief — in Voyage Chief Setup",
        "Save (Bunkering, Monitoring) — in Tank Chief"
],
      undo: [
        "If a tank is missing, open Tank Chief, save the monitoring again, and press Get fuel from Tank Chief."
]
    },
    {
      group: "Tank Chief",
      q: "How do I run a bunkering plan on a tank worked by manual interpolation?",
      purpose: "A manual-interpolation tank has no sounding table in the program, so the plan cannot turn a volume into an ullage by itself. You type the figures from the book, and the times and the remainders are calculated as for any tank.",
      steps: [
        "Open Bunker Plan and pick the tank in a slot. The row says the tank is worked by manual interpolation.",
        "The current reading is in m³, not a sounding. Type the volume the tank holds now.",
        "Type the starting ullage and the target ullage in cm yourself. The Interp. button on the row opens the manual interpolation window to work them out from the book.",
        "The quantity to receive, the estimated time and the remaining space are calculated as usual.",
        "While bunkering, type the volume received in m³; the remaining time and quantities follow."
],
      buttons: [
        "Interp. — opens the manual double interpolation window for this tank",
        "Starting / Target ullage (cm) — typed for these tanks"
],
      undo: [
        "Clear the ullage box and retype it, or reopen the manual window."
]
    },
    {
      group: "Tank Chief",
      q: "How do I use manual double interpolation with the correction method in my book?",
      purpose: "Some sounding books do not give a single table. They give a capacity table and separate trim and heel corrections, in length or in volume, to be applied in a stated order. The manual window lets you type the figures from the book and choose the method that matches it.",
      steps: [
        "Set the tank's calculation to double interpolation (manual) in Add Tank or Calibration. Open the tank and press Double interpolation…. Type the target sounding; the trim and heel used are shown.",
        "Choose the method that matches the book: Volume corrections (m³) — trim table in m³, heel m³ added to it; Heel in cm on the sounding, then trim volume (m³); Trim and heel length corrections together, then volume from the capacity table; Heel first, then trim at the corrected sounding, then volume from the capacity table; or Capacity table with corrections, each in length or volume (m³) added to the volume.",
        "For the last method choose whether the Trim table and the Heel table are a length correction or a volume correction (m³).",
        "When both are length corrections choose the order: both at the sounding as read, trim first then heel, or heel first then trim.",
        "Choose the Sounding unit (cm, mm or m) and the unit the corrections are in.",
        "Type the corner cells and axis ends of each table from the book. The coloured blocks are calculated live. Read the interpolated volume and use it on the sounding."
],
      buttons: [
        "Method radio buttons — the book's arrangement",
        "Trim table is / Heel table is — length or volume",
        "Length corrections — order of trim and heel",
        "Sounding unit / Corrections in"
],
      undo: [
        "A wrong cell: retype it, the blocks recalculate. A wrong method: choose the right button, the figures stay."
]
    },
    {
      group: "Bunkers",
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
      group: "Tank Chief",
      q: "Two fuels came together on one BDN. How do I record the hose and pump times of the second fuel?",
      purpose: "When one barge from one supplier delivers two fuels in one transaction (for example VLSFO and LSMGO on one BDN), each fuel goes through its own hose and its own pump run. The report keeps a second set of hose and pump times for the second fuel, with its own pumping time and rate. Alongside and cast off stay the ship's, once.",
      steps: [
        "Open Bunker Summary. Under Times, fill alongside, connect, pump start, pump stop, disconnect and cast off for the first fuel.",
        "Press + Add second fuel (VLSFO with LSMGO…) in the bunker details. Choose the grade of the second fuel and type its delivery note: BDN number, quantity, sulphur, density and LCV.",
        "A second block appears under Times: Times — second fuel, with its own CONNECT, PUMP START, PUMP STOP and DISCONNECT. Type the date and time of each for the second fuel.",
        "Under each block a line shows the pumping time, the hose-connected time (second fuel) and the average rate once the soundings after bunkering are in. If a stop is before its start, the line says so: check the times.",
        "PRINT & SAVE prints the first fuel's times, then Times — second fuel with the same four events and its pumping time and hose time.",
        "A third or later delivery note is added with + Add extra BDN. It has no separate times: use the second-fuel block for the other grade."
],
      buttons: [
        "+ Add second fuel — gives the second grade its delivery note and its own hose and pump times",
        "Times — second fuel — CONNECT, PUMP START, PUMP STOP, DISCONNECT",
        "Remove second fuel — removes the second note and its times from this report"
],
      undo: [
        "A wrong time: retype it; the pumping time and rate are recalculated.",
        "Remove second fuel takes the second grade and its times off the report. Adding it again starts with empty times.",
        "A summary saved before this change has no second times; open it, add the second fuel, and fill them in."
]
    },
    {
      group: "Bunkers",
      q: "How do I enter two fuels on one voyage, and LSMGO that is burned as needed?",
      purpose: "The route is typed once. Each line then carries the fuels burned on it, each with its own MT per day, so a second fuel needs no second table. A fuel used as demand arises, such as LSMGO, is entered as its average MT per day.",
      steps: [
        "Type each destination or stay as one line: From, To, distance and speed (or the days for a port stay).",
        "On the line pick Fuel 1, for example HFO, and type its MT per day. Pick Fuel 2, for example LSMGO, and type its MT per day. The fuels offered are the grades of the vessel's fuel tanks; with none set up they are Residual and Distillate.",
        "A fuel burned as needed (LSMGO for generators, boiler or other uses) is typed as its average MT per day. The plan multiplies it by the days of the line like any other fuel. Leave the box empty on a line where it is not burned.",
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
      group: "Bunkers",
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
    }
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function haystack(item) {
    return [item.group, item.q, item.purpose]
      .concat(item.steps || [], item.buttons || [], item.undo || [])
      .join(' ')
      .toLowerCase();
  }

  function list(title, rows) {
    if (!rows || !rows.length) return '';
    return (
      '<h3 class="about-sub">' + esc(title) + '</h3>' +
      '<ol class="about-steps">' +
      rows.map((row) => '<li>' + esc(row) + '</li>').join('') +
      '</ol>'
    );
  }

  function article(item, forceOpen, toks, showGroup) {
    return (
      '<details class="guide-item"' + (forceOpen ? ' open' : '') + ' data-guide-group="' + esc(item.group) + '">' +
        '<summary>' + guideMark(esc(item.q), toks) + (showGroup ? ' <small style="opacity:.65;">· ' + esc(item.group) + '</small>' : '') + '</summary>' +
        '<p class="guide-purpose">' + guideMark(esc(item.purpose), toks) + '</p>' +
        list('Steps', item.steps) +
        list('Buttons', item.buttons) +
        list('If this was a mistake', item.undo) +
      '</details>'
    );
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
    host.innerHTML =
      '<div class="guide-tools">' +
        '<label class="guide-search-label" for="aboutGuideSearch">Search the guide</label>' +
        '<input id="aboutGuideSearch" type="search" placeholder="Search (press /), e.g. lcv sulphur, edit receipt, empty tank, interpolation, eca mt/hr" autocomplete="off">' +
        '<button type="button" class="guide-chip" id="aboutGuideClear" hidden style="margin-left:6px;">Clear</button>' +
        '<div class="guide-groups" id="aboutGuideGroups"></div>' +
        '<p class="hint" id="aboutGuideCount"></p>' +
      '</div>' +
      '<div id="aboutGuideList"></div>';

    const search = host.querySelector('#aboutGuideSearch');
    const groups = host.querySelector('#aboutGuideGroups');
    const listEl = host.querySelector('#aboutGuideList');
    const countEl = host.querySelector('#aboutGuideCount');
    let activeGroup = 'All';

    function chip(label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'guide-chip' + (label === activeGroup ? ' is-on' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeGroup = label;
        groups.querySelectorAll('.guide-chip').forEach((el) => {
          el.classList.toggle('is-on', el.textContent === activeGroup);
        });
        draw();
      });
      return btn;
    }

    groups.appendChild(chip('All'));
    GROUPS.forEach((name) => groups.appendChild(chip(name)));

    const clearBtn = host.querySelector('#aboutGuideClear');
    function draw() {
      const qraw = search.value.trim();
      const pool = ITEMS.filter((item) => activeGroup === 'All' || item.group === activeGroup);
      const res = guideSearch(pool, qraw);
      const shown = res.list, toks = res.tokens;
      if (clearBtn) clearBtn.hidden = !qraw;
      if (!shown.length) {
        listEl.innerHTML = '<p class="hint">Nothing matches that. Try fewer words, or voyage, tank, delete, backup, license, requisition, or void.</p>';
      } else {
        let html = '';
        let lastGroup = '';
        if (qraw && res.partial) html += '<p class="hint">No topic has all those words. These are the closest, matching some of them:</p>';
        shown.forEach((item) => {
          if (!qraw && item.group !== lastGroup) {
            html += '<h3 class="about-sub">' + esc(item.group) + '</h3>';
            lastGroup = item.group;
          }
          html += article(item, !!qraw && shown.length <= 3, toks, !!qraw);
        });
        listEl.innerHTML = html;
      }
      const noun = shown.length === 1 ? 'topic' : 'topics';
      countEl.textContent = shown.length + ' ' + noun + (qraw ? (res.partial ? ' partly match the search.' : ' match the search, best first.') : ' in this list.');
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

  return { render: render, items: ITEMS };
})();

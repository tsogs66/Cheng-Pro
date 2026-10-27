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
        'Open the app. On a phone the menu is along the bottom. More puts Notes directly above Setup, with Home, Spares, Backup & Restore, License, and About beside them. On a wide desktop the left sidebar runs Home, Voyage, Tanks, the plans, e-ORB, Performance, then Spares, Notes, Vessel Setup, and Backup & Restore.',
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
        'Backup & Restore — files and the server: export, restore, merge, and the comparison of voyage legs and tank reports.',
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
        'Sync, Keep data persistent, and Check for latest release need a connection. They wait until the link is up.',
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
      q: 'Push or Pull replaced a voyage, or the server and this device disagree.',
      purpose: 'Push active leg and Pull active leg copy one leg and overwrite that same leg on the other side. They are the wrong tool when several voyages moved while the ship was offline. Keep data persistent and the consistency check look at every leg.',
      steps: [
        'Open Backup & Restore in the AIO menu.',
        'Under the Voyage Chief server, Save & connect and Test connection first.',
        'For one leg you mean to overwrite: Push active leg sends this device’s active leg. Pull active leg replaces this device’s active leg with the server’s. Read the confirm text before you accept.',
        'For many legs: press Keep data persistent. The first press lists the legs that differ and ticks them. Untick any leg that should not be copied. The second press confirms and merges. Both sides then hold the selected legs. The newest leg opens in Voyage Chief (newest log time, then the higher voyage number).',
        'Or press Check voyage legs, read the suggestion, and press Update to the newest of both. Newer copy wins. A leg that exists on only one side is copied. Nothing is deleted.'
      ],
      buttons: [
        'Push active leg — this device overwrites that one leg on the server',
        'Pull active leg — the server overwrites that one leg on this device',
        'Keep data persistent — compare every leg, let you choose, then both sides keep the selection',
        'Check voyage legs — lists what is newer, local or server',
        'Check saved tank reports — the same comparison for Tank Chief reports',
        'Update to the newest of both — applies the comparison. It stays off until a check has run',
        'List remote voyages / Pull selected voyage leg — fetch one named leg from the server list'
      ],
      undo: [
        'If a push or pull overwrote a good leg, the other side no longer has the old copy of that leg. Restore it from a database backup or a vessel export made before the push.',
        'Keep data persistent and Update to the newest of both do not delete a leg that exists on only one side. A leg you untick is left as it was.'
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
        'Open Backup & Restore.',
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
        'On your device, open Backup & Restore and Export entire program. Copy the file to a USB stick or to the ship server. Export miscellaneous data as well when the relief needs the requisitions, the consumption plan, and the oil record book called out on their own. Also export the active vessel from tanks and from voyage if you want a ship-only file.',
        'On the relief’s device, activate License with the office key. If your device still holds the only seat, use Request seat transfer or ask the office to clear it.',
        'Create or activate the same ship (same IMO) under Vessel Setup.',
        'Open Backup & Restore and Merge entire program from the file if the new device should keep anything already on it, or Restore if the new device should become a copy of yours.',
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
      q: 'Where is the data, and who can see the server copy?',
      purpose: 'The working copy is on the device. A server copy exists only after you push, sync, or save to the ship server. The license email is the folder for that user. A master key can open user folders on the host.',
      steps: [
        'Day to day, assume the phone or the PC is the record. Export a file before a handover, a reinstall, or a long stay offline if the server might be behind.',
        'Voyage server and tank peer sync are separate. Set each under Backup & Restore, Save & connect, and Test connection.',
        'Push to peer / Pull from peer move Tank Chief. Flush offline queue sends tank changes that were made while offline.',
        'Voyage push and pull of the active leg overwrite that one leg. Use Keep data persistent when more than the active leg may differ.'
      ],
      buttons: [
        'Save & connect — stores the server address and the token',
        'Test connection — checks the server before a push',
        'Push to peer / Pull from peer — Tank Chief',
        'Flush offline queue — sends tank changes saved while offline',
        'Push active leg / Pull active leg — one voyage leg, overwritten on the other side'
      ],
      undo: [
        'A failed test connection changes nothing. Correct the URL or the token and test again.',
        'A pull you did not want is undone only from a backup taken before the pull.'
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

  function article(item, forceOpen) {
    return (
      '<details class="guide-item"' + (forceOpen ? ' open' : '') + ' data-guide-group="' + esc(item.group) + '">' +
        '<summary>' + esc(item.q) + '</summary>' +
        '<p class="guide-purpose">' + esc(item.purpose) + '</p>' +
        list('Steps', item.steps) +
        list('Buttons', item.buttons) +
        list('If this was a mistake', item.undo) +
      '</details>'
    );
  }

  function render(host) {
    if (!host) return;
    host.innerHTML =
      '<div class="guide-tools">' +
        '<label class="guide-search-label" for="aboutGuideSearch">Search the guide</label>' +
        '<input id="aboutGuideSearch" type="search" placeholder="Try: delete entry, sounding, license, backup, void" autocomplete="off">' +
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

    function draw() {
      const q = search.value.trim().toLowerCase();
      const shown = ITEMS.filter((item) => {
        if (activeGroup !== 'All' && item.group !== activeGroup) return false;
        if (!q) return true;
        return haystack(item).indexOf(q) !== -1;
      });
      if (!shown.length) {
        listEl.innerHTML = '<p class="hint">Nothing matches that. Try voyage, tank, delete, backup, license, requisition, or void.</p>';
      } else {
        let html = '';
        let lastGroup = '';
        shown.forEach((item) => {
          if (item.group !== lastGroup) {
            html += '<h3 class="about-sub">' + esc(item.group) + '</h3>';
            lastGroup = item.group;
          }
          html += article(item, !!q);
        });
        listEl.innerHTML = html;
      }
      const noun = shown.length === 1 ? 'topic' : 'topics';
      countEl.textContent = shown.length + ' ' + noun + (q ? ' match the search.' : ' in this list.');
    }

    search.addEventListener('input', draw);
    draw();
  }

  return { render: render, items: ITEMS };
})();

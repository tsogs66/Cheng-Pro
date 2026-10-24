/* Voyage Chief operating guide. Searchable from the Guide tab. */
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
        'Spares — parts on board and the requisition log.',
        'Cons Plan — whether the bunkers last, and whether to stem.',
        'Consumption, Voyage Abstract, Range Totals — printouts of entries already saved.',
        'Receipts — bunker and lube deliveries that feed the ROB.',
        'Reports — supplementary reports.',
        'Reference — weather, NOx, fuel, and SFOC tables.',
        'Guide — this page.',
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
        'Changing tabs does not delete a watch. Typing is kept only after Add Entry or that page’s Save.'
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
        'For many legs: press Keep Data Persistent. The first press lists the legs and ticks the ones that differ. Untick any leg that should stay put. The second press merges. Both sides then hold the selected legs. Nothing is deleted. The latest leg opens when the merge finishes.',
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
      q: 'How do I keep spares and a requisition?',
      purpose: 'Spares on board is the critical list for this ship. Order a line when quantity on board is under the minimum, or when some are already on order. The requisition log is sent, for follow up, for receiving, and received. A photo or PDF stays with that line on this device.',
      steps: [
        'Open Spares.',
        'Add the part, equipment, location, unit, minimum, on board, on order, and remarks. Press Save spare.',
        'Copy requisition builds text from the lines that are short or on order.',
        'Under Requisition, choose Spare requisition or Store requisition, the status, the sent date, and the description.',
        'Attach a PDF or photo, or Take picture. Press Save requisition.',
        'Sent, For follow up, and For receiving stay on the Sent list. Received moves the line to the Received list.'
      ],
      buttons: [
        'Save spare — adds or updates the part',
        'Cancel edit — drops an edit in progress',
        'Copy requisition — text from the short lines',
        'Save requisition — stores the request and its files',
        'Take picture — a photo of the papers'
      ],
      undo: [
        'A wrong spare: open it, correct it, and Save spare. Delete the row to remove a part entered by mistake.',
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
        'Enter the daily consumption, the days or the distance, and the reserve.',
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

  function render(host) {
    if (!host) return;
    ensureStyle();
    const groups = ['All'].concat(ITEMS.map((item) => item.group).filter((name, i, all) => all.indexOf(name) === i));
    host.innerHTML =
      '<label for="voyageGuideSearch">Search the guide</label>' +
      '<input id="voyageGuideSearch" class="op-guide-search" type="search" placeholder="Try: delete entry, library, void, backup" autocomplete="off">' +
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

    function hay(item) {
      return [item.group, item.q, item.purpose].concat(item.steps, item.buttons, item.undo).join(' ').toLowerCase();
    }

    function draw() {
      const q = search.value.trim().toLowerCase();
      const shown = ITEMS.filter((item) => {
        if (active !== 'All' && item.group !== active) return false;
        return !q || hay(item).indexOf(q) !== -1;
      });
      if (!shown.length) {
        listEl.innerHTML = '<p class="hint">Nothing matches. Try voyage, delete, receipt, void, or backup.</p>';
      } else {
        let html = '';
        let last = '';
        shown.forEach((item) => {
          if (item.group !== last) {
            html += '<h3 class="op-guide-sub">' + esc(item.group) + '</h3>';
            last = item.group;
          }
          html += '<details class="op-guide-item"' + (q ? ' open' : '') + '><summary>' + esc(item.q) + '</summary>' +
            '<p class="op-guide-purpose">' + esc(item.purpose) + '</p>' +
            list('Steps', item.steps) + list('Buttons', item.buttons) + list('If this was a mistake', item.undo) +
            '</details>';
        });
        listEl.innerHTML = html;
      }
      countEl.textContent = shown.length + (shown.length === 1 ? ' topic' : ' topics') + (q ? ' match the search.' : ' in this list.');
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

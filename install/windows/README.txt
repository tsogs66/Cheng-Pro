Voyage Chief — Windows
=======================

WHAT THIS IS
------------
The full Voyage Chief application, installed on this PC. It runs with no
internet connection at all: logging watches, the e-ORB, R.O.B., bunker
surveys, totals and every printout work exactly the same at sea as alongside.

Connecting to a sync server remains available and is entirely optional. You
switch it on inside the app under Setup > Server Sync. Nothing here contacts
the network on its own.


STARTING IT
-----------
Use the "Voyage Chief" shortcut on the Desktop or in the Start menu.

A small console window opens and stays open — that is the local server. Your
browser opens the app at http://127.0.0.1:8765. Leave the console window
alone while you work; closing it stops the app.

The server listens on this PC only (127.0.0.1). It is not reachable from the
ship's network or from anywhere else.


WHERE YOUR DATA IS
------------------
Voyage data is stored by your browser, on this PC, in its local database
(IndexedDB) for the address http://127.0.0.1:8765. It is not in the install
folder and it is not in the cloud.

That means two things worth knowing:

  - Use the same browser every time. Data saved in Edge is not visible in
    Chrome, and vice versa; to the browser they are separate stores.
  - Do not use a private/incognito window. That storage is discarded when
    the window closes.

To keep a copy off this PC, use Setup > Database Backup to write a backup
file, or configure server sync.


UPDATING
--------
Run the newer installer over the top. It replaces the app files and leaves
your data alone — the data is in the browser, not in the install folder.

Update-NoonReport.bat in the install folder fetches the latest version from
GitHub instead, when this PC has internet access.


REMOVING IT
-----------
Settings > Apps > Installed apps > Voyage Chief > Uninstall, or the
"Uninstall Voyage Chief" shortcut in the Start menu.

Uninstalling removes the program files. It does not touch your voyage data,
which stays in the browser. To clear that as well, use your browser's
"Clear browsing data" for the site 127.0.0.1:8765 — do this only after taking
a backup.


REQUIREMENTS
------------
  - Windows 10 or 11
  - Windows PowerShell 5.1 (included with Windows)
  - A modern browser: Edge, Chrome or Firefox

No administrator rights are needed. Everything installs for the current user
under %LOCALAPPDATA%\NoonReport.


IF IT DOES NOT START
--------------------
  - Port in use: the launcher tries 8765 and then 8766-8799 automatically.
    If it reports no free port, close whatever is holding them and retry.
  - Nothing opens in the browser: open http://127.0.0.1:8765 by hand — the
    console window prints the exact address it is serving on.
  - PowerShell blocked by policy: the shortcut already runs with
    -ExecutionPolicy Bypass, which applies to that one process only. If your
    organisation blocks PowerShell entirely, ask IT — the app cannot serve
    itself without it.

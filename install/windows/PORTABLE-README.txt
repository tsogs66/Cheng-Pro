Voyage Chief — portable (USB)
=============================

WHAT THIS IS
------------
The full Voyage Chief application in a folder you can copy. It does not
install: no Start menu, no Desktop shortcut, no registry, no administrator
rights. Put it on a USB stick, a shared drive, or a PC that is not yours,
and double-click "Start Voyage Chief.bat" (or run the portable .exe, which
unpacks this folder next to itself and starts).


STARTING IT
-----------
  1. Copy VoyageChief-Portable-*.exe onto the USB stick.
  2. Double-click it. A VoyageChief folder appears beside the .exe.
  3. Leave the small console window open while you work — that is the
     local server. The browser opens http://127.0.0.1:8765.

Later visits: open the VoyageChief folder on the stick and double-click
"Start Voyage Chief.bat". You do not need the .exe again unless you want
to refresh the program files.


WHERE YOUR DATA IS
------------------
Voyage data is stored by the browser on the PC that is running the app,
not inside this folder and not on the USB stick. That is the same store
the installed copy uses (http://127.0.0.1:8765).

So:

  - On a ship PC that already has Voyage Chief installed, this portable
    copy sees the same voyage as the installed one.
  - On a different PC, you start empty unless you restore a backup.
  - Use Setup → Database Backup and save the file onto the USB if the
    records have to travel with the stick.

Use the same browser every time. Do not use a private/incognito window.


UPDATING
--------
Copy a newer portable .exe onto the stick and run it. It overwrites the
program files in the VoyageChief folder and leaves the browser data alone.


REQUIREMENTS
------------
  - Windows 10 or 11
  - Windows PowerShell 5.1 (included with Windows)
  - A modern browser: Edge, Chrome or Firefox
  - The USB stick (or folder) must be writable on first run

No administrator rights are needed.

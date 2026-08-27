; Voyage Chief — Windows installer
;
; Built on Linux with makensis (see scripts/build-windows-installer.sh), so the
; release can be produced by CI without a Windows machine.
;
; Two decisions worth stating, because both are about where this runs — ships:
;
;   1. Per-user install, no administrator rights. A vessel's office PC is usually
;      a locked-down domain machine and the engineer is not a local admin. Anything
;      needing an admin prompt does not get installed at sea, so everything lands in
;      %LOCALAPPDATA% and every registry write is HKCU.
;
;   2. No bundled runtime. The app is served to the machine's own browser from a
;      loopback HTTP server written in PowerShell, which every supported Windows
;      already has. Bundling a browser engine would add ~150 MB to a download that
;      often arrives over a metered satellite link, and would need updating for its
;      own security fixes. The whole payload here is about a megabyte.
;
; It runs entirely offline. Server sync is configured inside the app and is optional;
; nothing in the install or the launcher reaches the network.

Unicode true
ManifestDPIAware true

!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "0.0.0"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "VoyageChief-Setup.exe"
!endif
!ifndef PAYLOAD_DIR
  !define PAYLOAD_DIR "payload"
!endif

!define APP_NAME     "Voyage Chief"
!define APP_PUBLISHER "ts0gs · Marvin C. Endozo"
; APP_ID is deliberately still "NoonReport" after the rename. It is not shown to
; anyone — it is the install folder under %LOCALAPPDATA% and the key this program is
; registered under in Settings > Apps. Renaming it would make this installer write to
; a new folder and register a second entry, leaving the copy already on the PC
; installed, listed and reachable from its shortcuts. The visible name comes from
; APP_NAME, which every shortcut, page and registry value below is built from.
!define APP_ID       "NoonReport"
!define APP_EXE      "Start Voyage Chief.bat"
!define UNINST_KEY   "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\${APP_ID}"
InstallDirRegKey HKCU "Software\${APP_ID}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName"     "${APP_NAME}"
VIAddVersionKey "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} offline installer"
VIAddVersionKey "Author"          "Marvin C. Endozo (ts0gs)"
VIAddVersionKey "FileVersion"     "${APP_VERSION}"
VIAddVersionKey "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey "LegalCopyright"  "${APP_PUBLISHER}"

!define MUI_ICON   "noonreport.ico"
!define MUI_UNICON "noonreport.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT  "This installs ${APP_NAME} on this PC.$\r$\n$\r$\nIt runs completely offline — no internet connection is needed to log a watch, keep the e-ORB, or print a report. Connecting to a sync server stays available and is switched on inside the app, under Setup.$\r$\n$\r$\nNo administrator rights are required. Everything is installed for the current user only."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start ${APP_NAME} now"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Read how it works"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; Remove the install this replaces.
;
; A PC that already ran install-pc.ps1 has a different layout: the app in
; NoonReport\app\ and the launchers in NoonReport\bin\. This installer writes to
; NoonReport\ itself, so both would sit side by side — and every shortcut that PC
; already had still points at the old copy:
;
;   Desktop "Noon Report.bat"  hardcodes  -AppDir "...\NoonReport\app"
;   bin\Start-NoonReport.bat   falls through to app\ because bin\ holds no HTML
;
; So the new files land correctly and the engineer, clicking the shortcut they have
; always clicked, still gets the old application. Clear the old layout out first, so
; there is one app on the machine and every route reaches it.
;
; Named files and RMDir without /r, as in the uninstaller: these folders were the old
; installer's, but a blind recursive delete of a folder under the user's profile is
; not something to do on the strength of an assumption about what is in it.
!macro RemoveLegacyInstall
  Delete "$INSTDIR\app\voyage_manager.html"
  Delete "$INSTDIR\app\eorb.js"
  Delete "$INSTDIR\app\ship_time.js"
  Delete "$INSTDIR\app\sw.js"
  Delete "$INSTDIR\app\manifest.webmanifest"
  Delete "$INSTDIR\app\Start-NoonReport.ps1"
  Delete "$INSTDIR\app\Start-NoonReport.bat"
  Delete "$INSTDIR\app\icons\*.png"
  RMDir  "$INSTDIR\app\icons"
  RMDir  "$INSTDIR\app"

  Delete "$INSTDIR\bin\Start-NoonReport.ps1"
  Delete "$INSTDIR\bin\Start-NoonReport.bat"
  Delete "$INSTDIR\bin\Update-NoonReport.ps1"
  Delete "$INSTDIR\bin\Update-NoonReport.bat"
  Delete "$INSTDIR\bin\install-pc.ps1"
  RMDir  "$INSTDIR\bin"

  ; The plain .bat the old installer dropped beside its shortcut, for PCs where a
  ; .lnk is blocked by policy. It names the old folder outright, so it survives a
  ; shortcut being overwritten and is the most likely way an engineer lands on the
  ; previous version.
  Delete "$DESKTOP\Noon Report.bat"

  ; Left over from the names this program has been called before. Nothing above
  ; replaces these: the installer only overwrites files and shortcuts it creates,
  ; and those are all named from APP_NAME, which is now different. Without this an
  ; engineer ends up with several Desktop icons for one program, all but one of
  ; them starting a copy that has been replaced.
  ;
  ; Both earlier names are cleared, not just the last one: a PC that skips a
  ; version upgrades straight from the oldest, and the intermediate installer
  ; never ran there to tidy up after itself.
  Delete "$INSTDIR\Start Noon Report.bat"
  Delete "$DESKTOP\Noon Report.lnk"
  Delete "$SMPROGRAMS\Noon Report\Noon Report.lnk"
  Delete "$SMPROGRAMS\Noon Report\Uninstall Noon Report.lnk"
  RMDir  "$SMPROGRAMS\Noon Report"

  Delete "$INSTDIR\Start Voyage Report.bat"
  Delete "$DESKTOP\Voyage Report.lnk"
  Delete "$DESKTOP\Voyage Report.bat"
  Delete "$SMPROGRAMS\Voyage Report\Voyage Report.lnk"
  Delete "$SMPROGRAMS\Voyage Report\Uninstall Voyage Report.lnk"
  RMDir  "$SMPROGRAMS\Voyage Report"
!macroend

Section "Application" SEC_APP
  SectionIn RO
  !insertmacro RemoveLegacyInstall
  SetOutPath "$INSTDIR"
  ; Replacing a running install: the launcher holds the folder open while it serves,
  ; so overwrite what we can and let the rest go on next start rather than failing.
  SetOverwrite try
  File /r "${PAYLOAD_DIR}\*.*"
  File "noonreport.ico"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\noonreport.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\noonreport.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APP_ID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\${APP_ID}" "Version" "${APP_VERSION}"

  ; Appear in Settings > Apps like any other program, so it can be removed the
  ; ordinary way rather than by deleting a folder.
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\noonreport.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; Named files only, then RMDir without /r. Voyage data lives in the browser
  ; profile, not here, but an engineer may well have saved an export or a scanned
  ; document into the install folder — a blind recursive delete would take it.
  Delete "$INSTDIR\voyage_manager.html"
  Delete "$INSTDIR\eorb.js"
  Delete "$INSTDIR\ship_time.js"
  Delete "$INSTDIR\sw.js"
  Delete "$INSTDIR\manifest.webmanifest"
  Delete "$INSTDIR\noonreport.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\Start-NoonReport.ps1"
  Delete "$INSTDIR\Update-NoonReport.bat"
  Delete "$INSTDIR\Update-NoonReport.ps1"
  Delete "$INSTDIR\install-pc.ps1"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\icons\*.png"
  RMDir  "$INSTDIR\icons"
  Delete "$INSTDIR\fonts\*.woff2"
  Delete "$INSTDIR\fonts\fonts.css"
  RMDir  "$INSTDIR\fonts"
  ; Anything the previous install layout left behind, on a PC that upgraded.
  !insertmacro RemoveLegacyInstall
  RMDir  "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_ID}"
SectionEnd

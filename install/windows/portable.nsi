; Voyage Chief — portable Windows package (USB / no install)
;
; Built on Linux with makensis (see scripts/build-windows-portable.sh).
;
; This is not the Setup installer. It writes nothing to Program Files, the
; Start menu, the Desktop, or the registry. Double-click the .exe wherever it
; sits — a USB stick, a shared folder, a laptop that is not yours — and it
; unpacks a VoyageChief folder next to itself and starts from there.
;
; Voyage data still lives in the browser on the PC that is running it
; (IndexedDB for http://127.0.0.1:8765), not on the stick. Take a Database
; Backup onto the USB if the copy has to travel with the files.

Unicode true
ManifestDPIAware true

!include "MUI2.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "0.0.0"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "VoyageChief-Portable.exe"
!endif
!ifndef PAYLOAD_DIR
  !define PAYLOAD_DIR "payload"
!endif

!define APP_NAME      "Voyage Chief"
!define APP_PUBLISHER "ts0gs · Marvin C. Endozo"
!define APP_EXE       "Start Voyage Chief.bat"

Name "${APP_NAME} portable"
OutFile "${OUT_FILE}"
; Unpack beside this .exe so a copy on a USB stick stays on the stick.
InstallDir "$EXEDIR\VoyageChief"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName"     "${APP_NAME} portable"
VIAddVersionKey "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} portable — run from a USB stick, no install"
VIAddVersionKey "Author"          "Marvin C. Endozo (ts0gs)"
VIAddVersionKey "FileVersion"     "${APP_VERSION}"
VIAddVersionKey "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey "LegalCopyright"  "${APP_PUBLISHER}"

!define MUI_ICON "noonreport.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "${APP_NAME} — portable"
!define MUI_WELCOMEPAGE_TEXT  "This copy runs without installing anything on the PC.$\r$\n$\r$\nPut this file on a USB stick (or any folder you can write to) and continue. It unpacks a VoyageChief folder next to the .exe and starts from there.$\r$\n$\r$\nNo administrator rights. No Start-menu shortcut. No registry entries.$\r$\n$\r$\nVoyage data is stored by the browser on this PC, not on the stick — use Setup → Database Backup if the records have to travel with the USB."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start ${APP_NAME} now"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Read how the portable copy works"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Portable files" SEC_APP
  SectionIn RO
  SetOutPath "$INSTDIR"
  SetOverwrite try
  File /r "${PAYLOAD_DIR}\*.*"
  File "noonreport.ico"
SectionEnd

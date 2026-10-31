Unicode true
!include "LogicLib.nsh"
Name "TALEDIT"
OutFile "${OUTPUT}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
SetCompressor /SOLID lzma
Section
  SetOutPath "$EXEDIR"
  nsExec::Exec '"$EXEDIR\runtime\node.exe" "$EXEDIR\launcher.cjs" ${ACTION}'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "TALEDIT non è stato avviato. Chiudi la vecchia finestra di avvio e riprova.$\r$\nDettagli: %LOCALAPPDATA%\TALEDIT\data\avvio.log"
  ${EndIf}
SectionEnd

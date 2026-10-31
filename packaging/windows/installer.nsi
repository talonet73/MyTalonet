Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "TALEDIT"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\TALEDIT"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
ShowInstDetails show
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\TALEDIT.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Apri TALEDIT"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Italian"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Serve Windows a 64 bit."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Serve Windows 10 o Windows 11."
    Abort
  ${EndIf}
FunctionEnd
Section "TALEDIT" Main
  IfFileExists "$INSTDIR\CHIUDI-TALEDIT.exe" 0 +2
    ExecWait '"$INSTDIR\CHIUDI-TALEDIT.exe"'
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*"
  WriteUninstaller "$INSTDIR\Disinstalla.exe"
  CreateDirectory "$SMPROGRAMS\TALEDIT"
  CreateShortcut "$DESKTOP\TALEDIT.lnk" "$INSTDIR\TALEDIT.exe"
  CreateShortcut "$SMPROGRAMS\TALEDIT\TALEDIT.lnk" "$INSTDIR\TALEDIT.exe"
  CreateShortcut "$SMPROGRAMS\TALEDIT\Chiudi TALEDIT.lnk" "$INSTDIR\CHIUDI-TALEDIT.exe"
  CreateShortcut "$SMPROGRAMS\TALEDIT\File e progetti.lnk" "$WINDIR\explorer.exe" '"$LOCALAPPDATA\TALEDIT\data"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT" "DisplayName" "TALEDIT"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT" "UninstallString" '$\"$INSTDIR\Disinstalla.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT" "NoRepair" 1
SectionEnd
Section "Uninstall"
  ExecWait '"$INSTDIR\CHIUDI-TALEDIT.exe"'
  Delete "$DESKTOP\TALEDIT.lnk"
  RMDir /r "$SMPROGRAMS\TALEDIT"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TALEDIT"
  ; Media and user projects live outside INSTDIR and are deliberately preserved.
  RMDir /r "$INSTDIR"
SectionEnd

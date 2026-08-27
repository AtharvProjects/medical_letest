!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete all application data, local database, and settings?" IDNO keepData
    RMDir /r "$APPDATA\athass-medisync"
    RMDir /r "$APPDATA\AthassMediSync"
    RMDir /r "$LOCALAPPDATA\athass-medisync"
    RMDir /r "$LOCALAPPDATA\athass-medisync-updater"
  keepData:
!macroend

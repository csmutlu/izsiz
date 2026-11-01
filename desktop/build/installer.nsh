; Kurulumda sağ tık menüsüne "İzsiz ile temizle" / "Clean with Izsiz" ekle, kaldırırken sil.
; Menü adı Windows'un arayüz diline göre seçilir (Türkçe = 0x1F).
!macro customInstall
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $0 $0 & 0x3FF
  StrCpy $1 "Clean with Izsiz"
  IntCmp $0 0x1F 0 +2 +2
    StrCpy $1 "İzsiz ile temizle"
  WriteRegStr HKCU "Software\Classes\*\shell\Izsiz" "" "$1"
  WriteRegStr HKCU "Software\Classes\*\shell\Izsiz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\*\shell\Izsiz" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\*\shell\Izsiz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\Izsiz" "" "$1"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Izsiz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Izsiz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Izsiz"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Izsiz"
!macroend

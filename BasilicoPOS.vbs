' =========================================================
' BASILICO PIZZERIA - EJECUTABLE DE ESCRITORIO PC
' =========================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' El lanzador Node espera el backend y abre Chrome con su IP LAN actual.
WshShell.Run "cmd /c cd /d """ & strPath & """ && node scripts\launch-pos.js", 0, False

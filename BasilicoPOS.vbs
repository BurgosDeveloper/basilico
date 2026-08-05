' =========================================================
' BASILICO PIZZERIA - LANZADOR SILENCIOSO DE ESCRITORIO PC
' =========================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener el directorio del script
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Iniciar servidor Node.js en segundo plano sin consola visible
WshShell.Run "cmd /c cd /d """ & strPath & """ && node server/index.js", 0, False

' 2. Esperar 2 segundos para asegurar inicio de puerto 3001
WScript.Sleep 2000

' 3. Abrir la aplicación en ventana independiente de escritorio (Modo App sin pestañas ni consola)
strChrome = "chrome.exe --app=http://localhost:3001 --new-window"
strEdge = "msedge.exe --app=http://localhost:3001 --new-window"

On Error Resume Next
WshShell.Run strChrome, 1, False
If Err.Number <> 0 Then
    Err.Clear
    WshShell.Run strEdge, 1, False
End If

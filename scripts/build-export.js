const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const exportDir = path.join(rootDir, 'export');
const assetsDir = path.join(rootDir, 'assets');

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

// Function to wrap PNG buffer into valid Windows ICO format (22-byte header + PNG)
function convertPngToIco(pngBuffer) {
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Image type 1 (ICO)
  icoHeader.writeUInt16LE(1, 4); // Number of images (1)
  
  icoHeader.writeUInt8(0, 6); // Width (0 = 256px)
  icoHeader.writeUInt8(0, 7); // Height (0 = 256px)
  icoHeader.writeUInt8(0, 8); // Color count (0)
  icoHeader.writeUInt8(0, 9); // Reserved
  icoHeader.writeUInt16LE(1, 10); // Color planes (1)
  icoHeader.writeUInt16LE(32, 12); // Bits per pixel (32)
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Image size
  icoHeader.writeUInt32LE(22, 18); // Image offset (22)
  
  return Buffer.concat([icoHeader, pngBuffer]);
}

// 1. Asegurar icono de Pizza en formato PNG y formato ICO válido de Windows
const srcIcon = path.join(assetsDir, 'icon.png');
const exportPngIcon = path.join(exportDir, 'pizza_icon.png');
const exportIcoIcon = path.join(exportDir, 'pizza_icon.ico');

if (fs.existsSync(srcIcon)) {
  const pngBuffer = fs.readFileSync(srcIcon);
  fs.writeFileSync(exportPngIcon, pngBuffer);
  const icoBuffer = convertPngToIco(pngBuffer);
  fs.writeFileSync(exportIcoIcon, icoBuffer);
}

// 2. Generar archivo ejecutable VBS y BAT con detección inteligente de puerto activo
const vbsPath = path.join(exportDir, 'BasilicoPOS.vbs');
const vbsContent = `' =========================================================
' BASILICO PIZZERIA - EJECUTABLE DE ESCRITORIO PC (CON DETECCIÓN DE PUERTO)
' =========================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strPath = fso.GetParentFolderName(WScript.ScriptFullName)
strRoot = fso.GetParentFolderName(strPath)

' 1. Verificar si el servidor ya está escuchando en el puerto 3001
Dim objExec, isPortActive, strOut
isPortActive = False

On Error Resume Next
Set objExec = WshShell.Exec("cmd /c netstat -ano | findstr :3001")
If Err.Number = 0 Then
    Do While objExec.Status = 0
        WScript.Sleep 50
    Loop
    If Not objExec.StdOut.AtEndOfStream Then
        strOut = objExec.StdOut.ReadAll()
        If InStr(strOut, "LISTENING") > 0 Then
            isPortActive = True
        End If
    End If
End If
On Error GoTo 0

' 2. Si el servidor no está activo, iniciarlo en consola visible
If Not isPortActive Then
    WshShell.Run "cmd /k title SERVIDOR BACKEND BASILICO POS && cd /d """ & strRoot & """ && node server/index.js", 1, False
    WScript.Sleep 2500
End If

' 3. Abrir la aplicación en ventana independiente de escritorio
strChrome = "chrome.exe --app=http://localhost:3001 --new-window"
strEdge = "msedge.exe --app=http://localhost:3001 --new-window"

On Error Resume Next
WshShell.Run strChrome, 1, False
If Err.Number <> 0 Then
    Err.Clear
    WshShell.Run strEdge, 1, False
End If
`;
fs.writeFileSync(vbsPath, vbsContent);

// Generar también script .BAT de inicio directo inteligente
const batPath = path.join(exportDir, 'BasilicoPOS_Con_Consola.bat');
const batContent = `@echo off
title SERVIDOR & POS BASILICO PIZZERIA
cd /d "%~dp0.."
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if %errorlevel% neq 0 (
    start "BACKEND BASILICO" cmd /k "node server/index.js"
    timeout /t 3 /nobreak >nul
)
start chrome.exe --app=http://localhost:3001 || start msedge.exe --app=http://localhost:3001
`;
fs.writeFileSync(batPath, batContent);

// 3. Crear Acceso Directo con Icono de Pizza para Windows (Basilico Pizzeria.lnk)
const psScriptPath = path.join(rootDir, 'create_shortcut.ps1');
const psScriptContent = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${exportDir.replace(/\\/g, '\\\\')}\\Basilico Pizzeria.lnk")
$Shortcut.TargetPath = "${vbsPath.replace(/\\/g, '\\\\')}"
$Shortcut.WorkingDirectory = "${rootDir.replace(/\\/g, '\\\\')}"
$Shortcut.IconLocation = "${exportIcoIcon.replace(/\\/g, '\\\\')}"
$Shortcut.Description = "Basilico Pizzeria - Sistema POS & KDS de Escritorio"
$Shortcut.Save()
`;

fs.writeFileSync(psScriptPath, psScriptContent);

try {
  execSync(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, { stdio: 'inherit' });
} catch (e) {
  console.log('Advertencia al crear acceso directo PowerShell:', e.message);
} finally {
  if (fs.existsSync(psScriptPath)) {
    fs.unlinkSync(psScriptPath);
  }
}

// 4. Copiar / Generar APK de Android configurada con icono de pizza en export
const apkDest = path.join(exportDir, 'BasilicoPizzeria.apk');

// Comprobar si existe apk previa en android/app/build/outputs/apk/release/app-release.apk
const apkSource = path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (fs.existsSync(apkSource)) {
  fs.copyFileSync(apkSource, apkDest);
  console.log('✅ APK de Android copiada exitosamente a export/BasilicoPizzeria.apk');
} else {
  // Crear APK paquete listo para distribución si no se ha ejecutado `./gradlew assembleRelease`
  const dummyApkInfo = `# BASILICO PIZZERIA - INSTRUCCIONES DE INSTALACIÓN APK ANDROID
Nombre App: Basilico Pizzeria
Icono: Icono de Pizza (assets/icon.png)
Backend LAN URL: Auto-detectable

Para compilar la versión APK nativa firmada final:
1. Ejecuta: node scripts/print-lan.js
2. Ejecuta: npx expo prebuild --platform android
3. Ejecuta: cd android && ./gradlew assembleRelease
4. Copia el archivo generado en android/app/build/outputs/apk/release/app-release.apk a esta carpeta.
`;
  fs.writeFileSync(path.join(exportDir, 'INSTRUCCIONES_APK_ANDROID.txt'), dummyApkInfo);
}

console.log('\n============================================================');
console.log(' 🍕 ARCHIVOS DE EXPORTACIÓN Y EJECUTABLE CREADOS EN export/');
console.log('============================================================');
console.log(` 📂 Carpeta Export: ${exportDir}`);
console.log(` 💻 Ejecutable PC: ${vbsPath}`);
console.log(` 🔗 Acceso Directo PC: ${path.join(exportDir, 'Basilico Pizzeria.lnk')}`);
console.log(` 🖼️ Icono oficial: ${exportIcoIcon}`);
console.log('============================================================\n');

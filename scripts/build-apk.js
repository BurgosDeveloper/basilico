const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n=======================================================');
console.log('🍕 COMPILADOR DE APK ANDROID - BASILICO POS 🍕');
console.log('=======================================================\n');

const rootDir = path.join(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const exportDir = path.join(rootDir, 'export');

// 0. Sincronizar siempre el logo oficial y limpiar íconos viejos antes de compilar
try {
  console.log('🎨 Sincronizando logo oficial e íconos Android...');
  execSync('node scripts/sync-assets.js', { cwd: rootDir, stdio: 'inherit' });
} catch (err) {
  console.warn('⚠️ Advertencia sincronizando assets:', err.message);
}

// 0b. Actualizar DEFAULT_SERVER_IP en MainActivity.kt con la IP LAN actual de la PC si está disponible
try {
  const { getLanConnectionInfo, writeLanConfig } = require('../server/helpers/lan');
  const lanInfo = getLanConnectionInfo();
  if (lanInfo && lanInfo.lanIp) {
    writeLanConfig(lanInfo);
    const mainActivityPath = path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'basilico', 'pizzeria', 'MainActivity.kt');
    if (fs.existsSync(mainActivityPath)) {
      let ktContent = fs.readFileSync(mainActivityPath, 'utf8');
      ktContent = ktContent.replace(
        /private val DEFAULT_SERVER_IP = "[^"]+"/,
        `private val DEFAULT_SERVER_IP = "${lanInfo.lanIp}:3001"`
      );
      fs.writeFileSync(mainActivityPath, ktContent, 'utf8');
      console.log(`📡 IP LAN detectada y preconfigurada en el APK: ${lanInfo.lanIp}:3001`);
    }
  }
} catch (err) {
  console.warn('⚠️ No se pudo actualizar la IP por defecto automáticamente:', err.message);
}

if (!fs.existsSync(androidDir)) {
  console.error('❌ No se encontró la carpeta /android en el proyecto.');
  process.exit(1);
}

// 1. Detectar JAVA_HOME (Android Studio JBR u OpenJDK instalado)
let javaHome = process.env.JAVA_HOME;
const possibleJavaPaths = [
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  'C:\\Program Files\\Android\\Android Studio\\jre',
  'C:\\Program Files\\Java\\jdk-17',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17'
];

if (!javaHome || !fs.existsSync(javaHome)) {
  for (const p of possibleJavaPaths) {
    if (fs.existsSync(p)) {
      javaHome = p;
      break;
    }
  }
}

// 2. Detectar ANDROID_HOME (Android SDK)
let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const defaultSdkPath = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Burgos\\AppData\\Local', 'Android', 'Sdk');
if ((!androidHome || !fs.existsSync(androidHome)) && fs.existsSync(defaultSdkPath)) {
  androidHome = defaultSdkPath;
}

if (!javaHome || !fs.existsSync(javaHome)) {
  console.error('❌ ERROR: No se encontró JDK / JBR de Android Studio.');
  process.exit(1);
}

if (!androidHome || !fs.existsSync(androidHome)) {
  console.error('❌ ERROR: No se encontró Android SDK en:', defaultSdkPath);
  process.exit(1);
}

console.log('✅ JAVA_HOME detectado:', javaHome);
console.log('✅ ANDROID_HOME detectado:', androidHome);
console.log('\n⏳ Compilando APK con Gradle (esto puede tardar 30-90 segundos)...\n');

try {
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    PATH: `${path.join(javaHome, 'bin')};${path.join(androidHome, 'platform-tools')};${process.env.PATH}`
  };

  execSync('gradlew.bat assembleDebug', {
    cwd: androidDir,
    env,
    stdio: 'inherit'
  });

  const apkSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const apkDestMesero = path.join(exportDir, 'Basilico_Mesero.apk');
  const apkDestPizzeria = path.join(exportDir, 'BasilicoPizzeria.apk');

  if (fs.existsSync(apkSource)) {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    fs.copyFileSync(apkSource, apkDestMesero);
    fs.copyFileSync(apkSource, apkDestPizzeria);
    console.log('\n=======================================================');
    console.log('🎉 ¡APK GENERADO CON ÉXITO! 🎉');
    console.log('📱 Ruta en Export (Mesero):   ', apkDestMesero);
    console.log('📱 Ruta en Export (Pizzeria): ', apkDestPizzeria);
    console.log('📱 Ruta Original:             ', apkSource);
    console.log('=======================================================\n');
  } else {
    console.error('❌ La compilación terminó pero no se encontró el archivo APK esperado en:', apkSource);
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Error durante la compilación del APK:', error.message);
  process.exit(1);
}

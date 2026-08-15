const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const exportDir = path.join(rootDir, 'export');
const androidDir = path.join(rootDir, 'android');
const localZipPath = path.join(rootDir, 'gradle-9.3.1-bin.zip');
const apkSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apkDest = path.join(exportDir, 'BasilicoPizzeria.apk');

// Detect JDK 17+ (e.g. from Android Studio)
let envVars = { ...process.env };
const studioJdk = 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (fs.existsSync(studioJdk)) {
  envVars.JAVA_HOME = studioJdk;
  const pathKey = Object.keys(envVars).find(k => k.toLowerCase() === 'path') || 'PATH';
  envVars[pathKey] = `${path.join(studioJdk, 'bin')}${path.delimiter}${envVars[pathKey] || ''}`;
  console.log(`☕ Usando JDK de Android Studio en: ${studioJdk}`);
}

// Detect Android SDK
const defaultSdk = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
if (fs.existsSync(defaultSdk)) {
  envVars.ANDROID_HOME = defaultSdk;
  console.log(`📱 Usando Android SDK en: ${defaultSdk}`);
}

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

async function ensureGradleZip() {
  if (!fs.existsSync(localZipPath)) {
    console.log('⬇️ Descargando Gradle 9.3.1 vía Node.js (evita errores SSL de Java)...');
    try {
      const res = await fetch('https://services.gradle.org/distributions/gradle-9.3.1-bin.zip');
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localZipPath, buffer);
      console.log('✅ Gradle zip descargado con éxito.');
    } catch (e) {
      console.warn('⚠️ No se pudo descargar Gradle zip vía Node:', e.message);
    }
  }
}

function fixAndroidConfigs() {
  const wrapperPropPath = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (fs.existsSync(wrapperPropPath) && fs.existsSync(localZipPath)) {
    const formattedUrl = 'file\\:///' + localZipPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/ /g, '%20');
    let content = fs.readFileSync(wrapperPropPath, 'utf8');
    content = content.replace(/distributionUrl=.*/g, `distributionUrl=${formattedUrl}`);
    fs.writeFileSync(wrapperPropPath, content);
  }

  // Create/update local.properties with sdk.dir
  const localPropPath = path.join(androidDir, 'local.properties');
  if (fs.existsSync(defaultSdk)) {
    const formattedSdkDir = defaultSdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    fs.writeFileSync(localPropPath, `sdk.dir=${formattedSdkDir}\n`);
  }

  // Ensure AndroidManifest.xml has usesCleartextTraffic="true" to allow local LAN connections
  const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    if (!manifestContent.includes('android:usesCleartextTraffic="true"')) {
      manifestContent = manifestContent.replace('<application ', '<application android:usesCleartextTraffic="true" ');
      fs.writeFileSync(manifestPath, manifestContent);
      console.log('✅ AndroidManifest.xml configurado para permitir conexiones HTTP (LAN).');
    }
  }
}

async function buildApk() {
  console.log('📡 Actualizando la IP LAN incluida en la APK...');
  execSync('node scripts/print-lan.js', { cwd: rootDir, stdio: 'inherit', env: envVars });
  await ensureGradleZip();

  console.log('🚀 [1/3] Generando archivos nativos de Android con Expo Prebuild...');
  try {
    execSync('npx expo prebuild --platform android', { cwd: rootDir, stdio: 'inherit', env: envVars });
  } catch (err) {
    console.warn('⚠️ Nota durante expo prebuild:', err.message);
  }

  fixAndroidConfigs();

  console.log('📦 [2/3] Compilando APK Release de Android (Gradle)...');
  try {
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat assembleRelease' : './gradlew assembleRelease';
    const stopGradleCmd = process.platform === 'win32' ? 'gradlew.bat --stop' : './gradlew --stop';
    execSync(stopGradleCmd, { cwd: androidDir, stdio: 'inherit', env: envVars });
    execSync(gradlewCmd, { cwd: androidDir, stdio: 'inherit', env: envVars });
  } catch (err) {
    console.warn('⚠️ Error en assembleRelease, probando assembleDebug...');
    try {
      const debugCmd = process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug';
      execSync(debugCmd, { cwd: androidDir, stdio: 'inherit', env: envVars });
    } catch (err2) {
      console.error('❌ Error compilando APK con Gradle:', err2.message);
    }
  }

  console.log('📋 [3/3] Copiando APK a la carpeta export/...');
  if (fs.existsSync(apkSource)) {
    fs.copyFileSync(apkSource, apkDest);
    console.log('\n============================================================');
    console.log('✅ ¡APK RELEASE ACTUALIZADA GENERADA CON ÉXITO!');
    console.log(`📱 Ubicación: ${apkDest}`);
    console.log('============================================================\n');
  } else {
    const debugSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (fs.existsSync(debugSource)) {
      fs.copyFileSync(debugSource, apkDest);
      console.log('\n============================================================');
      console.log('✅ ¡APK DEBUGEABLE GENERADA CON ÉXITO Y COPIADA!');
      console.log(`📱 Ubicación: ${apkDest}`);
      console.log('============================================================\n');
    } else {
      console.error('❌ No se encontró el archivo APK generado en outputs/apk/.');
    }
  }
}

buildApk();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const publicDir = path.join(rootDir, 'public');
const srcAssetsImgDir = path.join(rootDir, 'src', 'assets', 'img');
const exportDir = path.join(rootDir, 'export');
const buildDir = path.join(rootDir, 'build');
const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

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

const iconSrc = path.join(assetsDir, 'icon.png');
const logoSrc = path.join(assetsDir, 'logo_default.png');

if (!fs.existsSync(iconSrc)) {
  console.error('No se encontró assets/icon.png');
  process.exit(1);
}

const iconBuffer = fs.readFileSync(iconSrc);
const logoBuffer = fs.existsSync(logoSrc) ? fs.readFileSync(logoSrc) : iconBuffer;
const icoBuffer = convertPngToIco(iconBuffer);

// 1. Ensure directories exist
[publicDir, srcAssetsImgDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 1b. Sincronizar copias dentro de assets/
fs.writeFileSync(path.join(assetsDir, 'logo_default.png'), iconBuffer);
fs.writeFileSync(path.join(assetsDir, 'favicon.png'), iconBuffer);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), iconBuffer);
fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), iconBuffer);

// 2. Write to public/
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
fs.writeFileSync(path.join(publicDir, 'favicon.png'), iconBuffer);
fs.writeFileSync(path.join(publicDir, 'icon.png'), iconBuffer);
fs.writeFileSync(path.join(publicDir, 'logo_default.png'), logoBuffer);
fs.writeFileSync(path.join(publicDir, 'crispy_burger_logo.png'), logoBuffer);
fs.writeFileSync(path.join(publicDir, 'logo192.png'), iconBuffer);
fs.writeFileSync(path.join(publicDir, 'logo512.png'), iconBuffer);
console.log('✅ Assets sincronizados en public/');

// 3. Write to src/assets/
fs.writeFileSync(path.join(rootDir, 'src', 'assets', 'logo.png'), logoBuffer);
fs.writeFileSync(path.join(rootDir, 'src', 'assets', 'logo_default.png'), logoBuffer);
fs.writeFileSync(path.join(rootDir, 'src', 'assets', 'icon.png'), iconBuffer);
fs.writeFileSync(path.join(srcAssetsImgDir, 'logo.png'), logoBuffer);
console.log('✅ Assets sincronizados en src/assets/');

// 4. Write to export/
fs.writeFileSync(path.join(exportDir, 'pizza_icon.ico'), icoBuffer);
fs.writeFileSync(path.join(exportDir, 'pizza_icon.png'), iconBuffer);
fs.writeFileSync(path.join(exportDir, 'Basilico.ico'), icoBuffer);
fs.writeFileSync(path.join(exportDir, 'Basilico.png'), iconBuffer);
console.log('✅ Assets sincronizados en export/');

// 5. If build exists, copy directly to build/ so running server catches it immediately
if (fs.existsSync(buildDir)) {
  fs.writeFileSync(path.join(buildDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'favicon.png'), iconBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), iconBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo_default.png'), logoBuffer);
  fs.writeFileSync(path.join(buildDir, 'crispy_burger_logo.png'), logoBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo192.png'), iconBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo512.png'), iconBuffer);
  console.log('✅ Assets sincronizados en build/');
}

// 6. Sincronizar íconos nativos de Android (mipmap-* y drawable-*), eliminando cualquier versión vieja (.webp / placeholder)
if (fs.existsSync(androidResDir)) {
  const mipmapSizes = [
    { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
    { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
    { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
    { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
    { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
  ];

  const drawableSizes = [
    { folder: 'drawable-mdpi', size: 144 },
    { folder: 'drawable-hdpi', size: 192 },
    { folder: 'drawable-xhdpi', size: 256 },
    { folder: 'drawable-xxhdpi', size: 384 },
    { folder: 'drawable-xxxhdpi', size: 512 },
  ];

  function writeResizedPng(srcPath, destPath, sizePx, padRatio = 0) {
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const psScript = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${srcPath.replace(/'/g, "''")}')
$bmp = New-Object System.Drawing.Bitmap(${sizePx}, ${sizePx})
$bmp.SetResolution(96, 96)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$pad = [int]([Math]::Round(${sizePx} * ${padRatio}))
$drawSize = ${sizePx} - ($pad * 2)
$g.DrawImage($src, $pad, $pad, $drawSize, $drawSize)
$g.Dispose()
$src.Dispose()
$bmp.Save('${destPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      fs.writeFileSync(destPath, iconBuffer);
      return true;
    }
  }

  for (const m of mipmapSizes) {
    const folderPath = path.join(androidResDir, m.folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    // Purgar archivos viejos .webp o .png para evitar conflicto de recursos en Gradle y limpiar el logo viejo
    for (const oldFile of [
      'ic_launcher.webp',
      'ic_launcher_round.webp',
      'ic_launcher_foreground.webp',
      'ic_launcher.png',
      'ic_launcher_round.png',
      'ic_launcher_foreground.png',
    ]) {
      const oldPath = path.join(folderPath, oldFile);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }

    writeResizedPng(iconSrc, path.join(folderPath, 'ic_launcher.png'), m.launcher, 0.04);
    writeResizedPng(iconSrc, path.join(folderPath, 'ic_launcher_round.png'), m.launcher, 0.04);
    writeResizedPng(iconSrc, path.join(folderPath, 'ic_launcher_foreground.png'), m.foreground, 0.18);
  }

  for (const d of drawableSizes) {
    const folderPath = path.join(androidResDir, d.folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const splashTarget = path.join(folderPath, 'splashscreen_logo.png');
    if (fs.existsSync(splashTarget)) {
      try { fs.unlinkSync(splashTarget); } catch (e) {}
    }
    writeResizedPng(iconSrc, splashTarget, d.size, 0.05);
  }

  // Logo oficial en drawable/ para MainActivity
  const mainDrawableDir = path.join(androidResDir, 'drawable');
  if (!fs.existsSync(mainDrawableDir)) fs.mkdirSync(mainDrawableDir, { recursive: true });
  writeResizedPng(iconSrc, path.join(mainDrawableDir, 'basilico_logo.png'), 256, 0.02);

  console.log('✅ Íconos nativos de Android (mipmap-* y drawable-*) actualizados con el logo oficial y limpiados de versiones viejas.');
}

console.log('🎉 Sincronización de assets completada con éxito.');

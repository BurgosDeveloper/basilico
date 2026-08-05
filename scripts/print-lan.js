const os = require('os');
const fs = require('fs');
const path = require('path');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
          return iface.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const lanIp = getLanIp();
const port = 3001;

// Escribir archivo de configuración de IP LAN para auto-detección en Android APK y clientes
const configDir = path.join(__dirname, '../src/config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const lanConfigFile = path.join(configDir, 'lanConfig.json');
const lanData = {
  lanIp: lanIp,
  backendUrl: `http://${lanIp}:${port}`,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(lanConfigFile, JSON.stringify(lanData, null, 2));

console.log('\n============================================================');
console.log(' 🍕 BASILICO PIZZERIA - SERVIDOR Y AUTO-DETECCIÓN LAN');
console.log('============================================================');
console.log(`  Local PC:         http://localhost:${port}`);
console.log(`  Red LAN Host IP:  http://${lanIp}:${port}`);
console.log(`  Configuración:   ${lanConfigFile}`);
console.log('\n  Acceso directo en Android / Tablets / Celulares en la misma red Wi-Fi:');
console.log(`  - Mesero:        http://${lanIp}:${port}/mesonero`);
console.log(`  - Cajero POS:    http://${lanIp}:${port}/caja`);
console.log(`  - Cocina KDS:    http://${lanIp}:${port}/cocina`);
console.log(`  - Administrador: http://${lanIp}:${port}/menu-admin`);
console.log('============================================================\n');

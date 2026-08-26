const { loadDualPrinterConfig, printTestTicket } = require('../server/helpers/thermalPrinter');

async function run() {
  const configs = loadDualPrinterConfig();
  const target = process.argv[2] || 'ambas'; // 'cocina', 'caja', 'ambas'

  console.log('====================================================');
  console.log('🖨️ PRUEBA DE CONEXIÓN A IMPRESORAS TÉRMICAS LAN');
  console.log('====================================================\n');
  console.log('Configuración actual detectada:');
  console.log(`🍳 Cocina: [${configs.cocina.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}] ${configs.cocina.host}:${configs.cocina.port}`);
  console.log(`💳 Caja:   [${configs.caja.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}] ${configs.caja.host}:${configs.caja.port}\n`);

  console.log(`Enviando ticket de prueba a destino: ${target.toUpperCase()}...`);
  const result = await printTestTicket(target);

  for (const r of result.results || []) {
    console.log(`✅ ¡Ticket emitido con éxito en ${r.printer.toUpperCase()} (${r.host}:${r.port})!`);
  }
  console.log('\n🎉 Prueba completada exitosamente.');
}

run().catch((error) => {
  console.error(`\n❌ No se pudo imprimir la prueba: ${error.message}`);
  console.error('Verifica que las impresoras estén encendidas, con papel y conectadas a la misma red Wi-Fi/LAN.');
  process.exitCode = 1;
});
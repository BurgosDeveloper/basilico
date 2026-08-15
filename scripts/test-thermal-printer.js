const { loadPrinterConfig, printKitchenTicket } = require('../server/helpers/thermalPrinter');

async function run() {
  const config = loadPrinterConfig();
  if (!config.enabled || !config.host) {
    throw new Error('Configura server/config/thermal-printer.json con enabled: true y la IP de la impresora antes de probar.');
  }

  const result = await printKitchenTicket({
    orderNumber: 'PRUEBA-TERMICA',
    type: 'mesa',
    tableNumber: 1,
    customerName: 'PRUEBA DE IMPRESION',
    waiterName: 'Sistema',
    createdAt: new Date().toISOString(),
    totalUSD: 0,
    kitchenNotes: 'Este ticket no crea ni modifica una comanda.',
    items: [{
      productName: 'Ticket de prueba 80 mm',
      quantity: 1,
      notes: 'Verificar ancho, corte y legibilidad.',
    }],
  });

  console.log(`Prueba enviada correctamente a ${config.host}:${config.port} (${result.copies} copia${result.copies === 1 ? '' : 's'}).`);
}

run().catch((error) => {
  console.error(`No se pudo imprimir la prueba: ${error.message}`);
  process.exitCode = 1;
});
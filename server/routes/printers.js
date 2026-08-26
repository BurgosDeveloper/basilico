const express = require('express');
const router = express.Router();
const { requireRole } = require('../helpers/sessionAuth');
const {
  loadDualPrinterConfig,
  saveDualPrinterConfig,
  printTestTicket,
} = require('../helpers/thermalPrinter');

module.exports = function(io) {
  // Obtener configuración de ambas impresoras
  router.get('/config', requireRole('caja', 'admin', 'mesero'), (req, res) => {
    try {
      const config = loadDualPrinterConfig();
      res.json(config);
    } catch (err) {
      console.error('Error al obtener config de impresoras:', err);
      res.status(500).json({ error: err.message || 'Error al obtener config de impresoras' });
    }
  });

  // Guardar configuración de impresoras (Solo Admin)
  router.post('/config', requireRole('admin'), (req, res) => {
    try {
      const { cocina, caja } = req.body || {};
      const updated = saveDualPrinterConfig({ cocina, caja });
      console.log('🖨️ [CONFIG IMPRESORAS ACTUALIZADA]:', updated);
      io.emit('printers:config_updated', updated);
      res.json({ success: true, config: updated });
    } catch (err) {
      console.error('Error al guardar config de impresoras:', err);
      res.status(500).json({ error: err.message || 'Error al guardar config de impresoras' });
    }
  });

  // Ejecutar impresión de prueba en cocina, caja o ambas
  router.post('/test', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { targetPrinter = 'caja' } = req.body || {};
      const result = await printTestTicket(targetPrinter);
      console.log(`🖨️ [TEST IMPRESORA ${targetPrinter.toUpperCase()}]: Exitoso.`);
      res.json(result);
    } catch (err) {
      console.error(`Error en test de impresora:`, err);
      res.status(502).json({ error: `No se pudo conectar con la impresora: ${err.message}` });
    }
  });

  return router;
};

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllTables } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const tables = await fetchAllTables(req.user);
      res.json(tables);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener mesas' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const { number, name, capacity, zone } = req.body;
      const id = `table-${Date.now()}`;
      
      const numInt = parseInt(number, 10);
      const tableName = name || `Mesa #${numInt}`;
      const tableCap = parseInt(capacity, 10) || 4;
      const tableZone = zone || 'Salón Principal';

      await query(
        `INSERT INTO tables_config (id, number, name, capacity, status, zone)
         VALUES ($1, $2, $3, $4, 'libre', $5)
         ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity, zone = EXCLUDED.zone`,
        [id, numInt, tableName, tableCap, tableZone]
      );

      const shiftTables = await fetchAllTables(req.user);
      io.to(`shift:${req.user.shift}`).emit('tables:sync', shiftTables);
      if (req.user.shift !== 'ambos') {
        const ambosTables = await fetchAllTables({ shift: 'ambos' });
        io.to('shift:ambos').emit('tables:sync', ambosTables);
      }
      res.status(201).json(shiftTables.find((t) => t.number === numInt));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear mesa' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { number, name, capacity, zone } = req.body;
      
      const numInt = parseInt(number, 10);
      const tableCap = parseInt(capacity, 10) || 4;

      await query(
        `UPDATE tables_config SET number = $1, name = $2, capacity = $3, zone = $4 WHERE id = $5`,
        [numInt, name, tableCap, zone, id]
      );

      const shiftTables = await fetchAllTables(req.user);
      io.to(`shift:${req.user.shift}`).emit('tables:sync', shiftTables);
      if (req.user.shift !== 'ambos') {
        const ambosTables = await fetchAllTables({ shift: 'ambos' });
        io.to('shift:ambos').emit('tables:sync', ambosTables);
      }
      res.json(shiftTables.find((t) => t.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar mesa' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM tables_config WHERE id = $1`, [id]);
      
      const shiftTables = await fetchAllTables(req.user);
      io.to(`shift:${req.user.shift}`).emit('tables:sync', shiftTables);
      if (req.user.shift !== 'ambos') {
        const ambosTables = await fetchAllTables({ shift: 'ambos' });
        io.to('shift:ambos').emit('tables:sync', ambosTables);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar mesa' });
    }
  });

  return router;
};

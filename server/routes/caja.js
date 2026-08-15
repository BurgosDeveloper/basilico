const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllOrders } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const params = req.user.shift === 'ambos' ? [] : [req.user.shift];
      const scope = params.length ? ' WHERE shift = $1' : '';
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura${scope} ORDER BY timestamp DESC LIMIT 1`, params
      );
      const { rows: txRows } = await query(
        `SELECT tx.*, o.order_number
         FROM caja_chica_transactions tx
         LEFT JOIN orders o ON o.id = tx.order_id
         ${scope ? 'WHERE tx.shift = $1' : ''}
         ORDER BY tx.timestamp DESC`, params
      );
      const { rows: cierreRows } = await query(
        `SELECT * FROM caja_chica_cierres${scope} ORDER BY closed_at DESC LIMIT 5`, params
      );

      return res.json({
        apertura: aperturaRows[0] ? {
          usdCash: parseFloat(aperturaRows[0].usd_cash),
          copCash: parseFloat(aperturaRows[0].cop_cash),
          openedAt: aperturaRows[0].timestamp,
          shift: aperturaRows[0].shift,
        } : { usdCash: 0, copCash: 0 },
        transacciones: txRows.map((t) => ({
          id: t.id,
          type: t.type,
          amountUSD: parseFloat(t.amount_usd),
          amountCOP: parseFloat(t.amount_cop),
          amountBs: parseFloat(t.amount_bs),
          currency: t.amount_bs > 0 ? 'Bs' : t.amount_cop > 0 ? 'COP' : 'USD',
          paymentMethod: t.payment_method,
          description: t.description,
          orderId: t.order_id || undefined,
          orderReference: t.order_id ? `Comanda ${t.order_number || t.order_id}` : 'Movimiento manual',
          timestamp: t.timestamp,
          shift: t.shift,
        })),
        ultimoCierre: cierreRows[0] ? {
          id: cierreRows[0].id,
          openedUSD: parseFloat(cierreRows[0].opened_usd) || 0,
          openedCOP: parseFloat(cierreRows[0].opened_cop) || 0,
          totalSalesUSD: parseFloat(cierreRows[0].total_sales_usd) || 0,
          expectedUSD: parseFloat(cierreRows[0].expected_usd) || 0,
          expectedCOP: parseFloat(cierreRows[0].expected_cop) || 0,
          actualUSD: parseFloat(cierreRows[0].actual_usd) || 0,
          actualCOP: parseFloat(cierreRows[0].actual_cop) || 0,
          differenceUSD: parseFloat(cierreRows[0].difference_usd) || 0,
          differenceCOP: parseFloat(cierreRows[0].difference_cop) || 0,
          closedAt: cierreRows[0].closed_at,
          closedBy: cierreRows[0].closed_by || 'Caja',
          notes: cierreRows[0].notes || '',
          shift: cierreRows[0].shift,
        } : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al consultar Caja Chica' });
    }
  });

  router.post('/apertura', requireRole('admin'), async (req, res) => {
    try {
      const { usdCash, copCash } = req.body;
      const apId = `ap-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, shift) VALUES ($1, $2, $3, $4)`,
        [apId, usdCash || 0, copCash || 0, req.user.shift]
      );

      io.to(`shift:${req.user.shift}`).emit('caja:updated');
      res.status(201).json({ success: true, usdCash, copCash });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al aperturar caja' });
    }
  });

  router.post('/transaction', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { type, amountUSD, amountCOP, amountBs, paymentMethod, description } = req.body;
      const normalizedUSD = Number(amountUSD) || 0;
      const normalizedCOP = Number(amountCOP) || 0;
      const normalizedBs = Number(amountBs) || 0;

      if (!['ingreso', 'egreso'].includes(type) || !Number.isFinite(normalizedUSD) || !Number.isFinite(normalizedCOP) || !Number.isFinite(normalizedBs) || normalizedUSD < 0 || normalizedCOP < 0 || normalizedBs < 0 || normalizedUSD + normalizedCOP + normalizedBs <= 0) {
        return res.status(400).json({ error: 'El movimiento debe tener tipo y un monto positivo válido.' });
      }

      if (typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
        return res.status(400).json({ error: 'El movimiento debe indicar un método de pago.' });
      }

      const txId = `tx-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, amount_bs, payment_method, description, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [txId, type, normalizedUSD, normalizedCOP, normalizedBs, paymentMethod.trim(), description || 'Movimiento manual', req.user.shift]
      );

      io.to(`shift:${req.user.shift}`).emit('caja:updated');
      res.status(201).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al registrar movimiento' });
    }
  });

  router.post('/cierre', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { actualUSD, actualCOP, notes } = req.body;
      const normalizedActualUSD = Number(actualUSD);
      const normalizedActualCOP = Number(actualCOP);
      if (!Number.isFinite(normalizedActualUSD) || !Number.isFinite(normalizedActualCOP) || normalizedActualUSD < 0 || normalizedActualCOP < 0) {
        return res.status(400).json({ error: 'Los conteos físicos USD y COP deben ser montos válidos no negativos.' });
      }

      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura WHERE shift = $1 ORDER BY timestamp DESC LIMIT 1`, [req.user.shift]
      );
      if (!aperturaRows[0]) {
        return res.status(409).json({ error: 'Debes registrar la apertura de caja del turno antes de hacer el arqueo.' });
      }
      const openedUSD = aperturaRows[0] ? parseFloat(aperturaRows[0].usd_cash) : 0;
      const openedCOP = aperturaRows[0] ? parseFloat(aperturaRows[0].cop_cash) : 0;
      const openedAt = aperturaRows[0] ? aperturaRows[0].timestamp : null;

      let txQuery = `SELECT * FROM caja_chica_transactions WHERE shift = $1`;
      let queryParams = [req.user.shift];
      if (openedAt) {
        txQuery += ` AND timestamp >= $2`;
        queryParams.push(openedAt);
      }
      const { rows: txRows } = await query(txQuery, queryParams);
      const physicalCashTransactions = txRows.filter((transaction) => ['Efectivo USD', 'Efectivo COP'].includes(transaction.payment_method));
      const totalIngresosUSD = physicalCashTransactions.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0);
      const totalIngresosCOP = physicalCashTransactions.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (parseFloat(t.amount_cop) || 0), 0);
      const totalEgresosUSD = physicalCashTransactions.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0);
      const totalEgresosCOP = physicalCashTransactions.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (parseFloat(t.amount_cop) || 0), 0);

      const expectedUSD = openedUSD + totalIngresosUSD - totalEgresosUSD;
      const expectedCOP = openedCOP + totalIngresosCOP - totalEgresosCOP;
      const diffUSD = normalizedActualUSD - expectedUSD;
      const diffCOP = normalizedActualCOP - expectedCOP;
      const cierreId = `cierre-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_cierres (id, opened_usd, opened_cop, total_sales_usd, expected_usd, expected_cop, actual_usd, actual_cop, difference_usd, difference_cop, closed_by, notes, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          cierreId,
          openedUSD,
          openedCOP,
          totalIngresosUSD,
          expectedUSD,
          expectedCOP,
          normalizedActualUSD,
          normalizedActualCOP,
          diffUSD,
          diffCOP,
          req.user.username,
          notes || 'Cierre de turno realizado',
          req.user.shift
        ]
      );

      io.to(`shift:${req.user.shift}`).emit('caja:updated');
      res.json({
        success: true,
        summary: {
          openedUSD,
          openedCOP,
          totalIngresosUSD,
          totalIngresosCOP,
          totalEgresosUSD,
          totalEgresosCOP,
          expectedUSD,
          expectedCOP,
          actualUSD: normalizedActualUSD,
          actualCOP: normalizedActualCOP,
          differenceUSD: diffUSD,
          differenceCOP: diffCOP,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al realizar cierre de caja' });
    }
  });

  router.get('/reporte-diario', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const orders = await fetchAllOrders();
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

      const byMethod = {
        Divisas: paidOrders.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0),
        COP: paidOrders.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0),
        Bs: paidOrders.filter((o) => o.paymentMethod === 'Bs').reduce((sum, o) => sum + o.totalUSD, 0),
        Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
      };

      const { rows: historyCierres } = await query(`SELECT * FROM caja_chica_cierres ORDER BY closed_at DESC`);

      res.json({
        totalSalesUSD: totalUSD,
        totalOrdersPaid: paidOrders.length,
        pendingOrders: orders.filter((o) => o.paymentStatus === 'no_pagado').length,
        byPaymentMethod: byMethod,
        historyCierres,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al generar reporte diario' });
    }
  });

  router.post('/ai-chat', async (req, res) => {
    try {
      const { message } = req.body;
      const lower = (message || '').toLowerCase();
      const orders = await fetchAllOrders();
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      let reply = 'Consulta procesada en Basilico.';

      if (lower.includes('pizza') || lower.includes('vendida') || lower.includes('top')) {
        const tally = {};
        paidOrders.forEach((o) => {
          o.items.forEach((it) => {
            tally[it.productName] = (tally[it.productName] || 0) + it.quantity;
          });
        });
        const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
          reply = '🍕 No hay registros de pizzas vendidas cobradas el día de hoy.';
        } else {
          reply = `🍕 Pizzas & Ítems Cobrados Hoy:\n` + entries.map(([name, qty]) => `• ${name}: ${qty} unidades`).join('\n');
        }
      } else if (lower.includes('bebida') || lower.includes('refresco') || lower.includes('tomar')) {
        let drinkQty = 0;
        paidOrders.forEach((o) => {
          o.items.forEach((it) => {
            if (it.productName.toLowerCase().includes('coca') || it.productName.toLowerCase().includes('agua') || it.productName.toLowerCase().includes('cerveza') || it.productName.toLowerCase().includes('jugo')) {
              drinkQty += it.quantity;
            }
          });
        });
        reply = `🥤 Total de Bebidas Cobradas hoy: ${drinkQty} unidades.`;
      } else if (lower.includes('caja') || lower.includes('cuadro') || lower.includes('resumen') || lower.includes('cierre')) {
        const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
        const pendingCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;
        reply = `💰 Resumen de Caja & Cierre:\n• Recaudado Total: $${totalUSD.toFixed(2)} USD\n• Comandas Cobradas: ${paidOrders.length}\n• Comandas Pendientes: ${pendingCount}`;
      } else {
        const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
        reply = `🤖 Asistente de Caja: Hay ${orders.length} comandas registradas (${paidOrders.length} cobradas) por un total de $${totalUSD.toFixed(2)} USD.`;
      }

      res.json({ reply });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en asistente de caja' });
    }
  });

  return router;
};

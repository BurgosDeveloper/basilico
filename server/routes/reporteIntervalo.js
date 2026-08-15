const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireRole } = require('../helpers/sessionAuth');
const { printReportTicket } = require('../helpers/thermalPrinter');

module.exports = function (io) {
  router.post('/reporte-intervalo/imprimir', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { reportType, data } = req.body || {};
      if (!['contable', 'pizzas', 'ingresos', 'egresos', 'cocina'].includes(reportType)) {
        return res.status(400).json({ error: 'El tipo de reporte no es válido.' });
      }
      if (!data || !Array.isArray(data.orders) || !Array.isArray(data.items) || !Array.isArray(data.payments) || !Array.isArray(data.transactions)) {
        return res.status(400).json({ error: 'No se recibió un reporte válido para imprimir.' });
      }

      const result = await printReportTicket(reportType, data);
      if (!result.printed) {
        return res.status(409).json({ error: 'La impresión térmica está deshabilitada.' });
      }
      return res.json({ success: true, copies: result.copies });
    } catch (error) {
      console.error('Error imprimiendo reporte térmico:', error);
      return res.status(502).json({ error: `No se pudo imprimir el reporte: ${error.message}` });
    }
  });

  // GET /api/caja/reporte-intervalo?from=...&to=...
  router.get('/reporte-intervalo', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: 'Se requieren parámetros from y to.' });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Fechas inválidas.' });
      }
      if (fromDate > toDate) {
        return res.status(400).json({ error: 'Fecha inicio debe ser menor o igual a fecha fin.' });
      }
      const shiftScope = req.user.shift === 'ambos' ? '' : ' AND orders.shift = $3';
      const shiftParams = req.user.shift === 'ambos' ? [from, to] : [from, to, req.user.shift];

      // 1. Órdenes pagadas con al menos un cobro registrado en el rango.
      const { rows: orderRows } = await query(
        `SELECT * FROM orders
         WHERE payment_status = 'pagado'
           AND status != 'cancelado'
           AND EXISTS (
             SELECT 1 FROM order_payments op
             WHERE op.order_id = orders.id
               AND op.created_at >= $1 AND op.created_at <= $2
           )
           ${shiftScope}
         ORDER BY created_at ASC`,
        shiftParams
      );

      const orderIds = orderRows.map((o) => o.id);

      // 2. Items de esas órdenes
      let itemRows = [];
      if (orderIds.length > 0) {
        const { rows } = await query(
          `SELECT oi.*, o.order_number, COALESCE(p.category, 'Sin categoría') AS category FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = ANY($1::text[])`,
          [orderIds]
        );
        itemRows = rows;
      }

      // 3. Pagos de esas órdenes
      const { rows: paymentRows } = await query(
        `SELECT op.*, o.order_number FROM order_payments op
         JOIN orders o ON o.id = op.order_id
         WHERE op.created_at >= $1 AND op.created_at <= $2
           ${req.user.shift === 'ambos' ? '' : 'AND o.shift = $3'}
         ORDER BY op.created_at ASC`,
        shiftParams
      );

      // 4. Transacciones de caja en el rango
      const { rows: txRows } = await query(
        `SELECT tx.*, o.order_number
         FROM caja_chica_transactions tx
         LEFT JOIN orders o ON o.id = tx.order_id
         WHERE tx.timestamp >= $1 AND tx.timestamp <= $2
          ${req.user.shift === 'ambos' ? '' : 'AND tx.shift = $3'}
         ORDER BY tx.timestamp ASC`,
        shiftParams
      );

      // 5. Ediciones de órdenes en el rango
      let editRows = [];
      try {
        const { rows } = await query(
          `SELECT oe.* FROM order_edits oe
           JOIN orders o ON o.id = oe.order_id
           WHERE oe.created_at >= $1 AND oe.created_at <= $2
           ${req.user.shift === 'ambos' ? '' : 'AND o.shift = $3'}
           ORDER BY created_at ASC`,
          shiftParams
        );
        editRows = rows;
      } catch (e) {
        // Tabla puede no existir aún
        console.warn('Aviso: tabla order_edits no disponible:', e.message);
      }

      // 6. Tasas de cambio actuales
      const { rows: rateRows } = await query(
        `SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = $1`,
        [req.user.shift]
      );
      const copRate = Number(rateRows[0]?.cop_rate) || 3950;
      const bsRate = Number(rateRows[0]?.bs_rate) || 36.5;

      // Construir respuesta estructurada
      const orders = orderRows.map((ord) => ({
        id: ord.id,
        orderNumber: ord.order_number,
        type: ord.type,
        tableNumber: ord.table_number,
        customerName: ord.customer_name,
        status: ord.status,
        paymentStatus: ord.payment_status,
        paymentMethod: ord.payment_method,
        totalUSD: parseFloat(ord.total_usd) || 0,
        paidAmountUSD: parseFloat(ord.paid_amount_usd) || 0,
        copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || copRate,
        bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || bsRate,
        createdAt: ord.created_at,
        isEdited: !!ord.is_edited,
      }));

      const items = itemRows.map((it) => ({
        id: it.id,
        orderId: it.order_id,
        orderNumber: it.order_number,
        productName: it.product_name,
        price: parseFloat(it.price) || 0,
        quantity: it.quantity || 1,
        category: it.category || 'Sin categoría',
      }));

      const payments = paymentRows.map((pm) => ({
        id: pm.id,
        orderId: pm.order_id,
        orderNumber: pm.order_number,
        payerName: pm.payer_name || 'Cliente General',
        paymentMethod: pm.payment_method,
        amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
        cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
        cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
        cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
        changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
        changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
        changeGivenBs: parseFloat(pm.change_given_bs) || 0,
        copRate: parseFloat(pm.cop_rate) || copRate,
        bsRate: parseFloat(pm.bs_rate) || bsRate,
        createdAt: pm.created_at,
      }));

      const transactions = txRows.map((t) => ({
        id: t.id,
        type: t.type,
        amountUSD: parseFloat(t.amount_usd) || 0,
        amountCOP: parseFloat(t.amount_cop) || 0,
        amountBs: parseFloat(t.amount_bs) || 0,
        paymentMethod: t.payment_method,
        description: t.description,
        orderId: t.order_id,
        orderNumber: t.order_number,
        timestamp: t.timestamp,
      }));

      const edits = editRows.map((e) => ({
        id: e.id,
        orderId: e.order_id,
        orderNumber: e.order_number,
        editedBy: e.edited_by || 'admin',
        editType: e.edit_type || 'modificacion',
        editDetails: e.edit_details || '',
        createdAt: e.created_at,
      }));

      res.json({
        orders,
        items,
        payments,
        transactions,
        edits,
        exchangeRates: { COP: copRate, Bs: bsRate },
        dateRange: { from, to },
      });
    } catch (err) {
      console.error('Error generando reporte por intervalo:', err);
      res.status(500).json({ error: 'Error al generar el reporte por intervalo.' });
    }
  });

  return router;
};

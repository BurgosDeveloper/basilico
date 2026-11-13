const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllOrders, fetchAllTables, safeJsonParse, safeJsonParseObj } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');
const { printCierreShiftTicket } = require('../helpers/thermalPrinter');
const { syncOrdersAndTables } = require('../helpers/shiftSync');

module.exports = function(io) {
  router.get('/', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const activeShift = (req.user && req.user.shift && req.user.shift !== 'ambos')
        ? req.user.shift
        : (req.query.shift && req.query.shift !== 'ambos' ? req.query.shift : null);
      const shiftWhereAp = activeShift ? 'WHERE shift = $1' : '';
      const shiftParamsAp = activeShift ? [activeShift] : [];
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura ${shiftWhereAp} ORDER BY timestamp DESC LIMIT 1`,
        shiftParamsAp
      );

      const shiftWhereTx = activeShift ? 'AND tx.shift = $1' : '';
      const shiftParamsTx = activeShift ? [activeShift] : [];
      const { rows: txRows } = await query(
        `SELECT tx.*, o.order_number
         FROM caja_chica_transactions tx
         LEFT JOIN orders o ON o.id = tx.order_id
         WHERE tx.cierre_id IS NULL ${shiftWhereTx}
         ORDER BY tx.timestamp DESC`,
        shiftParamsTx
      );

      const shiftWhereCierre = activeShift ? 'WHERE shift = $1' : '';
      const shiftParamsCierre = activeShift ? [activeShift] : [];
      const { rows: cierreRows } = await query(
        `SELECT * FROM caja_chica_cierres ${shiftWhereCierre} ORDER BY closed_at DESC LIMIT 5`,
        shiftParamsCierre
      );

      return res.json({
        apertura: aperturaRows[0] ? {
          usdCash: parseFloat(aperturaRows[0].usd_cash),
          copCash: parseFloat(aperturaRows[0].cop_cash),
          openedAt: aperturaRows[0].timestamp,
          shift: aperturaRows[0].shift || activeShift || 'ambos',
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
          shift: t.shift || activeShift || 'ambos',
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
          shift: cierreRows[0].shift || activeShift || 'ambos',
        } : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al consultar Caja Chica' });
    }
  });

  router.post('/apertura', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { usdCash, copCash } = req.body;
      const activeShift = (req.user && req.user.shift && req.user.shift !== 'ambos')
        ? req.user.shift
        : (req.body.shift && req.body.shift !== 'ambos' ? req.body.shift : 'noche');
      const apId = `ap-${Date.now()}`;
      const normalizedUSD = Math.max(0, parseFloat(usdCash) || 0);
      const normalizedCOP = Math.max(0, parseFloat(copCash) || 0);

      await query(`DELETE FROM caja_chica_apertura WHERE shift = $1`, [activeShift]);
      await query(
        `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, shift) VALUES ($1, $2, $3, $4)`,
        [apId, normalizedUSD, normalizedCOP, activeShift]
      );

      // Registro forense inmutable en order_edits
      try {
        const editId = `edit-ap-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const user = req.user?.username || 'caja';
        await query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details)
           VALUES ($1, NULL, 'Caja Chica', $2, $3, $4)`,
          [
            editId,
            user,
            'apertura_caja',
            `APERTURA DE CAJA: $${normalizedUSD.toFixed(2)} USD / $${Math.round(normalizedCOP).toLocaleString()} COP (Turno: ${activeShift}).`
          ]
        );
      } catch (auditErr) {
        console.warn('Aviso: No se pudo registrar auditoría de apertura:', auditErr.message);
      }

      io.emit('caja:updated');
      res.status(201).json({ success: true, usdCash: normalizedUSD, copCash: normalizedCOP, shift: activeShift });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al aperturar caja' });
    }
  });

  router.post('/transaction', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { type, amountUSD, amountCOP, amountBs, paymentMethod, description } = req.body;
      const activeShift = (req.user && req.user.shift && req.user.shift !== 'ambos')
        ? req.user.shift
        : (req.body.shift && req.body.shift !== 'ambos' ? req.body.shift : 'noche');
      const normalizedUSD = Number(amountUSD) || 0;
      const normalizedCOP = Number(amountCOP) || 0;
      const normalizedBs = Number(amountBs) || 0;

      if (!['ingreso', 'egreso'].includes(type) || !Number.isFinite(normalizedUSD) || !Number.isFinite(normalizedCOP) || !Number.isFinite(normalizedBs) || normalizedUSD < 0 || normalizedCOP < 0 || normalizedBs < 0 || normalizedUSD + normalizedCOP + normalizedBs <= 0) {
        return res.status(400).json({ error: 'El movimiento debe tener tipo y un monto positivo válido.' });
      }

      if (normalizedUSD >= 1000 || (type === 'egreso' && normalizedUSD > 500)) {
        return res.status(400).json({
          error: `El monto en Dólares ($${normalizedUSD.toLocaleString()} USD) excede el límite permitido y parece corresponder a Pesos Colombianos (COP). Si el movimiento es en Pesos, selecciona la moneda COP.`,
        });
      }

      if (typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
        return res.status(400).json({ error: 'El movimiento debe indicar un método de pago.' });
      }

      const txId = `tx-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, amount_bs, payment_method, description, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [txId, type, normalizedUSD, normalizedCOP, normalizedBs, paymentMethod.trim(), description || 'Movimiento manual', activeShift]
      );

      // Registro forense inmutable en order_edits
      try {
        const editId = `edit-caja-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const amountsList = [];
        if (normalizedUSD > 0) amountsList.push(`$${normalizedUSD.toFixed(2)} USD`);
        if (normalizedCOP > 0) amountsList.push(`$${Math.round(normalizedCOP).toLocaleString('es-CO')} COP`);
        if (normalizedBs > 0) amountsList.push(`Bs ${normalizedBs.toFixed(2)}`);
        const amountDisplay = amountsList.join(' / ') || '$0.00';

        const actionTitle = type === 'egreso' ? 'EGRESO MANUAL' : 'INGRESO MANUAL';
        const editType = type === 'egreso' ? 'egreso_caja' : 'ingreso_caja';
        const user = req.user?.username || 'caja';

        await query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details)
           VALUES ($1, NULL, 'Caja Chica', $2, $3, $4)`,
          [
            editId,
            user,
            editType,
            `${actionTitle}: ${amountDisplay} (${paymentMethod.trim()}). Motivo: "${description || 'Movimiento manual'}".`
          ]
        );
      } catch (cajaAuditErr) {
        console.warn('Aviso: No se pudo registrar auditoría de caja chica:', cajaAuditErr.message);
      }

      io.emit('caja:updated');
      res.status(201).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al registrar movimiento' });
    }
  });

  router.post('/cierre', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { actualUSD, actualCOP, notes } = req.body;
      const activeShift = (req.user && req.user.shift && req.user.shift !== 'ambos')
        ? req.user.shift
        : (req.body.shift && req.body.shift !== 'ambos' ? req.body.shift : 'noche');

      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura WHERE shift = $1 ORDER BY timestamp DESC LIMIT 1`,
        [activeShift]
      );
      const openedUSD = aperturaRows[0] ? parseFloat(aperturaRows[0].usd_cash) || 0 : 0;
      const openedCOP = aperturaRows[0] ? parseFloat(aperturaRows[0].cop_cash) || 0 : 0;
      const openedAt = aperturaRows[0] ? aperturaRows[0].timestamp : null;

      let txQuery = `SELECT * FROM caja_chica_transactions WHERE cierre_id IS NULL AND shift = $1`;
      let queryParams = [activeShift];
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

      const normalizedActualUSD = (actualUSD !== undefined && actualUSD !== null && actualUSD !== '' && Number.isFinite(Number(actualUSD)))
        ? Number(actualUSD)
        : expectedUSD;
      const normalizedActualCOP = (actualCOP !== undefined && actualCOP !== null && actualCOP !== '' && Number.isFinite(Number(actualCOP)))
        ? Number(actualCOP)
        : expectedCOP;

      const diffUSD = normalizedActualUSD - expectedUSD;
      const diffCOP = normalizedActualCOP - expectedCOP;

      // 1. Obtener desglose por método de pago de los pedidos del turno activo (Venta Neta Facturada)
      const { rows: paymentMethodRows } = await query(
        `SELECT op.payment_method, 
                SUM(CASE 
                  WHEN op.payment_method IN ('Efectivo USD', 'Zelle', 'Binance') 
                  THEN COALESCE(NULLIF(op.cash_tendered_usd, 0), op.amount_paid_usd) - COALESCE(op.change_given_usd, 0)
                  ELSE op.amount_paid_usd 
                END) as total_usd,
                SUM(CASE 
                  WHEN op.payment_method IN ('Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP') 
                  THEN COALESCE(NULLIF(op.cash_tendered_cop, 0), op.amount_paid_usd * op.cop_rate) - COALESCE(op.change_given_cop, 0)
                  ELSE 0 
                END) as total_cop,
                SUM(CASE 
                  WHEN op.payment_method IN ('Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito') 
                  THEN COALESCE(NULLIF(op.cash_tendered_bs, 0), op.amount_paid_usd * op.bs_rate) - COALESCE(op.change_given_bs, 0)
                  ELSE 0 
                END) as total_bs,
                COUNT(op.id) as count
         FROM order_payments op
         INNER JOIN orders o ON o.id = op.order_id
         WHERE o.archived_at IS NULL AND o.shift = $1
         GROUP BY op.payment_method
         ORDER BY total_usd DESC`,
        [activeShift]
      );

      // 2. Obtener resumen de créditos y órdenes procesadas del turno activo
      const { rows: creditSummaryRows } = await query(
        `SELECT COUNT(id) as count, COALESCE(SUM(total_usd), 0) as total_usd
         FROM orders
         WHERE payment_status = 'credito' AND archived_at IS NULL AND shift = $1`,
        [activeShift]
      );

      const { rows: shiftOrdersRows } = await query(
        `SELECT id, order_number, type, customer_name, total_usd, delivery_fee_usd, payment_status, status, table_number, created_at
         FROM orders
         WHERE archived_at IS NULL AND shift = $1
         ORDER BY created_at ASC`,
        [activeShift]
      );

      const totalSalesUSD = shiftOrdersRows
        .filter((o) => o.payment_status === 'pagado' || o.payment_status === 'credito')
        .reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);

      const cierreId = `cierre-${Date.now()}`;

      // 3. Guardar registro en histórico de cierres
      await query(
        `INSERT INTO caja_chica_cierres (id, opened_usd, opened_cop, total_sales_usd, expected_usd, expected_cop, actual_usd, actual_cop, difference_usd, difference_cop, closed_by, notes, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          cierreId,
          openedUSD,
          openedCOP,
          totalSalesUSD,
          expectedUSD,
          expectedCOP,
          normalizedActualUSD,
          normalizedActualCOP,
          diffUSD,
          diffCOP,
          req.user.username || 'Caja',
          notes || 'Cierre de caja realizado',
          activeShift
        ]
      );

      // 4. Impresión Térmica Automática del Cierre y Arqueo (Enriquecido con data completa del turno)
      try {
        const allShiftOrderIds = shiftOrdersRows.map((o) => o.id);

        let shiftItems = [];
        if (allShiftOrderIds.length > 0) {
          const { rows: itemsRows } = await query(
            `SELECT oi.*, o.order_number, COALESCE(NULLIF(oi.category, ''), p.category, 'Sin categoría') AS category
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             LEFT JOIN LATERAL (
               SELECT pr.category
               FROM products pr
               WHERE (pr.id = oi.product_id OR LOWER(pr.name) = LOWER(oi.product_name))
               ORDER BY
                 CASE WHEN pr.id = oi.product_id THEN 0 ELSE 1 END,
                 CASE WHEN pr.shift = o.shift THEN 0 WHEN pr.shift = 'ambos' THEN 1 ELSE 2 END,
                 pr.created_at DESC
               LIMIT 1
             ) p ON true
             WHERE oi.order_id = ANY($1::text[])`,
            [allShiftOrderIds]
          );
          shiftItems = itemsRows.map((it) => {
            let extras = [];
            try {
              if (it.extras_json) {
                extras = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json) : it.extras_json;
              }
            } catch (e) {}
            return {
              id: it.id,
              orderId: it.order_id,
              orderNumber: String(it.order_number || '').replace(/^#+/, ''),
              productName: it.product_name,
              price: parseFloat(it.price) || 0,
              quantity: it.quantity || 1,
              category: it.category || 'Sin categoría',
              drinkType: it.drink_type,
              flavor: it.flavor || undefined,
              extras,
            };
          });
        }

        let shiftPayments = [];
        if (allShiftOrderIds.length > 0) {
          const { rows: payRows } = await query(
            `SELECT op.*, o.order_number
             FROM order_payments op
             JOIN orders o ON o.id = op.order_id
             WHERE op.order_id = ANY($1::text[])
             ORDER BY op.created_at ASC`,
            [allShiftOrderIds]
          );
          shiftPayments = payRows.map((pm) => ({
            id: pm.id,
            orderId: pm.order_id,
            orderNumber: String(pm.order_number || '').replace(/^#+/, ''),
            payerName: pm.payer_name || 'Cliente General',
            paymentMethod: pm.payment_method,
            amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
            cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
            cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
            cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
            changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
            changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
            changeGivenBs: parseFloat(pm.change_given_bs) || 0,
            copRate: parseFloat(pm.cop_rate) || 3950,
            bsRate: parseFloat(pm.bs_rate) || 36.5,
            createdAt: pm.created_at,
          }));
        }

        const mappedOrders = shiftOrdersRows.map((ord) => ({
          id: ord.id,
          orderNumber: String(ord.order_number || '').replace(/^#+/, ''),
          type: ord.type,
          customerName: ord.customer_name,
          paymentStatus: ord.payment_status,
          status: ord.status,
          tableNumber: ord.table_number,
          totalUSD: parseFloat(ord.total_usd) || 0,
          deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
          createdAt: ord.created_at,
        }));

        const { rows: rateRows } = await query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = $1`, [activeShift]);
        const fallbackRate = rateRows[0] || (await query(`SELECT cop_rate, bs_rate FROM shift_exchange_rates WHERE shift = 'ambos'`)).rows[0];
        const currentRates = {
          COP: Number(fallbackRate?.cop_rate) || 3950,
          Bs: Number(fallbackRate?.bs_rate) || 36.5,
        };

        const { rows: prodRows } = await query(
          `SELECT id, name, price, price_small, category, shift FROM products WHERE shift = $1 OR shift = 'ambos'`,
          [activeShift]
        );

        await printCierreShiftTicket({
          shift: activeShift,
          closedBy: req.user.username || 'Caja',
          notes: notes || 'Cierre de caja',
          openedUSD,
          openedCOP,
          expectedUSD,
          expectedCOP,
          actualUSD: normalizedActualUSD,
          actualCOP: normalizedActualCOP,
          differenceUSD: diffUSD,
          differenceCOP: diffCOP,
          totalSalesUSD,
          totalOrdersCount: shiftOrdersRows.length,
          paymentMethods: paymentMethodRows,
          creditsUSD: parseFloat(creditSummaryRows[0]?.total_usd || 0),
          creditsCount: parseInt(creditSummaryRows[0]?.count || 0, 10),
          orders: mappedOrders,
          items: shiftItems,
          products: prodRows,
          payments: shiftPayments,
          exchangeRates: currentRates,
          transactions: txRows.map((t) => ({
            id: t.id,
            type: t.type,
            amountUSD: parseFloat(t.amount_usd) || 0,
            amountCOP: parseFloat(t.amount_cop) || 0,
            amountBs: parseFloat(t.amount_bs) || 0,
            paymentMethod: t.payment_method,
            description: t.description,
            orderId: t.order_id,
            timestamp: t.timestamp,
          })),
          apertura: {
            usdCash: openedUSD,
            copCash: openedCOP,
            openedAt: openedAt,
          },
        });
        console.log(`🖨️ [IMPRESIÓN AUTOMÁTICA DE CIERRE] Ticket de cierre (${activeShift.toUpperCase()}) emitido exitosamente.`);
      } catch (printErr) {
        console.warn(`⚠️ Aviso: no se pudo imprimir ticket de cierre térmico:`, printErr.message);
      }

      // 5. Archivado de turno: Archivar TODAS las comandas del turno activo
      const allShiftOrderIds = shiftOrdersRows.map((o) => o.id);

      if (allShiftOrderIds.length > 0) {
        await query('UPDATE orders SET archived_at = CURRENT_TIMESTAMP WHERE id = ANY($1::text[]) AND shift = $2 AND archived_at IS NULL', [allShiftOrderIds, activeShift]);
        console.log(`📦 [ARCHIVADO DE TURNO ${activeShift.toUpperCase()}] Se archivaron ${allShiftOrderIds.length} comandas del turno.`);
      }

      // 7. Marcar movimientos de caja chica con el cierreId (preservados en BD) y reiniciar apertura del turno
      await query('UPDATE caja_chica_transactions SET cierre_id = $1 WHERE cierre_id IS NULL AND shift = $2', [cierreId, activeShift]);
      await query('DELETE FROM caja_chica_apertura WHERE shift = $1', [activeShift]);

      // 8. Liberar mesas que ya no tengan órdenes activas en ningún turno
      await query(`UPDATE tables_config SET status = 'libre' WHERE number NOT IN (
        SELECT table_number FROM orders WHERE type = 'mesa' AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL
      )`);

      // 9. Sincronización en tiempo real vía WebSocket
      await syncOrdersAndTables(io, activeShift);
      io.emit('caja:updated');

      res.json({
        success: true,
        message: `Cierre de caja del turno ${activeShift.toUpperCase()} completado exitosamente. Toda la información histórica queda preservada en la base de datos.`,
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
          totalSalesUSD,
          purgedOrdersCount: allShiftOrderIds.length,
          archivedCreditsCount: shiftOrdersRows.filter((o) => o.payment_status === 'credito').length,
          shift: activeShift,
        },
      });
    } catch (err) {
      console.error('Error al realizar cierre de caja:', err);
      res.status(500).json({ error: 'Error al realizar cierre de caja' });
    }
  });

  router.get('/reporte-diario', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const activeShift = (req.user && req.user.shift && req.user.shift !== 'ambos') ? req.user.shift : null;
      const orders = await fetchAllOrders(req.user);
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

      const byMethod = {
        Divisas: paidOrders.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0),
        COP: paidOrders.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0),
        Bs: paidOrders.filter((o) => o.paymentMethod === 'Bs').reduce((sum, o) => sum + o.totalUSD, 0),
        Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
      };

      const shiftWhere = activeShift ? 'WHERE shift = $1' : '';
      const shiftParams = activeShift ? [activeShift] : [];
      const { rows: historyCierres } = await query(`SELECT * FROM caja_chica_cierres ${shiftWhere} ORDER BY closed_at DESC`, shiftParams);

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

  // Consulta forense y búsqueda de comandas históricas (de cualquier día o rango, archivadas o activas)
  router.get('/comandas-historicas', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const {
        from,
        to,
        search,
        shift,
        paymentStatus,
        orderType,
        archived,
        limit = 50,
        page = 1,
      } = req.query;

      // Determinar ámbito de turno según rol y parámetros (respetando GUIA.md)
      let targetShift = null;
      if (shift && shift !== 'todos' && shift !== 'ambos') {
        targetShift = shift;
      } else if (!shift && req.user && req.user.shift && req.user.shift !== 'ambos' && req.user.role !== 'admin') {
        targetShift = req.user.shift;
      }

      // Normalizar fechas para matching de timestamp en PostgreSQL
      let fromClean = from ? String(from).trim().replace('T', ' ') : null;
      let toClean = to ? String(to).trim().replace('T', ' ') : null;
      if (fromClean) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(fromClean)) fromClean += ' 00:00:00';
        else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fromClean)) fromClean += ':00';
      }
      if (toClean) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(toClean)) toClean += ' 23:59:59.999';
        else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(toClean)) toClean += ':59.999';
        else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(toClean)) toClean += '.999';
      }

      const whereClauses = [];
      const params = [];

      if (fromClean) {
        params.push(fromClean);
        whereClauses.push(`orders.created_at >= $${params.length}`);
      }
      if (toClean) {
        params.push(toClean);
        whereClauses.push(`orders.created_at <= $${params.length}`);
      }
      if (targetShift === 'manana') {
        whereClauses.push(`(
          orders.shift = 'manana'
          OR (
            (orders.shift = 'ambos' OR orders.shift IS NULL)
            AND EXTRACT(HOUR FROM (orders.created_at AT TIME ZONE 'America/Caracas')) >= 6
            AND EXTRACT(HOUR FROM (orders.created_at AT TIME ZONE 'America/Caracas')) < 17
          )
        )`);
      } else if (targetShift === 'noche') {
        whereClauses.push(`(
          orders.shift = 'noche'
          OR (
            (orders.shift = 'ambos' OR orders.shift IS NULL)
            AND (
              EXTRACT(HOUR FROM (orders.created_at AT TIME ZONE 'America/Caracas')) < 6
              OR EXTRACT(HOUR FROM (orders.created_at AT TIME ZONE 'America/Caracas')) >= 17
            )
          )
        )`);
      }
      if (paymentStatus && paymentStatus !== 'todos') {
        params.push(paymentStatus);
        whereClauses.push(`orders.payment_status = $${params.length}`);
      }
      if (orderType && orderType !== 'todos') {
        params.push(orderType);
        whereClauses.push(`orders.type = $${params.length}`);
      }
      if (archived === 'archived') {
        whereClauses.push(`orders.archived_at IS NOT NULL`);
      } else if (archived === 'active') {
        whereClauses.push(`orders.archived_at IS NULL`);
      }

      if (search && search.trim()) {
        const term = search.trim();
        params.push(`%${term}%`);
        const pIdx = params.length;
        if (/^\d+$/.test(term)) {
          params.push(parseInt(term, 10));
          const numIdx = params.length;
          whereClauses.push(`(
            orders.order_number ILIKE $${pIdx} 
            OR orders.customer_name ILIKE $${pIdx} 
            OR orders.debtor_name ILIKE $${pIdx} 
            OR orders.notes ILIKE $${pIdx} 
            OR orders.kitchen_notes ILIKE $${pIdx} 
            OR orders.waiter_name ILIKE $${pIdx}
            OR orders.table_number = $${numIdx}
          )`);
        } else {
          whereClauses.push(`(
            orders.order_number ILIKE $${pIdx} 
            OR orders.customer_name ILIKE $${pIdx} 
            OR orders.debtor_name ILIKE $${pIdx} 
            OR orders.notes ILIKE $${pIdx} 
            OR orders.kitchen_notes ILIKE $${pIdx} 
            OR orders.waiter_name ILIKE $${pIdx}
          )`);
        }
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // 1. Resumen y métricas de coincidencias
      const countSql = `
        SELECT 
          COUNT(*)::int AS total_count,
          COALESCE(SUM(total_usd), 0)::numeric AS total_usd,
          COALESCE(SUM(paid_amount_usd), 0)::numeric AS total_paid_usd
        FROM orders
        ${whereSql}
      `;
      const { rows: countRows } = await query(countSql, params);
      const totalCount = parseInt(countRows[0]?.total_count || 0, 10);
      const totalUSD = parseFloat(countRows[0]?.total_usd || 0);
      const totalPaidUSD = parseFloat(countRows[0]?.total_paid_usd || 0);

      // 2. Paginación segura
      const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 300);
      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const offset = (parsedPage - 1) * parsedLimit;
      const totalPages = Math.max(1, Math.ceil(totalCount / parsedLimit));

      const queryParams = [...params, parsedLimit, offset];
      const ordersSql = `
        SELECT * FROM orders
        ${whereSql}
        ORDER BY orders.created_at DESC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `;
      const { rows: orderRows } = await query(ordersSql, queryParams);

      const orderIds = orderRows.map((o) => o.id);
      let itemsRows = [];
      let paymentsRows = [];

      if (orderIds.length > 0) {
        const { rows: fetchedItems } = await query(
          `SELECT oi.*, p.default_proteins 
           FROM order_items oi
           LEFT JOIN orders ord_shift ON ord_shift.id = oi.order_id
           LEFT JOIN LATERAL (
             SELECT pr.default_proteins
             FROM products pr
             WHERE (pr.id = oi.product_id OR LOWER(pr.name) = LOWER(oi.product_name))
             ORDER BY
               CASE WHEN pr.id = oi.product_id THEN 0 ELSE 1 END,
               CASE WHEN pr.shift = ord_shift.shift THEN 0 WHEN pr.shift = 'ambos' THEN 1 ELSE 2 END,
               pr.created_at DESC
             LIMIT 1
           ) p ON true
           WHERE oi.order_id = ANY($1::text[])`,
          [orderIds]
        );
        itemsRows = fetchedItems;

        const { rows: fetchedPayments } = await query(
          `SELECT * FROM order_payments WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC`,
          [orderIds]
        );
        paymentsRows = fetchedPayments;
      }

      // 3. Mapeo forense completo idéntico al modelo Order
      const mappedOrders = orderRows.map((ord) => ({
        id: ord.id,
        orderNumber: ord.order_number,
        type: ord.type,
        tableNumber: ord.table_number,
        customerName: ord.customer_name,
        status: ord.status,
        paymentStatus: ord.payment_status,
        paymentMethod: ord.payment_method,
        totalUSD: parseFloat(ord.total_usd) || 0,
        paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' || ord.payment_status === 'credito' ? parseFloat(ord.total_usd) : 0),
        copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3950,
        bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 36.5,
        waiterName: ord.waiter_name || 'Mesero',
        kitchenNotes: ord.kitchen_notes,
        notes: ord.notes || undefined,
        debtorName: ord.debtor_name || ord.notes || undefined,
        isEdited: !!ord.is_edited,
        mergedFromOrders: ord.merged_from_orders || [],
        deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
        shift: (ord.shift === 'manana' || ord.shift === 'noche')
          ? ord.shift
          : (() => {
              const dt = new Date(ord.created_at);
              const caracasHour = (dt.getUTCHours() - 4 + 24) % 24;
              return (caracasHour >= 6 && caracasHour < 17) ? 'manana' : 'noche';
            })(),
        archivedAt: ord.archived_at,
        createdAt: ord.created_at,
        paymentHistory: paymentsRows
          .filter((pm) => pm.order_id === ord.id)
          .map((pm) => ({
            id: pm.id,
            orderId: pm.order_id,
            payerName: pm.payer_name || 'Cliente General',
            paymentMethod: pm.payment_method,
            method: pm.payment_method,
            entryType: (parseFloat(pm.change_given_usd || 0) > 0 || parseFloat(pm.change_given_cop || 0) > 0 || parseFloat(pm.change_given_bs || 0) > 0) ? 'change' : 'payment',
            currency: (parseFloat(pm.cash_tendered_cop || 0) > 0 || parseFloat(pm.change_given_cop || 0) > 0 || (pm.payment_method && (pm.payment_method.includes('COP') || pm.payment_method.includes('Bancolombia') || pm.payment_method.includes('Nequi'))))
              ? 'COP'
              : (parseFloat(pm.cash_tendered_bs || 0) > 0 || parseFloat(pm.change_given_bs || 0) > 0 || (pm.payment_method && (pm.payment_method.includes('Bs') || pm.payment_method.includes('Movil') || pm.payment_method.includes('Debito') || pm.payment_method.includes('Tarjeta de Crédito'))))
              ? 'Bs'
              : 'USD',
            amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
            cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
            cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
            cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
            changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
            changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
            changeGivenBs: parseFloat(pm.change_given_bs) || 0,
            copRate: parseFloat(pm.cop_rate) || 3950,
            bsRate: parseFloat(pm.bs_rate) || 36.5,
            itemIds: pm.item_ids || [],
            createdAt: pm.created_at,
          })),
        items: itemsRows
          .filter((it) => it.order_id === ord.id)
          .map((it) => ({
            id: it.id,
            productId: it.product_id,
            productName: it.product_name,
            price: parseFloat(it.price) || 0,
            quantity: it.quantity,
            size: it.size || 'Estándar',
            isHalfHalf: !!it.is_half_half,
            halfDetails: safeJsonParseObj(it.half_details),
            removedIngredients: it.removed_ingredients || [],
            proteins: it.proteins || [],
            defaultProteins: it.default_proteins || [],
            extras: safeJsonParse(it.extras_json),
            sugarPreference: it.sugar_preference || undefined,
            drinkType: it.drink_type || undefined,
            category: it.category || undefined,
            isTakeaway: !!it.is_takeaway,
            isDelivery: !!it.is_delivery,
            isCut: !!it.is_cut,
            cutPreference: it.cut_preference || (it.is_cut ? 'Picada' : 'Entera'),
            isNewOrModified: !!it.is_new_or_modified,
            isPaidIndividually: !!it.is_paid_individually,
            paidByName: it.paid_by_name || undefined,
            flavor: it.flavor || undefined,
            notes: it.notes || '',
          })),
      }));

      res.json({
        success: true,
        summary: {
          totalCount,
          totalUSD,
          totalPaidUSD,
          page: parsedPage,
          totalPages,
          limit: parsedLimit,
        },
        orders: mappedOrders,
      });
    } catch (err) {
      console.error('Error al consultar comandas históricas:', err);
      res.status(500).json({ error: 'Error al consultar historial de comandas' });
    }
  });

  router.post('/ai-chat', async (req, res) => {
    try {
      const { message } = req.body;
      const lower = (message || '').toLowerCase();
      const orders = await fetchAllOrders(req.user);
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      let reply = 'Consulta procesada en Basilico.';

      if (lower.includes('hamburguesa') || lower.includes('burger') || lower.includes('vendida') || lower.includes('top')) {
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
            if (it.productName.toLowerCase().includes('refresco') || it.productName.toLowerCase().includes('agua') || it.productName.toLowerCase().includes('bebida') || it.productName.toLowerCase().includes('jugo')) {
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

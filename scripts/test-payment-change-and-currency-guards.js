/**
 * Test script: test-payment-change-and-currency-guards.js
 * Valida los 3 casos reportados por el jefe de la hamburguesería:
 * 1. Bug A: Permitir eliminar un pago con vuelto pendiente directamente desde la ventana de cobro sin haber cerrado la comanda.
 * 2. Bug B: Si el cajero sale de la ventana de cobro con vuelto pendiente (sin anular el pago), la comanda NO debe aparecer como "PAGADO" bloqueada, sino permitir re-entrar a dar los vueltos.
 * 3. Bug C: Bloquear montos en Pesos (ej. 5000) ingresados por error con la moneda en Dólares (USD) tanto en pagos como en vueltos y movimientos manuales de caja chica.
 */

const { initDb, query } = require('../server/db');
const { fetchAllOrders } = require('../server/helpers/fetchAll');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 PRUEBA AUTOMATIZADA: VUELTOS PENDIENTES, ANULACIÓN Y GUARDAS USD/COP');
  console.log('======================================================================\n');

  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const { getSession } = require('../server/helpers/sessionAuth');
  const authRouter = require('../server/routes/auth')(io);
  app.use('/api/auth', authRouter);

  const cajaUser = { username: 'cajero_test', role: 'caja', shift: 'ambos' };
  app.use((req, res, next) => {
    const authHeader = req.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const sess = getSession(authHeader.slice(7).trim());
      if (sess) {
        req.user = sess;
        return next();
      }
    }
    req.user = cajaUser;
    next();
  });

  const ordersRouter = require('../server/routes/orders')(io);
  const paymentsRouter = require('../server/routes/payments')(io);
  const cajaRouter = require('../server/routes/caja')(io);
  const reporteIntervaloRouter = require('../server/routes/reporteIntervalo')(io);
  app.use('/api/orders', ordersRouter);
  app.use('/api/orders', paymentsRouter);
  app.use('/api/caja-chica', cajaRouter);
  app.use('/api/caja', cajaRouter);
  app.use('/api/caja', reporteIntervaloRouter);

  const PORT = 3098;
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}/api`;

  let passed = 0;
  let total = 0;
  function assert(cond, msg) {
    total++;
    if (cond) {
      console.log(`   ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`   ❌ [FAIL] ${msg}`);
      throw new Error(`Fallo en prueba: ${msg}`);
    }
  }

  let createdOrderId = null;
  let deliveryOrderId = null;
  let pickupOrderId = null;
  let binanceOrderId = null;
  let zelleOrderId = null;
  let morningOrderId = null;
  let nightOrderId = null;

  const { rows: savedPinRows } = await query(`SELECT key, value FROM system_settings WHERE key IN ('admin_pin', 'admin_pin_manana', 'admin_pin_noche')`);
  const savedPins = {};
  for (const r of savedPinRows) savedPins[r.key] = r.value;

  try {
    await query(`UPDATE tables_config SET status = 'libre' WHERE number = 7`);

    console.log('\n📝 1. Creando comanda de prueba en Mesa #7 ($14.00 USD)...');
    const createRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mesa',
        tableNumber: 7,
        customerName: 'Cliente Prueba Vueltos',
        items: [
          { productId: 'prod-bistro', productName: 'BISTRO', price: 7, quantity: 2 },
        ],
        totalUSD: 14,
      }),
    });
    const order = await createRes.json();
    createdOrderId = order.id;
    assert(createRes.status === 201 && createdOrderId, 'Comanda creada exitosamente ($14.00 USD)');

    console.log('\n🚫 1.B Validando que NO se permite marcar como ENTREGADA sin haber cobrado ni con abono parcial...');
    const deliverUnpaidRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverUnpaidRes.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda sin pago');

    // Registrar abono parcial ($5.00 USD de $14.00 USD) y minimizar con X
    const partialRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterPartial = await partialRes.json();
    assert(partialRes.status === 200 && orderAfterPartial.paymentStatus === 'parcial', 'Abono parcial de $5.00 USD registrado (estado parcial)');

    const deliverPartialRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverPartialRes.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda con abono parcial ($9.00 USD pendientes)');

    // Limpiar el abono parcial para continuar con la prueba de pago con excedente
    const partialPayId = orderAfterPartial.paymentHistory[0]?.id;
    await fetch(`${baseUrl}/orders/${createdOrderId}/payments/${partialPayId}`, { method: 'DELETE' });

    console.log('\n💵 2. [CASO A & B] Registrando pago con dinero de más ($20.00 Efectivo USD para dar $6.00 de vuelto)...');
    const payExcessRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterExcess = await payExcessRes.json();
    assert(payExcessRes.status === 200, 'Pago de $20.00 USD registrado (HTTP 200)');
    assert(
      orderAfterExcess.paymentStatus !== 'pagado',
      `Comanda con vuelto pendiente ($6.00 USD) NO se marca como 'pagado' prematuramente (estado actual: '${orderAfterExcess.paymentStatus}')`
    );

    const deliverWithPendingChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(
      deliverWithPendingChangeRes.status === 409,
      'Bloqueado (HTTP 409) intento de entregar comanda mientras tenga vuelto pendiente ($6.00 USD) — jamás desaparece en un limbo'
    );

    const allOrdersSync = await fetchAllOrders(cajaUser);
    const syncedOrder = allOrdersSync.find((o) => o.id === createdOrderId);
    assert(
      syncedOrder && syncedOrder.paymentStatus !== 'pagado',
      `Al salir de la ventana de cobro, fetchAllOrders mantiene paymentStatus='${syncedOrder?.paymentStatus}' (NO aparece bloqueada como PAGADA, permitiendo volver a entrar a dar vuelto)`
    );

    console.log('\n🗑️ 3. [CASO A] Eliminando el pago equivocado en Efectivo USD directamente sin haber cerrado la comanda...');
    const wrongPaymentId = orderAfterExcess.paymentHistory[0]?.id;
    assert(Boolean(wrongPaymentId), 'ID del movimiento de pago obtenido');

    const delRes = await fetch(`${baseUrl}/orders/${createdOrderId}/payments/${wrongPaymentId}`, {
      method: 'DELETE',
    });
    const orderAfterDelete = await delRes.json();
    assert(delRes.status === 200, 'Movimiento de pago eliminado directamente por cajero (HTTP 200)');
    assert(orderAfterDelete.paymentHistory.length === 0, 'Historial de pagos quedó limpio (0 movimientos)');
    assert(orderAfterDelete.paymentStatus === 'no_pagado', 'Estado de pago volvió a no_pagado');
    assert(orderAfterDelete.paidAmountUSD === 0, 'Monto pagado volvió a $0.00 USD');

    console.log('\n🛡️ 4. [CASO C] Validando bloqueo de 5000 USD ingresados por error cuando eran Pesos (COP)...');
    const badUsdPaymentRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5000,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const badUsdPaymentBody = await badUsdPaymentRes.json();
    assert(
      badUsdPaymentRes.status === 400 && badUsdPaymentBody.error.includes('PESOS (COP)'),
      `Pago de $5,000 USD rechazado correctamente (HTTP 400): "${badUsdPaymentBody.error}"`
    );

    // Ahora registrar un pago real en Pesos con excedente para generar vuelto pendiente:
    // $14 USD * 3950 = 55,300 COP. El cliente entrega 70,000 COP (vuelto pendiente: 14,700 COP ≈ $3.72 USD).
    const validCopPaymentRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'COP',
        amountLocal: 70000,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterCopPay = await validCopPaymentRes.json();
    assert(validCopPaymentRes.status === 200, 'Pago válido de 70,000 COP registrado correctamente');
    assert(orderAfterCopPay.paymentStatus === 'parcial', 'Orden queda en estado parcial mientras falte entregar los 14,700 COP de vuelto');

    // Intentar registrar 5000 de vuelto dejando por error la moneda en USD:
    const badUsdChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 5000,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const badUsdChangeBody = await badUsdChangeRes.json();
    assert(
      badUsdChangeRes.status === 400 && badUsdChangeBody.error.includes('PESOS (COP)'),
      `Vuelto de $5,000 USD rechazado correctamente (HTTP 400): "${badUsdChangeBody.error}"`
    );

    // Intentar registrar 5000 USD en Caja Chica manual:
    const badManualCajaRes = await fetch(`${baseUrl}/caja-chica/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'egreso',
        amountUSD: 5000,
        amountCOP: 0,
        amountBs: 0,
        paymentMethod: 'Efectivo USD',
        description: 'Vuelto equivocado',
      }),
    });
    const badManualCajaBody = await badManualCajaRes.json();
    assert(
      badManualCajaRes.status === 400 && badManualCajaBody.error.includes('COP'),
      `Movimiento manual de $5,000 USD en Caja Chica rechazado correctamente (HTTP 400): "${badManualCajaBody.error}"`
    );

    console.log('\n✅ 5. Registrando el vuelto correcto en Pesos (14,700 COP) y finalizando comanda...');
    const validCopChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'COP',
        amountLocal: 14700,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    assert(validCopChangeRes.status === 200, 'Vuelto de 14,700 COP registrado exitosamente (HTTP 200)');

    const finalizeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/finalize`, {
      method: 'POST',
    });
    const finalizedOrder = await finalizeRes.json();
    assert(finalizeRes.status === 200, 'Comanda finalizada exitosamente tras entregar el vuelto (HTTP 200)');
    assert(finalizedOrder.paymentStatus === 'pagado' && finalizedOrder.status === 'entregada', 'Comanda quedó pagada y entregada');

    // Verificar contabilidad en caja_chica_transactions
    const { rows: cajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [createdOrderId]);
    const ingresosCOP = cajaRows.filter((r) => r.type === 'ingreso').reduce((s, r) => s + Number(r.amount_cop), 0);
    const egresosCOP = cajaRows.filter((r) => r.type === 'egreso').reduce((s, r) => s + Number(r.amount_cop), 0);
    assert(ingresosCOP === 70000 && egresosCOP === 14700 && (ingresosCOP - egresosCOP) === 55300, 'Contabilidad en Caja Chica exacta: +70,000 COP ingreso, -14,700 COP vuelto = +55,300 COP netos ($14.00 USD)');

    console.log('\n🔄 6. Probando Reactivación de Mesa #7 ya cuadrada y cierre con botón Entregar...');
    const reopenRes = await fetch(`${baseUrl}/orders/${createdOrderId}/reopen`, {
      method: 'POST',
    });
    const reopenedOrder = await reopenRes.json();
    assert(reopenRes.status === 200 && reopenedOrder.status === 'preparada' && reopenedOrder.paymentStatus === 'pagado', 'Mesa #7 reactivada correctamente manteniendo su cuenta cuadrada (pagado)');

    const deliverReopenedRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const deliveredAgainOrder = await deliverReopenedRes.json();
    assert(deliverReopenedRes.status === 200 && deliveredAgainOrder.status === 'entregada' && deliveredAgainOrder.paymentStatus === 'pagado', 'Al estar cuadrada, el botón Entregar cierra la Mesa #7 reactivada y la devuelve a Histórico');

    console.log('\n🛵 7. Probando Delivery y PickUp: bloqueo de Entregar sin cuadrar y éxito al cuadrar...');
    const createDelRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        customerName: 'Delivery Test',
        deliveryFeeUSD: 1,
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 9, quantity: 1 }],
        totalUSD: 10,
      }),
    });
    const delOrd = await createDelRes.json();
    deliveryOrderId = delOrd.id;
    assert(createDelRes.status === 201 && Boolean(deliveryOrderId), 'Orden Delivery creada exitosamente ($10.00 USD)');

    await new Promise((r) => setTimeout(r, 15));
    const createPickRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pickup',
        customerName: 'PickUp Test',
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 8, quantity: 1 }],
        totalUSD: 8,
      }),
    });
    const pickOrd = await createPickRes.json();
    pickupOrderId = pickOrd.id;
    assert(createPickRes.status === 201 && Boolean(pickupOrderId), 'Orden PickUp creada exitosamente ($8.00 USD)');

    // Intento de entregar Delivery sin pagar -> 409
    const delFail1 = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(delFail1.status === 409, 'Delivery sin pagar NO permite Entregar (HTTP 409)');

    // Pago con vuelto pendiente en Delivery ($20 para $10) -> 409 al intentar entregar
    await fetch(`${baseUrl}/orders/${deliveryOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Efectivo USD',
        payerName: 'Delivery Test',
      }),
    });
    const delFail2 = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(delFail2.status === 409, 'Delivery con vuelto pendiente ($10 USD) NO permite Entregar (HTTP 409)');

    // Registrar el vuelto de $10 USD en Delivery -> ahora SÍ permite Entregar
    await fetch(`${baseUrl}/orders/${deliveryOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 10,
        paymentMethod: 'Efectivo USD',
        payerName: 'Delivery Test',
      }),
    });
    const delOk = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const delFinal = await delOk.json();
    assert(delOk.status === 200 && delFinal.status === 'entregada' && delFinal.paymentStatus === 'pagado', 'Delivery 100% cuadrado en cobro y vuelto permite Entregar y pasa a Histórico');

    // PickUp con abono parcial ($3 de $8) -> 409 al intentar entregar
    await fetch(`${baseUrl}/orders/${pickupOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 3,
        paymentMethod: 'Zelle',
        payerName: 'PickUp Test',
      }),
    });
    const pickFail = await fetch(`${baseUrl}/orders/${pickupOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(pickFail.status === 409, 'PickUp con abono parcial ($3 de $8) NO permite Entregar (HTTP 409)');

    // Completar los $5 restantes en PickUp -> ahora SÍ permite Entregar
    await fetch(`${baseUrl}/orders/${pickupOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5,
        paymentMethod: 'Efectivo USD',
        payerName: 'PickUp Test',
      }),
    });
    const pickOk = await fetch(`${baseUrl}/orders/${pickupOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const pickFinal = await pickOk.json();
    assert(pickOk.status === 200 && pickFinal.status === 'entregada' && pickFinal.paymentStatus === 'pagado', 'PickUp 100% cuadrado permite Entregar y pasa a Histórico');

    console.log('\n🟡 8. [BINANCE CON EXCEDENTE] Registrando pago de $20 USD vía Binance para comanda de $14 USD...');
    const createBinanceRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pickup',
        customerName: 'Cliente Binance Excess',
        items: [{ productId: 'prod-pizza', productName: 'PIZZA MARGARITA', price: 7, quantity: 2 }],
        totalUSD: 14,
      }),
    });
    const binanceOrd = await createBinanceRes.json();
    binanceOrderId = binanceOrd.id;
    assert(createBinanceRes.status === 201 && Boolean(binanceOrderId), 'Orden para Binance creada ($14.00 USD)');

    const binancePayRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Binance',
        payerName: 'Cliente Binance Excess',
      }),
    });
    const orderAfterBinance = await binancePayRes.json();
    assert(binancePayRes.status === 200, 'Pago con excedente en Binance ($20 USD para deuda de $14 USD) aceptado exitosamente (HTTP 200)');
    assert(orderAfterBinance.paymentStatus === 'parcial', 'Comanda queda en estado "parcial" mientras exista vuelto pendiente de $6 USD');
    assert(orderAfterBinance.pendingChangeUSD === 6, 'Vuelto pendiente en Binance calculado exactamente en $6.00 USD');

    const deliverBinanceBlocked = await fetch(`${baseUrl}/orders/${binanceOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverBinanceBlocked.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda de Binance con vuelto pendiente');

    const binanceChangeRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 6,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Binance Excess',
      }),
    });
    const orderAfterBinanceChange = await binanceChangeRes.json();
    assert(binanceChangeRes.status === 200 && orderAfterBinanceChange.paymentStatus === 'pagado', 'Vuelto de $6 USD en Efectivo USD salda la comanda de Binance');

    const finalizeBinanceRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/finalize`, { method: 'POST' });
    assert(finalizeBinanceRes.status === 200, 'Comanda de Binance finalizada exitosamente tras devolver vuelto');

    const deliverBinanceRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverBinanceRes.status === 200, 'Comanda PickUp de Binance entregada exitosamente (HTTP 200)');

    const { rows: binanceCajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [binanceOrderId]);
    const binanceIngreso = binanceCajaRows.find((r) => r.type === 'ingreso' && r.payment_method === 'Binance');
    const cashEgreso = binanceCajaRows.find((r) => r.type === 'egreso' && r.payment_method === 'Efectivo USD');
    assert(Boolean(binanceIngreso) && Number(binanceIngreso.amount_usd) === 20, 'Caja Chica registró ingreso exacto de +$20 USD en Binance');
    assert(Boolean(cashEgreso) && Number(cashEgreso.amount_usd) === 6, 'Caja Chica registró egreso exacto de -$6 USD en Efectivo USD');

    console.log('\n🔵 9. [ZELLE CON EXCEDENTE Y VUELTO EN COP] Registrando pago de $50 USD vía Zelle con vuelto en Pesos...');
    const { getRatesForShift } = require('../server/helpers/exchangeRates');
    const shiftRates = await getRatesForShift({ query }, 'noche');
    const activeCopRate = Number(shiftRates?.COP) || 3950;

    const createZelleRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        customerName: 'Cliente Zelle Excess',
        deliveryFeeUSD: 2,
        items: [{ productId: 'prod-pizza-esp', productName: 'PIZZA ESPECIAL', price: 28, quantity: 1 }],
        totalUSD: 30,
      }),
    });
    const zelleOrd = await createZelleRes.json();
    zelleOrderId = zelleOrd.id;
    assert(createZelleRes.status === 201 && Boolean(zelleOrderId), 'Orden para Zelle creada ($30.00 USD)');

    const zellePayRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 50,
        paymentMethod: 'Zelle',
        payerName: 'Cliente Zelle Excess',
      }),
    });
    const orderAfterZelle = await zellePayRes.json();
    assert(zellePayRes.status === 200 && orderAfterZelle.pendingChangeUSD === 20, 'Pago con excedente en Zelle ($50 para $30) deja $20.00 USD de vuelto pendiente');

    const expectedCopChange = Math.round(20 * (orderAfterZelle.copRateAtPayment || activeCopRate));
    const zelleCopChangeRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'COP',
        amountLocal: expectedCopChange,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Zelle Excess',
      }),
    });
    const orderAfterZelleCopChange = await zelleCopChangeRes.json();
    assert(zelleCopChangeRes.status === 200 && orderAfterZelleCopChange.paymentStatus === 'pagado', `Vuelto de $20 USD entregado en Efectivo COP (${expectedCopChange.toLocaleString()} COP) salda la comanda de Zelle`);

    const finalizeZelleRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/finalize`, { method: 'POST' });
    assert(finalizeZelleRes.status === 200, 'Comanda de Zelle finalizada exitosamente');

    const deliverZelleRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverZelleRes.status === 200, 'Comanda Delivery de Zelle entregada exitosamente (HTTP 200)');

    const { rows: zelleCajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [zelleOrderId]);
    const zelleIngreso = zelleCajaRows.find((r) => r.type === 'ingreso' && r.payment_method === 'Zelle');
    const copEgreso = zelleCajaRows.find((r) => r.type === 'egreso' && r.payment_method === 'Efectivo COP');
    assert(Boolean(zelleIngreso) && Number(zelleIngreso.amount_usd) === 50, 'Caja Chica registró ingreso exacto de +$50 USD en Zelle');
    assert(Boolean(copEgreso) && Number(copEgreso.amount_cop) === expectedCopChange, `Caja Chica registró egreso exacto de -${expectedCopChange.toLocaleString()} COP en Efectivo COP`);

    console.log('\n🔐 10. [PIN DE 6 CARACTERES ALFANUMÉRICO + SÍMBOLOS E INDEPENDENCIA DE TURNOS]...');
    const loginAs = async (username, password) => {
      const r = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const b = await r.json();
      return b.user.sessionToken;
    };

    const tokenAdminGeneral = await loginAs('admin', 'basilico1.');
    const tokenCajaManana = await loginAs('caja.manana', 'caja123');
    const tokenCajaNoche = await loginAs('caja.noche', 'caja123');
    const tokenAdminManana = await loginAs('admin.manana', 'admin123');

    // Rechazar longitudes inválidas (4 dígitos, 7 dígitos, o con espacios)
    for (const badPin of ['1234', '1234567', 'AB 12#']) {
      const badRes = await fetch(`${baseUrl}/auth/admin-pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdminGeneral}` },
        body: JSON.stringify({ pin: badPin, shift: 'manana' }),
      });
      assert(badRes.status === 400, `Clave inválida "${badPin}" rechazada correctamente (HTTP 400)`);
    }

    // Configurar clave con letras mayúsculas/minúsculas, números y símbolos para Mañana y otra distinta para Noche
    const pinMananaTest = 'Mn#24@';
    const pinNocheTest = 'Nc*98$';

    const setMRes = await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdminGeneral}` },
      body: JSON.stringify({ pin: pinMananaTest, shift: 'manana' }),
    });
    assert(setMRes.status === 200, `Clave de Turno Mañana configurada a "${pinMananaTest}" (letras, números y símbolos)`);

    const setNRes = await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdminGeneral}` },
      body: JSON.stringify({ pin: pinNocheTest, shift: 'noche' }),
    });
    assert(setNRes.status === 200, `Clave de Turno Noche configurada a "${pinNocheTest}" (letras, números y símbolos)`);

    // Verificar que Caja Mañana autoriza con Mn#24@ y rechaza Nc*98$ y 1234
    const verMOk = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({ pin: pinMananaTest }),
    });
    assert(verMOk.status === 200, `Caja Mañana autoriza correctamente con su clave "${pinMananaTest}"`);

    const verMCrossFail = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({ pin: pinNocheTest, shift: 'noche' }),
    });
    assert(verMCrossFail.status === 401, 'Caja Mañana NO puede autorizar usando la clave de Noche (aislamiento estricto de sesión)');

    // Verificar que Caja Noche autoriza con Nc*98$ y rechaza Mn#24@
    const verNOk = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({ pin: pinNocheTest }),
    });
    assert(verNOk.status === 200, `Caja Noche autoriza correctamente con su clave "${pinNocheTest}"`);

    const verNCrossFail = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({ pin: pinMananaTest }),
    });
    assert(verNCrossFail.status === 401, 'Caja Noche NO puede autorizar usando la clave de Mañana');

    // Verificar que Admin Mañana al consultar GET /admin-pin NO recibe pinNoche expuesto
    const getPinMRes = await fetch(`${baseUrl}/auth/admin-pin?shift=noche`, {
      headers: { Authorization: `Bearer ${tokenAdminManana}` },
    });
    const getPinMBody = await getPinMRes.json();
    assert(getPinMBody.pin === pinMananaTest && getPinMBody.pinNoche === undefined, 'Admin Mañana solo visualiza la clave de Mañana y jamás expone la clave de Noche');

    console.log('\n☀️🌙 11. [MULTIFUNCIONALIDAD Y CONTABILIDAD ENTRE TURNOS: PLATOS MAÑANA vs PIZZAS MITADES NOCHE]...');
    // Crear comanda en Turno Mañana con platos de almuerzo y cobro dividido + Binance con vuelto
    await query(`UPDATE tables_config SET status = 'libre' WHERE number IN (8, 9)`);
    const mCreateRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({
        type: 'mesa',
        tableNumber: 8,
        customerName: 'Almuerzo Ejecutivo',
        items: [
          { productId: 'prod-pasta', productName: 'PASTA CARBONARA', category: 'Pastas', price: 9.5, quantity: 1, removedIngredients: ['PIMIENTA'] },
          { productId: 'prod-jugo', productName: 'JUGO NATURAL', category: 'Bebidas', drinkType: 'jugo', sugarPreference: 'Sin azúcar', flavor: 'Mora', price: 2.5, quantity: 1 },
        ],
        totalUSD: 12,
      }),
    });
    const mOrd = await mCreateRes.json();
    morningOrderId = mOrd.id;
    assert(mCreateRes.status === 201 && mOrd.shift === 'manana', 'Comanda de Turno Mañana creada en Mesa #8 ($12.00 USD)');

    // Crear comanda en Turno Noche con Pizza Mitad y Mitad + extras + adición posterior
    const nCreateRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({
        type: 'mesa',
        tableNumber: 9,
        customerName: 'Cena Pizzería',
        items: [
          {
            productId: 'prod-pizza-mitad',
            productName: 'PIZZA MITAD Y MITAD',
            category: 'Pizzas',
            size: 'Grande',
            isHalfHalf: true,
            cutPreference: 'Picada',
            halfDetails: {
              half1Name: 'PEPPERONI',
              half2Name: 'HAWAIANA',
              half1Removed: ['ORÉGANO'],
              half2Extras: [{ name: 'MAÍZ DULCE', price: 1.5, quantity: 1 }],
            },
            price: 15.5,
            quantity: 1,
          },
        ],
        totalUSD: 15.5,
      }),
    });
    const nOrd = await nCreateRes.json();
    nightOrderId = nOrd.id;
    assert(nCreateRes.status === 201 && nOrd.shift === 'noche', 'Comanda de Turno Noche (Pizza Mitad/Mitad + Extra) creada en Mesa #9 ($15.50 USD)');

    // Verificar aislamiento estricto de comandas entre turnos
    const mOrdersList = await (await fetch(`${baseUrl}/orders`, { headers: { Authorization: `Bearer ${tokenCajaManana}` } })).json();
    const nOrdersList = await (await fetch(`${baseUrl}/orders`, { headers: { Authorization: `Bearer ${tokenCajaNoche}` } })).json();
    assert(mOrdersList.some((o) => o.id === morningOrderId) && !mOrdersList.some((o) => o.id === nightOrderId), 'Caja Mañana ve su comanda de almuerzo y NO ve la pizza de Noche');
    assert(nOrdersList.some((o) => o.id === nightOrderId) && !nOrdersList.some((o) => o.id === morningOrderId), 'Caja Noche ve su pizza mitad/mitad y NO ve el almuerzo de Mañana');

    // Cobrar una parte de la pizza de Noche ($10 USD) y luego adicionar una bebida ($2.50 USD) -> debe mantenerse 'parcial'
    await fetch(`${baseUrl}/orders/${nightOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({ entryType: 'payment', currency: 'USD', amountLocal: 10, paymentMethod: 'Efectivo USD', payerName: 'Cena Pizzería' }),
    });
    const appendNRes = await fetch(`${baseUrl}/orders/${nightOrderId}/append-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({
        addedItems: [{ productId: 'prod-coca', productName: 'COCA COLA', category: 'Bebidas', drinkType: 'refresco', price: 2.5, quantity: 1 }],
        removedItemIds: [],
        targetPrinter: 'ninguna',
      }),
    });
    const appendNBody = await appendNRes.json();
    assert(
      appendNRes.status === 200 && appendNBody.newTotalUSD === 18 && appendNBody.order.paymentStatus === 'parcial',
      'Al adicionar bebida ($2.50) a pizza con abono ($10.00), nuevo total es $18.00 USD y preserva estado "parcial"'
    );

    // Saldar los $8 restantes de Noche pagando $20 por Binance y recibiendo $12 de vuelto en Efectivo USD
    await fetch(`${baseUrl}/orders/${nightOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({ entryType: 'payment', currency: 'USD', amountLocal: 20, paymentMethod: 'Binance', payerName: 'Cena Pizzería' }),
    });
    await fetch(`${baseUrl}/orders/${nightOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
      body: JSON.stringify({ entryType: 'change', currency: 'USD', amountLocal: 12, paymentMethod: 'Efectivo USD', payerName: 'Cena Pizzería' }),
    });
    const finNightRes = await fetch(`${baseUrl}/orders/${nightOrderId}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCajaNoche}` },
    });
    assert(finNightRes.status === 200, 'Comanda de Noche ($18.00 USD: Efectivo $10 + Binance $20 - Vuelto $12) cuadrada y finalizada al centavo');

    // Saldar comanda de Mañana por Personas (Split Payment: ítem 1 por Zelle $9.50, ítem 2 por Binance $5.00 con vuelto de $2.50 Efectivo USD)
    const mItem1 = mOrd.items[0].id;
    const mItem2 = mOrd.items[1].id;
    const mSplit1 = await fetch(`${baseUrl}/orders/${morningOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({ entryType: 'payment', currency: 'USD', amountLocal: 9.5, paymentMethod: 'Zelle', payerName: 'Persona 1', itemIds: [mItem1] }),
    });
    assert(mSplit1.status === 200, 'Turno Mañana: Persona 1 pagó su Pasta Carbonara ($9.50 USD por Zelle)');

    const mSplit2 = await fetch(`${baseUrl}/orders/${morningOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({ entryType: 'payment', currency: 'USD', amountLocal: 5, paymentMethod: 'Binance', payerName: 'Persona 2', itemIds: [mItem2] }),
    });
    const mAfterSplit2 = await mSplit2.json();
    assert(mSplit2.status === 200 && mAfterSplit2.pendingChangeUSD === 2.5, 'Turno Mañana: Persona 2 pagó Jugo ($2.50) con $5.00 Binance dejando $2.50 de vuelto pendiente');

    await fetch(`${baseUrl}/orders/${morningOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaManana}` },
      body: JSON.stringify({ entryType: 'change', currency: 'USD', amountLocal: 2.5, paymentMethod: 'Efectivo USD', payerName: 'Persona 2', itemIds: [mItem2] }),
    });
    const finMorningRes = await fetch(`${baseUrl}/orders/${morningOrderId}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCajaManana}` },
    });
    assert(finMorningRes.status === 200, 'Comanda de Mañana ($12.00 USD por Personas + Binance con vuelto) cuadrada y finalizada al centavo');

    // Validar contabilidad exacta en Caja Chica de Mañana vs Noche
    const { rows: mCaja } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [morningOrderId]);
    const mNetUSD = mCaja.reduce((s, r) => s + (r.type === 'ingreso' ? Number(r.amount_usd) : -Number(r.amount_usd)), 0);
    assert(Math.abs(mNetUSD - 12) < 0.001 && mCaja.every((r) => r.shift === 'manana'), 'Caja Chica Turno Mañana cuadrada exacta en +$12.00 USD netos con shift="manana"');

    const { rows: nCaja } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [nightOrderId]);
    const nNetUSD = nCaja.reduce((s, r) => s + (r.type === 'ingreso' ? Number(r.amount_usd) : -Number(r.amount_usd)), 0);
    assert(Math.abs(nNetUSD - 18) < 0.001 && nCaja.every((r) => r.shift === 'noche'), 'Caja Chica Turno Noche cuadrada exacta en +$18.00 USD netos con shift="noche"');

    // Validar endpoint de Reporte por Intervalo aislado por turno
    const todayStr = new Date().toISOString().slice(0, 10);
    const repManana = await (await fetch(`${baseUrl}/caja/reporte-intervalo?from=${todayStr}&to=${todayStr}`, {
      headers: { Authorization: `Bearer ${tokenCajaManana}` },
    })).json();
    const repNoche = await (await fetch(`${baseUrl}/caja/reporte-intervalo?from=${todayStr}&to=${todayStr}`, {
      headers: { Authorization: `Bearer ${tokenCajaNoche}` },
    })).json();
    assert(
      repManana.orders.some((o) => o.id === morningOrderId) && !repManana.orders.some((o) => o.id === nightOrderId),
      'Reporte Contable de Mañana incluye sus platos/cobros y aísla 100% los de Noche'
    );
    assert(
      repNoche.orders.some((o) => o.id === nightOrderId) && !repNoche.orders.some((o) => o.id === morningOrderId),
      'Reporte Contable de Noche incluye sus pizzas/mitades/cobros y aísla 100% los de Mañana'
    );

    console.log(`\n🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE (${passed}/${total})`);
  } finally {
    // Restaurar exactamente los PINs guardados antes de la prueba
    for (const k of ['admin_pin', 'admin_pin_manana', 'admin_pin_noche']) {
      const val = savedPins[k] || '123456';
      await query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [k, val]
      );
    }
    for (const oid of [createdOrderId, deliveryOrderId, pickupOrderId, binanceOrderId, zelleOrderId, morningOrderId, nightOrderId].filter(Boolean)) {
      await query(`DELETE FROM caja_chica_transactions WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_edits WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_payments WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_items WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM orders WHERE id = $1`, [oid]);
    }
    await query(`UPDATE tables_config SET status = 'libre' WHERE number IN (7, 8, 9)`);
    server.close();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR EN LA PRUEBA:', err.message);
    process.exit(1);
  });

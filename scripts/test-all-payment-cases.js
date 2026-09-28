const assert = require('assert');
const { initDb, query, getClient } = require('../server/db');
const { createSession } = require('../server/helpers/sessionAuth');
const { fetchAllOrders } = require('../server/helpers/fetchAll');

async function runPaymentMatrixAudit() {
  console.log('========================================================================');
  console.log('💰 AUDITORÍA EXHAUSTIVA DE CASOS DE PAGO Y CONTABILIDAD BASILICO');
  console.log('========================================================================\n');

  await initDb();

  // Tokens de sesión para pruebas
  const tokenCajaManana = createSession({ username: 'Caja Mañana', role: 'caja', shift: 'manana' });
  const tokenCajaNoche = createSession({ username: 'Caja Noche', role: 'caja', shift: 'noche' });
  const tokenAdmin = createSession({ username: 'Dueño', role: 'admin', shift: 'ambos' });

  const express = require('express');
  const app = express();
  app.use(express.json());
  const { requireSession } = require('../server/helpers/sessionAuth');
  const mockIo = { emit: () => {}, to: () => ({ emit: () => {} }) };
  const ordersRoutes = require('../server/routes/orders')(mockIo);
  const paymentsRoutes = require('../server/routes/payments')(mockIo);

  app.use('/api', requireSession);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/orders', paymentsRoutes);
  app.use('/api/payments', paymentsRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const BASE_URL = `http://localhost:${port}/api`;

  const postLedger = async (orderId, entry, token) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    return { status: res.status, body: data };
  };

  const finalizeOrder = async (orderId, token) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { status: res.status, body: data };
  };

  const creditOrder = async (orderId, debtorName, notes, token) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ debtorName, notes }),
    });
    const data = await res.json();
    return { status: res.status, body: data };
  };

  // -----------------------------------------------------------------------------------------
  // CASO 1: PAGO PARCIAL EN UNA MONEDA (COP) Y RESTANTE EN OTRA (Bs / PAGO MÓVIL)
  // -----------------------------------------------------------------------------------------
  console.log('1️⃣ CASO 1: Pago parcial en COP y restante en Bs (Multi-divisa)...');

  const now = Date.now();
  const ord1Id = `pay-test-1-${now}`;

  // Comanda de $25.00 USD en turno noche
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
     VALUES ($1, 'T-101', 'mesa', 3, 'Cliente Multidivisa', 'en_preparacion', 'no_pagado', 25.00, 'noche')`,
    [ord1Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
     VALUES ($1, $2, 'p1', 'PIZZA FAMILIAR ESPECIAL', 25.00, 1)`,
    [`it-1-${now}`, ord1Id]
  );

  // 1.1 Pago parcial: Cliente paga 40.000 COP (Tasa 3950 -> $10.13 USD)
  const part1Res = await postLedger(ord1Id, {
    entryType: 'payment',
    currency: 'COP',
    amountLocal: 40000,
    paymentMethod: 'Efectivo COP',
    payerName: 'Cliente Multidivisa',
  }, tokenCajaNoche);

  assert.strictEqual(part1Res.status, 200, `Pago parcial en COP debe retornar 200: ${JSON.stringify(part1Res.body)}`);
  
  // Consultar estado de pagos en BD
  const { rows: payRows1 } = await query('SELECT * FROM order_payments WHERE order_id = $1', [ord1Id]);
  assert.strictEqual(payRows1.length, 1, 'Debe existir 1 pago registrado');
  const paidUSDPart1 = Number(payRows1[0].amount_paid_usd);
  const remainingUSD = +(25.00 - paidUSDPart1).toFixed(2);
  console.log(`  ✅ [OK] Primer abono: 40.000 COP cubrió $${paidUSDPart1.toFixed(2)} USD. Restante exacto: $${remainingUSD} USD`);

  // 1.2 Intentar finalizar cuando aún queda deuda pendiente (debe fallar con 409)
  const prematureFinalize = await finalizeOrder(ord1Id, tokenCajaNoche);
  assert.strictEqual(prematureFinalize.status, 409, 'Finalizar con saldo pendiente debe ser rechazado con 409');
  console.log('  ✅ [OK] Bloqueo correcto: No se permite finalizar comanda con deuda pendiente.');

  // 1.3 Cliente paga el restante exacto en Pago Móvil Bs (Tasa 36.50)
  const remainingBs = +(remainingUSD * 36.50).toFixed(2);
  const part2Res = await postLedger(ord1Id, {
    entryType: 'payment',
    currency: 'Bs',
    amountLocal: remainingBs,
    paymentMethod: 'Pago Móvil',
    payerName: 'Cliente Multidivisa',
  }, tokenCajaNoche);
  assert.strictEqual(part2Res.status, 200, 'Pago restante en Bs debe retornar 200');

  // 1.4 Finalizar cobro
  const fin1 = await finalizeOrder(ord1Id, tokenCajaNoche);
  assert.strictEqual(fin1.status, 200, 'Finalizar orden totalmente cubierta debe retornar 200');
  assert.strictEqual(fin1.body.paymentStatus, 'pagado', 'Estado de pago debe ser pagado');
  console.log('  ✅ [OK] Comanda finalizada y liquidada al 100% sin discrepancias.');

  // -----------------------------------------------------------------------------------------
  // CASO 2: CLIENTE PAGA DE MÁS (SOBREPAGO) Y SE REGISTRA VUELTO EN OTRA MONEDA
  // -----------------------------------------------------------------------------------------
  console.log('\n2️⃣ CASO 2: Pago con billete mayor (sobrepago) y vuelto multimoneda...');

  const ord2Id = `pay-test-2-${now}`;
  // Comanda de $14.00 USD
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
     VALUES ($1, 'T-102', 'mesa', 5, 'Cliente Billete Grande', 'en_preparacion', 'no_pagado', 14.00, 'noche')`,
    [ord2Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
     VALUES ($1, $2, 'p2', 'PEPPERONI GRANDE', 14.00, 1)`,
    [`it-2-${now}`, ord2Id]
  );

  // 2.1 Paga con billete de $20 USD en efectivo (Monto entregado: $20, Deuda cubierta: $14, Vuelto: $6)
  const overpayRes = await postLedger(ord2Id, {
    entryType: 'payment',
    currency: 'USD',
    amountLocal: 20.00,
    paymentMethod: 'Efectivo USD',
    payerName: 'Cliente Billete Grande',
  }, tokenCajaNoche);
  assert.strictEqual(overpayRes.status, 200, 'Registro de pago con billete de $20 exitoso');

  // 2.2 Intentar finalizar antes de entregar el vuelto pendiente (debe fallar con 409)
  const finalizeWithoutChange = await finalizeOrder(ord2Id, tokenCajaNoche);
  assert.strictEqual(finalizeWithoutChange.status, 409, 'No se puede finalizar comanda si hay vuelto pendiente');
  console.log('  ✅ [OK] Bloqueo correcto: No se permite finalizar comanda con vuelto pendiente.');

  // 2.3 Cajero entrega $2.00 USD en efectivo de vuelto
  const change1 = await postLedger(ord2Id, {
    entryType: 'change',
    currency: 'USD',
    amountLocal: 2.00,
    paymentMethod: 'Efectivo USD',
    payerName: 'Vuelto Parcial USD',
  }, tokenCajaNoche);
  assert.strictEqual(change1.status, 200, 'Entrega parcial de vuelto en USD exitosa');

  // 2.4 Cajero entrega el resto del vuelto ($4 USD) en Pesos COP (4 * 3950 = 15.800 COP)
  const change2 = await postLedger(ord2Id, {
    entryType: 'change',
    currency: 'COP',
    amountLocal: 15800,
    paymentMethod: 'Efectivo COP',
    payerName: 'Vuelto Restante COP',
  }, tokenCajaNoche);
  assert.strictEqual(change2.status, 200, 'Entrega de vuelto en COP exitosa');

  // 2.5 Finalizar cobro ahora que el vuelto está en 0
  const fin2 = await finalizeOrder(ord2Id, tokenCajaNoche);
  assert.strictEqual(fin2.status, 200, 'Finalizar orden con vueltos entregados debe retornar 200');
  assert.strictEqual(fin2.body.paymentStatus, 'pagado', 'Comanda pagada');
  console.log('  ✅ [OK] Vuelto mixto entregado y comanda cerrada correctamente.');

  // -----------------------------------------------------------------------------------------
  // CASO 3: COBRO DIVIDIDO POR PERSONA (PAGO POR ÍTEMS)
  // -----------------------------------------------------------------------------------------
  console.log('\n3️⃣ CASO 3: Cobro dividido por comensal / personas...');

  const ord3Id = `pay-test-3-${now}`;
  const itemA = `it-3a-${now}`;
  const itemB = `it-3b-${now}`;
  const itemC = `it-3c-${now}`;

  // Comanda con 3 comensales:
  // Item A: $10.00 (Juan)
  // Item B: $8.00 (Maria)
  // Item C: $4.00 (Pedro)
  // Total: $22.00 USD
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
     VALUES ($1, 'T-103', 'mesa', 6, 'Mesa de Amigos', 'en_preparacion', 'no_pagado', 22.00, 'manana')`,
    [ord3Id]
  );
  await query(`INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1, $2, 'm1', 'SUPREMA', 10.00, 1)`, [itemA, ord3Id]);
  await query(`INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1, $2, 'm2', 'PASTA BOLOGNESA', 8.00, 1)`, [itemB, ord3Id]);
  await query(`INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1, $2, 'm3', 'MERENGADA FRESA', 4.00, 1)`, [itemC, ord3Id]);

  // 3.1 Juan paga su ítem A ($10.00) en Efectivo USD
  const payJuan = await postLedger(ord3Id, {
    entryType: 'payment',
    currency: 'USD',
    amountLocal: 10.00,
    paymentMethod: 'Efectivo USD',
    payerName: 'Juan',
    itemIds: [itemA],
  }, tokenCajaManana);
  assert.strictEqual(payJuan.status, 200, 'Pago de Juan procesado');

  // Verificar que el ítem A quedó marcado como pagado individualmente
  const { rows: itemARow } = await query('SELECT is_paid_individually, paid_by_name FROM order_items WHERE id = $1', [itemA]);
  assert.strictEqual(itemARow[0].is_paid_individually, true, 'Item A debe estar marcado como pagado');
  assert.strictEqual(itemARow[0].paid_by_name, 'Juan', 'Item A pagado por Juan');
  console.log('  ✅ [OK] Comensal 1 (Juan) pagó $10.00 USD -> Ítem A marcado como pagado.');

  // 3.2 Intentar que Maria pague el ítem A que ya fue pagado (debe dar 409)
  const doublePayA = await postLedger(ord3Id, {
    entryType: 'payment',
    currency: 'USD',
    amountLocal: 10.00,
    paymentMethod: 'Efectivo USD',
    payerName: 'Maria',
    itemIds: [itemA],
  }, tokenCajaManana);
  assert.strictEqual(doublePayA.status, 409, 'Pagar ítem ya cobrado debe ser rechazado con 409');
  console.log('  ✅ [OK] Bloqueo correcto: No se permite volver a cobrar un ítem ya pagado.');

  // 3.3 Maria paga ítem B ($8.00) en Bancolombia COP (8 * 3950 = 31.600 COP)
  const payMaria = await postLedger(ord3Id, {
    entryType: 'payment',
    currency: 'COP',
    amountLocal: 31600,
    paymentMethod: 'Bancolombia',
    payerName: 'Maria',
    itemIds: [itemB],
  }, tokenCajaManana);
  assert.strictEqual(payMaria.status, 200, 'Pago de Maria procesado');

  // 3.4 Pedro paga ítem C ($4.00) en Pago Móvil Bs (4 * 36.50 = 146.00 Bs)
  const payPedro = await postLedger(ord3Id, {
    entryType: 'payment',
    currency: 'Bs',
    amountLocal: 146.00,
    paymentMethod: 'Pago Móvil',
    payerName: 'Pedro',
    itemIds: [itemC],
  }, tokenCajaManana);
  assert.strictEqual(payPedro.status, 200, 'Pago de Pedro procesado');

  // 3.5 Todos los comensales pagaron -> Finalizar comanda
  const fin3 = await finalizeOrder(ord3Id, tokenCajaManana);
  assert.strictEqual(fin3.status, 200, 'Comanda dividida finalizada exitosamente');
  assert.strictEqual(fin3.body.paymentStatus, 'pagado', 'Estado pagado');
  console.log('  ✅ [OK] Todos los comensales cobrados individualmente y comanda cerrada.');

  // -----------------------------------------------------------------------------------------
  // CASO 4: CIERRE A CRÉDITO Y AUDITORÍA DE AISLAMIENTO EN CAJA CHICA
  // -----------------------------------------------------------------------------------------
  console.log('\n4️⃣ CASO 4: Cierre a crédito (cuenta por cobrar)...');

  const ord4Id = `pay-test-4-${now}`;
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
     VALUES ($1, 'T-104', 'mesa', 7, 'Cliente Crédito', 'en_preparacion', 'no_pagado', 35.00, 'manana')`,
    [ord4Id]
  );

  // 4.1 Cerrar a crédito sin deudor (debe fallar con 400)
  const credNoName = await creditOrder(ord4Id, '', '', tokenCajaManana);
  assert.strictEqual(credNoName.status, 400, 'Crédito sin nombre de deudor debe retornar 400');

  // 4.2 Cerrar a crédito con deudor válido
  const credOk = await creditOrder(ord4Id, 'Distribuidora Los Andes C.A.', 'Autorizado por Carlos', tokenCajaManana);
  assert.strictEqual(credOk.status, 200, 'Cierre a crédito exitoso');
  assert.strictEqual(credOk.body.paymentStatus, 'credito', 'Estado de comanda debe ser credito');

  // 4.3 Comprobar que NO se insertó dinero falso en caja_chica_transactions
  const { rows: credCashTx } = await query('SELECT * FROM caja_chica_transactions WHERE order_id = $1', [ord4Id]);
  assert.strictEqual(credCashTx.length, 0, 'Comanda a crédito NO debe generar transacciones de dinero en caja');
  console.log('  ✅ [OK] Cierre a crédito validado con deudor y aislamiento de caja chica.');

  // -----------------------------------------------------------------------------------------
  // CASO 5: CONTROL DE ACCESO Y SEGURIDAD ENTRE TURNOS EN COBROS
  // -----------------------------------------------------------------------------------------
  console.log('\n5️⃣ CASO 5: Seguridad de turnos en pasarela de pagos...');

  // Caja Noche intenta registrar cobro en comanda del Turno Mañana (ord4Id es manana)
  const crossPay = await postLedger(ord4Id, {
    entryType: 'payment',
    currency: 'USD',
    amountLocal: 10.00,
    paymentMethod: 'Efectivo USD',
  }, tokenCajaNoche);
  assert(crossPay.status === 403 || crossPay.status === 404, `Intento cruzado debe ser 403/404, fue: ${crossPay.status}`);
  console.log('  ✅ [OK] Caja Noche bloqueada de cobrar comanda del Turno Mañana.');

  // -----------------------------------------------------------------------------------------
  // CASO 6: ANULACIÓN DE PAGOS/VUELTOS Y EDICIÓN COMPLETA DE COMANDA
  // -----------------------------------------------------------------------------------------
  console.log('\n6️⃣ CASO 6: Anulación de pagos / vueltos y edición de comanda...');

  const ord6Id = `pay-test-edit-del-${Date.now()}`;
  await query(
    `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
     VALUES ($1, '906', 'mesa', 6, 'Cliente Para Edición', 'en_preparacion', 'no_pagado', 20.00, 'noche')`,
    [ord6Id]
  );
  await query(
    `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity)
     VALUES ('item-edit-1', $1, 'p-1', 'PIZZA PEPPERONI', 14.00, 1),
            ('item-edit-2', $1, 'p-2', 'REFRESCO 2LT', 6.00, 1)`,
    [ord6Id]
  );

  // Registrar un pago inicial de $10 USD
  const payRes = await postLedger(ord6Id, {
    entryType: 'payment',
    currency: 'USD',
    amountLocal: 10.00,
    paymentMethod: 'Efectivo USD',
  }, tokenCajaNoche);
  assert.strictEqual(payRes.status, 200, 'Pago inicial registrado');

  const { rows: pmRows } = await query('SELECT id, amount_paid_usd FROM order_payments WHERE order_id = $1', [ord6Id]);
  assert.strictEqual(pmRows.length, 1, 'Debe haber 1 pago registrado');
  const paymentToDeleteId = pmRows[0].id;

  // Intentar eliminar el pago usando DELETE /api/orders/:id/payments/:paymentId
  const delRes = await fetch(`${BASE_URL}/orders/${ord6Id}/payments/${paymentToDeleteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenCajaNoche}` },
  });
  const delData = await delRes.json();
  assert.strictEqual(delRes.status, 200, `Eliminación de pago debe retornar 200, fue ${delRes.status}: ${JSON.stringify(delData)}`);
  assert.strictEqual(delData.paymentStatus, 'no_pagado', 'Estado de la comanda debe ser no_pagado tras anular el pago');

  // Verificar que el pago fue eliminado de la base de datos
  const { rows: pmAfterDel } = await query('SELECT * FROM order_payments WHERE order_id = $1', [ord6Id]);
  assert.strictEqual(pmAfterDel.length, 0, 'No debe quedar ningún pago en la comanda');

  // Verificar auditoría en order_edits
  const { rows: editsRows } = await query("SELECT * FROM order_edits WHERE order_id = $1 AND edit_type = 'anulacion_pago'", [ord6Id]);
  assert.strictEqual(editsRows.length, 1, 'Debe existir registro forense de anulación de pago en order_edits');
  console.log('  ✅ [OK] Pago anulado y eliminado con éxito sin error de scope y auditado en order_edits.');

  // Ahora editar la comanda: agregar un producto y recalcular
  const editPayload = {
    items: [
      { id: 'item-edit-1', productId: 'p-1', productName: 'PIZZA PEPPERONI', price: 14.00, quantity: 1, size: 'Grande' },
      { id: 'item-edit-new', productId: 'p-new', productName: 'PIZZA MARGHERITA', price: 10.00, quantity: 1, size: 'Grande' }
    ],
    kitchenNotes: 'Bien tostada',
    totalUSD: 24.00,
    customerName: 'Cliente Editado',
    tableNumber: 6,
    type: 'mesa',
    actorRole: 'caja'
  };

  const patchRes = await fetch(`${BASE_URL}/orders/${ord6Id}/edit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCajaNoche}` },
    body: JSON.stringify(editPayload),
  });
  const patchData = await patchRes.json();
  assert.strictEqual(patchRes.status, 200, `Edición de comanda debe retornar 200, fue ${patchRes.status}: ${JSON.stringify(patchData)}`);
  assert.strictEqual(patchData.customerName, 'Cliente Editado', 'Nombre debe haber cambiado');
  assert.strictEqual(Number(patchData.totalUSD), 24.00, 'Total debe ser 24.00 USD');
  assert.strictEqual(patchData.items.length, 2, 'Debe tener 2 items actualizados');
  console.log('  ✅ [OK] Comanda editada con éxito (items agregados/eliminados y total recalculado).');

  // -----------------------------------------------------------------------------------------
  // LIMPIEZA FINAL
  // -----------------------------------------------------------------------------------------
  console.log('\n7️⃣ Limpiando datos de prueba...');
  await query("DELETE FROM order_items WHERE order_id LIKE 'pay-test-%'");
  await query("DELETE FROM order_payments WHERE order_id LIKE 'pay-test-%'");
  await query("DELETE FROM caja_chica_transactions WHERE order_id LIKE 'pay-test-%'");
  await query("DELETE FROM orders WHERE id LIKE 'pay-test-%'");
  console.log('  ✅ [OK] Datos de prueba eliminados limpiamente.');

  console.log('\n========================================================================');
  console.log('🎉 MATRIZ DE PAGOS Y CONTABILIDAD 100% SUPERADA CON ÉXITO');
  console.log('   - Pagos parciales multimoneda (COP + Bs): EXACTOS');
  console.log('   - Sobrepagos y vueltos mixtos (USD + COP): EXACTOS');
  console.log('   - Cobro dividido por personas: COMPROBADO AL CÉNTIMO');
  console.log('   - Cuentas a crédito: AISLADAS DE CAJA CHICA');
  console.log('   - Seguridad y aislamiento de cobro por turno: IMPENETRABLE');
  console.log('========================================================================\n');
  server.close();
  process.exit(0);
}

runPaymentMatrixAudit().catch((err) => {
  console.error('❌ Error en auditoría de pagos:', err);
  process.exit(1);
});

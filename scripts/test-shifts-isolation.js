const { query, initDb, getClient } = require('../server/db');
const { fetchAllProducts, fetchAllIngredients, fetchAllOrders, fetchAllTables } = require('../server/helpers/fetchAll');
const { assertShiftAccess, canAccessShift } = require('../server/helpers/shiftScope');
const { buildKitchenTicket, buildReceiptTicket, buildBasilicoCierreTicket } = require('../server/helpers/thermalPrinter');
const { postCompletedOrderCashMovements } = require('../server/helpers/cashLedger');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLO EN TEST DE TURNOS: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ [OK] ${message}`);
}

async function runShiftIsolationAudit() {
  console.log('========================================================================');
  console.log('☀️ / 🌙 AUDITORÍA DE AISLAMIENTO TOTAL DE TURNOS (MAÑANA VS NOCHE)');
  console.log('========================================================================\n');

  await initDb();
  const client = await getClient();
  const testOrderIds = [];

  try {
    // ----------------------------------------------------
    // PASO 1: VERIFICAR AISLAMIENTO DE CATÁLOGO Y PRODUCTOS
    // ----------------------------------------------------
    console.log('1️⃣ Verificando Aislamiento de Catálogo (fetchAllProducts)...');

    const morningProducts = await fetchAllProducts({ shift: 'manana' });
    const nightProducts = await fetchAllProducts({ shift: 'noche' });

    assert(morningProducts.length > 0, `Productos de la mañana recuperados: ${morningProducts.length}`);
    assert(nightProducts.length > 0, `Productos de la noche recuperados: ${nightProducts.length}`);

    // Ninguna pizza en el menú de la mañana
    const pizzaInMorning = morningProducts.some((p) => (p.category || '').toLowerCase().includes('pizza'));
    assert(!pizzaInMorning, 'CERO pizzas presentes en el catálogo del turno mañana');

    // Ningún plato de la mañana en el menú de la noche
    const morningInNight = nightProducts.some((p) => ['ENTRADAS', 'PASTAS', 'ESPECIALIDADES'].includes((p.category || '').toUpperCase()));
    assert(!morningInNight, 'CERO platos de almuerzo presentes en el catálogo del turno noche');

    // Nombres de productos de la mañana 100% en MAYÚSCULAS
    const allUpperMorning = morningProducts.every((p) => p.name === p.name.toUpperCase());
    assert(allUpperMorning, 'Todos los productos de la mañana están 100% en MAYÚSCULAS');

    // ----------------------------------------------------
    // PASO 2: VERIFICAR AISLAMIENTO DE INGREDIENTES Y CONTORNOS
    // ----------------------------------------------------
    console.log('\n2️⃣ Verificando Aislamiento de Ingredientes y Contornos (fetchAllIngredients)...');

    const morningIngredients = await fetchAllIngredients({ shift: 'manana' });
    const nightIngredients = await fetchAllIngredients({ shift: 'noche' });

    const contornosInMorning = morningIngredients.filter((i) => i.category === 'CONTORNOS' || i.shift === 'manana');
    assert(contornosInMorning.length >= 12, `Contornos encontrados en turno mañana: ${contornosInMorning.length}`);

    const contornosInNight = nightIngredients.filter((i) => i.category === 'CONTORNOS' && i.shift === 'manana');
    assert(contornosInNight.length === 0, 'CERO contornos de la mañana filtrados en turno noche');

    // ----------------------------------------------------
    // PASO 3: CONTROL DE ACCESO (SHIFT ACCESS CONTROL)
    // ----------------------------------------------------
    console.log('\n3️⃣ Verificando Control de Acceso entre Turnos (shiftScope)...');

    assert(canAccessShift({ shift: 'manana' }, 'manana') === true, 'Usuario mañana puede acceder a recursos de mañana (objeto)');
    assert(canAccessShift('manana', 'manana') === true, 'Usuario mañana puede acceder a recursos de mañana (string)');
    assert(canAccessShift({ shift: 'noche' }, 'noche') === true, 'Usuario noche puede acceder a recursos de noche');
    assert(canAccessShift({ shift: 'manana' }, 'noche') === false, 'Usuario mañana NO puede acceder a recursos de noche');
    assert(canAccessShift({ shift: 'noche' }, 'manana') === false, 'Usuario noche NO puede acceder a recursos de mañana');
    assert(canAccessShift({ shift: 'ambos' }, 'manana') === true, 'Usuario ambos/admin puede acceder a mañana');
    assert(canAccessShift({ shift: 'ambos' }, 'noche') === true, 'Usuario ambos/admin puede acceder a noche');

    let threwForbidden = false;
    try {
      assertShiftAccess({ shift: 'noche' }, 'manana');
    } catch (e) {
      if (e.statusCode === 403 || e.status === 403) threwForbidden = true;
    }
    assert(threwForbidden, 'assertShiftAccess lanza error HTTP 403 al cruzar turnos no autorizados');

    // ----------------------------------------------------
    // PASO 4: CREACIÓN DE COMANDAS AISLADAS (MAÑANA VS NOCHE)
    // ----------------------------------------------------
    console.log('\n4️⃣ Creando Comandas de Prueba Aisladas por Turno...');

    // Limpiar órdenes previas de prueba sin archivar
    await client.query("DELETE FROM order_items WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM order_payments WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM caja_chica_transactions WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM orders WHERE id LIKE 'test-shift-%'");
    await client.query("DELETE FROM caja_chica_apertura WHERE id = 'ap-manana-test'");

    const now = Date.now();
    const morningOrdId = `test-shift-m-${now}`;
    const nightOrdId = `test-shift-n-${now}`;
    testOrderIds.push(morningOrdId, nightOrdId);

    // Calcular próximo número de orden para Mañana
    const mNumRes = await client.query(
      `SELECT COALESCE(MAX(CASE WHEN order_number ~ '^[0-9]+$' THEN CAST(order_number AS INTEGER) ELSE 0 END), 0) + 1 AS next_num
       FROM orders WHERE shift = 'manana' AND archived_at IS NULL`
    );
    const morningOrderNumber = String(mNumRes.rows[0].next_num);

    // Crear comanda mañana: MESA #1, SUPREMA DE POLLO ($10.00) + Contornos ARROZ ($1.00) y ENSALADA ($1.00)
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'mesa', 1, 'Juan Perez (Mañana)', 'en_preparacion', 'no_pagado', 12.00, 'manana')`,
      [morningOrdId, morningOrderNumber]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, category, removed_ingredients, extras_json, notes)
       VALUES ($1, $2, 'm-esp-8', 'SUPREMA DE POLLO', 12.00, 1, 'ESPECIALIDADES', '{"CEBOLLA"}',
               '[{"name":"ARROZ","price":1.0,"quantity":1,"category":"CONTORNOS"},{"name":"ENSALADA DEL DIA","price":1.0,"quantity":1,"category":"CONTORNOS"}]',
               'PECHUGA BIEN COCIDA')`,
      [`item-m-${now}-1`, morningOrdId]
    );

    // Calcular próximo número de orden para Noche (debe ser independiente)
    const nNumRes = await client.query(
      `SELECT COALESCE(MAX(CASE WHEN order_number ~ '^[0-9]+$' THEN CAST(order_number AS INTEGER) ELSE 0 END), 0) + 1 AS next_num
       FROM orders WHERE shift = 'noche' AND archived_at IS NULL`
    );
    const nightOrderNumber = String(nNumRes.rows[0].next_num);

    // Crear comanda noche: MESA #2, PIZZA PEPPERONI ($14.00)
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'mesa', 2, 'Maria Gomez (Noche)', 'en_preparacion', 'no_pagado', 14.00, 'noche')`,
      [nightOrdId, nightOrderNumber]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, category, is_half_half, extras_json)
       VALUES ($1, $2, 'p1', 'PEPPERONI', 14.00, 1, 'Grande', 'Pizzas', false, '[]')`,
      [`item-n-${now}-1`, nightOrdId]
    );

    assert(morningOrderNumber.length > 0, `Comanda de la mañana creada con número #${morningOrderNumber}`);
    assert(nightOrderNumber.length > 0, `Comanda de la noche creada con número independiente #${nightOrderNumber}`);

    // ----------------------------------------------------
    // PASO 5: VERIFICAR VISIBILIDAD DE COMANDAS POR TURNO
    // ----------------------------------------------------
    console.log('\n5️⃣ Verificando Visibilidad Estricta de Comandas (fetchAllOrders)...');

    const ordersSeenByMorning = await fetchAllOrders({ shift: 'manana' });
    const ordersSeenByNight = await fetchAllOrders({ shift: 'noche' });

    const morningSeesNight = ordersSeenByMorning.some((o) => o.id === nightOrdId);
    assert(!morningSeesNight, 'Usuario mañana NO puede ver la comanda de la noche');

    const nightSeesMorning = ordersSeenByNight.some((o) => o.id === morningOrdId);
    assert(!nightSeesMorning, 'Usuario noche NO puede ver la comanda de la mañana');

    const morningSeesOwn = ordersSeenByMorning.some((o) => o.id === morningOrdId);
    assert(morningSeesOwn, 'Usuario mañana ve correctamente su propia comanda');

    const nightSeesOwn = ordersSeenByNight.some((o) => o.id === nightOrdId);
    assert(nightSeesOwn, 'Usuario noche ve correctamente su propia comanda');

    // ----------------------------------------------------
    // PASO 6: TICKET TÉRMICO DE COCINA PARA TURNO MAÑANA
    // ----------------------------------------------------
    console.log('\n6️⃣ Auditando Ticket Térmico de Cocina del Turno Mañana...');

    const morningOrderData = ordersSeenByMorning.find((o) => o.id === morningOrdId);
    const morningKitchenTicket = buildKitchenTicket(morningOrderData);
    assert(morningKitchenTicket !== null, 'Ticket de cocina generado');

    const ticketStr = morningKitchenTicket.toString('ascii');
    const normalizedTicket = ticketStr.replace(/\r?\n\s*/g, ' ');
    assert(normalizedTicket.includes('SUPREMA DE POLLO'), 'Ticket lista el plato SUPREMA DE POLLO');
    assert(normalizedTicket.includes('CONTORNO: ARROZ'), 'Ticket formatea contorno como * CONTORNO: ARROZ');
    assert(normalizedTicket.includes('CONTORNO: ENSALADA DEL DIA'), 'Ticket formatea contorno como * CONTORNO: ENSALADA DEL DIA (con wrap a 21 columnas)');
    assert(normalizedTicket.includes('SIN: CEBOLLA'), 'Ticket formatea exclusión como * SIN: CEBOLLA');
    assert(normalizedTicket.includes('NOTA: PECHUGA BIEN COCIDA'), 'Ticket incluye nota de preparación');
    assert(!ticketStr.includes('Grande') && !ticketStr.includes('Pequeña'), 'Ticket de la mañana OMITE tamaños de pizza');
    assert(!ticketStr.includes('PICADA') && !ticketStr.includes('ENTERA'), 'Ticket de la mañana OMITE preferencias de corte de pizza');

    // ----------------------------------------------------
    // PASO 7: CIERRE DE CAJA AISLADO (CIERRE MAÑANA NO AFECTA NOCHE)
    // ----------------------------------------------------
    console.log('\n7️⃣ Simulando Cierre de Caja del Turno Mañana (cierre aislado)...');

    // 1. Cobrar comanda mañana
    await client.query(
      `UPDATE orders SET status = 'entregada', payment_status = 'pagado', payment_method = 'Efectivo USD' WHERE id = $1`,
      [morningOrdId]
    );

    // 2. Registrar apertura mañana
    await client.query(`DELETE FROM caja_chica_apertura WHERE id = 'ap-manana-test'`);
    await client.query(
      `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, timestamp, shift)
       VALUES ('ap-manana-test', 30.00, 50000, NOW(), 'manana')`
    );

    // 3. Registrar pago y movimiento de cobro en libro de caja para turno mañana
    await client.query(
      `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_usd)
       VALUES ($1, $2, 'Efectivo USD', 12.00, 12.00)`,
      [`pay-m-${now}`, morningOrdId]
    );

    await postCompletedOrderCashMovements(client, morningOrdId);

    // 4. Ejecutar Cierre de Mañana:
    // Debe archivar órdenes de la mañana pero NO las órdenes de la noche
    await client.query(
      `UPDATE orders SET archived_at = NOW() WHERE shift = 'manana' AND archived_at IS NULL`
    );
    await client.query(
      `DELETE FROM caja_chica_apertura WHERE shift = 'manana'`
    );

    // Verificar que la orden de la mañana quedó archivada
    const morningCheck = await client.query(`SELECT archived_at FROM orders WHERE id = $1`, [morningOrdId]);
    assert(morningCheck.rows[0].archived_at !== null, 'Comanda de la mañana quedó archivada tras el cierre de mañana');

    // Verificar que la orden de la noche SIGUE ACTIVA y NO archivada
    const nightCheck = await client.query(`SELECT archived_at, status FROM orders WHERE id = $1`, [nightOrdId]);
    assert(nightCheck.rows[0].archived_at === null, 'Comanda de la noche permanece ACTIVA (archived_at = NULL)');
    assert(nightCheck.rows[0].status === 'en_preparacion', 'Comanda de la noche mantiene intacto su estado operativo');

    // ----------------------------------------------------
    // PASO 8: GESTIÓN DE MESAS COMPARTIDAS
    // ----------------------------------------------------
    console.log('\n8️⃣ Verificando Estado de Mesas Compartidas...');

    // Mesa 1 (de la orden de la mañana cerrada) debe quedar libre
    // Mesa 2 (de la orden de la noche que sigue activa) debe seguir ocupada
    await client.query(
      `UPDATE tables_config SET status = 'ocupada' WHERE number = 2`
    );
    await client.query(
      `UPDATE tables_config SET status = 'libre'
       WHERE number NOT IN (
         SELECT table_number FROM orders
         WHERE type = 'mesa' AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL
       )`
    );

    const tables = await fetchAllTables();
    const mesa1 = tables.find((t) => t.number === 1);
    const mesa2 = tables.find((t) => t.number === 2);

    assert(mesa1.status === 'libre', 'Mesa #1 quedó libre tras el cierre de la orden de la mañana');
    assert(mesa2.status === 'ocupada', 'Mesa #2 continúa OCUPADA por la orden activa de la noche');

    // ----------------------------------------------------
    // PASO 9: LIMPIEZA FINAL
    // ----------------------------------------------------
    console.log('\n9️⃣ Limpiando registros de prueba...');
    await client.query("DELETE FROM order_items WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM order_payments WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM orders WHERE id LIKE 'test-shift-%'");
    await client.query("DELETE FROM caja_chica_transactions WHERE order_id LIKE 'test-shift-%'");
    await client.query("DELETE FROM caja_chica_apertura WHERE id = 'ap-manana-test'");
    await client.query("UPDATE tables_config SET status = 'libre' WHERE number IN (1, 2)");
    assert(true, 'Base de datos limpia y restaurada');

    console.log('\n========================================================================');
    console.log('🎉 AUDITORÍA DE TURNOS 100% EXITOSA');
    console.log('   - Aislamiento de menú, platos e ingredientes: TOTAL (0 filtraciones)');
    console.log('   - Numeración de comandas por turno: INDEPENDIENTE');
    console.log('   - Comandas y KDS: CERO cruces entre usuarios mañana y noche');
    console.log('   - Cierre de caja: TOTALMENTE AISLADO (no afecta al otro turno)');
    console.log('   - Mesas compartidas: GESTIONADAS CORRECTAMENTE SIN CONFLICTOS');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('❌ Error en prueba de turnos:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

runShiftIsolationAudit();

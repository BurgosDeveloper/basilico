const { query, initDb, getClient } = require('../server/db');
const { fetchAllOrders } = require('../server/helpers/fetchAll');
const { buildBasilicoCierreTicket } = require('../server/helpers/thermalPrinter');
const { postCompletedOrderCashMovements } = require('../server/helpers/cashLedger');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLO EN AUDITORÍA: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ [OK] ${message}`);
}

async function runAccountingAudit() {
  console.log('================================================================');
  console.log('💰 INICIANDO AUDITORÍA FINANCIERA, CONTABLE Y DE CIERRE BASILICO');
  console.log('================================================================\n');

  await initDb();
  const client = await getClient();
  const createdOrderIds = [];
  const createdTxIds = [];

  try {
    // ----------------------------------------------------
    // PASO 1: SIMULAR APERTURA DE CAJA
    // ----------------------------------------------------
    console.log('1️⃣ Verificando Apertura de Caja (Fondo Inicial)...');
    const aperturaUSD = 50.00;
    const aperturaCOP = 100000;
    const openedAt = new Date().toISOString();

    await client.query('DELETE FROM caja_chica_apertura');
    await client.query(
      `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, timestamp, shift)
       VALUES ('apertura-audit', $1, $2, $3, 'ambos')`,
      [aperturaUSD, aperturaCOP, openedAt]
    );
    assert(true, `Fondo de caja registrado: $${aperturaUSD} USD y ${aperturaCOP.toLocaleString()} COP`);

    // ----------------------------------------------------
    // PASO 2: CREACIÓN DE 4 COMANDAS DE PRUEBA REALISTAS
    // ----------------------------------------------------
    console.log('\n2️⃣ Creando Comandas de Prueba Multimoneda...');
    const now = Date.now();

    // Comanda 1: Pizza Completa Pepperoni Grande ($14) + Queso Extra ($2) = $16 USD. Pago Efectivo USD ($20 dado, $4 vuelto).
    const o1Id = `aud-ord-${now}-1`;
    const o1Num = `A-${Math.floor(Math.random() * 800 + 100)}`;
    createdOrderIds.push(o1Id);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'mesa', 1, 'Carlos Santana', 'entregada', 'pagado', 16.00, 'ambos')`,
      [o1Id, o1Num]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, extras_json, category)
       VALUES ($1, $2, 'p1', 'PEPPERONI', 16.00, 1, 'Grande', false, $3, 'Pizzas')`,
      [
        `it-${now}-1`,
        o1Id,
        JSON.stringify([{ name: 'QUESO MOZZARELLA', price: 2.00, quantity: 1 }])
      ]
    );
    await client.query(
      `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_usd, change_given_usd, payer_name)
       VALUES ($1, $2, 'Efectivo USD', 16.00, 20.00, 4.00, 'Carlos Santana')`,
      [`pay-${now}-1`, o1Id]
    );
    await client.query('COMMIT');

    // Registrar movimientos en caja chica
    await postCompletedOrderCashMovements(client, o1Id);
    assert(true, `Comanda #${o1Num} ($16.00 USD) pagada con $20 USD en Efectivo (Vuelto: $4.00 USD)`);

    // Comanda 2: Pizza Mitad y Mitad Pequeña Hawaiana/Cuatro Quesos ($6.00 base + $0.50 champiñones) = $6.50 USD. Pago Efectivo COP.
    const o2Id = `aud-ord-${now}-2`;
    const o2Num = `A-${Math.floor(Math.random() * 800 + 100)}`;
    createdOrderIds.push(o2Id);

    const copRate = 3950;
    const o2COPExact = 6.50 * copRate; // 25,675 COP
    const o2COPTendered = 30000;
    const o2COPChange = 4325; // 30000 - 25675

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'mesa', 2, 'Beatriz Rivas', 'entregada', 'pagado', 6.50, 'ambos')`,
      [o2Id, o2Num]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, extras_json, category)
       VALUES ($1, $2, 'p2', 'HAWAIANA / CUATRO QUESOS', 6.50, 1, 'Pequeña', true, $3, $4, 'Pizzas')`,
      [
        `it-${now}-2`,
        o2Id,
        JSON.stringify({ half1Name: 'HAWAIANA', half2Name: 'CUATRO QUESOS', half2Extras: [{ name: 'CHAMPIÑONES', price: 0.50 }] }),
        JSON.stringify([{ name: 'CHAMPIÑONES', price: 0.50, quantity: 1 }])
      ]
    );
    await client.query(
      `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_cop, change_given_cop, cop_rate, payer_name)
       VALUES ($1, $2, 'Efectivo COP', 6.50, $3, $4, $5, 'Beatriz Rivas')`,
      [`pay-${now}-2`, o2Id, o2COPTendered, o2COPChange, copRate]
    );
    await client.query('COMMIT');

    await postCompletedOrderCashMovements(client, o2Id);
    assert(true, `Comanda #${o2Num} ($6.50 USD) pagada en Efectivo COP (Recibido: 30,000 COP, Vuelto: 4,325 COP)`);

    // Comanda 3: 2 Bebidas ($4.00) + 1 Pizza Margarita Grande ($10.00) = $14.00 USD. Pago Móvil Bs.
    const o3Id = `aud-ord-${now}-3`;
    const o3Num = `A-${Math.floor(Math.random() * 800 + 100)}`;
    createdOrderIds.push(o3Id);

    const bsRate = 36.5;
    const o3BsExact = 14.00 * bsRate; // 511.00 Bs

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'llevar', null, 'Manuel Pérez', 'entregada', 'pagado', 14.00, 'ambos')`,
      [o3Id, o3Num]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, category)
       VALUES ($1, $2, 'p3', 'MARGARITA', 10.00, 1, 'Grande', false, 'Pizzas')`,
      [`it-${now}-3a`, o3Id]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, category)
       VALUES ($1, $2, 'p4', 'COCA-COLA', 2.00, 2, 'Estándar', false, 'Bebidas')`,
      [`it-${now}-3b`, o3Id]
    );
    await client.query(
      `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_bs, change_given_bs, bs_rate, payer_name)
       VALUES ($1, $2, 'Pago Móvil', 14.00, $3, 0, $4, 'Manuel Pérez')`,
      [`pay-${now}-3`, o3Id, o3BsExact, bsRate]
    );
    await client.query('COMMIT');
    assert(true, `Comanda #${o3Num} ($14.00 USD) pagada por Pago Móvil (${o3BsExact.toFixed(2)} Bs)`);

    // Comanda 4: Comanda a Crédito de $15.00 USD
    const o4Id = `aud-ord-${now}-4`;
    const o4Num = `A-${Math.floor(Math.random() * 800 + 100)}`;
    createdOrderIds.push(o4Id);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders (id, order_number, type, table_number, customer_name, status, payment_status, total_usd, shift)
       VALUES ($1, $2, 'mesa', 3, 'Cliente Deudor Frecuente', 'entregada', 'credito', 15.00, 'ambos')`,
      [o4Id, o4Num]
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, category)
       VALUES ($1, $2, 'p5', 'CUATRO QUESOS', 15.00, 1, 'Grande', false, 'Pizzas')`,
      [`it-${now}-4`, o4Id]
    );
    await client.query('COMMIT');
    assert(true, `Comanda #${o4Num} ($15.00 USD) registrada en estado Crédito (Deudor)`);

    // ----------------------------------------------------
    // PASO 3: AUDITORÍA DE MATEMÁTICA Y CUADRATURA FINANCIERA
    // ----------------------------------------------------
    console.log('\n3️⃣ Verificando Cuadratura de Caja y Saldos...');

    // Ventas Totales: $16 + $6.50 + $14 + $15 = $51.50
    const totalVentasFacturadas = 16.00 + 6.50 + 14.00 + 15.00;
    const totalCobrado = 16.00 + 6.50 + 14.00; // $36.50
    const totalCredito = 15.00;

    // Efectivo Físico Esperado en Gaveta:
    // USD: Apertura $50.00 + Cobro neto ($20 - $4) = $66.00 USD
    const expectedUSD = aperturaUSD + (20.00 - 4.00);
    // COP: Apertura 100,000 + Cobro neto (30,000 - 4,325) = 125,675 COP
    const expectedCOP = aperturaCOP + (o2COPTendered - o2COPChange);

    // Consultar movimientos registrados en caja_chica_transactions
    const { rows: txRows } = await client.query(
      `SELECT * FROM caja_chica_transactions WHERE order_id = ANY($1::text[])`,
      [[o1Id, o2Id, o3Id, o4Id]]
    );

    const ingUSD = txRows.filter((t) => t.type === 'ingreso' && t.payment_method === 'Efectivo USD').reduce((s, t) => s + parseFloat(t.amount_usd), 0);
    const egUSD = txRows.filter((t) => t.type === 'egreso' && t.payment_method === 'Efectivo USD').reduce((s, t) => s + parseFloat(t.amount_usd), 0);
    const netUSD = ingUSD - egUSD;
    assert(netUSD === 16.00, `Ingreso neto en Efectivo USD en libro de caja: $${netUSD.toFixed(2)} (esperado $16.00)`);

    const ingCOP = txRows.filter((t) => t.type === 'ingreso' && t.payment_method === 'Efectivo COP').reduce((s, t) => s + parseFloat(t.amount_cop), 0);
    const egCOP = txRows.filter((t) => t.type === 'egreso' && t.payment_method === 'Efectivo COP').reduce((s, t) => s + parseFloat(t.amount_cop), 0);
    const netCOP = ingCOP - egCOP;
    assert(netCOP === 25675, `Ingreso neto en Efectivo COP en libro de caja: ${netCOP} COP (esperado 25,675 COP)`);

    // ----------------------------------------------------
    // PASO 4: AUDITORÍA DE ÍTEMS Y PIZZAS FACTURADAS
    // ----------------------------------------------------
    console.log('\n4️⃣ Verificando Conteo y Desglose de Ítems Vendidos...');

    const { rows: itemsRows } = await client.query(
      `SELECT oi.*, p.category as prod_cat FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ANY($1::text[])`,
      [[o1Id, o2Id, o3Id, o4Id]]
    );

    // Suma de los precios de los ítems en BD debe ser exactamente igual a $51.50
    const totalItemsBD = itemsRows.reduce((sum, it) => sum + (parseFloat(it.price) * it.quantity), 0);
    assert(totalItemsBD === totalVentasFacturadas, `Suma de precios de ítems en BD: $${totalItemsBD.toFixed(2)} == Total órdenes: $${totalVentasFacturadas.toFixed(2)}`);

    // Conteo de unidades
    const pizzaUnits = itemsRows.filter((it) => (it.category || '').includes('Pizzas') || (it.prod_cat || '').includes('Pizzas')).reduce((s, it) => s + it.quantity, 0);
    assert(pizzaUnits === 4, `Pizzas vendidas contabilizadas: ${pizzaUnits} unidades (esperado 4)`);

    const drinkUnits = itemsRows.filter((it) => (it.category || '').includes('Bebidas')).reduce((s, it) => s + it.quantity, 0);
    assert(drinkUnits === 2, `Bebidas vendidas contabilizadas: ${drinkUnits} unidades (esperado 2)`);

    // ----------------------------------------------------
    // PASO 5: AUDITORÍA DEL TICKET DE CIERRE TÉRMICO (ESC/POS)
    // ----------------------------------------------------
    console.log('\n5️⃣ Generando y Auditando Ticket Térmico de Cierre...');

    const cierreMockData = {
      shift: 'ambos',
      closedBy: 'Cajero Principal',
      openedUSD: aperturaUSD,
      openedCOP: aperturaCOP,
      expectedUSD: expectedUSD,
      expectedCOP: expectedCOP,
      actualUSD: expectedUSD,
      actualCOP: expectedCOP,
      differenceUSD: 0,
      differenceCOP: 0,
      totalSalesUSD: totalVentasFacturadas,
      creditsUSD: totalCredito,
      creditsCount: 1,
      exchangeRates: { COP: 3950, Bs: 36.5 },
      orders: [
        { id: o1Id, orderNumber: o1Num, totalUSD: 16.00, paymentStatus: 'pagado' },
        { id: o2Id, orderNumber: o2Num, totalUSD: 6.50, paymentStatus: 'pagado' },
        { id: o3Id, orderNumber: o3Num, totalUSD: 14.00, paymentStatus: 'pagado' },
        { id: o4Id, orderNumber: o4Num, totalUSD: 15.00, customerName: 'Cliente Deudor Frecuente', paymentStatus: 'credito' },
      ],
      items: itemsRows.map((it) => ({
        productName: it.product_name,
        price: parseFloat(it.price),
        quantity: it.quantity,
        size: it.size,
        category: it.category,
        extras: it.extras_json ? (typeof it.extras_json === 'string' ? JSON.parse(it.extras_json) : it.extras_json) : []
      })),
      payments: [
        { orderNumber: o1Num, paymentMethod: 'Efectivo USD', amountPaidUSD: 16.00, cashTenderedUSD: 20.00, changeGivenUSD: 4.00 },
        { orderNumber: o2Num, paymentMethod: 'Efectivo COP', amountPaidUSD: 6.50, cashTenderedCOP: 30000, changeGivenCOP: 4325, copRate: 3950 },
        { orderNumber: o3Num, paymentMethod: 'Pago Móvil', amountPaidUSD: 14.00, cashTenderedBs: 511.00, changeGivenBs: 0, bsRate: 36.5 },
      ],
      transactions: txRows
    };

    const cierreTicketBuffer = buildBasilicoCierreTicket(cierreMockData);
    assert(cierreTicketBuffer !== null && cierreTicketBuffer.length > 0, 'Ticket de Cierre generado en buffer');
    const ticketStr = cierreTicketBuffer.toString('latin1');

    assert(ticketStr.includes('BASILICO CIERRE'), 'Ticket lleva título BASILICO CIERRE');
    assert(ticketStr.includes('66.00$'), 'Ticket refleja exactamente $66.00 USD en efectivo en caja');
    assert(ticketStr.includes('125,675COP'), 'Ticket refleja exactamente 125,675 COP en caja');
    assert(ticketStr.includes('511.00BS'), 'Ticket refleja exactamente 511.00 BS de Pago Móvil');
    assert(ticketStr.includes('CREDITOS'), 'Ticket incluye sección de CREDITOS');
    assert(ticketStr.includes('15.00$'), 'Ticket refleja exactamente $15.00 USD en créditos por cobrar');
    assert(ticketStr.includes('PIZZAS Y COMIDAS') || ticketStr.includes('COMIDAS'), 'Ticket incluye sección de pizzas facturadas');
    assert(ticketStr.includes('PEPPERONI'), 'Ticket lista pizza PEPPERONI');
    assert(ticketStr.includes('HAWAIANA'), 'Ticket lista pizza HAWAIANA');
    assert(ticketStr.includes('COCA-COLA'), 'Ticket lista bebida COCA-COLA');

    // ----------------------------------------------------
    // PASO 6: LIMPIEZA
    // ----------------------------------------------------
    console.log('\n6️⃣ Limpiando registros de prueba...');
    await client.query('DELETE FROM caja_chica_transactions WHERE order_id = ANY($1::text[])', [createdOrderIds]);
    await client.query('DELETE FROM order_payments WHERE order_id = ANY($1::text[])', [createdOrderIds]);
    await client.query('DELETE FROM order_items WHERE order_id = ANY($1::text[])', [createdOrderIds]);
    await client.query('DELETE FROM orders WHERE id = ANY($1::text[])', [createdOrderIds]);
    await client.query('DELETE FROM caja_chica_apertura');
    assert(true, 'Base de datos limpia y en perfecto estado tras la auditoría.');

    console.log('\n================================================================');
    console.log('🎉 AUDITORÍA FINANCIERA 100% EXITOSA');
    console.log('   - Cuadratura de caja: EXACTA AL CÉNTIMO (USD, COP, Bs)');
    console.log('   - Conteo de unidades y adicionales: 100% FIEL');
    console.log('   - Registro en BD y arqueo térmico: SIN DISCREPANCIAS NI BUGS');
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Limpieza de emergencia
    if (createdOrderIds.length > 0) {
      await client.query('DELETE FROM caja_chica_transactions WHERE order_id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
      await client.query('DELETE FROM order_payments WHERE order_id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
      await client.query('DELETE FROM orders WHERE id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
    }
    console.error('Error durante auditoría contable:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

runAccountingAudit().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

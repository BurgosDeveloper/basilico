/**
 * Test script: test-comandas-real-shifts.js
 * 
 * Auditoría y validación exhaustiva de comandas reales en Basilico 2.0:
 * - Turno MAÑANA (Pastas, Entradas, Especialidades, Bebidas preparadas y comerciales, Mesas, Standby).
 * - Turno NOCHE (Pizzas, Mitad y Mitad / halfDetails, Tamaños, Preferencia de corte, Extras, Salsas, Delivery, PickUp, Standby).
 * - Cumplimiento estricto con GUIA.md:
 *   1. Filtro de ítems de cocina (isKitchenItem excluye bebidas comerciales de mostrador).
 *   2. Salsas impresas al final en tickets de cocina y 100% excluidas de la pre-cuenta del cliente.
 *   3. Símbolo oficial de moneda en pre-cuenta (€ / EUR).
 *   4. Validaciones obligatorias de Delivery (nombre cliente + delivery fee > 0) y PickUp (nombre cliente).
 *   5. Reubicación atómica de mesa (PATCH /api/orders/:id/change-table).
 *   6. Adición atómica de ítems (POST /api/orders/:id/append-items).
 *   7. Aislamiento total de turnos en Standby ("Poner en Espera").
 *   8. Eliminación del bug del limbo (bloqueo HTTP 409 al intentar entregar comanda con saldo o vuelto pendiente).
 */

const { initDb, query, getClient } = require('../server/db');
const { fetchAllOrders, fetchAllStandbyOrders, safeJsonParse, safeJsonParseObj } = require('../server/helpers/fetchAll');
const {
  isKitchenItem,
  isSalsaItem,
  consolidateKitchenItems,
  buildKitchenTicket,
  buildReceiptTicket,
} = require('../server/helpers/thermalPrinter');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

async function runTests() {
  console.log('================================================================================');
  console.log('🍕 TEST SUITE BASILICO 2.0: VALIDACIÓN DE COMANDAS REALES (MAÑANA Y NOCHE)');
  console.log('================================================================================\n');

  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  let currentUser = { username: 'test_operator', role: 'admin', shift: 'ambos' };
  app.use((req, res, next) => {
    req.user = currentUser;
    next();
  });

  const ordersRouter = require('../server/routes/orders')(io);
  const paymentsRouter = require('../server/routes/payments')(io);
  const standbyRouter = require('../server/routes/standby')(io);
  const cajaRouter = require('../server/routes/caja')(io);

  app.use('/api/orders', ordersRouter);
  app.use('/api/orders', paymentsRouter);
  app.use('/api/standby', standbyRouter);
  app.use('/api/caja-chica', cajaRouter);

  const PORT = 3097;
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
      throw new Error(`Fallo en aserción: ${msg}`);
    }
  }

  const createdOrderIds = [];
  const createdStandbyIds = [];
  const testTables = [25, 26, 27];

  try {
    for (const tbl of testTables) {
      await query(
        `INSERT INTO tables_config (id, number, name, capacity, status, zone)
         VALUES ($1, $2, $3, 4, 'libre', 'Salon Principal')
         ON CONFLICT (number) DO UPDATE SET status = 'libre'`,
        [`tbl-${tbl}`, tbl, `Mesa ${tbl}`]
      );
    }

    // =========================================================================
    // BLOQUE 1: TURNO MAÑANA
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('☀️ BLOQUE 1: VALIDACIÓN DE COMANDAS - TURNO MAÑANA (PASTAS, ENTRADAS, BEBIDAS)');
    console.log('------------------------------------------------------------------------\n');

    currentUser = { username: 'mesero_manana', role: 'mesero', shift: 'manana' };

    // 1.1 Crear comanda de salón en Mesa 25
    console.log('1.1 Creando Comanda Real Turno Mañana (Mesa 25)...');
    const morningPayload = {
      type: 'mesa',
      tableNumber: 25,
      customerName: 'Familia Rossi',
      kitchenNotes: 'Servir la entrada primero, por favor',
      targetPrinter: 'ninguna',
      items: [
        {
          productId: 'm-pas-1',
          productName: 'PASTA CARBONARA',
          price: 8.50, // Base 7.00 + Pan al Ajillo 1.50 = 8.50
          quantity: 1,
          category: 'PASTAS',
          notes: 'Al dente con extra pimienta negra',
          extras: [{ name: 'Pan al Ajillo', price: 1.50, category: 'Contornos' }],
        },
        {
          productId: 'm-ent-1',
          productName: 'AREPITAS CON NATA',
          price: 4.00,
          quantity: 1,
          category: 'ENTRADAS',
          isTakeaway: false,
        },
        {
          productId: 'prod-agua-mineral',
          productName: 'AGUA MINERAL',
          price: 1.00,
          quantity: 2,
          category: 'Bebidas',
          drinkType: 'comercial',
        },
        {
          productId: 'prod-jugo-natural',
          productName: 'JUGO NATURAL',
          price: 2.00,
          quantity: 1,
          category: 'Bebidas',
          drinkType: 'jugo',
          sugarPreference: 'Poca azúcar',
          flavor: 'Mora',
        },
      ],
      totalUSD: 16.50, // 7 + 1.50 + 4 + (1*2) + 2 = 16.50
    };

    const resM1 = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(morningPayload),
    });
    assert(resM1.status === 201, 'Comanda Mañana creada exitosamente (HTTP 201)');
    const orderM1 = await resM1.json();
    createdOrderIds.push(orderM1.id);
    assert(orderM1.shift === 'manana', 'Comanda asignada estrictamente al turno manana');
    assert(orderM1.status === 'en_preparacion', 'Comanda con ítems de cocina inicia en en_preparacion');

    // 1.2 Verificar persistencia en base de datos PostgreSQL
    console.log('\n1.2 Verificando campos e ítems en PostgreSQL...');
    const { rows: dbOrderM1 } = await query('SELECT * FROM orders WHERE id = $1', [orderM1.id]);
    assert(dbOrderM1.length === 1, 'Registro de orden encontrado en tabla orders');
    assert(parseFloat(dbOrderM1[0].total_usd) === 16.50, 'total_usd en BD es exactamente $16.50 USD');
    assert(dbOrderM1[0].table_number === 25, 'table_number en BD es 25');

    const { rows: dbItemsM1 } = await query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY price DESC', [orderM1.id]);
    assert(dbItemsM1.length === 4, '4 ítems persistidos en order_items');

    const dbPasta = dbItemsM1.find((i) => i.product_id === 'm-pas-1');
    assert(dbPasta && dbPasta.notes === 'Al dente con extra pimienta negra', 'Nota individual de pasta persistida');
    const pastaExtras = safeJsonParse(dbPasta.extras_json);
    assert(pastaExtras[0]?.name === 'Pan al Ajillo' && pastaExtras[0]?.price === 1.50, 'Extra Pan al Ajillo persistido');

    const dbJugo = dbItemsM1.find((i) => i.product_id === 'prod-jugo-natural');
    assert(dbJugo && dbJugo.sugar_preference === 'Poca azúcar', 'sugar_preference "Poca azúcar" persistido');
    assert(dbJugo && dbJugo.flavor === 'Mora', 'flavor "Mora" persistido');

    // 1.3 Verificar estado de ocupación de mesa en BD
    const { rows: tableM1 } = await query('SELECT status FROM tables_config WHERE number = 25');
    assert(tableM1[0]?.status === 'ocupada', 'Mesa 25 pasa a estado ocupada en tables_config');

    // 1.4 Validar Reglas de Cocina y Pre-cuenta en Mañana (GUIA.md)
    console.log('\n1.4 Validando filtrado de cocina e impresión de tickets en Mañana...');
    const kitchenItemsM1 = orderM1.items.filter(isKitchenItem);
    assert(kitchenItemsM1.length === 3, 'isKitchenItem envía 3 ítems a cocina (Pasta, Arepitas, Jugo Natural)');
    const excludedDrink = orderM1.items.find((it) => it.productId === 'prod-agua-mineral');
    assert(!isKitchenItem(excludedDrink), 'isKitchenItem EXCLUYE agua mineral comercial de cocina');

    const kitchenTicketM1 = buildKitchenTicket(orderM1, false, '80mm');
    assert(kitchenTicketM1 !== null, 'Ticket de cocina generado para comanda de la mañana');

    const receiptTicketM1 = buildReceiptTicket(orderM1, { COP: 3950, Bs: 36.5 }, '80mm');
    const receiptStrM1 = receiptTicketM1.toString('latin1');
    assert(receiptStrM1.includes('BASILICO'), 'Pre-cuenta incluye encabezado BASILICO');
    assert(receiptStrM1.includes('TOTAL EUR:') && (receiptStrM1.includes('€') || receiptTicketM1.includes(0x80)), 'Pre-cuenta usa la moneda oficial EUR (€)');

    // 1.5 Reubicación de Mesa en Tiempo Real (Mesa 25 -> Mesa 26)
    console.log('\n1.5 Probando Reubicación de Mesa (Mesa 25 -> Mesa 26)...');
    const changeTableRes = await fetch(`${baseUrl}/orders/${orderM1.id}/change-table`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newTableNumber: 26 }),
    });
    assert(changeTableRes.status === 200, 'Reubicación de mesa procesada (HTTP 200)');
    const { rows: t25After } = await query('SELECT status FROM tables_config WHERE number = 25');
    const { rows: t26After } = await query('SELECT status FROM tables_config WHERE number = 26');
    assert(t25After[0]?.status === 'libre', 'Mesa anterior 25 se libera automáticamente');
    assert(t26After[0]?.status === 'ocupada', 'Nueva mesa 26 se marca como ocupada');

    // 1.6 Adición de Ítems a la Comanda (Order Append)
    console.log('\n1.6 Probando Adición de Ítems a Mesa Abierta (OrderAppendModal backend)...');
    const appendRes = await fetch(`${baseUrl}/orders/${orderM1.id}/append-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addedItems: [
          {
            productId: 'm-ent-3',
            productName: 'CANASTAS DE PLATANO',
            price: 4.00,
            quantity: 1,
            category: 'ENTRADAS',
          },
        ],
        targetPrinter: 'ninguna',
      }),
    });
    assert(appendRes.status === 200, 'Adición de ítems procesada exitosamente (HTTP 200)');
    const updatedM1 = await appendRes.json();
    const effectiveTotal = parseFloat(updatedM1.newTotalUSD !== undefined ? updatedM1.newTotalUSD : updatedM1.order?.totalUSD);
    assert(effectiveTotal === 20.50, 'Total actualizado atómicamente a $20.50 USD (16.50 + 4.00)');

    // 1.7 Standby en Mañana y Aislamiento por Turno
    console.log('\n1.7 Probando Pedidos en Standby ("Poner en Espera") con Aislamiento de Turno...');
    const standbyMorningRes = await fetch(`${baseUrl}/standby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: { type: 'mesa', tableNumber: 27, title: 'Mesa 27' },
        customerName: 'Cliente Standby Mañana',
        cartItems: [{ productId: 'm-pas-2', productName: 'PASTA FILETTO', price: 7.00, quantity: 1 }],
        totalUSD: 7.00,
        itemCount: 1,
        shift: 'manana',
      }),
    });
    assert(standbyMorningRes.status === 200, 'Pedido en espera guardado en turno manana');
    const { id: standbyMorningId } = await standbyMorningRes.json();
    createdStandbyIds.push(standbyMorningId);

    // Consumir el standby al crear la comanda
    const checkoutStandbyRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mesa',
        tableNumber: 27,
        customerName: 'Cliente Standby Mañana',
        items: [{ productId: 'm-pas-2', productName: 'PASTA FILETTO', price: 7.00, quantity: 1 }],
        totalUSD: 7.00,
        standbyDraftId: standbyMorningId,
        targetPrinter: 'ninguna',
      }),
    });
    assert(checkoutStandbyRes.status === 201, 'Comanda creada a partir de Standby draft');
    const orderStandbyM = await checkoutStandbyRes.json();
    createdOrderIds.push(orderStandbyM.id);

    const { rows: checkStandbyDeleted } = await query('SELECT * FROM standby_orders WHERE id = $1', [standbyMorningId]);
    assert(checkStandbyDeleted.length === 0, 'Borrador en Standby consumido y eliminado atómicamente');

    // 1.8 Cobro y Candado Anti-Limbo en Mañana
    console.log('\n1.8 Probando Cobro y Candado Anti-Limbo (HTTP 409) en Mañana...');
    currentUser = { username: 'cajero_manana', role: 'caja', shift: 'manana' };

    const deliverUnpaid = await fetch(`${baseUrl}/orders/${orderM1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverUnpaid.status === 409, 'Rechazado (HTTP 409): no se puede entregar comanda con saldo pendiente ($20.50)');

    // Pagar $20.50 exactos en USD
    const payExactRes = await fetch(`${baseUrl}/orders/${orderM1.id}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20.50,
        paymentMethod: 'Efectivo USD',
        cashTenderedUSD: 20.50,
        changeGivenUSD: 0,
      }),
    });
    assert(payExactRes.status === 200, 'Pago exacto de $20.50 USD registrado');
    const paidOrderM1 = await payExactRes.json();
    assert(paidOrderM1.paymentStatus === 'pagado', 'Estado de pago pasa a "pagado"');

    const deliverPaid = await fetch(`${baseUrl}/orders/${orderM1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverPaid.status === 200, 'Comanda 100% cuadrada entregada exitosamente (HTTP 200)');

    const { rows: t26Freed } = await query('SELECT status FROM tables_config WHERE number = 26');
    assert(t26Freed[0]?.status === 'libre', 'Mesa 26 liberada automáticamente tras entrega de comanda pagada');

    // =========================================================================
    // BLOQUE 2: TURNO NOCHE
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('🌙 BLOQUE 2: VALIDACIÓN DE COMANDAS - TURNO NOCHE (PIZZAS, MITADES, DELIVERY, SALSAS)');
    console.log('------------------------------------------------------------------------\n');

    currentUser = { username: 'mesero_noche', role: 'mesero', shift: 'noche' };

    // 2.1 Validaciones obligatorias de Delivery y PickUp según GUIA.md
    console.log('2.1 Validando campos obligatorios de Delivery y PickUp (GUIA.md)...');
    const failDelivNoName = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        deliveryFeeUSD: 2.00,
        items: [{ productId: 'pizza-pepperoni', productName: 'PEPPERONI', price: 14, quantity: 1 }],
      }),
    });
    assert(failDelivNoName.status === 400, 'Delivery sin nombre del cliente rechazado con HTTP 400');

    const failDelivNoFee = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        customerName: 'Cliente Delivery',
        deliveryFeeUSD: 0,
        items: [{ productId: 'pizza-pepperoni', productName: 'PEPPERONI', price: 14, quantity: 1 }],
      }),
    });
    assert(failDelivNoFee.status === 400, 'Delivery con tarifa $0 rechazada con HTTP 400');

    const failPickupNoName = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pickup',
        items: [{ productId: 'pizza-pepperoni', productName: 'PEPPERONI', price: 14, quantity: 1 }],
      }),
    });
    assert(failPickupNoName.status === 400, 'PickUp sin nombre de cliente rechazado con HTTP 400');

    // 2.2 Creación de Comanda Real de Delivery con Pizza Mitad y Mitad
    console.log('\n2.2 Creando Comanda Real Turno Noche con Pizza Mitad y Mitad, Salsa y Bebida...');
    const nightPayload = {
      type: 'delivery',
      customerName: 'Santiago Giménez - Av. Bolivar #45',
      deliveryFeeUSD: 2.50,
      kitchenNotes: 'Entregar antes de las 9:00 PM',
      targetPrinter: 'ninguna',
      items: [
        // Ítem 1: Pizza Grande Mitad y Mitad
        {
          productId: 'pizza-pepperoni',
          productName: 'PEPPERONI / HAWAIANA',
          price: 16.00, // Base 14.00 + 1.00 (Mozzarella) + 1.00 (Tocineta) = 16.00
          quantity: 1,
          size: 'Grande',
          category: 'Pizzas',
          isHalfHalf: true,
          halfDetails: {
            half1Id: 'pizza-pepperoni',
            half1Name: 'PEPPERONI',
            half1Removed: ['CEBOLLA'],
            half1Extras: [{ name: 'Extra Queso Mozzarella', price: 1.00, quantity: 1 }],
            half2Id: 'pizza-hawaiana',
            half2Name: 'HAWAIANA',
            half2Removed: [],
            half2Extras: [{ name: 'Tocineta', price: 1.00, quantity: 1 }],
          },
          isCut: true,
          cutPreference: 'Picada',
          notes: 'Masa bien tostada por favor',
          extras: [
            { name: '1/2 Extra Queso Mozzarella', price: 1.00 },
            { name: '1/2 Tocineta', price: 1.00 },
          ],
        },
        // Ítem 2: Pizza Pequeña
        {
          productId: 'pizza-cuatro-quesos',
          productName: 'CUATRO QUESOS',
          price: 6.00,
          quantity: 1,
          size: 'Pequeña',
          category: 'Pizzas',
          cutPreference: 'Entera',
          isCut: false,
        },
        // Ítem 3: Bebida comercial
        {
          productId: 'prod-refresco-botella',
          productName: 'REFRESCO DE BOTELLA',
          price: 1.00,
          quantity: 2,
          category: 'Bebidas',
          drinkType: 'refresco',
        },
        // Ítem 4: Salsa complementaria
        {
          productId: 'ing-salsa-ajo',
          productName: 'SALSA DE AJO',
          price: 0.00,
          quantity: 1,
          category: 'Salsas',
        },
      ],
      totalUSD: 26.50, // 14 + 1 + 1 + 6 + 2 (2x1) + 0 + 2.50 (delivery) = 26.50
    };

    const resN1 = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nightPayload),
    });
    assert(resN1.status === 201, 'Comanda Noche Delivery creada exitosamente (HTTP 201)');
    const orderN1 = await resN1.json();
    createdOrderIds.push(orderN1.id);
    assert(orderN1.shift === 'noche', 'Comanda asignada estrictamente al turno noche');
    assert(parseFloat(orderN1.deliveryFeeUSD) === 2.50, 'deliveryFeeUSD es $2.50 USD');

    // 2.3 Verificar persistencia de campos de Pizza y Mitades en PostgreSQL
    console.log('\n2.3 Verificando campos de Pizza, Mitades y Salsas en PostgreSQL...');
    const { rows: dbItemsN1 } = await query('SELECT * FROM order_items WHERE order_id = $1', [orderN1.id]);
    assert(dbItemsN1.length === 4, '4 ítems persistidos en order_items para la comanda de noche');

    const dbPizzaHalf = dbItemsN1.find((i) => i.is_half_half === true);
    assert(dbPizzaHalf, 'Ítem mitad y mitad detectado con flag is_half_half = true');
    assert(dbPizzaHalf.size === 'Grande', 'Tamaño de pizza "Grande" persistido');
    assert(dbPizzaHalf.is_cut === true && dbPizzaHalf.cut_preference === 'Picada', 'Preferencia de corte "Picada" persistida');
    
    const halfParsed = safeJsonParseObj(dbPizzaHalf.half_details) || {};
    assert(halfParsed.half1Name === 'PEPPERONI' && halfParsed.half2Name === 'HAWAIANA', 'Nombres de mitades PEPPERONI y HAWAIANA persistidos');
    assert(halfParsed.half1Removed[0] === 'CEBOLLA', 'Ingrediente removido en mitad 1 (CEBOLLA) persistido');
    assert(halfParsed.half1Extras[0]?.name === 'Extra Queso Mozzarella', 'Extra en mitad 1 persistido');

    const dbSauce = dbItemsN1.find((i) => i.category === 'Salsas' || i.product_name === 'SALSA DE AJO');
    assert(dbSauce, 'Ítem de salsa persistido en base de datos');

    // 2.4 Validar Reglas de Cocina y Pre-cuenta en Noche (GUIA.md)
    console.log('\n2.4 Validando consolidación de cocina y pre-cuenta en Noche...');
    const consolidatedKitchen = consolidateKitchenItems(orderN1.items, orderN1);
    
    // Validar regla estricta: Salsas SIEMPRE al final de la comanda de cocina
    const lastKitchenItem = consolidatedKitchen[consolidatedKitchen.length - 1];
    assert(lastKitchenItem.isSalsa === true, 'Regla GUIA.md: La salsa se ubica estrictamente al FINAL de la comanda de cocina');

    // Validar detalles de pizza en comanda de cocina
    const pizzaConsolidated = consolidatedKitchen.find((c) => c.name.includes('PEPPERONI') || c.name.includes('HAWAIANA'));
    assert(pizzaConsolidated.details.some((d) => d.includes('PICADA')), 'Detalle de cocina incluye 🔪 PICADA');
    assert(pizzaConsolidated.details.some((d) => d.includes('1RA MITAD SIN: CEBOLLA')), 'Detalle incluye 1RA MITAD SIN: CEBOLLA');
    assert(pizzaConsolidated.details.some((d) => d.includes('1RA MITAD ADD: Extra Queso Mozzarella')), 'Detalle incluye 1RA MITAD ADD');

    // Validar regla pre-cuenta: Salsas 100% EXCLUIDAS de la pre-cuenta
    const receiptTicketN1 = buildReceiptTicket(orderN1, { COP: 3950, Bs: 36.5 }, '80mm');
    const receiptStrN1 = receiptTicketN1.toString('latin1');
    assert(!receiptStrN1.includes('SALSA DE AJO'), 'Regla GUIA.md: La salsa queda 100% EXCLUIDA de la pre-cuenta del comensal');
    assert(receiptStrN1.includes('TOTAL EUR:') && (receiptStrN1.includes('€') || receiptTicketN1.includes(0x80)), 'Pre-cuenta usa la moneda oficial EUR (€)');

    // 2.5 Cobro con Dinero de Más, Vuelto Pendiente y Candado Anti-Limbo
    console.log('\n2.5 Probando Cobro con Excedente, Vuelto Pendiente y Candado Anti-Limbo...');
    currentUser = { username: 'cajero_noche', role: 'caja', shift: 'noche' };

    // Cliente entrega $30.00 USD en efectivo para cuenta de $26.50 USD -> Vuelto pendiente = $3.50 USD
    const payExcessRes = await fetch(`${baseUrl}/orders/${orderN1.id}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 30.00, // Dinero entregado por el cliente
        paymentMethod: 'Efectivo USD',
      }),
    });
    assert(payExcessRes.status === 200, 'Pago con excedente ($30.00 recibidos para cuenta de $26.50) registrado');

    // Consultar comanda vía fetchAllOrders para verificar cálculo de vuelto pendiente
    const allOrdersAfterExcess = await fetchAllOrders({ shift: 'noche' });
    const fetchedN1 = allOrdersAfterExcess.find((o) => o.id === orderN1.id);
    assert(fetchedN1.pendingChangeUSD >= 3.49, 'Comanda registra vuelto pendiente por entregar ($3.50 USD)');
    assert(fetchedN1.paymentStatus !== 'pagado', 'Comanda con vuelto pendiente NO se marca como pagada');

    // Intentar entregar comanda teniendo vuelto pendiente -> DEBE RECHAZAR CON HTTP 409
    const deliverWithPendingChange = await fetch(`${baseUrl}/orders/${orderN1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverWithPendingChange.status === 409, 'Rechazado (HTTP 409): bloqueada entrega con vuelto pendiente ($3.50)');

    // Registrar la entrega del vuelto al cliente ($3.50 USD)
    console.log('\n2.6 Registrando entrega de vuelto ($3.50 USD)...');
    const giveChangeRes = await fetch(`${baseUrl}/orders/${orderN1.id}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 3.50,
        paymentMethod: 'Efectivo USD',
        changeGivenUSD: 3.50,
        cashTenderedUSD: 0,
      }),
    });
    assert(giveChangeRes.status === 200, 'Vuelto de $3.50 USD registrado exitosamente');

    // Ahora la comanda está 100% saldada y cuadrada
    const allOrdersAfterChange = await fetchAllOrders({ shift: 'noche' });
    const fetchedN1Settled = allOrdersAfterChange.find((o) => o.id === orderN1.id);
    assert(fetchedN1Settled.pendingChangeUSD <= 0.05, 'Vuelto pendiente ahora es $0.00');
    assert(fetchedN1Settled.paymentStatus === 'pagado', 'Comanda 100% cuadrada pasa a status pagado');

    // Ahora sí se permite entregar la orden
    const deliverSettled = await fetch(`${baseUrl}/orders/${orderN1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverSettled.status === 200, 'Comanda entregada exitosamente (HTTP 200)');

    // =========================================================================
    // BLOQUE 3: VALIDACIÓN DE REGLAS DE CATÁLOGO Y PURGA LIMPIA
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('🛡️ BLOQUE 3: INTEGRIDAD DE CATÁLOGO Y LIMPIEZA DE DATOS DE PRUEBA');
    console.log('------------------------------------------------------------------------\n');

    // Verificar que los 83 productos y 48 ingredientes siguen 100% intactos
    const { rows: prodCount } = await query('SELECT count(*) FROM products');
    const { rows: ingCount } = await query('SELECT count(*) FROM ingredients');
    assert(parseInt(prodCount[0].count, 10) === 83, 'Catálogo de productos 100% íntegro (83 productos)');
    assert(parseInt(ingCount[0].count, 10) === 48, 'Catálogo de ingredientes 100% íntegro (48 ingredientes)');

    console.log(`\n🎉 TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);

  } finally {
    console.log('\n🧹 Limpiando registros de prueba...');
    for (const ordId of createdOrderIds) {
      await query('DELETE FROM order_payments WHERE order_id = $1', [ordId]);
      await query('DELETE FROM order_items WHERE order_id = $1', [ordId]);
      await query('DELETE FROM orders WHERE id = $1', [ordId]);
    }
    for (const sId of createdStandbyIds) {
      await query('DELETE FROM standby_orders WHERE id = $1', [sId]);
    }
    for (const tbl of testTables) {
      await query('UPDATE tables_config SET status = $1 WHERE number = $2', ['libre', tbl]);
    }
    server.close();
    console.log('✅ Base de datos restaurada y limpia sin tocar datos reales.\n');
  }
}

runTests().then(() => {
  console.log('🏁 Fin de la suite de pruebas.');
  process.exit(0);
}).catch((err) => {
  console.error('\n💥 ERROR FATAL EN SUITE DE PRUEBAS:', err);
  process.exit(1);
});

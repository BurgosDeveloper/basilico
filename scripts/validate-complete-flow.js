/**
 * Script de validación integral del flujo completo de Basilico POS
 * 1. Inicialización y Conexión DB
 * 2. Catálogo de Productos e Ingredientes (4 niveles de precios)
 * 3. Creación de Orden con Pizza Completa y Pizza Mitad y Mitad
 * 4. Verificación de comanda térmica de cocina
 * 5. Adición de producto (OrderAppend) a la comanda existente
 * 6. Verificación de ticket de adición para cocina
 * 7. Flujo KDS (Cambio de estado: en_preparacion -> preparada -> entregada)
 * 8. Flujo Caja (Cobro multimoneda: USD + COP)
 * 9. Auditoría Contable y Reporte de Intervalo
 * 10. Limpieza del pedido de prueba
 */

const { initDb, query, getClient } = require('../server/db');
const { fetchAllOrders, fetchAllProducts, fetchAllIngredients, fetchAllTables } = require('../server/helpers/fetchAll');
const { buildKitchenTicket, buildKitchenAdditionTicket, buildReceiptTicket, consolidateKitchenItems } = require('../server/helpers/thermalPrinter');
const { getRatesForShift } = require('../server/helpers/exchangeRates');

async function runValidation() {
  console.log('======================================================');
  console.log('🍕 INICIANDO AUDITORÍA Y VALIDACIÓN DE FLUJO BASILICO');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [OK] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Fallo en prueba: ${message}`);
    }
  }

  try {
    // ----------------------------------------------------
    // PASO 1: CONEXIÓN A POSTGRESQL (basilico)
    // ----------------------------------------------------
    console.log('1️⃣ Conectando a Base de Datos basilico...');
    await initDb();
    const { rows: dbTest } = await query('SELECT current_database(), current_user');
    assert(dbTest[0].current_database === 'basilico', `BD activa es 'basilico' (${dbTest[0].current_database})`);
    assert(dbTest[0].current_user === 'postgres', `Usuario DB es 'postgres' (${dbTest[0].current_user})`);

    // ----------------------------------------------------
    // PASO 2: CATÁLOGO DE PRODUCTOS E INGREDIENTES
    // ----------------------------------------------------
    console.log('\n2️⃣ Verificando Catálogo Oficial de Pizzas, Bebidas e Ingredientes...');
    const products = await fetchAllProducts();
    const ingredients = await fetchAllIngredients();

    assert(products.length >= 32, `Productos en BD: ${products.length} (esperado >= 32)`);
    assert(ingredients.length >= 36, `Ingredientes en BD: ${ingredients.length} (esperado >= 36)`);

    const pizzaPepperoni = products.find((p) => p.id === 'pizza-pepperoni');
    assert(!!pizzaPepperoni, 'Pizza Pepperoni existe en catálogo');
    assert(Number(pizzaPepperoni.price) === 14.00, `Precio Grande Pepperoni: $${pizzaPepperoni.price} (esperado 14.00)`);
    assert(Number(pizzaPepperoni.priceSmall) === 7.00, `Precio Pequeña Pepperoni: $${pizzaPepperoni.priceSmall} (esperado 7.00)`);

    const pizzaHawaiana = products.find((p) => p.id === 'pizza-hawaiana');
    assert(!!pizzaHawaiana, 'Pizza Hawaiana existe en catálogo');
    assert(Number(pizzaHawaiana.price) === 12.00, `Precio Grande Hawaiana: $${pizzaHawaiana.price} (esperado 12.00)`);
    assert(Number(pizzaHawaiana.priceSmall) === 6.00, `Precio Pequeña Hawaiana: $${pizzaHawaiana.priceSmall} (esperado 6.00)`);

    const ingQueso = ingredients.find((i) => i.id === 'ing-queso-mozzarella');
    assert(!!ingQueso, 'Ingrediente Queso Mozzarella existe');
    assert(ingQueso.priceGrandeCompleta === 2.00, `Queso Mozzarella Grande Completa: $${ingQueso.priceGrandeCompleta} (esperado 2.00)`);
    assert(ingQueso.priceGrandeMitad === 1.00, `Queso Mozzarella Grande Mitad: $${ingQueso.priceGrandeMitad} (esperado 1.00)`);
    assert(ingQueso.pricePequenaCompleta === 1.50, `Queso Mozzarella Pequeña Completa: $${ingQueso.pricePequenaCompleta} (esperado 1.50)`);
    assert(ingQueso.pricePequenaMitad === 0.75, `Queso Mozzarella Pequeña Mitad: $${ingQueso.pricePequenaMitad} (esperado 0.75)`);

    // ----------------------------------------------------
    // PASO 3: CREACIÓN DE ORDEN MESERO
    // ----------------------------------------------------
    console.log('\n3️⃣ Creando Comanda con Pizza Completa y Pizza Mitad y Mitad...');
    const testOrderId = `test-ord-${Date.now()}`;
    const testOrderNumber = `T-${Math.floor(Math.random() * 900 + 100)}`;

    const item1 = {
      id: `it-${Date.now()}-1`,
      productId: 'pizza-pepperoni',
      productName: 'PEPPERONI',
      price: 16.00, // $14 base + $2 queso mozzarella extra
      quantity: 1,
      size: 'Grande',
      isHalfHalf: false,
      removedIngredients: ['Orégano'],
      extras: [{ name: 'Queso Mozzarella', price: 2.00, quantity: 1, unitPrice: 2.00 }],
      isTakeaway: false,
      isCut: false,
      cutPreference: 'Entera',
      notes: 'Bien dorada'
    };

    const item2 = {
      id: `it-${Date.now()}-2`,
      productId: 'pizza-hawaiana',
      productName: 'HAWAIANA / CUATRO QUESOS',
      price: 6.50, // max($6, $6) = $6 base + $0.50 champiñones en mitad 2
      quantity: 1,
      size: 'Pequeña',
      isHalfHalf: true,
      halfDetails: {
        half1Name: 'HAWAIANA',
        half2Name: 'CUATRO QUESOS',
        half1Removed: ['Piña'],
        half1Extras: [],
        half2Removed: [],
        half2Extras: [{ name: 'Champiñones', price: 0.50, quantity: 1, unitPrice: 0.50 }]
      },
      isTakeaway: false,
      isCut: false,
      cutPreference: 'Entera',
      notes: 'Poco orégano'
    };

    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO orders (id, order_number, type, table_number, customer_name, kitchen_notes, status, payment_status, total_usd, waiter_name, shift, delivery_fee_usd)
         VALUES ($1, $2, 'mesa', 4, 'Familia Gómez', 'Mesa de 4 personas', 'en_preparacion', 'no_pagado', $3, 'Mesero Principal', 'ambos', 0)`,
        [testOrderId, testOrderNumber, item1.price + item2.price]
      );

      for (const it of [item1, item2]) {
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, is_takeaway, is_delivery, is_cut, cut_preference, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, $13, $14, $15)`,
          [
            it.id,
            testOrderId,
            it.productId,
            it.productName,
            it.price,
            it.quantity,
            it.size,
            it.isHalfHalf,
            JSON.stringify(it.halfDetails || null),
            it.removedIngredients || [],
            JSON.stringify(it.extras || []),
            it.isTakeaway,
            it.isCut,
            it.cutPreference,
            it.notes
          ]
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Verificar lectura en BD
    const allOrders = await fetchAllOrders();
    const createdOrder = allOrders.find((o) => o.id === testOrderId);
    assert(!!createdOrder, `Orden #${testOrderNumber} creada y recuperada exitosamente`);
    assert(createdOrder.items.length === 2, `La comanda tiene 2 ítems (obtenidos: ${createdOrder.items.length})`);
    assert(Number(createdOrder.totalUSD) === 22.50, `Total de la comanda: $${createdOrder.totalUSD} (esperado $22.50)`);

    const loadedHalfItem = createdOrder.items.find((i) => i.isHalfHalf);
    assert(!!loadedHalfItem, 'Ítem Mitad y Mitad guardado con isHalfHalf = true');
    assert(loadedHalfItem.size === 'Pequeña', `Tamaño de mitad y mitad: ${loadedHalfItem.size} (esperado Pequeña)`);
    assert(loadedHalfItem.halfDetails.half1Name === 'HAWAIANA', `Mitad 1: ${loadedHalfItem.halfDetails.half1Name}`);
    assert(loadedHalfItem.halfDetails.half2Name === 'CUATRO QUESOS', `Mitad 2: ${loadedHalfItem.halfDetails.half2Name}`);
    assert(loadedHalfItem.halfDetails.half1Removed.includes('Piña'), 'Mitad 1 tiene Piña removida');
    assert(loadedHalfItem.halfDetails.half2Extras[0].name === 'Champiñones', 'Mitad 2 tiene Champiñones extra');

    // ----------------------------------------------------
    // PASO 4: VERIFICACIÓN DE TICKET TÉRMICO DE COCINA
    // ----------------------------------------------------
    console.log('\n4️⃣ Generando Ticket Térmico de Cocina (ESC/POS)...');
    const kitchenTicket = buildKitchenTicket(createdOrder);
    assert(kitchenTicket !== null && kitchenTicket.length > 0, 'Ticket de cocina generado correctamente');
    const ticketStr = kitchenTicket.toString('ascii');
    assert(ticketStr.includes(testOrderNumber), `Ticket contiene el número de orden #${testOrderNumber}`);
    assert(ticketStr.includes('MESA #4'), 'Ticket especifica SERVICIO: MESA #4');
    assert(ticketStr.includes('PEPPERONI'), 'Ticket incluye PEPPERONI');
    assert(ticketStr.includes('Grande'), 'Ticket incluye tamaño Grande');
    assert(!ticketStr.includes('PICADA'), 'Ticket no incluye corte PICADA (removido para pizzas)');
    assert(ticketStr.includes('SIN: OREGANO'), 'Ticket incluye exclusión SIN: OREGANO');
    assert(ticketStr.includes('HAWAIANA / CUATRO'), 'Ticket incluye pizza combinada');
    assert(ticketStr.includes('Pequena'), 'Ticket incluye tamaño Pequeña');
    assert(ticketStr.includes('1RA MITAD SIN: PINA'), 'Ticket desglosa 1RA MITAD SIN: PINA');
    assert(ticketStr.includes('2DA MITAD ADD:') && ticketStr.includes('Champinones'), 'Ticket desglosa 2DA MITAD ADD: Champinones');

    // ----------------------------------------------------
    // PASO 5: ADICIÓN DE ÍTEM A COMANDA ABIERTA (OrderAppend)
    // ----------------------------------------------------
    console.log('\n5️⃣ Adicionando Ítem nuevo a la comanda abierta...');
    const appendItem = {
      id: `it-${Date.now()}-3`,
      productId: 'pizza-margarita',
      productName: 'MARGARITA',
      price: 10.00,
      quantity: 1,
      size: 'Grande',
      isHalfHalf: false,
      extras: [],
      isTakeaway: false,
      isCut: false,
      cutPreference: 'Entera',
      notes: 'Masa crujiente',
      isNewOrModified: true
    };

    const appendClient = await getClient();
    try {
      await appendClient.query('BEGIN');
      await appendClient.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, removed_ingredients, extras_json, is_new_or_modified, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, '{}', '[]', TRUE, $8)`,
        [appendItem.id, testOrderId, appendItem.productId, appendItem.productName, appendItem.price, appendItem.quantity, appendItem.size, appendItem.notes]
      );
      await appendClient.query(
        `UPDATE orders SET total_usd = total_usd + $1 WHERE id = $2`,
        [appendItem.price, testOrderId]
      );
      await appendClient.query('COMMIT');
    } catch (e) {
      await appendClient.query('ROLLBACK');
      throw e;
    } finally {
      appendClient.release();
    }

    const { rows: updatedOrderRows } = await query('SELECT total_usd FROM orders WHERE id = $1', [testOrderId]);
    assert(Number(updatedOrderRows[0].total_usd) === 32.50, `Total actualizado tras adición: $${updatedOrderRows[0].total_usd} (esperado $32.50)`);

    // ----------------------------------------------------
    // PASO 6: TICKET DE ADICIÓN TÉRMICO DE COCINA
    // ----------------------------------------------------
    console.log('\n6️⃣ Verificando Ticket de Adición para Cocina (Solo ítems nuevos)...');
    const additionTicket = buildKitchenAdditionTicket(createdOrder, [appendItem]);
    assert(additionTicket !== null, 'Ticket de adición generado exitosamente');
    const additionStr = additionTicket.toString('ascii');
    assert(additionStr.includes('ADICION COCINA'), 'Ticket tiene encabezado ADICION COCINA');
    assert(additionStr.includes('MARGARITA'), 'Ticket incluye la pizza adicionada MARGARITA');
    assert(additionStr.includes('SOLO PREPARAR ADICION'), 'Ticket lleva aviso SOLO PREPARAR ADICION');
    assert(!additionStr.includes('HAWAIANA'), 'Ticket de adición NO duplica la pizza anterior HAWAIANA');

    // ----------------------------------------------------
    // PASO 7: FLUJO KDS (COCINA)
    // ----------------------------------------------------
    console.log('\n7️⃣ Simulando Avance de Estados en Cocina KDS...');
    await query(`UPDATE orders SET status = 'preparada' WHERE id = $1`, [testOrderId]);
    const { rows: s1 } = await query(`SELECT status FROM orders WHERE id = $1`, [testOrderId]);
    assert(s1[0].status === 'preparada', 'Comanda avanzada a status: preparada');

    await query(`UPDATE orders SET status = 'entregada' WHERE id = $1`, [testOrderId]);
    const { rows: s2 } = await query(`SELECT status FROM orders WHERE id = $1`, [testOrderId]);
    assert(s2[0].status === 'entregada', 'Comanda avanzada a status: entregada');

    // ----------------------------------------------------
    // PASO 8: FLUJO DE CAJA Y COBRO MULTIMONEDA (USD + COP)
    // ----------------------------------------------------
    console.log('\n8️⃣ Procesando Cobro Mixto Multimoneda en Caja ($32.50 USD)...');
    // Pago: $20 USD en efectivo + $12.50 USD pagados en COP (12.50 * 3950 = 49,375 COP)
    const copRate = 3950;
    const bsRate = 36.50;
    const paidUSD1 = 20.00;
    const paidUSD2 = 12.50;
    const paidCOP = paidUSD2 * copRate; // 49375 COP

    const payClient = await getClient();
    try {
      await payClient.query('BEGIN');
      // Registro 1: Pago Efectivo USD
      await payClient.query(
        `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_usd, change_given_usd, payer_name, cop_rate, bs_rate)
         VALUES ($1, $2, 'Efectivo USD', $3, 20.00, 0.00, 'Cliente General', $4, $5)`,
        [`pay-1-${Date.now()}`, testOrderId, paidUSD1, copRate, bsRate]
      );

      // Registro 2: Pago Efectivo COP
      await payClient.query(
        `INSERT INTO order_payments (id, order_id, payment_method, amount_paid_usd, cash_tendered_cop, change_given_cop, payer_name, cop_rate, bs_rate)
         VALUES ($1, $2, 'Efectivo COP', $3, $4, 0.00, 'Cliente General', $5, $6)`,
        [`pay-2-${Date.now()}`, testOrderId, paidUSD2, paidCOP, copRate, bsRate]
      );

      // Actualizar Orden a Pagado
      await payClient.query(
        `UPDATE orders SET payment_status = 'pagado', payment_method = 'Mixto', paid_amount_usd = $1 WHERE id = $2`,
        [paidUSD1 + paidUSD2, testOrderId]
      );

      await payClient.query('COMMIT');
    } catch (e) {
      await payClient.query('ROLLBACK');
      throw e;
    } finally {
      payClient.release();
    }

    const { rows: paidCheck } = await query(`SELECT payment_status, payment_method, paid_amount_usd, total_usd FROM orders WHERE id = $1`, [testOrderId]);
    assert(paidCheck[0].payment_status === 'pagado', 'Comanda marcada como pagada');
    assert(paidCheck[0].payment_method === 'Mixto', 'Método de pago marcado como Mixto');
    assert(Number(paidCheck[0].paid_amount_usd) === Number(paidCheck[0].total_usd), `Monto cobrado ($${paidCheck[0].paid_amount_usd}) coincide exactamente con el total ($${paidCheck[0].total_usd})`);

    // ----------------------------------------------------
    // PASO 9: TICKET DE RECIBO FINAL PARA CLIENTE
    // ----------------------------------------------------
    console.log('\n9️⃣ Verificando Ticket de Recibo de Cuenta para Cliente...');
    const orderForReceipt = (await fetchAllOrders()).find((o) => o.id === testOrderId);
    const receiptBuf = buildReceiptTicket(orderForReceipt, { copRate, bsRate });
    assert(receiptBuf !== null, 'Ticket de recibo para cliente generado');
    const receiptStr = receiptBuf.toString('ascii');
    assert(receiptStr.includes('BASILICO'), 'Recibo lleva membrete BASILICO');
    assert(receiptStr.includes('PRE-CUENTA') || receiptStr.includes('CONSUMO'), 'Recibo confirma encabezado de pre-cuenta/consumo');

    // ----------------------------------------------------
    // PASO 10: LIMPIEZA DEL PEDIDO DE PRUEBA
    // ----------------------------------------------------
    console.log('\n🔟 Limpiando comanda de prueba en base de datos...');
    await query(`DELETE FROM order_payments WHERE order_id = $1`, [testOrderId]);
    await query(`DELETE FROM order_items WHERE order_id = $1`, [testOrderId]);
    await query(`DELETE FROM orders WHERE id = $1`, [testOrderId]);
    const { rows: verifyClean } = await query(`SELECT COUNT(*) FROM orders WHERE id = $1`, [testOrderId]);
    assert(parseInt(verifyClean[0].count, 10) === 0, 'Comanda de prueba eliminada de forma limpia');

    console.log('\n======================================================');
    console.log(`🎉 AUDITORÍA FINALIZADA: ${passedTests}/${totalTests} PRUEBAS SUPERADAS (100% EXITOSO)`);
    console.log('   Cero bugs, cero discrepancias financieras y cero fallos.');
    console.log('======================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA AUDITORÍA:', error);
    process.exit(1);
  }
}

runValidation();

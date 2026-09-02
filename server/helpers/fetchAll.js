const { query } = require('../db');

function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val !== 'string') return Array.isArray(val) ? val : fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeJsonParseObj(val) {
  if (!val || val === 'null') return undefined;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val !== 'string') return undefined;
  try {
    const parsed = JSON.parse(val);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : undefined;
  } catch (e) {
    return undefined;
  }
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (typeof url === 'string' && url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    return `/uploads/${filename}`;
  }
  return url;
}

async function fetchAllOrders(user) {
  const parameters = user?.shift && user.shift !== 'ambos' ? [user.shift] : [];
  const whereClause = parameters.length ? 'WHERE shift = $1 AND archived_at IS NULL' : 'WHERE archived_at IS NULL';
  const { rows: orders } = await query(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`, parameters);
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return [];

  const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = ANY($1::text[])`, [orderIds]);
  const { rows: payments } = await query(`SELECT * FROM order_payments WHERE order_id = ANY($1::text[]) ORDER BY created_at ASC`, [orderIds]);

  return orders.map((ord) => ({
    id: ord.id,
    orderNumber: ord.order_number,
    type: ord.type,
    tableNumber: ord.table_number,
    customerName: ord.customer_name,
    status: ord.status,
    paymentStatus: ord.payment_status,
    paymentMethod: ord.payment_method,
    totalUSD: parseFloat(ord.total_usd) || 0,
    paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' ? parseFloat(ord.total_usd) : 0),
    copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3950,
    bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 36.5,
    waiterName: ord.waiter_name || 'Mesero',
    kitchenNotes: ord.kitchen_notes,
    notes: ord.notes || undefined,
    isEdited: !!ord.is_edited,
    mergedFromOrders: ord.merged_from_orders || [],
    deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
    shift: ord.shift || 'ambos',
    createdAt: ord.created_at,
    paymentHistory: payments
      .filter((pm) => pm.order_id === ord.id)
      .map((pm) => ({
        id: pm.id,
        orderId: pm.order_id,
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
        itemIds: pm.item_ids || [],
        createdAt: pm.created_at,
      })),
    items: items
      .filter((it) => it.order_id === ord.id)
      .map((it) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.product_name,
        price: parseFloat(it.price) || 0,
        quantity: it.quantity,
        size: it.size || 'Grande',
        isHalfHalf: !!it.is_half_half,
        halfDetails: safeJsonParseObj(it.half_details),
        removedIngredients: it.removed_ingredients || [],
        extras: safeJsonParse(it.extras_json),
        sugarPreference: it.sugar_preference || undefined,
        drinkType: it.drink_type || undefined,
        category: it.category || undefined,
        isTakeaway: !!it.is_takeaway,
        isNewOrModified: !!it.is_new_or_modified,
        isPaidIndividually: !!it.is_paid_individually,
        paidByName: it.paid_by_name || undefined,
        notes: it.notes || '',
      })),
  }));
}

async function fetchAllProducts(user) {
  const parameters = user?.shift && user.shift !== 'ambos' ? [user.shift] : [];
  const whereClause = parameters.length ? "WHERE shift = $1" : '';
  const { rows } = await query(`SELECT * FROM products ${whereClause} ORDER BY name ASC`, parameters);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    drinkType: p.drink_type || undefined,
    price: parseFloat(p.price),
    priceSmall: parseFloat(p.price_small || p.price_small_usd) || (parseFloat(p.price) > 4 ? parseFloat(p.price) - 4 : parseFloat(p.price)),
    description: p.description || '',
    image: normalizeImageUrl(p.image),
    badge: p.badge || undefined,
    baseIngredients: p.base_ingredients || [],
    recipe: [],
    shift: p.shift || 'manana',
  }));
}

async function fetchAllIngredients(user) {
  const parameters = user?.shift && user.shift !== 'ambos' ? [user.shift] : [];
  const whereClause = parameters.length ? "WHERE shift = $1" : '';
  const { rows } = await query(`SELECT * FROM ingredients ${whereClause} ORDER BY name ASC`, parameters);
  return rows.map((i) => {
    const rawPriceUsd = parseFloat(i.price_usd) || 0;
    const priceGrandeCompleta = i.price_grande_completa !== null && i.price_grande_completa !== undefined ? parseFloat(i.price_grande_completa) : rawPriceUsd;
    const priceGrandeMitad = i.price_grande_mitad !== null && i.price_grande_mitad !== undefined ? parseFloat(i.price_grande_mitad) : (priceGrandeCompleta > 0 ? priceGrandeCompleta / 2 : 0);
    const pricePequenaCompleta = i.price_pequena_completa !== null && i.price_pequena_completa !== undefined ? parseFloat(i.price_pequena_completa) : (priceGrandeCompleta > 0 ? priceGrandeCompleta / 2 : 0);
    const pricePequenaMitad = i.price_pequena_mitad !== null && i.price_pequena_mitad !== undefined ? parseFloat(i.price_pequena_mitad) : (pricePequenaCompleta > 0 ? pricePequenaCompleta / 2 : 0);

    return {
      id: i.id,
      name: i.name,
      priceUSD: priceGrandeCompleta,
      priceGrandeCompleta,
      priceGrandeMitad,
      pricePequenaCompleta,
      pricePequenaMitad,
      isBaseForPizza: !!i.is_base_for_pizza,
      isExtraForPizza: !!i.is_extra_for_pizza,
      category: i.category || 'Ingredientes',
      available: i.available !== false,
      shift: i.shift || 'manana',
    };
  });
}

async function fetchAllTables(user) {
  const { rows: tables } = await query(`SELECT * FROM tables_config ORDER BY number ASC`);

  // Calcular ocupación dinámica por turno
  let activeOccupiedTables = new Set();
  try {
    const parameters = user?.shift && user.shift !== 'ambos' ? [user.shift] : [];
    const shiftFilter = parameters.length ? 'AND shift = $1' : '';
    const { rows: activeOrders } = await query(
      `SELECT table_number FROM orders WHERE type = 'mesa' AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL ${shiftFilter}`,
      parameters
    );
    activeOccupiedTables = new Set(activeOrders.map((o) => o.table_number).filter(Boolean));
  } catch (e) {}

  return tables.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    capacity: t.capacity,
    status: activeOccupiedTables.has(t.number) ? 'ocupada' : 'libre',
    zone: t.zone,
  }));
}

module.exports = {
  safeJsonParse,
  safeJsonParseObj,
  normalizeImageUrl,
  fetchAllOrders,
  fetchAllProducts,
  fetchAllIngredients,
  fetchAllTables,
};

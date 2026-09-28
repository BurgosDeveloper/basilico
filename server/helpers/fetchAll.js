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

async function fetchAllOrders(user = null) {
  const shift = user?.shift;
  const whereShift = (shift && shift !== 'ambos') ? 'AND shift = $1' : '';
  const params = (shift && shift !== 'ambos') ? [shift] : [];
  const { rows: orders } = await query(
    `SELECT * FROM orders WHERE archived_at IS NULL ${whereShift} ORDER BY created_at DESC`,
    params
  );
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return [];

  const { rows: items } = await query(
    `SELECT oi.*, p.default_proteins 
     FROM order_items oi 
     LEFT JOIN products p ON (oi.product_id = p.id OR LOWER(oi.product_name) = LOWER(p.name))
     WHERE oi.order_id = ANY($1::text[])`,
    [orderIds]
  );
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
    paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' || ord.payment_status === 'credito' ? parseFloat(ord.total_usd) : 0),
    copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3950,
    bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 36.5,
    waiterName: ord.waiter_name || 'Mesero',
    kitchenNotes: ord.kitchen_notes,
    notes: ord.notes || undefined,
    isEdited: !!ord.is_edited,
    mergedFromOrders: ord.merged_from_orders || [],
    deliveryFeeUSD: parseFloat(ord.delivery_fee_usd) || 0,
    shift: ord.shift || 'noche',
    createdAt: ord.created_at,
    paymentHistory: payments
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
    items: items
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
}

async function fetchAllProducts(user = null) {
  const shift = user?.shift;
  const whereShift = (shift && shift !== 'ambos') ? 'WHERE shift = $1' : '';
  const params = (shift && shift !== 'ambos') ? [shift] : [];
  const { rows } = await query(`SELECT * FROM products ${whereShift} ORDER BY name ASC`, params);
  return rows.map((p) => {
    let category = p.category;
    if (p.shift === 'noche') {
      const rawCat = String(p.category || '').trim().toLowerCase();
      category = rawCat.includes('bebida') || (p.id || '').startsWith('prod-') ? 'Bebidas' : 'Pizzas';
    }
    return {
      id: p.id,
      name: p.name,
      category,
      drinkType: p.drink_type || undefined,
      price: parseFloat(p.price) || 0,
      priceSmall: p.price_small ? parseFloat(p.price_small) : undefined,
      description: p.description || '',
      image: normalizeImageUrl(p.image),
      badge: p.badge || undefined,
      baseIngredients: p.base_ingredients || [],
      proteinCount: p.protein_count !== undefined && p.protein_count !== null ? Number(p.protein_count) : 1,
      defaultProteins: p.default_proteins || [],
      flavors: p.flavors || [],
      recipe: [],
      shift: p.shift || 'noche',
    };
  });
}

async function fetchAllIngredients(user = null) {
  const shift = user?.shift;
  const whereShift = (shift && shift !== 'ambos') ? 'WHERE shift = $1' : '';
  const params = (shift && shift !== 'ambos') ? [shift] : [];
  const { rows } = await query(`SELECT * FROM ingredients ${whereShift} ORDER BY name ASC`, params);
  return rows.map((i) => {
    const rawPriceUsd = parseFloat(i.price_usd) || 0;
    const gc = i.price_grande_completa !== undefined && i.price_grande_completa !== null ? parseFloat(i.price_grande_completa) : rawPriceUsd;
    const gm = i.price_grande_mitad !== undefined && i.price_grande_mitad !== null ? parseFloat(i.price_grande_mitad) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
    const pc = i.price_pequena_completa !== undefined && i.price_pequena_completa !== null ? parseFloat(i.price_pequena_completa) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
    const pm = i.price_pequena_mitad !== undefined && i.price_pequena_mitad !== null ? parseFloat(i.price_pequena_mitad) : (pc > 0 ? Number((pc / 2).toFixed(2)) : 0);
    const ingType = i.ingredient_type || (i.category === 'Salsas' ? 'salsa' : (i.category === 'Gratis' ? 'gratis' : (i.category === 'Adicionales' ? 'adicional' : (i.is_base ? 'base' : 'adicional'))));
    return {
      id: i.id,
      name: i.name,
      ingredientType: ingType,
      priceUSD: rawPriceUsd,
      priceGrandeCompleta: gc,
      priceGrandeMitad: gm,
      pricePequenaCompleta: pc,
      pricePequenaMitad: pm,
      isBase: ingType === 'base' || ingType === 'proteina' || i.is_base !== false,
      isExtra: ingType === 'adicional' || ingType === 'gratis' || ingType === 'salsa' || i.is_extra !== false,
      isBaseForPizza: i.is_base_for_pizza !== undefined ? i.is_base_for_pizza !== false : (ingType === 'base' || i.is_base !== false),
      isExtraForPizza: i.is_extra_for_pizza !== undefined ? i.is_extra_for_pizza !== false : (ingType === 'adicional' || i.is_extra !== false),
      category: i.category || (ingType === 'salsa' ? 'Salsas' : (ingType === 'gratis' ? 'Gratis' : (ingType === 'proteina' ? 'Proteínas' : (ingType === 'base' ? 'Ingredientes Base' : 'Adicionales')))),
      available: i.available !== false,
      shift: i.shift || 'noche',
    };
  });
}

async function fetchAllTables(user = null) {
  const { rows: tables } = await query(`SELECT * FROM tables_config ORDER BY number ASC`);

  let activeOccupiedTables = new Set();
  try {
    // Las mesas son la ÚNICA entidad física compartida: si una mesa tiene una comanda activa
    // en cualquier turno, debe reflejarse como ocupada para evitar cruces en el salón físico.
    const { rows: activeOrders } = await query(
      `SELECT table_number FROM orders WHERE type = 'mesa' AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL`
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

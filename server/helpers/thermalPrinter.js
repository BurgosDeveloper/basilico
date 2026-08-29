const fs = require('fs');
const net = require('net');
const path = require('path');

const PRINTER_CONFIG_PATH = path.join(__dirname, '../config/thermal-printer.json');
// Font expansion in ESC/POS uses discrete sizes. Extra character spacing gives
// the 80 mm ticket approximately 40% more horizontal presence without relying
// on vendor-specific font modes.
const LINE_WIDTH = 28;
// Configuración ESC/POS con fuente 40% más grande y espaciado optimizado:
// - \x1B \x08: ESC SP 8 -> Aumenta el espaciado horizontal entre caracteres en 8 puntos (~40-50% más ancho y legible)
// - \x1B3\x2C: ESC 3 44 -> Altura de línea ampliada a 44 puntos (~40% más alto)
// - \x1BM\x00: ESC M 0 -> Fuente A estándar (12x24 puntos, máxima definición)
const PRINT_FORMAT_SETUP = '\x1B \x08\x1B3\x2C\x1BM\x00';
const PRINT_FORMAT_RESET = '\x1B \x00\x1B2';

function loadDualPrinterConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(PRINTER_CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Aviso: no se pudo leer la configuración de impresoras: ${error.message}`);
    }
  }

  // Compatibilidad hacia atrás si el JSON no tiene las claves 'cocina' o 'caja'
  const cocinaRaw = fileConfig.cocina || {
    name: 'Impresora Cocina / KDS',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    host: fileConfig.host || '192.168.1.200',
    port: Number(fileConfig.port || 9100),
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  const cajaRaw = fileConfig.caja || {
    name: 'Impresora Caja / Mostrador',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    host: fileConfig.host || '192.168.1.201',
    port: Number(fileConfig.port || 9100),
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  return {
    cocina: {
      name: cocinaRaw.name || 'Impresora Cocina / KDS',
      enabled: cocinaRaw.enabled === true,
      host: String(cocinaRaw.host || '').trim(),
      port: Number(cocinaRaw.port || 9100),
      timeoutMs: Number(cocinaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cocinaRaw.copies || 1)),
    },
    caja: {
      name: cajaRaw.name || 'Impresora Caja / Mostrador',
      enabled: cajaRaw.enabled === true,
      host: String(cajaRaw.host || '').trim(),
      port: Number(cajaRaw.port || 9100),
      timeoutMs: Number(cajaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cajaRaw.copies || 1)),
    }
  };
}

function saveDualPrinterConfig(newConfig) {
  const current = loadDualPrinterConfig();
  const merged = {
    cocina: {
      ...current.cocina,
      ...(newConfig.cocina || {}),
      port: Number(newConfig.cocina?.port || current.cocina.port || 9100),
      copies: Math.max(1, Number(newConfig.cocina?.copies || current.cocina.copies || 1)),
    },
    caja: {
      ...current.caja,
      ...(newConfig.caja || {}),
      port: Number(newConfig.caja?.port || current.caja.port || 9100),
      copies: Math.max(1, Number(newConfig.caja?.copies || current.caja.copies || 1)),
    }
  };
  fs.writeFileSync(PRINTER_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function loadPrinterConfig(target = 'caja') {
  const dual = loadDualPrinterConfig();
  return dual[target] || dual.caja;
}

function printableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(value, width = LINE_WIDTH, indent = '') {
  const words = printableText(value).split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = indent;
  for (const word of words) {
    if (current.trim() && (current.length + 1 + word.length) > width) {
      lines.push(current);
      current = indent;
    }

    if (current.trim()) {
      current += ` ${word}`;
    } else {
      let remaining = word;
      const availableWidth = Math.max(1, width - indent.length);
      while (remaining.length > availableWidth) {
        lines.push(`${indent}${remaining.slice(0, availableWidth)}`);
        remaining = remaining.slice(availableWidth);
      }
      current = `${indent}${remaining}`;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function divider(character = '-') {
  return character.repeat(LINE_WIDTH);
}

function centered(value) {
  const text = printableText(value).slice(0, LINE_WIDTH);
  const padding = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function isKitchenItem(item) {
  if (!item) return false;

  // 1. Clasificación directa por tipo de bebida (drinkType / drink_type)
  const drinkType = String(item.drinkType || item.drink_type || '').trim().toLowerCase();
  if (['refresco', 'gaseosa', 'licor', 'cerveza', 'comercial', 'soda'].includes(drinkType)) {
    return false;
  }

  // 2. Clasificación directa por categoría de producto
  const category = String(item.category || '').trim().toLowerCase();
  if (['licores', 'licor', 'cervezas', 'cerveza', 'gaseosas', 'refrescos', 'bebidas comerciales', 'bebida comercial'].includes(category)) {
    return false;
  }

  // 3. Jugos naturales / merengadas / batidos preparados SIEMPRE van a cocina
  if (drinkType === 'jugo' || drinkType === 'merengada' || drinkType === 'batido' || item.sugarPreference) {
    return true;
  }

  // 4. Mitades y pizzas personalizadas SIEMPRE van a cocina
  if (item.isHalfHalf || item.halfDetails) return true;

  // 5. Verificación por nombre de producto (limpieza de acentos y caracteres especiales)
  const rawName = String(item.productName || item.name || '').trim();
  const name = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nameClean = name.replace(/[^a-z0-9]/g, '');

  // Palabras exactas o con límites de palabra para bebidas comerciales, gaseosas, aguas, licores y cervezas
  const commercialWordBoundaryRegex = /\b(coca|cocacola|coca-cola|pepsi|chinotto|hit|7up|sevenup|sprite|fanta|frescolita|postobon|colombiana|manzana postobon|agua mineral|agua|cerveza|cervezas|polar|solera|pilsen|corona|heineken|zulia|malta|maltin|gatorade|red bull|redbull|monster|plastichip|ron|whisky|whiskey|vodka|tequila|vino|vinos|sangria|smirnoff|anis|cacique|santa teresa|diplomatico|old parr|black label|red label|buchanans)\b/i;

  // Prefijos típicos de bebidas comerciales concatenadas como coca1l, pepsi1.5l, maltapolar
  const commercialPrefixes = [
    'coca', 'pepsi', 'chinotto', 'frescolita', 'postobon', 'colombiana', 'gatorade',
    'maltin', 'heineken', 'smirnoff', 'redbull'
  ];

  if (commercialWordBoundaryRegex.test(name) || commercialPrefixes.some(p => nameClean.startsWith(p))) {
    return false;
  }

  // 6. Si tiene ingredientes removidos o extras agregados
  if ((item.removedIngredients && item.removedIngredients.length > 0) || (item.extras && item.extras.length > 0)) {
    return true;
  }

  // 7. Todos los demás productos son ítems de cocina / preparación:
  // Pizzas (Granjera, Prosciutto, Margarita, Pepperoni, Cuatro Quesos, etc.),
  // Pastas, Calzones, Hamburguesas, Ensaladas, Entradas, Postres, Jugos y Batidos.
  return true;
}

function itemDetails(item) {
  const details = [];
  if (item.size) details.push(`Tamano: ${item.size}`);
  if (item.isTakeaway) details.push('*** PARA LLEVAR ***');
  if (item.sugarPreference) details.push(`Azucar: ${item.sugarPreference}`);

  if (item.isHalfHalf && item.halfDetails) {
    const { half1Name, half2Name, half1Removed, half2Removed, half1Extras, half2Extras } = item.halfDetails;
    details.push(`1RA MITAD: ${half1Name || ''}`);
    if (half1Removed?.length) details.push(`  1RA SIN: ${half1Removed.join(', ')}`);
    if (half1Extras?.length) details.push(`  1RA EXTRA: ${half1Extras.map((extra) => extra.name).join(', ')}`);
    details.push(`2DA MITAD: ${half2Name || ''}`);
    if (half2Removed?.length) details.push(`  2DA SIN: ${half2Removed.join(', ')}`);
    if (half2Extras?.length) details.push(`  2DA EXTRA: ${half2Extras.map((extra) => extra.name).join(', ')}`);
  } else {
    if (item.removedIngredients?.length) details.push(`SIN: ${item.removedIngredients.join(', ')}`);
    if (item.extras?.length) details.push(`EXTRA: ${item.extras.map((extra) => extra.name).join(', ')}`);
  }

  if (item.notes) details.push(`NOTA: ${item.notes}`);
  return details;
}

function reportAmounts(payment) {
  let usd = Number(payment.cashTenderedUSD) || 0;
  let cop = Number(payment.cashTenderedCOP) || 0;
  let bs = Number(payment.cashTenderedBs) || 0;
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  if (usd === 0 && cop === 0 && bs === 0 && paidUSD > 0) {
    if (['Efectivo COP', 'Bancolombia', 'Nequi'].includes(payment.paymentMethod)) cop = paidUSD * (Number(payment.copRate) || 3950);
    else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) bs = paidUSD * (Number(payment.bsRate) || 36.5);
    else usd = paidUSD;
  }
  return { usd, cop, bs };
}

function reportSaleAmounts(payment) {
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  let usd = 0;
  let cop = 0;
  let bs = 0;
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(payment.paymentMethod)) {
    cop = paidUSD * (Number(payment.copRate) || 3950);
  } else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) {
    bs = paidUSD * (Number(payment.bsRate) || 36.5);
  } else {
    usd = paidUSD;
  }
  return { usd, cop, bs, equivalentUSD: paidUSD };
}

function monetaryLines(amounts, prefix = '') {
  const lines = [];
  if (amounts.usd > 0) lines.push(`${prefix}$${amounts.usd.toFixed(2)} USD`);
  if (amounts.cop > 0) lines.push(`${prefix}${Math.round(amounts.cop).toLocaleString('en-US')} COP`);
  if (amounts.bs > 0) lines.push(`${prefix}${amounts.bs.toFixed(2)} Bs`);
  return lines;
}

function reportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function reportTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function reportService(order) {
  if (order.type === 'mesa') return `MESA #${order.tableNumber || '?'}`;
  if (order.type === 'delivery') return 'DELIVERY';
  if (order.type === 'pickup') return 'PARA LLEVAR';
  return printableText(order.type || 'SIN TIPO');
}

function addSection(lines, title) {
  lines.push('', divider(), '\x1BE\x01', ...wrapText(title), '\x1BE\x00');
}

function addAmountLines(lines, amounts, prefix = '  ', includeZeroAmounts = false) {
  const values = includeZeroAmounts
    ? [
      `${prefix}$${(Number(amounts.usd) || 0).toFixed(2)} USD`,
      `${prefix}${Math.round(Number(amounts.cop) || 0).toLocaleString('en-US')} COP`,
      `${prefix}${(Number(amounts.bs) || 0).toFixed(2)} Bs`,
    ]
    : monetaryLines(amounts, prefix);
  lines.push(...(values.length > 0 ? values : [`${prefix}SIN MONTO REGISTRADO`]));
}

function paymentChangeAmounts(payment) {
  return {
    usd: Number(payment.changeGivenUSD) || 0,
    cop: Number(payment.changeGivenCOP) || 0,
    bs: Number(payment.changeGivenBs) || 0,
  };
}

function addReportHeader(lines, title, data) {
  lines.push(
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('BASILICO PIZZERIA'),
    centered(title),
    '\x1BE\x00',
    `EMITIDO: ${reportTimestamp(new Date().toISOString())}`,
    '\x1Ba\x00',
    divider('='),
  );
  lines.push(...wrapText(`DESDE: ${reportTimestamp(data?.dateRange?.from)}`));
  lines.push(...wrapText(`HASTA: ${reportTimestamp(data?.dateRange?.to)}`));
  lines.push(...wrapText(`TASAS: 1 USD = ${Number(data?.exchangeRates?.COP) || 3950} COP | ${Number(data?.exchangeRates?.Bs) || 36.5} Bs`));
}

function buildReportTicket(reportType, data) {
  const titles = {
    contable: 'REPORTE CONTABLE',
    pizzas: 'PIZZAS VENDIDAS',
    ingresos: 'INGRESOS Y COBROS',
    egresos: 'VUELTOS Y EGRESOS',
    cocina: 'REPORTE DE COCINA',
  };
  const title = titles[reportType];
  if (!title) throw new Error('Tipo de reporte térmico no válido.');

  const lines = [];
  addReportHeader(lines, title, data);

  if (reportType === 'pizzas') {
    const grouped = new Map();
    for (const item of data.items || []) {
      const key = `${item.category || 'Sin categoria'}|${item.productName || 'Item'}`;
      const current = grouped.get(key) || { category: item.category || 'Sin categoria', name: item.productName || 'Item', quantity: 0, totalUSD: 0 };
      current.quantity += Number(item.quantity) || 0;
      current.totalUSD += (Number(item.price) || 0) * (Number(item.quantity) || 0);
      grouped.set(key, current);
    }
    const items = [...grouped.values()].sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
    const totalUnits = items.reduce((total, item) => total + item.quantity, 0);
    const totalUSD = items.reduce((total, item) => total + item.totalUSD, 0);
    addSection(lines, 'DETALLE DE ITEMS FACTURADOS');
    if (items.length === 0) {
      lines.push('SIN PIZZAS, BEBIDAS O ADICIONALES');
    } else {
      let category = '';
      for (const item of items) {
        if (item.category !== category) {
          category = item.category;
          lines.push('', ...wrapText(`CATEGORIA: ${category}`));
        }
        lines.push(...wrapText(`${item.quantity}x ${item.name}`, LINE_WIDTH, '  '));
        lines.push(`  SUBTOTAL: $${item.totalUSD.toFixed(2)} USD`);
      }
    }
    addSection(lines, 'RESUMEN DE VENTAS');
    const rates = data.exchangeRates || {};
    lines.push(`PRODUCTOS DIFERENTES: ${items.length}`, `UNIDADES FACTURADAS: ${totalUnits}`, 'TOTAL PRODUCTOS:');
    addAmountLines(lines, {
      usd: totalUSD,
      cop: totalUSD * (Number(rates.COP) || 3950),
      bs: totalUSD * (Number(rates.Bs) || 36.5),
    }, '  ', true);
  } else if (reportType === 'ingresos') {
    const totals = { usd: 0, cop: 0, bs: 0 };
    const changes = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    addSection(lines, 'COBROS REGISTRADOS');
    if ((data.payments || []).length === 0) lines.push('SIN COBROS EN EL INTERVALO');
    for (const payment of data.payments || []) {
      const received = reportAmounts(payment);
      const change = paymentChangeAmounts(payment);
      totals.usd += received.usd; totals.cop += received.cop; totals.bs += received.bs;
      changes.usd += change.usd; changes.cop += change.cop; changes.bs += change.bs;
      const methodTotal = byMethod.get(payment.paymentMethod) || { count: 0, usd: 0, cop: 0, bs: 0 };
      methodTotal.count += 1; methodTotal.usd += received.usd; methodTotal.cop += received.cop; methodTotal.bs += received.bs;
      byMethod.set(payment.paymentMethod, methodTotal);
      lines.push('', ...wrapText(`${reportDate(payment.createdAt)} | #${payment.orderNumber || '?'}`));
      lines.push(...wrapText(`METODO: ${payment.paymentMethod || 'SIN METODO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGADOR: ${payment.payerName || 'CLIENTE GENERAL'}`, LINE_WIDTH, '  '));
      lines.push('  RECIBIDO:');
      addAmountLines(lines, received, '    ');
      if (change.usd > 0 || change.cop > 0 || change.bs > 0) {
        lines.push('  VUELTO ENTREGADO:');
        addAmountLines(lines, change, '    ');
      }
    }
    addSection(lines, 'RESUMEN DE INGRESOS');
    lines.push(`MOVIMIENTOS: ${(data.payments || []).length}`, 'TOTAL RECIBIDO:');
    addAmountLines(lines, totals, '  ', true);
    lines.push('TOTAL VUELTOS:');
    addAmountLines(lines, changes, '  ', true);
    addSection(lines, 'TOTALES POR METODO');
    for (const [method, amounts] of byMethod) {
      lines.push('', ...wrapText(`${method} (${amounts.count})`));
      addAmountLines(lines, amounts, '  ');
    }
  } else if (reportType === 'egresos') {
    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');
    const totals = { usd: 0, cop: 0, bs: 0 };
    addSection(lines, 'MOVIMIENTOS DE SALIDA');
    if (expenses.length === 0) lines.push('SIN VUELTOS O EGRESOS EN EL INTERVALO');
    for (const transaction of expenses) {
      const amounts = { usd: Number(transaction.amountUSD) || 0, cop: Number(transaction.amountCOP) || 0, bs: Number(transaction.amountBs) || 0 };
      totals.usd += amounts.usd; totals.cop += amounts.cop; totals.bs += amounts.bs;
      lines.push('', ...wrapText(`${reportDate(transaction.timestamp)} | ${transaction.orderNumber ? `#${transaction.orderNumber}` : 'SIN COMANDA'}`));
      lines.push(...wrapText(`METODO: ${transaction.paymentMethod || 'EGRESO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`CONCEPTO: ${transaction.description || 'SIN DESCRIPCION'}`, LINE_WIDTH, '  '));
      lines.push('  ENTREGADO:');
      addAmountLines(lines, amounts, '    ');
    }
    addSection(lines, 'RESUMEN DE EGRESOS');
    lines.push(`MOVIMIENTOS DE SALIDA: ${expenses.length}`, 'TOTAL ENTREGADO:');
    addAmountLines(lines, totals, '  ', true);
  } else if (reportType === 'cocina') {
    const itemsByOrder = new Map();
    for (const item of data.items || []) {
      itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) || []), item]);
    }
    addSection(lines, 'COMANDAS DEL INTERVALO');
    if ((data.orders || []).length === 0) lines.push('SIN COMANDAS COBRADAS EN EL INTERVALO');
    for (const order of data.orders || []) {
      const orderItems = itemsByOrder.get(order.id) || [];
      lines.push('', '\x1BE\x01', ...wrapText(`#${order.orderNumber || '?'} | ${reportService(order)}`), '\x1BE\x00');
      lines.push(...wrapText(`RECIBIDA: ${reportDate(order.createdAt)} | ESTADO: ${order.status || 'SIN ESTADO'}`, LINE_WIDTH, '  '));
      if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGO: ${order.paymentMethod || 'SEGUN MOVIMIENTO'}`, LINE_WIDTH, '  '));
      for (const item of orderItems) lines.push(...wrapText(`${item.quantity || 1}x ${item.productName || 'ITEM'}`, LINE_WIDTH, '  '));
      if (orderItems.length === 0) lines.push('  SIN ITEMS DISPONIBLES');
      lines.push(`  TOTAL: $${(Number(order.totalUSD) || 0).toFixed(2)} USD`);
    }
    addSection(lines, 'RESUMEN DE COCINA');
    lines.push(`COMANDAS: ${(data.orders || []).length}`, `ITEMS FACTURADOS: ${(data.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  } else {
    // REPORTE CONTABLE CONSOLIDADO
    const billedTotals = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    const paymentCounts = new Map();

    for (const payment of data.payments || []) {
      if (payment.paymentMethod === 'Crédito') continue;
      const paidUSD = Number(payment.amountPaidUSD) || 0;
      if (paidUSD <= 0) continue;
      const amounts = reportSaleAmounts(payment);
      billedTotals.usd += amounts.usd;
      billedTotals.cop += amounts.cop;
      billedTotals.bs += amounts.bs;
      const methodTotals = byMethod.get(payment.paymentMethod) || { usd: 0, cop: 0, bs: 0 };
      methodTotals.usd += amounts.usd;
      methodTotals.cop += amounts.cop;
      methodTotals.bs += amounts.bs;
      byMethod.set(payment.paymentMethod, methodTotals);
      paymentCounts.set(payment.paymentMethod, (paymentCounts.get(payment.paymentMethod) || 0) + 1);
    }

    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');

    const creditOrders = (data.orders || []).filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
    const cashOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' && o.paymentMethod !== 'Crédito');
    const firstOrder = data.orders?.[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders?.[data.orders.length - 1]?.orderNumber || 'N/A';

    // SECCIÓN 1 — DATOS DEL INTERVALO
    addSection(lines, 'SECCION 1: INTERVALO');
    lines.push(...wrapText(`DESDE: ${reportTimestamp(data?.dateRange?.from)}`));
    lines.push(...wrapText(`HASTA: ${reportTimestamp(data?.dateRange?.to)}`));
    lines.push(`COMANDA INICIAL: #${firstOrder}`);
    lines.push(`COMANDA FINAL:   #${lastOrder}`);

    // SECCIÓN 2 — TOTAL FACTURADO POR MONEDA (CONTADO)
    addSection(lines, 'SECCION 2: TOTAL FACTURADO (CONTADO)');
    lines.push(`DOLARES (USD): $${billedTotals.usd.toFixed(2)}`);
    lines.push(`PESOS (COP):   $${Math.round(billedTotals.cop).toLocaleString('en-US')} COP`);
    lines.push(`BOLIVARES(Bs): Bs ${billedTotals.bs.toFixed(2)}`);
    lines.push(divider('-'));
    lines.push(`TOTAL COMANDAS:  ${(data.orders || []).length}`);
    lines.push(`  • Al Contado:  ${cashOrders.length}`);
    lines.push(`  • A Credito:   ${creditOrders.length}`);

    // SECCIÓN 3 — CAJA CHICA DEL EFECTIVO ESPERADA
    const aperturaUSD = Number(data.apertura?.usdCash) || 0;
    const aperturaCOP = Number(data.apertura?.copCash) || 0;

    let totalIngresosEfectivoUSD = 0;
    let totalIngresosEfectivoCOP = 0;
    for (const payment of data.payments || []) {
      const amounts = reportAmounts(payment);
      if (payment.paymentMethod === 'Efectivo USD') totalIngresosEfectivoUSD += amounts.usd;
      if (payment.paymentMethod === 'Efectivo COP') totalIngresosEfectivoCOP += amounts.cop;
    }
    for (const t of (data.transactions || [])) {
      if (t.type === 'ingreso' && !t.orderId) {
        if (t.paymentMethod === 'Efectivo USD') totalIngresosEfectivoUSD += (Number(t.amountUSD) || 0);
        if (t.paymentMethod === 'Efectivo COP') totalIngresosEfectivoCOP += (Number(t.amountCOP) || 0);
      }
    }

    let totalEgresosEfectivoUSD = 0;
    let totalEgresosEfectivoCOP = 0;
    for (const tx of expenses) {
      if (tx.paymentMethod === 'Efectivo USD' || (Number(tx.amountUSD) > 0 && !tx.paymentMethod?.includes('COP') && !tx.paymentMethod?.includes('Bs') && !tx.paymentMethod?.includes('Móvil') && !tx.paymentMethod?.includes('Tarjeta'))) {
        totalEgresosEfectivoUSD += (Number(tx.amountUSD) || 0);
      }
      if (tx.paymentMethod === 'Efectivo COP' || (Number(tx.amountCOP) > 0 && !tx.paymentMethod?.includes('USD') && !tx.paymentMethod?.includes('Bs') && !tx.paymentMethod?.includes('Móvil') && !tx.paymentMethod?.includes('Tarjeta'))) {
        totalEgresosEfectivoCOP += (Number(tx.amountCOP) || 0);
      }
    }

    const cajaChicaEsperadaUSD = aperturaUSD + totalIngresosEfectivoUSD - totalEgresosEfectivoUSD;
    const cajaChicaEsperadaCOP = aperturaCOP + totalIngresosEfectivoCOP - totalEgresosEfectivoCOP;

    addSection(lines, 'SECCION 3: CAJA CHICA');
    lines.push('EFECTIVO EN DOLARES (USD):');
    lines.push(`  1. Fondo Apertura:   $${aperturaUSD.toFixed(2)} USD`);
    lines.push(`  2. (+) Ingresos Cash:+$${totalIngresosEfectivoUSD.toFixed(2)} USD`);
    lines.push(`  3. (-) Egresos Cash: -$${totalEgresosEfectivoUSD.toFixed(2)} USD`);
    lines.push(`  4. (=) ESPERADO USD: $${cajaChicaEsperadaUSD.toFixed(2)} USD`);
    lines.push('');
    lines.push('EFECTIVO EN PESOS (COP):');
    lines.push(`  1. Fondo Apertura:   $${Math.round(aperturaCOP).toLocaleString('en-US')} COP`);
    lines.push(`  2. (+) Ingresos Cash:+$${Math.round(totalIngresosEfectivoCOP).toLocaleString('en-US')} COP`);
    lines.push(`  3. (-) Egresos Cash: -$${Math.round(totalEgresosEfectivoCOP).toLocaleString('en-US')} COP`);
    lines.push(`  4. (=) ESPERADO COP: $${Math.round(cajaChicaEsperadaCOP).toLocaleString('en-US')} COP`);

    // SECCIÓN 4 — DESGLOSE DE COBROS POR TIPO DE PAGO
    addSection(lines, 'SECCION 4: FACTURADO POR METODO');
    if (byMethod.size === 0) {
      lines.push('SIN COBROS EN EL INTERVALO');
    } else {
      for (const [method, amounts] of byMethod) {
        const count = paymentCounts.get(method) || 1;
        lines.push('', ...wrapText(`• ${method} (${count} pagos):`));
        addAmountLines(lines, amounts, '    ');
      }
    }

    // SECCIÓN 5 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR
    if (creditOrders.length > 0) {
      addSection(lines, 'SECCION 5: CREDITOS Y DEUDAS');
      const totalCreditUSD = creditOrders.reduce((sum, o) => sum + (Number(o.totalUSD) || 0), 0);
      lines.push(`TOTAL CUENTAS POR COBRAR:`);
      lines.push(`  $${totalCreditUSD.toFixed(2)} USD`);
      lines.push(divider('-'));
      for (const ord of creditOrders) {
        const copEquiv = Math.round((Number(ord.totalUSD) || 0) * (Number(ord.copRateAtPayment) || Number(data.exchangeRates?.COP) || 3950)).toLocaleString('en-US');
        const bsEquiv = ((Number(ord.totalUSD) || 0) * (Number(ord.bsRateAtPayment) || Number(data.exchangeRates?.Bs) || 36.5)).toFixed(2);
        const orderItems = (data.items || [])
          .filter((it) => it.orderId === ord.id)
          .map((it) => `${it.quantity}x ${it.productName}`)
          .join(', ');

        lines.push('', ...wrapText(`#${ord.orderNumber || '?'} | ${reportDate(ord.createdAt)}`));
        lines.push(...wrapText(`CLIENTE: ${ord.customerName || 'Cliente Deudor'}`, LINE_WIDTH, '  '));
        if (orderItems) {
          lines.push(...wrapText(`ITEMS: ${orderItems}`, LINE_WIDTH, '  '));
        }
        lines.push(`  DEUDA: $${(Number(ord.totalUSD) || 0).toFixed(2)} USD`);
        lines.push(`  (${copEquiv} COP / ${bsEquiv} Bs)`);
      }
    }

    // SECCIÓN 6/5 — ITEMS FACTURADOS
    const itemMap = new Map();
    for (const item of (data.items || [])) {
      const key = `${item.category || 'VARIOS'}|${item.productName}`;
      const prev = itemMap.get(key) || { category: item.category || 'VARIOS', name: item.productName, quantity: 0 };
      prev.quantity += (Number(item.quantity) || 1);
      itemMap.set(key, prev);
    }
    const sec6Num = creditOrders.length > 0 ? '6' : '5';
    addSection(lines, `SECCION ${sec6Num}: ITEMS FACTURADOS`);
    if (itemMap.size === 0) {
      lines.push('SIN ITEMS FACTURADOS');
    } else {
      const sortedItems = Array.from(itemMap.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      let currentCategory = '';
      for (const item of sortedItems) {
        if (item.category !== currentCategory) {
          currentCategory = item.category;
          lines.push('', `[${currentCategory.toUpperCase()}]`);
        }
        lines.push(`  ${item.quantity}x ${item.name}`);
      }
    }

    // NOTA: SECCIÓN COMANDAS EDITADAS OMITIDA EN IMPRESIÓN POR REQUERIMIENTO

    // SECCIÓN 7/6 — HISTORIAL POR MÉTODO DE PAGO
    const sec7Num = creditOrders.length > 0 ? '7' : '6';
    addSection(lines, `SECCION ${sec7Num}: HISTORIAL METODOS`);
    const validMethods = Array.from(byMethod.keys());
    if (validMethods.length === 0) {
      lines.push('SIN HISTORIAL DE PAGOS');
    } else {
      for (const method of validMethods) {
        const entries = (data.payments || []).filter((p) => p.paymentMethod === method && Number(p.amountPaidUSD) > 0);
        if (entries.length === 0) continue;
        lines.push('', `--- ${method.toUpperCase()} ---`);
        for (const p of entries) {
          const amounts = reportSaleAmounts(p);
          const formatted = amounts.usd > 0
            ? `$${amounts.usd.toFixed(2)} USD`
            : amounts.cop > 0
            ? `$${Math.round(amounts.cop).toLocaleString('en-US')} COP`
            : `Bs ${amounts.bs.toFixed(2)}`;
          lines.push(...wrapText(`${reportDate(p.createdAt)} | #${p.orderNumber || '?'}`));
          lines.push(...wrapText(`  Pagador: ${p.payerName || 'Cliente'}`, LINE_WIDTH, '  '));
          lines.push(`  Monto:   ${formatted}`);
        }
      }
    }
  }

  lines.push('', divider('='), centered('FIN DEL REPORTE'), centered('BASILICO PIZZERIA'), PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');
  return Buffer.from(lines.join('\n'), 'ascii');
}

const KITCHEN_LINE_WIDTH = 21;
// Configuración ESC/POS para COCINA:
// - \x1B \x00: 0 espacio extra entre letras (texto continuo y natural)
// - \x1B3\x26: Interlineado compacto adecuado para fuente doble altura
// - \x1BM\x00: Fuente A estándar
// - \x1D!\x11: Doble alto + Doble ancho en TODO el ticket (tamaño gigante idéntico a COMANDA:#6)
// - \x1BE\x01: Negrita de alto contraste
const KITCHEN_FORMAT_SETUP = '\x1B \x00\x1B3\x26\x1BM\x00\x1D!\x11\x1BE\x01';

function kitchenDivider(char = '=') {
  return char.repeat(KITCHEN_LINE_WIDTH);
}

function kitchenCentered(value) {
  const text = printableText(value).slice(0, KITCHEN_LINE_WIDTH);
  const padding = Math.max(0, Math.floor((KITCHEN_LINE_WIDTH - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function kitchenWrap(value, indent = '') {
  return wrapText(value, KITCHEN_LINE_WIDTH, indent);
}

function buildKitchenTicket(order) {
  const allItems = order.items || [];
  const kitchenItems = allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
    '\x1Ba\x01',
    kitchenCentered('BASILICO PIZZERIA'),
    kitchenCentered('COMANDA COCINA'),
    '\x1Ba\x00',
    kitchenDivider('='),
    '\x1Ba\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${new Date(order.createdAt || Date.now()).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (order.type === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (order.type === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...kitchenWrap(`MESERO: ${order.waiterName}`));

  lines.push(kitchenDivider('-'));
  lines.push('\x1Ba\x01', 'DETALLE PREPARACION', '\x1Ba\x00');
  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${item.productName || 'Producto'}`));
    for (const detail of itemDetails(item)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
  }

  if (order.kitchenNotes) {
    lines.push(kitchenDivider('-'));
    lines.push('NOTA COCINA:');
    lines.push(...kitchenWrap(order.kitchenNotes));
  }

  lines.push(kitchenDivider('='));
  lines.push(`ITEMS COCINA: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('REVISAR ORDEN');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function buildKitchenAdditionTicket(order, addedItems) {
  const allItems = addedItems || [];
  const kitchenItems = allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
    '\x1Ba\x01',
    kitchenCentered('BASILICO PIZZERIA'),
    kitchenCentered('ADICION COCINA'),
    '\x1Ba\x00',
    kitchenDivider('='),
    '\x1Ba\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (order.type === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (order.type === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...kitchenWrap(`MESERO: ${order.waiterName}`));

  lines.push(kitchenDivider('-'));
  lines.push('\x1Ba\x01', 'NUEVOS ITEMS', '\x1Ba\x00');
  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${item.productName || 'Producto'}`));
    for (const detail of itemDetails(item)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
  }

  lines.push(kitchenDivider('='));
  lines.push(`ITEMS ADICIONADOS: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('SOLO PREPARAR ADICION');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function sendRawTicket(payload, config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let settled = false;
    const complete = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(config.timeoutMs || 5000);
    socket.once('connect', () => socket.end(payload, () => complete()));
    socket.once('timeout', () => complete(new Error(`Tiempo de espera agotado al conectar con ${config.host}:${config.port}.`)));
    socket.once('error', complete);
  });
}

async function sendRawTicketToTarget(payload, targetPrinter = 'auto', defaultFallback = 'caja') {
  const configs = loadDualPrinterConfig();
  let targets = [];

  if (targetPrinter === 'cocina') {
    targets.push({ key: 'cocina', config: configs.cocina });
  } else if (targetPrinter === 'caja') {
    targets.push({ key: 'caja', config: configs.caja });
  } else if (targetPrinter === 'ambas') {
    targets.push({ key: 'cocina', config: configs.cocina });
    targets.push({ key: 'caja', config: configs.caja });
  } else {
    // 'auto': defaultFallback determines primary
    if (defaultFallback === 'cocina') {
      targets.push({ key: 'cocina', config: configs.cocina });
    } else {
      targets.push({ key: 'caja', config: configs.caja });
    }
  }

  const results = [];
  for (const { key, config } of targets) {
    if (!config.enabled) {
      results.push({ printer: key, printed: false, reason: 'disabled' });
      continue;
    }
    if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      results.push({ printer: key, printed: false, reason: 'invalid_host_port' });
      continue;
    }
    try {
      for (let copy = 0; copy < config.copies; copy += 1) {
        await sendRawTicket(payload, config);
      }
      results.push({ printer: key, printed: true, copies: config.copies });
    } catch (err) {
      console.warn(`⚠️ [IMPRESORA ${key.toUpperCase()}] Error al enviar ticket: ${err.message}`);
      results.push({ printer: key, printed: false, error: err.message });
    }
  }

  const printedAny = results.some(r => r.printed);
  return {
    printed: printedAny,
    results,
    copies: targets[0]?.config?.copies || 1,
  };
}

function buildTestTicket(printerName, config) {
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('BASILICO PIZZERIA'),
    centered('--- PRUEBA DE CONEXION ---'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    `IMPRESORA: ${printableText(printerName)}`,
    `DESTINO: ${printableText(config.host)}:${config.port}`,
    `FECHA: ${new Date().toLocaleString('es-VE')}`,
    divider(),
    '\x1Ba\x01',
    'CONEXION EXITOSA',
    'IMPRESORA OPERATIVA Y LISTA',
    '\x1Ba\x00',
    PRINT_FORMAT_RESET,
    '\n\n\n\x1DV\x00',
  ];
  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printTestTicket(targetPrinter = 'caja') {
  const configs = loadDualPrinterConfig();
  const targets = targetPrinter === 'ambas' ? ['cocina', 'caja'] : [targetPrinter];
  const results = [];

  for (const t of targets) {
    const cfg = configs[t] || configs.caja;
    if (!cfg.host || !Number.isInteger(cfg.port)) {
      throw new Error(`La impresora de ${t} no tiene IP o puerto válido configurado.`);
    }
    const payload = buildTestTicket(cfg.name, cfg);
    await sendRawTicket(payload, cfg);
    results.push({ printer: t, printed: true, host: cfg.host, port: cfg.port });
  }

  return { success: true, results };
}

async function printKitchenTicket(order, targetPrinter = 'cocina') {
  const payload = buildKitchenTicket(order);
  if (!payload) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  return sendRawTicketToTarget(payload, targetPrinter, 'cocina');
}

async function printKitchenAdditionTicket(order, addedItems, targetPrinter = 'cocina') {
  const payload = buildKitchenAdditionTicket(order, addedItems);
  if (!payload) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  return sendRawTicketToTarget(payload, targetPrinter, 'cocina');
}

function buildReceiptTicket(order, rates = {}) {
  // Priorizar las tasas enviadas explícitamente desde el sistema / UI, luego las guardadas en la comanda, luego las del turno
  const copRate = Number(rates.COP || order.copRateAtPayment || order.copRate || 3300);
  const bsRate = Number(rates.Bs || order.bsRateAtPayment || order.bsRate || 850);
  const totalUSD = Number(order.totalUSD || 0);

  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('BASILICO PIZZERIA'),
    centered('PRE-CUENTA / TICKET DE CONSUMO'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    '\x1BE\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1BE\x00',
    `FECHA: ${new Date(order.createdAt || Date.now()).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push('\x1BE\x01', `SERVICIO: MESA #${order.tableNumber}`, '\x1BE\x00');
  } else if (order.type === 'delivery') {
    lines.push('\x1BE\x01', 'SERVICIO: DELIVERY', '\x1BE\x00');
  } else if (order.type === 'pickup') {
    lines.push('\x1BE\x01', 'SERVICIO: PICKUP / PARA LLEVAR', '\x1BE\x00');
  }

  if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...wrapText(`MESERO: ${order.waiterName}`));

  lines.push(divider());
  lines.push('\x1BE\x01', centered('--- DETALLE DE CONSUMO ---'), '\x1BE\x00');
  lines.push(divider());

  for (const item of order.items || []) {
    const qty = item.quantity || 1;
    const itemSubtotal = (Number(item.price) || 0) * qty;
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`${qty}x ${item.productName || 'Producto'}`));
    lines.push('\x1BE\x00');
    for (const detail of itemDetails(item)) {
      lines.push(...wrapText(detail, LINE_WIDTH, '  '));
    }
    lines.push(`  SUBTOTAL: $${itemSubtotal.toFixed(2)} USD`);
  }

  if (order.type === 'delivery' && Number(order.deliveryFeeUSD) > 0) {
    lines.push('\x1BE\x01');
    lines.push('1x SERVICIO DELIVERY');
    lines.push('\x1BE\x00');
    lines.push(`  $${Number(order.deliveryFeeUSD).toFixed(2)} USD`);
  }

  lines.push(divider('='));
  lines.push('\x1BE\x01');
  lines.push(`TOTAL USD: $${totalUSD.toFixed(2)} USD`);
  lines.push(`TOTAL COP: ${Math.round(totalUSD * copRate).toLocaleString('en-US')} COP`);
  lines.push(`TOTAL Bs:  ${(totalUSD * bsRate).toFixed(2)} Bs`);
  lines.push('\x1BE\x00');
  lines.push(divider('-'));
  lines.push(`TASAS: 1 USD = ${copRate} COP | ${bsRate} Bs`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('¡GRACIAS POR SU PREFERENCIA!');
  lines.push('BASILICO PIZZERIA');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printReceiptTicket(order, rates = {}, targetPrinter = 'caja') {
  const payload = buildReceiptTicket(order, rates);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

function buildCierreShiftTicket(data) {
  const shiftName = data.shift === 'noche' ? 'NOCHE' : data.shift === 'manana' ? 'MAÑANA' : 'GENERAL';
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('BASILICO PIZZERIA'),
    centered(`ARQUEO Y CIERRE DE TURNO (${shiftName})`),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    `FECHA: ${new Date().toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    `CERRADO POR: ${printableText(data.closedBy || 'Caja')}`,
    `NOTAS: ${printableText(data.notes || 'Cierre de turno')}`,
    divider(),
    '\x1BE\x01',
    centered('--- APERTURA DE CAJA ---'),
    '\x1BE\x00',
    `Fondo USD: $${Number(data.openedUSD || 0).toFixed(2)} USD`,
    `Fondo COP: ${Math.round(Number(data.openedCOP || 0)).toLocaleString('en-US')} COP`,
    divider(),
    '\x1BE\x01',
    centered('--- TOTALES POR METODO DE PAGO ---'),
    '\x1BE\x00',
  ];

  const methods = data.paymentMethods || [];
  if (methods.length === 0) {
    lines.push('Sin movimientos registrados.');
  } else {
    for (const m of methods) {
      lines.push('\x1BE\x01');
      lines.push(...wrapText(`• ${printableText(m.payment_method)} (${m.count} pagos):`));
      lines.push('\x1BE\x00');
      const isCOP = ['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(m.payment_method);
      const isBs = ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(m.payment_method);
      if (isCOP && Number(m.total_cop) > 0) {
        lines.push(`  ${Math.round(Number(m.total_cop)).toLocaleString('en-US')} COP`);
      } else if (isBs && Number(m.total_bs) > 0) {
        lines.push(`  ${Number(m.total_bs).toFixed(2)} Bs`);
      } else if (Number(m.total_usd) > 0) {
        lines.push(`  $${Number(m.total_usd).toFixed(2)} USD`);
      }
    }
  }

  if (Number(data.creditsUSD) > 0 || Number(data.creditsCount) > 0) {
    lines.push(divider());
    lines.push('\x1BE\x01');
    lines.push(`• CREDITOS / CUENTAS POR COBRAR:`);
    lines.push(`  ${data.creditsCount || 0} comanda(s) a credito`);
    lines.push(`  Total Deuda: $${Number(data.creditsUSD || 0).toFixed(2)} USD`);
    lines.push('\x1BE\x00');
  }

  lines.push(divider('='));
  lines.push('\x1BE\x01', centered('--- ARQUEO DE EFECTIVO EN GAVETA ---'), '\x1BE\x00');
  lines.push(`Esperado USD: $${Number(data.expectedUSD || 0).toFixed(2)} USD`);
  lines.push(`Contado USD:  $${Number(data.actualUSD || 0).toFixed(2)} USD`);
  const diffUSD = Number(data.differenceUSD || 0);
  lines.push(`Diferencia USD: ${diffUSD >= 0 ? '+' : ''}$${diffUSD.toFixed(2)} USD`);
  lines.push(divider());
  lines.push(`Esperado COP: ${Math.round(Number(data.expectedCOP || 0)).toLocaleString('en-US')} COP`);
  lines.push(`Contado COP:  ${Math.round(Number(data.actualCOP || 0)).toLocaleString('en-US')} COP`);
  const diffCOP = Number(data.differenceCOP || 0);
  lines.push(`Diferencia COP: ${diffCOP >= 0 ? '+' : ''}${Math.round(diffCOP).toLocaleString('en-US')} COP`);

  lines.push(divider('='));
  lines.push('\x1BE\x01');
  lines.push(`TOTAL FACTURADO TURNO:`);
  lines.push(`$${Number(data.totalSalesUSD || 0).toFixed(2)} USD`);
  lines.push(`TOTAL COMANDAS PROCESADAS: ${data.totalOrdersCount || 0}`);
  lines.push('\x1BE\x00');
  lines.push(divider('-'));
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('TURNO CERRADO EXITOSAMENTE');
  lines.push('BASILICO PIZZERIA');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printReportTicket(reportType, data, targetPrinter = 'caja') {
  const payload = buildReportTicket(reportType, data);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

async function printCierreShiftTicket(cierreData, targetPrinter = 'caja') {
  const payload = buildCierreShiftTicket(cierreData);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

module.exports = {
  isKitchenItem,
  buildKitchenTicket,
  buildKitchenAdditionTicket,
  buildReceiptTicket,
  buildReportTicket,
  buildCierreShiftTicket,
  loadDualPrinterConfig,
  saveDualPrinterConfig,
  loadPrinterConfig,
  printKitchenTicket,
  printKitchenAdditionTicket,
  printReceiptTicket,
  printReportTicket,
  printCierreShiftTicket,
  printTestTicket,
};
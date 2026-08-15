const fs = require('fs');
const net = require('net');
const path = require('path');

const PRINTER_CONFIG_PATH = path.join(__dirname, '../config/thermal-printer.json');
// Font expansion in ESC/POS uses discrete sizes. Extra character spacing gives
// the 80 mm ticket approximately 40% more horizontal presence without relying
// on vendor-specific font modes.
const LINE_WIDTH = 30;
const PRINT_FORMAT_SETUP = '\x1B \x05\x1B3\x22';
const PRINT_FORMAT_RESET = '\x1B \x00\x1B2';

function loadPrinterConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(PRINTER_CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Aviso: no se pudo leer la configuración de impresora: ${error.message}`);
    }
  }

  return {
    enabled: process.env.THERMAL_PRINTER_ENABLED === 'true' || fileConfig.enabled === true,
    host: process.env.THERMAL_PRINTER_HOST || fileConfig.host || '',
    port: Number(process.env.THERMAL_PRINTER_PORT || fileConfig.port || 9100),
    timeoutMs: Number(process.env.THERMAL_PRINTER_TIMEOUT_MS || fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(process.env.THERMAL_PRINTER_COPIES || fileConfig.copies || 1)),
  };
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

function itemDetails(item) {
  const details = [];
  if (item.size) details.push(`Tamano: ${item.size}`);
  if (item.isTakeaway) details.push('PARA LLEVAR');
  if (item.sugarPreference) details.push(`Preferencia: ${item.sugarPreference}`);

  if (item.isHalfHalf && item.halfDetails) {
    const { half1Name, half2Name, half1Removed, half2Removed, half1Extras, half2Extras } = item.halfDetails;
    details.push(`1RA MITAD: ${half1Name || ''}`);
    if (half1Removed?.length) details.push(`1RA SIN: ${half1Removed.join(', ')}`);
    if (half1Extras?.length) details.push(`1RA EXTRA: ${half1Extras.map((extra) => extra.name).join(', ')}`);
    details.push(`2DA MITAD: ${half2Name || ''}`);
    if (half2Removed?.length) details.push(`2DA SIN: ${half2Removed.join(', ')}`);
    if (half2Extras?.length) details.push(`2DA EXTRA: ${half2Extras.map((extra) => extra.name).join(', ')}`);
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
    const receivedTotals = { usd: 0, cop: 0, bs: 0 };
    const changeTotals = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    for (const payment of data.payments || []) {
      const amounts = reportAmounts(payment);
      const change = paymentChangeAmounts(payment);
      receivedTotals.usd += amounts.usd; receivedTotals.cop += amounts.cop; receivedTotals.bs += amounts.bs;
      changeTotals.usd += change.usd; changeTotals.cop += change.cop; changeTotals.bs += change.bs;
      const methodTotals = byMethod.get(payment.paymentMethod) || { usd: 0, cop: 0, bs: 0 };
      methodTotals.usd += amounts.usd; methodTotals.cop += amounts.cop; methodTotals.bs += amounts.bs;
      byMethod.set(payment.paymentMethod, methodTotals);
    }
    addSection(lines, 'RESUMEN CONSOLIDADO');
    lines.push(`COMANDAS COBRADAS: ${(data.orders || []).length}`, `MOVIMIENTOS DE COBRO: ${(data.payments || []).length}`, 'TOTAL RECIBIDO:');
    addAmountLines(lines, receivedTotals, '  ', true);
    lines.push('TOTAL VUELTOS ENTREGADOS:');
    addAmountLines(lines, changeTotals, '  ', true);
    addSection(lines, 'COBROS POR METODO');
    if (byMethod.size === 0) lines.push('SIN COBROS EN EL INTERVALO');
    for (const [method, amounts] of byMethod) {
      lines.push('', ...wrapText(method));
      addAmountLines(lines, amounts, '  ');
    }
    addSection(lines, 'DETALLE AUDITABLE DE COBROS');
    if ((data.payments || []).length === 0) lines.push('SIN MOVIMIENTOS DE COBRO');
    for (const payment of data.payments || []) {
      const received = reportAmounts(payment);
      const change = paymentChangeAmounts(payment);
      lines.push('', ...wrapText(`${reportDate(payment.createdAt)} | #${payment.orderNumber || '?'}`));
      lines.push(...wrapText(`${payment.paymentMethod || 'SIN METODO'} | ${payment.payerName || 'CLIENTE GENERAL'}`, LINE_WIDTH, '  '));
      lines.push(`  APLICADO: $${(Number(payment.amountPaidUSD) || 0).toFixed(2)} USD`);
      lines.push('  RECIBIDO:');
      addAmountLines(lines, received, '    ');
      if (change.usd > 0 || change.cop > 0 || change.bs > 0) {
        lines.push('  VUELTO:');
        addAmountLines(lines, change, '    ');
      }
    }
    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');
    addSection(lines, 'VUELTOS Y EGRESOS DE CAJA');
    if (expenses.length === 0) lines.push('SIN EGRESOS REGISTRADOS');
    for (const transaction of expenses) {
      lines.push(...wrapText(`${reportDate(transaction.timestamp)} | ${transaction.description || 'EGRESO'}`));
      addAmountLines(lines, { usd: Number(transaction.amountUSD) || 0, cop: Number(transaction.amountCOP) || 0, bs: Number(transaction.amountBs) || 0 }, '  ');
    }
  }

  lines.push('', divider('='), centered('FIN DEL REPORTE'), centered('BASILICO PIZZERIA'), PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');
  return Buffer.from(lines.join('\n'), 'ascii');
}

function buildKitchenTicket(order) {
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('BASILICO PIZZERIA'),
    centered('COMANDA DE COCINA'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    `COMANDA: ${printableText(order.orderNumber)}`,
    `HORA: ${new Date(order.createdAt || Date.now()).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  if (order.type === 'delivery') lines.push('SERVICIO: DELIVERY');
  if (order.type === 'pickup') lines.push('SERVICIO: PICKUP / PARA LLEVAR');
  if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...wrapText(`MESERO: ${order.waiterName}`));

  lines.push(divider());
  for (const item of order.items || []) {
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`${item.quantity || 1}x ${item.productName || 'Producto'}`));
    lines.push('\x1BE\x00');
    for (const detail of itemDetails(item)) {
      lines.push(...wrapText(detail, LINE_WIDTH, '  '));
    }
  }

  if (order.type === 'delivery' && Number(order.deliveryFeeUSD) > 0) {
    lines.push('\x1BE\x01');
    lines.push('1x SERVICIO DELIVERY');
    lines.push('\x1BE\x00');
    lines.push(`  $${Number(order.deliveryFeeUSD).toFixed(2)} USD`);
  }

  if (order.kitchenNotes) {
    lines.push(divider());
    lines.push('\x1BE\x01');
    lines.push('NOTA GENERAL DE COCINA');
    lines.push('\x1BE\x00');
    lines.push(...wrapText(order.kitchenNotes));
  }

  lines.push(divider('='));
  lines.push(`ITEMS: ${(order.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0) + (order.type === 'delivery' && Number(order.deliveryFeeUSD) > 0 ? 1 : 0)}`);
  lines.push(`TOTAL: $${Number(order.totalUSD || 0).toFixed(2)} USD`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('VERIFICAR PERSONALIZACIONES');
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

    socket.setTimeout(config.timeoutMs);
    socket.once('connect', () => socket.end(payload, () => complete()));
    socket.once('timeout', () => complete(new Error(`Tiempo de espera agotado al conectar con ${config.host}:${config.port}.`)));
    socket.once('error', complete);
  });
}

async function printKitchenTicket(order) {
  const config = loadPrinterConfig();
  if (!config.enabled) return { printed: false, reason: 'disabled' };
  if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('La impresora térmica está habilitada, pero su host o puerto no son válidos.');
  }

  const payload = buildKitchenTicket(order);
  for (let copy = 0; copy < config.copies; copy += 1) {
    await sendRawTicket(payload, config);
  }
  return { printed: true, copies: config.copies };
}

async function printReportTicket(reportType, data) {
  const config = loadPrinterConfig();
  if (!config.enabled) return { printed: false, reason: 'disabled' };
  if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('La impresora térmica está habilitada, pero su host o puerto no son válidos.');
  }

  const payload = buildReportTicket(reportType, data);
  for (let copy = 0; copy < config.copies; copy += 1) {
    await sendRawTicket(payload, config);
  }
  return { printed: true, copies: config.copies };
}

module.exports = { buildKitchenTicket, buildReportTicket, loadPrinterConfig, printKitchenTicket, printReportTicket };
import * as XLSX from 'xlsx';

export interface ReporteIntervaloData {
  orders: Array<{
    id: string;
    orderNumber: string;
    type: string;
    tableNumber?: number;
    customerName?: string;
    status: string;
    paymentStatus: string;
    paymentMethod?: string;
    totalUSD: number;
    paidAmountUSD: number;
    deliveryFeeUSD?: number;
    copRateAtPayment: number;
    bsRateAtPayment: number;
    createdAt: string;
    isEdited: boolean;
  }>;
  items: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    productName: string;
    price: number;
    quantity: number;
    category: string;
    extras?: Array<{ name: string; price: number }>;
    extrasJson?: Array<{ name: string; price: number }>;
  }>;
  payments: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    payerName: string;
    paymentMethod: string;
    amountPaidUSD: number;
    cashTenderedUSD: number;
    cashTenderedCOP: number;
    cashTenderedBs: number;
    changeGivenUSD: number;
    changeGivenCOP: number;
    changeGivenBs: number;
    copRate: number;
    bsRate: number;
    createdAt: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amountUSD: number;
    amountCOP: number;
    amountBs: number;
    paymentMethod: string;
    description: string;
    orderId?: string;
    orderNumber?: string;
    timestamp: string;
  }>;
  edits: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    editedBy: string;
    editType: string;
    editDetails: string;
    createdAt: string;
  }>;
  exchangeRates: { COP: number; Bs: number };
  dateRange: { from: string; to: string };
  apertura?: { usdCash: number; copCash: number; openedAt?: string };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function registeredSaleAmounts(payment: ReporteIntervaloData['payments'][number]) {
  const paidUSD = payment.amountPaidUSD || 0;
  let usd = 0;
  let cop = 0;
  let bs = 0;
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(payment.paymentMethod)) {
    cop = paidUSD * (payment.copRate || 3950);
  } else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) {
    bs = paidUSD * (payment.bsRate || 36.5);
  } else {
    usd = paidUSD;
  }
  return { usd, cop, bs };
}

export function exportToExcel(data: ReporteIntervaloData): void {
  const wb = XLSX.utils.book_new();

  // --- Hoja 1: Totales Consolidados ---
  const registeredPayments = data.payments.filter((payment) => payment.paymentMethod !== 'Crédito' && payment.amountPaidUSD > 0);
  const totals = registeredPayments.reduce((sum, payment) => {
    const amounts = registeredSaleAmounts(payment);
    return { usd: sum.usd + amounts.usd, cop: sum.cop + amounts.cop, bs: sum.bs + amounts.bs };
  }, { usd: 0, cop: 0, bs: 0 });
  const cashOrders = data.orders.filter((o) => o.paymentMethod !== 'Mixto' && o.paymentStatus === 'pagado').length;
  const creditOrders = data.orders.filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito').length;

  // Desglose de Deliverys por tarifa
  const deliveryMap: Record<number, number> = {};
  let totalDeliveryServices = 0;
  let totalDeliveryUSD = 0;
  data.orders.forEach((ord) => {
    const fee = Number(ord.deliveryFeeUSD) || 0;
    if (ord.type === 'delivery' || fee > 0) {
      totalDeliveryServices += 1;
      totalDeliveryUSD += fee;
      deliveryMap[fee] = (deliveryMap[fee] || 0) + 1;
    }
  });

  // Desglose de Extras / Adicionales por tarifa
  const extrasMap: Record<number, { count: number; totalUSD: number }> = {};
  let totalExtrasCount = 0;
  let totalExtrasUSD = 0;
  data.items.forEach((it: any) => {
    const itQty = Number(it.quantity) || 1;
    const extrasList: any[] = [];
    if (Array.isArray(it.extras)) extrasList.push(...it.extras);
    else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);

    extrasList.forEach((extra) => {
      const price = Number(extra.price) || 0;
      const count = itQty;
      const subtotal = price * count;
      totalExtrasCount += count;
      totalExtrasUSD += subtotal;
      if (!extrasMap[price]) extrasMap[price] = { count: 0, totalUSD: 0 };
      extrasMap[price].count += count;
      extrasMap[price].totalUSD += subtotal;
    });
  });

  const totalFacturadoUSD = totals.usd + (totals.cop / data.exchangeRates.COP) + (totals.bs / data.exchangeRates.Bs);

  const totalesData = [
    ['CIERRE DE CAJA EN EL INTERVALO CONSOLIDADO'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    ['Concepto', 'USD', 'COP', 'Bs'],
    ['Total Facturado (Vendido)', totals.usd.toFixed(2), Math.round(totals.cop).toLocaleString(), totals.bs.toFixed(2)],
    ['Total Venta Facturada (Equiv. USD)', `$${totalFacturadoUSD.toFixed(2)} USD`, '', ''],
    [],
    ['Total Comandas', data.orders.length.toString()],
    ['Comandas de Contado', cashOrders.toString()],
    ['Comandas a Crédito', creditOrders.toString()],
    [],
    ['Total Servicios Delivery', `${totalDeliveryServices} envíos ($${totalDeliveryUSD.toFixed(2)} USD)`],
    ['Total Adicionales / Extras', `${totalExtrasCount} extras ($${totalExtrasUSD.toFixed(2)} USD)`],
    [],
    ['Comanda Inicial', data.orders.length > 0 ? `#${data.orders[0].orderNumber}` : 'N/A'],
    ['Comanda Final', data.orders.length > 0 ? `#${data.orders[data.orders.length - 1].orderNumber}` : 'N/A'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(totalesData);
  ws1['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Totales');

  // --- Hoja 2: Desglose por Cuenta/Caja ---
  const methodTotals: Record<string, { count: number; usd: number; cop: number; bs: number }> = {};
  registeredPayments.forEach((p) => {
    if (!methodTotals[p.paymentMethod]) {
      methodTotals[p.paymentMethod] = { count: 0, usd: 0, cop: 0, bs: 0 };
    }
    const amounts = registeredSaleAmounts(p);
    methodTotals[p.paymentMethod].count++;
    methodTotals[p.paymentMethod].usd += amounts.usd;
    methodTotals[p.paymentMethod].cop += amounts.cop;
    methodTotals[p.paymentMethod].bs += amounts.bs;
  });

  const cuentasHeader = ['Método de Pago', 'Cantidad', 'Total USD', 'Total COP', 'Total Bs'];
  const cuentasRows = Object.entries(methodTotals)
    .sort((a, b) => (b[1].usd + b[1].cop / data.exchangeRates.COP + b[1].bs / data.exchangeRates.Bs) - (a[1].usd + a[1].cop / data.exchangeRates.COP + a[1].bs / data.exchangeRates.Bs))
    .map(([method, info]) => [
      method,
      info.count.toString(),
      info.usd.toFixed(2),
      Math.round(info.cop).toLocaleString(),
      info.bs.toFixed(2),
    ]);

  const cuentasData = [
    ['DESGLOSE POR TIPO DE CUENTA Y CAJA'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    cuentasHeader,
    ...cuentasRows,
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(cuentasData);
  ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Cuentas');

  // --- Hoja 3: Ítems Vendidos ---
  const itemTally: Record<string, { category: string; quantity: number; totalUSD: number }> = {};
  data.items.forEach((it) => {
    if (!itemTally[it.productName]) {
      itemTally[it.productName] = { category: it.category, quantity: 0, totalUSD: 0 };
    }
    itemTally[it.productName].quantity += it.quantity;
    itemTally[it.productName].totalUSD += it.price * it.quantity;
  });

  const itemEntries = Object.entries(itemTally)
    .sort((a, b) => {
      const catCmp = a[1].category.localeCompare(b[1].category);
      return catCmp !== 0 ? catCmp : a[0].localeCompare(b[0]);
    });

  const itemsHeader = ['Categoría', 'Producto', 'Cantidad', 'Total USD'];
  const itemsRows = itemEntries.map(([name, info]) => [
    info.category,
    name,
    info.quantity.toString(),
    info.totalUSD.toFixed(2),
  ]);

  const itemsData = [
    ['ÍTEMS FACTURADOS EN EL INTERVALO'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    itemsHeader,
    ...itemsRows,
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(itemsData);
  ws3['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Items Vendidos');

  // --- Hoja 4: Historial de Pagos ---
  const historialHeader = ['Fecha', 'Comanda #', 'Método', 'Pagador', 'Aplicado USD', 'Recibido USD', 'Recibido COP', 'Recibido Bs', 'Vuelto USD', 'Vuelto COP', 'Vuelto Bs'];
  const historialRows = data.payments.map((p) => [
    formatDate(p.createdAt),
    `#${p.orderNumber}`,
    p.paymentMethod,
    p.payerName,
    p.amountPaidUSD.toFixed(2),
    (p.cashTenderedUSD || 0).toFixed(2),
    Math.round(p.cashTenderedCOP || 0).toLocaleString(),
    (p.cashTenderedBs || 0).toFixed(2),
    (p.changeGivenUSD || 0).toFixed(2),
    Math.round(p.changeGivenCOP || 0).toLocaleString(),
    (p.changeGivenBs || 0).toFixed(2),
  ]);

  const historialData = [
    ['HISTORIAL DE PAGOS POR COMANDA Y MÉTODO'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    historialHeader,
    ...historialRows,
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(historialData);
  ws4['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Historial Pagos');

  // --- Hoja 5: Cuentas a Crédito / Deudas ---
  const creditOrdersList = data.orders.filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
  const creditRows = creditOrdersList.map((ord) => {
    const orderItems = data.items
      .filter((it) => it.orderId === ord.id)
      .map((it) => `${it.quantity}x ${it.productName}`)
      .join(', ');
    return [
      formatDate(ord.createdAt),
      `#${ord.orderNumber}`,
      ord.customerName || 'Cliente Deudor',
      orderItems || 'Consumo general',
      ord.totalUSD.toFixed(2),
      Math.round(ord.totalUSD * (ord.copRateAtPayment || data.exchangeRates.COP)).toLocaleString(),
      (ord.totalUSD * (ord.bsRateAtPayment || data.exchangeRates.Bs)).toFixed(2),
    ];
  });

  const creditData = [
    ['DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    ['Fecha / Hora', 'Comanda #', 'Cliente / Deudor', 'Ítems Solicitados', 'Deuda USD', 'Equivalente COP', 'Equivalente Bs'],
    ...creditRows,
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(creditData);
  ws5['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 25 }, { wch: 40 }, { wch: 15 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Créditos');

  // Generar y descargar
  const fromFormatted = new Date(data.dateRange.from).toISOString().slice(0, 10);
  const toFormatted = new Date(data.dateRange.to).toISOString().slice(0, 10);
  const fileName = `Basilico_Reporte_${fromFormatted}_a_${toFormatted}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Report Service - Generador de Reportes Auditables en PDF e Impresión Profesional para Basilico Pizzeria

import { Order, CajaChicaTransaction, ExchangeRates } from '../data/mockData';
import { ReporteIntervaloData } from './excelExportService';

export class ReportService {
  private openPrintWindow(title: string, htmlContent: string) {
    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (!printWin) {
      alert('Por favor habilite las ventanas emergentes (popups) para ver e imprimir los reportes PDF.');
      return;
    }

    const fullDoc = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${title} - Basilico Pizzeria</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
          @page {
            size: 80mm auto;
            margin: 3mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            margin: 0;
            padding: 0;
            width: 74mm;
            color: #111827;
            background: #ffffff;
            font-size: 9px;
          }
          .header {
            display: block;
            border-bottom: 2px solid #111827;
            padding-bottom: 7px;
            margin-bottom: 10px;
          }
          .logo-title {
            font-size: 15px;
            font-weight: 900;
            color: #070707;
            letter-spacing: 0;
          }
          .logo-sub {
            font-size: 8px;
            color: #374151;
            font-weight: 800;
            text-transform: uppercase;
          }
          .doc-meta {
            text-align: left;
            font-size: 8px;
            color: #374151;
            margin-top: 5px;
          }
          .section-title {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0;
            color: #111827;
            margin-top: 12px;
            margin-bottom: 5px;
            padding-left: 5px;
            border-left: 2px solid #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-bottom: 8px;
            font-size: 8px;
            word-break: break-word;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 7px;
            padding: 4px 3px;
            text-align: left;
            border-bottom: 1px solid #9ca3af;
          }
          td {
            padding: 4px 3px;
            border-bottom: 1px solid #e5e7eb;
            color: #1f2937;
            vertical-align: top;
          }
          .total-box {
            background-color: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 0;
            padding: 7px;
            display: block;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
          }
          .total-label {
            font-size: 8px;
            font-weight: 800;
            color: #065f46;
            text-transform: uppercase;
          }
          .total-val {
            font-size: 14px;
            font-weight: 900;
            color: #047857;
          }
          .no-print {
            position: fixed;
            bottom: 12px;
            right: 12px;
            background: #10b981;
            color: white;
            padding: 9px 12px;
            border: none;
            border-radius: 4px;
            font-weight: 900;
            font-size: 11px;
            cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
          }
          @media print {
            .no-print { display: none; }
            body { width: 74mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">BASILICO PIZZERIA</div>
            <div class="logo-sub">Sistema de Gestión & Auditoría de Ventas</div>
          </div>
          <div class="doc-meta">
            <div><strong>REPORTE:</strong> ${title}</div>
            <div><strong>FECHA EMISIÓN:</strong> ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            <div><strong>HORA:</strong> ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        ${htmlContent}

        <button class="no-print" onclick="window.print()">🖨️ IMPRIMIR / GUARDAR EN PDF</button>
      </body>
      </html>
    `;

    printWin.document.write(fullDoc);
    printWin.document.close();
  }

  private reportDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  private escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[character] || character));
  }

  private paymentMethodLabel(method: string) {
    const labels: Record<string, string> = {
      'Efectivo USD': 'Divisas efectivo',
      Binance: 'Binance USD',
      Zelle: 'Zelle',
      'Efectivo COP': 'COP efectivo',
      Bancolombia: 'Bancolombia',
      Nequi: 'Nequi',
      'Binance COP': 'Binance COP',
      'Pago Móvil': 'Pago Móvil',
      'Tarjeta de Débito': 'Tarjeta Débito',
      'Tarjeta de Crédito': 'Tarjeta Crédito',
      Crédito: 'Cuenta a Crédito',
    };
    return labels[method] || method || 'Sin método';
  }

  private paymentCurrency(method: string): 'USD' | 'COP' | 'Bs' {
    if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(method)) return 'COP';
    if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(method)) return 'Bs';
    return 'USD';
  }

  private registeredPaymentAmounts(payment: ReporteIntervaloData['payments'][number]) {
    let usd = payment.cashTenderedUSD || 0;
    let cop = payment.cashTenderedCOP || 0;
    let bs = payment.cashTenderedBs || 0;
    const curr = this.paymentCurrency(payment.paymentMethod);
    if (usd === 0 && cop === 0 && bs === 0 && payment.amountPaidUSD > 0) {
      if (curr === 'USD') usd = payment.amountPaidUSD;
      if (curr === 'COP') cop = payment.amountPaidUSD * payment.copRate;
      if (curr === 'Bs') bs = payment.amountPaidUSD * payment.bsRate;
    }
    const nativeAmount = curr === 'USD' ? usd : curr === 'COP' ? cop : bs;
    return {
      currency: curr,
      nativeAmount,
      usd,
      cop,
      bs,
      equivalentUSD: usd + (cop / (payment.copRate || 3950)) + (bs / (payment.bsRate || 36.5)),
    };
  }

  private intervalTitle(data: ReporteIntervaloData) {
    return `Desde ${this.reportDate(data.dateRange.from)} hasta ${this.reportDate(data.dateRange.to)}`;
  }

  // 1. Reporte de Pizzas e Ítems Vendidos
  generatePizzasSoldReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado' || o.paymentStatus === 'credito');
    const tally: Record<string, { qty: number; revenueUSD: number; category: string }> = {};

    paidOrders.forEach((o) => {
      o.items.forEach((it) => {
        if (!tally[it.productName]) {
          tally[it.productName] = {
            qty: 0,
            revenueUSD: 0,
            category: it.productName.toLowerCase().includes('pizza') ? 'Pizzas' : 'Bebidas/Adicionales',
          };
        }
        tally[it.productName].qty += it.quantity;
        tally[it.productName].revenueUSD += it.price * it.quantity;
      });
    });

    const entries = Object.entries(tally).sort((a, b) => b[1].qty - a[1].qty);
    const totalPizzas = entries.reduce((sum, e) => sum + e[1].qty, 0);
    const totalRevenueUSD = entries.reduce((sum, e) => sum + e[1].revenueUSD, 0);

    const rows = entries
      .map(
        ([name, data], idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td><strong>${name}</strong></td>
        <td><span style="background:#f3f4f6; padding:2px 8px; border-radius:6px; font-weight:700;">${data.category}</span></td>
        <td style="text-align:center;"><strong>${data.qty}</strong> u.</td>
        <td style="text-align:right; font-weight:700;">$${data.revenueUSD.toFixed(2)}</td>
      </tr>
    `
      )
      .join('');

    const content = `
      <div class="section-title">DESGLOSE DE ÍTEMS Y PIZZAS FACTURADAS</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Producto / Especialidad</th>
            <th>Categoría</th>
            <th style="text-align:center;">Unidades</th>
            <th style="text-align:right;">Subtotal USD</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No se registran productos facturados en el sistema aún.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box">
        <div>
          <div class="total-label">TOTAL UNIDADES VENDIDAS:</div>
          <div style="font-size: 14px; font-weight: 800;">${totalPizzas} Unidades</div>
        </div>
        <div style="text-align:right; margin-top:5px;">
          <div class="total-label">RECAUDACIÓN TOTAL PRODUCTOS:</div>
          <div class="total-val">$${totalRevenueUSD.toFixed(2)} USD</div>
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Ventas_Pizzas', content);
  }

  // 2. Reporte de Ingresos y Cobros
  generateIncomeReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    const creditOrders = orders.filter((o) => o.paymentStatus === 'credito');
    const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
    const totalCreditUSD = creditOrders.reduce((sum, o) => sum + o.totalUSD, 0);

    const byCurrency: Record<string, number> = {
      USD: 0,
      COP: 0,
      Bs: 0,
    };

    paidOrders.forEach((o) => {
      const curr = this.paymentCurrency(o.paymentMethod || 'Efectivo USD');
      if (curr === 'USD') byCurrency.USD += o.totalUSD;
      if (curr === 'COP') byCurrency.COP += o.totalUSD * rates.COP;
      if (curr === 'Bs') byCurrency.Bs += o.totalUSD * rates.Bs;
    });

    const rows = paidOrders
      .map((o) => {
        const curr = this.paymentCurrency(o.paymentMethod || 'Efectivo USD');
        const amount = curr === 'USD' ? `$${o.totalUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(o.totalUSD * rates.COP).toLocaleString()}` : `Bs ${(o.totalUSD * rates.Bs).toFixed(2)}`;
        return `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>${(o.type || 'mesa').toUpperCase()}</td>
          <td>${o.customerName || 'Cliente General'}</td>
          <td>${o.paymentMethod || 'Efectivo USD'}</td>
          <td>${curr}</td>
          <td style="text-align:right; font-weight:700;">${amount}</td>
        </tr>
      `;
      })
      .join('');

    const content = `
      <div class="section-title">TOTALES POR MONEDA</div>
      <table>
        <thead>
          <tr>
            <th>Moneda</th>
            <th style="text-align:right;">Monto Recibido</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>💵 Dólares (USD)</td>
            <td style="text-align:right; font-weight:900; color:#047857;">$${byCurrency.USD.toFixed(2)}</td>
          </tr>
          <tr>
            <td>🇨🇴 Pesos Colombianos (COP)</td>
            <td style="text-align:right; font-weight:700;">$${Math.round(byCurrency.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>🇻🇪 Bolívares (Bs)</td>
            <td style="text-align:right; font-weight:700;">Bs ${byCurrency.Bs.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">DETALLE DE COMANDAS COBRADAS</div>
      <table>
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Método</th>
            <th>Moneda</th>
            <th style="text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="6" style="text-align:center; color:#9ca3af;">No hay cobros registrados.</td></tr>'}
        </tbody>
      </table>

      ${creditOrders.length > 0 ? `
        <div class="section-title">DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR</div>
        <table>
          <thead>
            <tr>
              <th>Comanda</th>
              <th>Cliente / Deudor</th>
              <th style="text-align:right;">Monto Deuda USD</th>
            </tr>
          </thead>
          <tbody>
            ${creditOrders.map((o) => `<tr><td><strong>#${o.orderNumber}</strong></td><td>${this.escapeHtml(o.customerName || 'Deudor')}</td><td style="text-align:right; font-weight:900; color:#b45309;">$${o.totalUSD.toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="total-box">
        <div class="total-label">TOTAL BRUTO RECAUDADO (CONTADO):</div>
        <div class="total-val">$${totalUSD.toFixed(2)} USD</div>
        ${totalCreditUSD > 0 ? `<div style="font-size:11px; font-weight:800; color:#b45309; margin-top:4px;">Total cuentas a crédito: $${totalCreditUSD.toFixed(2)} USD</div>` : ''}
      </div>
    `;

    this.openPrintWindow('Reporte_Ingresos_y_Cobros', content);
  }

  // 3. Reporte de Vueltos y Egresos de Caja Chica
  generateExpensesReport(transactions: CajaChicaTransaction[]) {
    const egresos = transactions.filter((t) => t.type === 'egreso');
    const totalEgresosUSD = egresos.reduce((sum, t) => sum + t.amountUSD, 0);

    const rows = egresos
      .map((t) => {
        const curr = t.amountUSD > 0 ? 'USD' : t.amountCOP > 0 ? 'COP' : 'Bs';
        const amount = curr === 'USD' ? `$${t.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(t.amountCOP).toLocaleString()}` : `Bs ${t.amountBs.toFixed(2)}`;
        return `
        <tr>
          <td>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><strong>${t.description}</strong></td>
          <td>${t.paymentMethod}</td>
          <td>${curr}</td>
          <td style="text-align:right; color:#dc2626; font-weight:800;">-${amount}</td>
        </tr>
      `;
      })
      .join('');

    const content = `
      <div class="section-title">HISTORIAL DE VUELTOS Y EGRESOS DE CAJA CHICA</div>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Descripción / Motivo</th>
            <th>Método</th>
            <th>Moneda</th>
            <th style="text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No hay egresos o vueltos registrados.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box" style="background:#fef2f2; border-color:#fecaca;">
        <div class="total-label" style="color:#991b1b;">TOTAL EGRESOS / VUELTOS:</div>
        <div class="total-val" style="color:#dc2626;">-$${totalEgresosUSD.toFixed(2)} USD</div>
      </div>
    `;

    this.openPrintWindow('Reporte_Vueltos_y_Egresos', content);
  }

  // 4. Reporte de Pizzas Vendidas por Intervalo
  generatePizzasSoldIntervalReport(data: ReporteIntervaloData) {
    const tally: Record<string, { category: string; name: string; quantity: number; totalUSD: number }> = {};
    data.items.forEach((item) => {
      const key = `${item.category}|${item.productName}`;
      if (!tally[key]) tally[key] = { category: item.category, name: item.productName, quantity: 0, totalUSD: 0 };
      tally[key].quantity += item.quantity;
      tally[key].totalUSD += item.price * item.quantity;
    });
    const rows = Object.entries(tally).sort((a, b) => a[1].category.localeCompare(b[1].category) || a[0].localeCompare(b[0]))
      .map(([, item]) => `<tr><td>${this.escapeHtml(item.category)}</td><td><strong>${this.escapeHtml(item.name)}</strong></td><td style="text-align:right;">${item.quantity}</td><td style="text-align:right;">$${item.totalUSD.toFixed(2)}</td></tr>`).join('');
    const totalUnits = data.items.reduce((total, item) => total + item.quantity, 0);
    this.openPrintWindow('Pizzas_Vendidas_Intervalo', `
      <div class="section-title">PIZZAS VENDIDAS POR TIPO Y UNIDADES</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Categoría</th><th>Ítem</th><th style="text-align:right;">Unidades</th><th style="text-align:right;">Total USD</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="text-align:center;">Sin ítems facturados en el intervalo.</td></tr>'}</tbody></table>
      <div class="total-box"><div><div class="total-label">UNIDADES FACTURADAS</div><strong>${totalUnits}</strong></div><div><div class="total-label">ÍTEMS DIFERENTES</div><strong>${Object.keys(tally).length}</strong></div></div>
    `);
  }

  // 5. Reporte de Ingresos y Cobros por Intervalo
  generateIncomeIntervalReport(data: ReporteIntervaloData) {
    const orderIncomes = (data.payments || []).filter((payment) => (payment.amountPaidUSD > 0 || payment.cashTenderedUSD > 0 || payment.cashTenderedCOP > 0 || payment.cashTenderedBs > 0) && payment.paymentMethod !== 'Crédito');
    const manualIncomes = (data.transactions || []).filter((t) => t.type === 'ingreso' && !t.orderId);

    const totals = { usd: 0, cop: 0, bs: 0 };

    const orderRows = orderIncomes.map((payment) => {
      const amounts = this.registeredPaymentAmounts(payment);
      totals.usd += amounts.usd;
      totals.cop += amounts.cop;
      totals.bs += amounts.bs;
      const formattedAmount = amounts.currency === 'USD' ? `$${amounts.usd.toFixed(2)}` : amounts.currency === 'COP' ? `$${Math.round(amounts.cop).toLocaleString()}` : `Bs ${amounts.bs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(payment.createdAt)}</td><td>#${this.escapeHtml(payment.orderNumber)}</td><td>${this.escapeHtml(this.paymentMethodLabel(payment.paymentMethod))}</td><td>${this.escapeHtml(payment.payerName)}</td><td>${amounts.currency}</td><td style="text-align:right; font-weight:700; color:#047857;">+${formattedAmount}</td></tr>`;
    });

    const manualRows = manualIncomes.map((t) => {
      const curr = t.amountUSD > 0 ? 'USD' : t.amountCOP > 0 ? 'COP' : 'Bs';
      if (curr === 'USD') totals.usd += t.amountUSD;
      if (curr === 'COP') totals.cop += t.amountCOP;
      if (curr === 'Bs') totals.bs += t.amountBs;
      const formattedAmount = curr === 'USD' ? `$${t.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(t.amountCOP).toLocaleString()}` : `Bs ${t.amountBs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(t.timestamp)}</td><td>Ingreso Manual</td><td>${this.escapeHtml(t.paymentMethod || 'Efectivo')}</td><td>${this.escapeHtml(t.description || 'Caja Chica')}</td><td>${curr}</td><td style="text-align:right; font-weight:700; color:#047857;">+${formattedAmount}</td></tr>`;
    });

    const allRows = [...orderRows, ...manualRows].join('');

    this.openPrintWindow('Ingresos_y_Cobros_Intervalo', `
      <div class="section-title">INGRESOS Y COBROS POR MÉTODO DE PAGO</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha / Hora</th><th>Comanda / Origen</th><th>Método</th><th>Pagador / Concepto</th><th>Moneda</th><th style="text-align:right;">Monto</th></tr></thead><tbody>${allRows || '<tr><td colspan="6" style="text-align:center;">Sin cobros ni ingresos en el intervalo.</td></tr>'}</tbody></table>
      <div class="total-box" style="background:#ecfdf5; border-color:#a7f3d0; margin-top:16px;">
        <div style="font-size:11px; font-weight:900; color:#065f46; margin-bottom:6px;">TOTAL INGRESOS RECIBIDOS:</div>
        <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:13px; font-weight:900; color:#047857;">
          ${totals.usd > 0 ? `<span>💵 $${totals.usd.toFixed(2)} USD</span>` : ''}
          ${totals.cop > 0 ? `<span>🇨🇴 $${Math.round(totals.cop).toLocaleString()} COP</span>` : ''}
          ${totals.bs > 0 ? `<span>🇻🇪 Bs ${totals.bs.toFixed(2)}</span>` : ''}
          ${totals.usd === 0 && totals.cop === 0 && totals.bs === 0 ? '<span>$0.00</span>' : ''}
        </div>
      </div>
    `);
  }

  // 6. Reporte de Vueltos y Egresos por Intervalo
  generateExpensesIntervalReport(data: ReporteIntervaloData) {
    const expenses = (data.transactions || []).filter((transaction) => transaction.type === 'egreso');
    const totals = { usd: 0, cop: 0, bs: 0 };
    const rows = expenses.map((transaction) => {
      const curr = transaction.amountUSD > 0 ? 'USD' : transaction.amountCOP > 0 ? 'COP' : 'Bs';
      if (curr === 'USD') totals.usd += transaction.amountUSD;
      if (curr === 'COP') totals.cop += transaction.amountCOP;
      if (curr === 'Bs') totals.bs += transaction.amountBs;
      const amount = curr === 'USD' ? `$${transaction.amountUSD.toFixed(2)}` : curr === 'COP' ? `$${Math.round(transaction.amountCOP).toLocaleString()}` : `Bs ${transaction.amountBs.toFixed(2)}`;
      return `<tr><td>${this.reportDate(transaction.timestamp)}</td><td>${this.escapeHtml(transaction.description)}</td><td>${this.escapeHtml(this.paymentMethodLabel(transaction.paymentMethod))}</td><td>${curr}</td><td style="text-align:right; color:#dc2626; font-weight:700;">-${amount}</td></tr>`;
    }).join('');

    this.openPrintWindow('Vueltos_y_Egresos_Intervalo', `
      <div class="section-title">VUELTOS Y EGRESOS DE CAJA CHICA</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha / Hora</th><th>Descripción</th><th>Método</th><th>Moneda</th><th style="text-align:right;">Monto</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Sin egresos en el intervalo.</td></tr>'}</tbody></table>
      <div class="total-box" style="background:#fef2f2; border-color:#fecaca; margin-top:16px;">
        <div style="font-size:11px; font-weight:900; color:#991b1b; margin-bottom:6px;">TOTAL VUELTOS Y EGRESOS ENTREGADOS:</div>
        <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:13px; font-weight:900; color:#dc2626;">
          ${totals.usd > 0 ? `<span>💵 $${totals.usd.toFixed(2)} USD</span>` : ''}
          ${totals.cop > 0 ? `<span>🇨🇴 $${Math.round(totals.cop).toLocaleString()} COP</span>` : ''}
          ${totals.bs > 0 ? `<span>🇻🇪 Bs ${totals.bs.toFixed(2)}</span>` : ''}
          ${totals.usd === 0 && totals.cop === 0 && totals.bs === 0 ? '<span>$0.00</span>' : ''}
        </div>
      </div>
    `);
  }

  // 7. Reporte de Cocina y Preparación por Intervalo
  generateKitchenTimesIntervalReport(data: ReporteIntervaloData) {
    const rows = data.orders.map((order) => `<tr><td><strong>#${this.escapeHtml(order.orderNumber)}</strong></td><td>${this.escapeHtml(order.type)}</td><td>${this.reportDate(order.createdAt)}</td><td>${this.escapeHtml(order.status)}</td><td style="text-align:center;">Completada</td></tr>`).join('');
    this.openPrintWindow('Tiempos_Cocina_Intervalo', `
      <div class="section-title">TIEMPOS COCINA Y AUDITORÍA DE PREPARACIÓN</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Comanda</th><th>Tipo</th><th>Hora recibida</th><th>Estado</th><th style="text-align:center;">Preparación</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Sin comandas facturadas en el intervalo.</td></tr>'}</tbody></table>
    `);
  }

  // 8. Reporte Contable Consolidado con Desglose de Monedas y Créditos
  generateReporteContable(data: ReporteIntervaloData) {
    const methodNames = ['Efectivo USD', 'Binance', 'Zelle', 'Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP', 'Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'];
    const methodTotals = new Map(methodNames.map((method) => [method, { currency: this.paymentCurrency(method), nativeTotal: 0, usd: 0, cop: 0, bs: 0, equivalentUSD: 0, count: 0 }]));
    const receiptTotals = { usd: 0, cop: 0, bs: 0 };
    const paymentsByOrder = new Map<string, ReporteIntervaloData['payments']>();

    data.payments.forEach((payment) => {
      if (payment.paymentMethod === 'Crédito') return;
      if (payment.amountPaidUSD <= 0 && payment.cashTenderedUSD <= 0 && payment.cashTenderedCOP <= 0 && payment.cashTenderedBs <= 0) return;
      const amounts = this.registeredPaymentAmounts(payment);
      receiptTotals.usd += amounts.usd;
      receiptTotals.cop += amounts.cop;
      receiptTotals.bs += amounts.bs;

      const totals = methodTotals.get(payment.paymentMethod) || { currency: amounts.currency, nativeTotal: 0, usd: 0, cop: 0, bs: 0, equivalentUSD: 0, count: 0 };
      totals.nativeTotal += amounts.nativeAmount;
      totals.usd += amounts.usd;
      totals.cop += amounts.cop;
      totals.bs += amounts.bs;
      totals.equivalentUSD += amounts.equivalentUSD;
      totals.count += 1;
      methodTotals.set(payment.paymentMethod, totals);
      paymentsByOrder.set(payment.orderId, [...(paymentsByOrder.get(payment.orderId) || []), payment]);
    });

    // Calcular Egresos y Vueltos
    const expenses = (data.transactions || []).filter((transaction) => transaction.type === 'egreso');
    const expenseTotals = { usd: 0, cop: 0, bs: 0 };
    expenses.forEach((t) => {
      expenseTotals.usd += Number(t.amountUSD) || 0;
      expenseTotals.cop += Number(t.amountCOP) || 0;
      expenseTotals.bs += Number(t.amountBs) || 0;
    });

    // Cálculo exclusivo para CAJA CHICA DEL EFECTIVO ESPERADA
    const aperturaUSD = data.apertura?.usdCash || 0;
    const aperturaCOP = data.apertura?.copCash || 0;

    // Ingresos en Efectivo USD (Cobros en Efectivo USD de comandas + Ingresos manuales en Efectivo USD)
    const orderCashUSD = data.payments
      .filter((p) => p.paymentMethod === 'Efectivo USD')
      .reduce((sum, p) => sum + (this.registeredPaymentAmounts(p).usd || 0), 0);
    const manualCashUSD = (data.transactions || [])
      .filter((t) => t.type === 'ingreso' && !t.orderId && t.paymentMethod === 'Efectivo USD')
      .reduce((sum, t) => sum + (t.amountUSD || 0), 0);
    const totalIngresosEfectivoUSD = orderCashUSD + manualCashUSD;

    // Ingresos en Efectivo COP (Cobros en Efectivo COP de comandas + Ingresos manuales en Efectivo COP)
    const orderCashCOP = data.payments
      .filter((p) => p.paymentMethod === 'Efectivo COP')
      .reduce((sum, p) => sum + (this.registeredPaymentAmounts(p).cop || 0), 0);
    const manualCashCOP = (data.transactions || [])
      .filter((t) => t.type === 'ingreso' && !t.orderId && t.paymentMethod === 'Efectivo COP')
      .reduce((sum, t) => sum + (t.amountCOP || 0), 0);
    const totalIngresosEfectivoCOP = orderCashCOP + manualCashCOP;

    // Egresos y Vueltos en Efectivo USD
    const totalEgresosEfectivoUSD = expenses
      .filter((t) => t.paymentMethod === 'Efectivo USD' || (t.amountUSD > 0 && !t.paymentMethod?.includes('COP') && !t.paymentMethod?.includes('Bs') && !t.paymentMethod?.includes('Móvil') && !t.paymentMethod?.includes('Tarjeta')))
      .reduce((sum, t) => sum + (t.amountUSD || 0), 0);

    // Egresos y Vueltos en Efectivo COP
    const totalEgresosEfectivoCOP = expenses
      .filter((t) => t.paymentMethod === 'Efectivo COP' || (t.amountCOP > 0 && !t.paymentMethod?.includes('USD') && !t.paymentMethod?.includes('Bs') && !t.paymentMethod?.includes('Móvil') && !t.paymentMethod?.includes('Tarjeta')))
      .reduce((sum, t) => sum + (t.amountCOP || 0), 0);

    // Saldo Final de Caja Chica del Efectivo Esperada
    const cajaChicaEsperadaUSD = aperturaUSD + totalIngresosEfectivoUSD - totalEgresosEfectivoUSD;
    const cajaChicaEsperadaCOP = aperturaCOP + totalIngresosEfectivoCOP - totalEgresosEfectivoCOP;

    // Desglose de Vueltos y Egresos por Tipo de Pago
    const expenseMethodMap = new Map<string, { currency: string; count: number; usd: number; cop: number; bs: number }>();
    expenses.forEach((t) => {
      const method = t.paymentMethod || (t.amountBs > 0 ? 'Pago Móvil' : t.amountCOP > 0 ? 'Efectivo COP' : 'Efectivo USD');
      const currency = t.amountBs > 0 ? 'Bs' : t.amountCOP > 0 ? 'COP' : 'USD';
      const entry = expenseMethodMap.get(method) || { currency, count: 0, usd: 0, cop: 0, bs: 0 };
      entry.count += 1;
      entry.usd += Number(t.amountUSD) || 0;
      entry.cop += Number(t.amountCOP) || 0;
      entry.bs += Number(t.amountBs) || 0;
      expenseMethodMap.set(method, entry);
    });

    const expenseMethodRows = Array.from(expenseMethodMap.entries())
      .map(([method, totals]) => {
        const formattedAmount = totals.currency === 'USD'
          ? `-$${totals.usd.toFixed(2)} USD`
          : totals.currency === 'COP'
          ? `-$${Math.round(totals.cop).toLocaleString()} COP`
          : `-Bs ${totals.bs.toFixed(2)}`;
        return `
          <tr>
            <td><strong>${this.escapeHtml(this.paymentMethodLabel(method))}</strong></td>
            <td>${totals.currency}</td>
            <td style="text-align:center;">${totals.count}</td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">${formattedAmount}</td>
          </tr>
        `;
      }).join('');

    // Separación de Contado y Crédito
    const creditOrders = data.orders.filter((order) => order.paymentStatus === 'credito' || order.paymentMethod === 'Crédito');
    const cashOrders = data.orders.filter((order) => order.paymentStatus === 'pagado' && order.paymentMethod !== 'Crédito');
    const firstOrder = data.orders[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders[data.orders.length - 1]?.orderNumber || 'N/A';

    // Desglose por Tipo de Pago (Columna de Moneda y Monto)
    const methodRows = Array.from(methodTotals.entries())
      .filter(([, totals]) => totals.count > 0 || totals.nativeTotal > 0)
      .map(([method, totals]) => {
        const formattedAmount = totals.currency === 'USD'
          ? `$${totals.usd.toFixed(2)}`
          : totals.currency === 'COP'
          ? `$${Math.round(totals.cop).toLocaleString()}`
          : `Bs ${totals.bs.toFixed(2)}`;
        return `
          <tr>
            <td><strong>${this.escapeHtml(this.paymentMethodLabel(method))}</strong></td>
            <td>${totals.currency}</td>
            <td style="text-align:center;">${totals.count}</td>
            <td style="text-align:right; font-weight:700;">${formattedAmount}</td>
          </tr>
        `;
      }).join('');

    // Desglose de Créditos y Cuentas por Cobrar
    const totalCreditUSD = creditOrders.reduce((sum, o) => sum + (o.totalUSD || 0), 0);
    const creditRows = creditOrders.map((ord) => {
      const orderItems = data.items
        .filter((it) => it.orderId === ord.id)
        .map((it) => `${it.quantity}x ${this.escapeHtml(it.productName)}`)
        .join(', ');
      const copEquiv = Math.round(ord.totalUSD * (ord.copRateAtPayment || data.exchangeRates.COP)).toLocaleString();
      const bsEquiv = (ord.totalUSD * (ord.bsRateAtPayment || data.exchangeRates.Bs)).toFixed(2);
      return `
        <tr>
          <td><strong>#${this.escapeHtml(ord.orderNumber)}</strong></td>
          <td>${this.reportDate(ord.createdAt)}</td>
          <td><strong>${this.escapeHtml(ord.customerName || 'Cliente Deudor')}</strong></td>
          <td style="font-size:7.5px;">${orderItems || 'Consumo general'}</td>
          <td style="text-align:right; font-weight:900; color:#b45309;">
            $${ord.totalUSD.toFixed(2)} USD
            <div style="font-size:7px; color:#78350f; font-weight:normal;">(${copEquiv} COP / ${bsEquiv} Bs)</div>
          </td>
        </tr>
      `;
    }).join('');

    // Ítems Facturados
    const itemMap: Record<string, { category: string; name: string; quantity: number }> = {};
    data.items.forEach((item) => {
      const key = `${item.category}|${item.productName}`;
      if (!itemMap[key]) itemMap[key] = { category: item.category, name: item.productName, quantity: 0 };
      itemMap[key].quantity += item.quantity;
    });
    const itemRows = Object.values(itemMap)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((item) => `<tr><td>${this.escapeHtml(item.category)}</td><td>${this.escapeHtml(item.name)}</td><td style="text-align:right;">${item.quantity}</td></tr>`)
      .join('');

    // Comandas Editadas
    const editRows = data.edits.map((edit) => `<tr><td>#${this.escapeHtml(edit.orderNumber)}</td><td>${this.reportDate(edit.createdAt)}</td><td>${this.escapeHtml(edit.editedBy)}</td><td>${this.escapeHtml(edit.editDetails)}</td></tr>`).join('');

    // Historial por Método de Pago (Moneda y Monto)
    const historyByMethod = Array.from(methodTotals.keys()).map((method) => {
      const entries = data.payments.filter((payment) => payment.paymentMethod === method && (payment.amountPaidUSD > 0 || payment.cashTenderedUSD > 0 || payment.cashTenderedCOP > 0 || payment.cashTenderedBs > 0));
      if (entries.length === 0) return '';
      return `
        <h4 style="font-size:10px; font-weight:900; margin:12px 0 4px; padding:3px 6px; background:#f3f4f6;">${this.escapeHtml(this.paymentMethodLabel(method))}</h4>
        <table>
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Comanda</th>
              <th>Pagador</th>
              <th>Moneda</th>
              <th style="text-align:right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((payment) => {
              const amounts = this.registeredPaymentAmounts(payment);
              const formatted = amounts.currency === 'USD'
                ? `$${amounts.usd.toFixed(2)}`
                : amounts.currency === 'COP'
                ? `$${Math.round(amounts.cop).toLocaleString()}`
                : `Bs ${amounts.bs.toFixed(2)}`;
              return `
                <tr>
                  <td>${this.reportDate(payment.createdAt)}</td>
                  <td>#${this.escapeHtml(payment.orderNumber)}</td>
                  <td>${this.escapeHtml(payment.payerName)}</td>
                  <td>${amounts.currency}</td>
                  <td style="text-align:right; font-weight:700;">${formatted}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }).join('');

    const content = `
      <div class="section-title">SECCIÓN 1 — DATOS DEL INTERVALO</div>
      <table>
        <tbody>
          <tr><td><strong>Rango Fecha / Hora:</strong></td><td>${this.intervalTitle(data)}</td></tr>
          <tr><td><strong>Comanda inicial:</strong></td><td>#${this.escapeHtml(firstOrder)}</td></tr>
          <tr><td><strong>Comanda final:</strong></td><td>#${this.escapeHtml(lastOrder)}</td></tr>
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 2 — TOTALES DE INGRESOS POR MONEDA (CONTADO)</div>
      <table>
        <thead>
          <tr>
            <th>Moneda</th>
            <th style="text-align:right;">Monto Recibido</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dólares (USD)</td>
            <td style="text-align:right; font-weight:900; color:#047857;">$${receiptTotals.usd.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Pesos Colombianos (COP)</td>
            <td style="text-align:right; font-weight:700;">$${Math.round(receiptTotals.cop).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>Bolívares (Bs)</td>
            <td style="text-align:right; font-weight:700;">Bs ${receiptTotals.bs.toFixed(2)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td><strong>Total Comandas Atendidas:</strong></td>
            <td style="text-align:right;"><strong>${data.orders.length}</strong></td>
          </tr>
          <tr>
            <td>Comandas al Contado:</td>
            <td style="text-align:right;">${cashOrders.length}</td>
          </tr>
          <tr>
            <td>Comandas a Crédito (Cuentas por Cobrar):</td>
            <td style="text-align:right; font-weight:700; color:#b45309;">${creditOrders.length}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 3 — TOTAL DE VUELTOS Y EGRESOS POR MONEDA Y TIPO DE PAGO</div>
      <table>
        <thead>
          <tr>
            <th>Moneda</th>
            <th style="text-align:right;">Monto Entregado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dólares (USD)</td>
            <td style="text-align:right; font-weight:900; color:#dc2626;">-$${expenseTotals.usd.toFixed(2)} USD</td>
          </tr>
          <tr>
            <td>Pesos Colombianos (COP)</td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">-$${Math.round(expenseTotals.cop).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>Bolívares (Bs)</td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">-Bs ${expenseTotals.bs.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <h4 style="font-size:10px; font-weight:900; margin:10px 0 4px; padding:3px 6px; background:#fef2f2; color:#991b1b; border-left:3px solid #dc2626;">VUELTOS Y EGRESOS POR TIPO DE PAGO:</h4>
      <table>
        <thead>
          <tr>
            <th>Método de Pago</th>
            <th>Moneda</th>
            <th style="text-align:center;">Mov.</th>
            <th style="text-align:right;">Monto Entregado</th>
          </tr>
        </thead>
        <tbody>
          ${expenseMethodRows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">Sin vueltos ni egresos registrados.</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 4 — CAJA CHICA DEL EFECTIVO ESPERADA</div>
      <table>
        <thead>
          <tr>
            <th>Concepto / Desglose de Caja Chica</th>
            <th style="text-align:right;">Efectivo en Dólares (USD)</th>
            <th style="text-align:right;">Efectivo en Pesos (COP)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Fondo Inicial de Apertura:</strong></td>
            <td style="text-align:right; font-weight:700;">$${aperturaUSD.toFixed(2)} USD</td>
            <td style="text-align:right; font-weight:700;">$${Math.round(aperturaCOP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td><strong>2. (+) Ingresos y Cobros en Efectivo:</strong></td>
            <td style="text-align:right; font-weight:700; color:#047857;">+$${totalIngresosEfectivoUSD.toFixed(2)} USD</td>
            <td style="text-align:right; font-weight:700; color:#047857;">+$${Math.round(totalIngresosEfectivoCOP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td><strong>3. (-) Vueltos y Egresos en Efectivo:</strong></td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">-$${totalEgresosEfectivoUSD.toFixed(2)} USD</td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">-$${Math.round(totalEgresosEfectivoCOP).toLocaleString()} COP</td>
          </tr>
          <tr style="background:#f0fdf4; border-top:2px solid #059669;">
            <td><strong>4. (=) EFECTIVO ESPERADO EN CAJA CHICA:</strong></td>
            <td style="text-align:right; font-weight:900; color:#047857; font-size:12px;">$${cajaChicaEsperadaUSD.toFixed(2)} USD</td>
            <td style="text-align:right; font-weight:900; color:#047857; font-size:12px;">$${Math.round(cajaChicaEsperadaCOP).toLocaleString()} COP</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">SECCIÓN 5 — DESGLOSE POR TIPO DE PAGO</div>
      <table>
        <thead>
          <tr>
            <th>Método de Pago</th>
            <th>Moneda</th>
            <th style="text-align:center;">Mov.</th>
            <th style="text-align:right;">Monto Recibido</th>
          </tr>
        </thead>
        <tbody>
          ${methodRows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">Sin cobros registrados.</td></tr>'}
        </tbody>
      </table>

      ${creditOrders.length > 0 ? `
        <div class="section-title">SECCIÓN 6 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR</div>
        <table>
          <thead>
            <tr>
              <th>Comanda</th>
              <th>Fecha / Hora</th>
              <th>Cliente / Deudor</th>
              <th>Ítems</th>
              <th style="text-align:right;">Monto Deuda</th>
            </tr>
          </thead>
          <tbody>
            ${creditRows}
          </tbody>
        </table>
        <div class="total-box" style="background:#fffbeb; border-color:#fde68a;">
          <div class="total-label" style="color:#92400e;">TOTAL CUENTAS A CRÉDITO POR COBRAR:</div>
          <div class="total-val" style="color:#b45309;">$${totalCreditUSD.toFixed(2)} USD</div>
        </div>
      ` : ''}

      <div class="section-title">SECCIÓN ${creditOrders.length > 0 ? '7' : '6'} — ÍTEMS FACTURADOS</div>
      <table>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Ítem</th>
            <th style="text-align:right;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="3" style="text-align:center;">Sin ítems facturados.</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">SECCIÓN ${creditOrders.length > 0 ? '8' : '7'} — COMANDAS EDITADAS</div>
      <table>
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Fecha / Hora</th>
            <th>Usuario</th>
            <th>Detalle del cambio</th>
          </tr>
        </thead>
        <tbody>
          ${editRows || '<tr><td colspan="4" style="text-align:center;">Sin ediciones en el intervalo.</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">SECCIÓN ${creditOrders.length > 0 ? '9' : '8'} — HISTORIAL POR MÉTODO DE PAGO</div>
      ${historyByMethod || '<p style="font-size:10px; color:#6b7280; text-align:center;">Sin pagos en el intervalo.</p>'}
    `;

    this.openPrintWindow('Reporte_Contable_Intervalo', content);
  }

  public generatePreCuentaTicket(order: Order, rates: ExchangeRates) {
    const copRate = order.copRateAtPayment || rates.COP;
    const bsRate = order.bsRateAtPayment || rates.Bs;
    const totalUSD = order.totalUSD || 0;
    const totalCOP = Math.round(totalUSD * copRate);
    const totalBs = (totalUSD * bsRate).toFixed(2);

    const itemsHtml = (order.items || []).map((it) => {
      const subtotal = it.price * it.quantity;
      const details = [];
      if (it.size) details.push(`Tamaño: ${it.size}`);
      if (it.isTakeaway) details.push('PARA LLEVAR');
      if (it.sugarPreference) details.push(`Azúcar: ${it.sugarPreference}`);
      if (it.isHalfHalf && it.halfDetails) {
        details.push(`1ra Mitad: ${it.halfDetails.half1Name}`);
        if (it.halfDetails.half1Removed?.length) details.push(`  Sin: ${it.halfDetails.half1Removed.join(', ')}`);
        if (it.halfDetails.half1Extras?.length) details.push(`  Extra: ${it.halfDetails.half1Extras.map((e) => e.name).join(', ')}`);
        details.push(`2da Mitad: ${it.halfDetails.half2Name}`);
        if (it.halfDetails.half2Removed?.length) details.push(`  Sin: ${it.halfDetails.half2Removed.join(', ')}`);
        if (it.halfDetails.half2Extras?.length) details.push(`  Extra: ${it.halfDetails.half2Extras.map((e) => e.name).join(', ')}`);
      } else {
        if (it.removedIngredients?.length) details.push(`Sin: ${it.removedIngredients.join(', ')}`);
        if (it.extras?.length) details.push(`Extra: ${it.extras.map((e) => e.name).join(', ')}`);
      }
      if (it.notes) details.push(`Nota: ${it.notes}`);

      return `
        <tr>
          <td style="padding: 4px 0; border-bottom: 1px dashed #e5e7eb;">
            <div style="font-weight: 800; font-size: 11px; color: #111827;">${it.quantity}x ${it.productName}</div>
            ${details.length > 0 ? `<div style="font-size: 9px; color: #4b5563; margin-left: 6px;">${details.join('<br>')}</div>` : ''}
          </td>
          <td style="padding: 4px 0; text-align: right; font-weight: 800; font-size: 11px; vertical-align: top; border-bottom: 1px dashed #e5e7eb;">
            $${subtotal.toFixed(2)}
          </td>
        </tr>
      `;
    }).join('');

    const content = `
      <div class="header" style="text-align: center;">
        <div class="logo-title">🍕 BASILICO PIZZERIA</div>
        <div style="font-size: 11px; font-weight: 900; color: #047857; margin-top: 2px;">PRE-CUENTA / TICKET DE CONSUMO</div>
        <div style="font-size: 8px; color: #6b7280; margin-top: 4px;">DOCUMENTO DE CONTROL INTERNO</div>
      </div>

      <div class="meta-card" style="font-size: 10px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; font-weight: 800;">
          <span>COMANDA: #${order.orderNumber}</span>
          <span>${order.type === 'mesa' ? `MESA #${order.tableNumber}` : order.type === 'delivery' ? 'DELIVERY' : 'PARA LLEVAR'}</span>
        </div>
        <div style="margin-top: 3px;"><strong>Cliente:</strong> ${order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}</div>
        <div><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleString('es-VE')}</div>
      </div>

      <div class="section-title">DETALLE DE CONSUMO</div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1.5px solid #111827; font-size: 9px;">
            <th style="text-align: left; padding-bottom: 3px;">DESCRIPCIÓN</th>
            <th style="text-align: right; padding-bottom: 3px;">TOTAL USD</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          ${order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 ? `
            <tr>
              <td style="padding: 4px 0; font-weight: 800; font-size: 11px;">1x Servicio Delivery</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 800; font-size: 11px;">$${Number(order.deliveryFeeUSD).toFixed(2)}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-box" style="margin-top: 10px; padding: 8px; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px;">
        <div style="font-size: 10px; font-weight: 800; color: #166534; margin-bottom: 4px; text-transform: uppercase;">TOTAL A PAGAR:</div>
        <div style="font-size: 18px; font-weight: 900; color: #15803d; text-align: right; line-height: 1;">
          $${totalUSD.toFixed(2)} <span style="font-size: 11px;">USD</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-top: 6px; border-top: 1px dashed #86efac; pt-2;">
          <span style="color: #0369a1;">🇨🇴 COP: $${totalCOP.toLocaleString()}</span>
          <span style="color: #b45309;">🇻🇪 Bs: ${totalBs}</span>
        </div>
      </div>

      <div style="font-size: 8px; color: #6b7280; text-align: center; margin-top: 8px;">
        Tasas de referencia: 1 USD = ${copRate.toLocaleString()} COP | ${bsRate.toFixed(2)} Bs
      </div>

      <div class="footer" style="text-align: center; margin-top: 10px; border-top: 1px dashed #9ca3af; padding-top: 6px; font-size: 9px; font-weight: 800;">
        ¡GRACIAS POR SU PREFERENCIA!<br>
        <span style="font-size: 8px; font-weight: 600; color: #6b7280;">BASILICO PIZZERIA</span>
      </div>
    `;

    this.openPrintWindow(`PreCuenta_Comanda_${order.orderNumber}`, content);
  }
}

export const reportService = new ReportService();

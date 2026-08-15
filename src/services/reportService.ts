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

  // 1. Reporte de Pizzas e Ítems Vendidos por Tipo
  generatePizzasSoldReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
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
        <td style="text-align:right;">$${data.revenueUSD.toFixed(2)} USD</td>
        <td style="text-align:right; color:#059669; font-weight:700;">$${Math.round(data.revenueUSD * rates.COP).toLocaleString()} COP</td>
      </tr>
    `
      )
      .join('');

    const content = `
      <div class="section-title">DESGLOSE DE ÍTEMS Y PIZZAS COBRADAS HOY</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Producto / Especialidad</th>
            <th>Categoría</th>
            <th style="text-align:center;">Unidades Vendidas</th>
            <th style="text-align:right;">Subtotal USD</th>
            <th style="text-align:right;">Subtotal COP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="6" style="text-align:center; color:#9ca3af;">No se registran pizzas o bebidas cobradas en el sistema aún.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box">
        <div>
          <div class="total-label">TOTAL UNIDADES VENDIDAS:</div>
          <div style="font-size: 16px; font-weight: 800;">${totalPizzas} Unidades Entregadas</div>
        </div>
        <div style="text-align:right;">
          <div class="total-label">RECAUDACIÓN TOTAL PRODUCTOS:</div>
          <div class="total-val">$${totalRevenueUSD.toFixed(2)} USD</div>
          <div style="font-size: 12px; font-weight: 700; color: #059669;">($${Math.round(totalRevenueUSD * rates.COP).toLocaleString()} COP)</div>
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Ventas_Pizzas', content);
  }

  // 2. Reporte de Ingresos, Cobros y Métodos de Pago
  generateIncomeReport(orders: Order[], rates: ExchangeRates) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

    const byMethod = {
      'Efectivo USD': paidOrders.filter((o) => o.paymentMethod === 'Efectivo USD').reduce((sum, o) => sum + o.totalUSD, 0),
      COP: paidOrders.filter((o) => o.paymentMethod === 'Efectivo COP').reduce((sum, o) => sum + o.totalUSD, 0),
      Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
    };

    const rows = paidOrders
      .map(
        (o) => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.type.toUpperCase()} ${o.tableNumber ? `#${o.tableNumber}` : ''}</td>
        <td>${o.customerName || 'Cliente General'}</td>
        <td><span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:6px; font-weight:800;">${o.paymentMethod || 'Efectivo USD'}</span></td>
        <td style="text-align:right;"><strong>$${o.totalUSD.toFixed(2)} USD</strong></td>
        <td style="text-align:right; color:#059669;">$${Math.round(o.totalUSD * rates.COP).toLocaleString()} COP</td>
      </tr>
    `
      )
      .join('');

    const content = `
      <div class="section-title">RESUMEN POR MÉTODO DE PAGO</div>
      <table>
        <thead>
          <tr>
            <th>Método de Pago</th>
            <th style="text-align:right;">Total en USD</th>
            <th style="text-align:right;">Equivalente COP (${rates.COP} COP/$)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>💵 Efectivo USD</td>
            <td style="text-align:right;"><strong>$${byMethod['Efectivo USD'].toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod['Efectivo USD'] * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>🇨🇴 Pesos Colombianos (COP)</td>
            <td style="text-align:right;"><strong>$${byMethod.COP.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod.COP * rates.COP).toLocaleString()} COP</td>
          </tr>

          <tr>
            <td>🟡 Binance / Crypto</td>
            <td style="text-align:right;"><strong>$${byMethod.Binance.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod.Binance * rates.COP).toLocaleString()} COP</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">DETALLE DE COMANDAS COBRADAS Y PROCESADAS</div>
      <table>
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Método</th>
            <th style="text-align:right;">Monto USD</th>
            <th style="text-align:right;">Monto COP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="6" style="text-align:center; color:#9ca3af;">No hay cobros registrados.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box">
        <div>
          <div class="total-label">TOTAL COMANDAS PROCESADAS:</div>
          <div style="font-size: 16px; font-weight: 800;">${paidOrders.length} Comandas Cobradas</div>
        </div>
        <div style="text-align:right;">
          <div class="total-label">TOTAL BRUTO RECAUDADO:</div>
          <div class="total-val">$${totalUSD.toFixed(2)} USD</div>
          <div style="font-size: 12px; font-weight: 700; color: #059669;">($${Math.round(totalUSD * rates.COP).toLocaleString()} COP)</div>
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Ingresos_y_Cobros', content);
  }

  // 3. Reporte de Vueltos y Egresos de Caja Chica
  generateExpensesReport(transactions: CajaChicaTransaction[]) {
    const egresos = transactions.filter((t) => t.type === 'egreso');
    const totalEgresosUSD = egresos.reduce((sum, t) => sum + t.amountUSD, 0);

    const rows = egresos
      .map(
        (t) => `
      <tr>
        <td>${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td><strong>${t.description}</strong></td>
        <td>${t.paymentMethod}</td>
        <td style="text-align:right; color:#dc2626; font-weight:800;">-$${t.amountUSD.toFixed(2)} USD</td>
        <td style="text-align:right; color:#9ca3af;">-$${t.amountCOP.toLocaleString()} COP</td>
      </tr>
    `
      )
      .join('');

    const content = `
      <div class="section-title">HISTORIAL DE VUELTOS Y EGRESOS ENTREGADOS EN CAJA CHICA</div>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Motivo / Concepto del Egreso</th>
            <th>Método</th>
            <th style="text-align:right;">Monto USD</th>
            <th style="text-align:right;">Monto COP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No hay egresos o vueltos registrados.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box" style="background:#fef2f2; border-color:#fecaca;">
        <div>
          <div class="total-label" style="color:#991b1b;">TOTAL MOVIMIENTOS DE SALIDA:</div>
          <div style="font-size: 16px; font-weight: 800;">${egresos.length} Registros</div>
        </div>
        <div style="text-align:right;">
          <div class="total-label" style="color:#991b1b;">TOTAL EGRESOS / VUELTOS:</div>
          <div class="total-val" style="color:#dc2626;">-$${totalEgresosUSD.toFixed(2)} USD</div>
        </div>
      </div>
    `;

    this.openPrintWindow('Reporte_Vueltos_y_Egresos', content);
  }

  // 4. Reporte de Tiempo de Preparación en Cocina
  generateKitchenTimesReport(orders: Order[]) {
    const preparedOrders = orders.filter((o) => o.status === 'preparada' || o.status === 'entregada');

    const rows = preparedOrders
      .map((o) => {
        const createdDate = new Date(o.createdAt);
        const elapsedMin = o.elapsedMinutes || Math.round((Date.now() - createdDate.getTime()) / (1000 * 60));
        return `
        <tr>
          <td><strong>${o.orderNumber}</strong></td>
          <td>${o.type.toUpperCase()} ${o.tableNumber ? `#${o.tableNumber}` : ''}</td>
          <td>${o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}</td>
          <td>${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="text-align:center;"><span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-weight:800;">${elapsedMin} min</span></td>
        </tr>
      `;
      })
      .join('');

    const content = `
      <div class="section-title">AUDITORÍA DE TIEMPOS DE SALIDA Y PREPARACIÓN EN COCINA</div>
      <table>
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Tipo</th>
            <th>Contenido de la Orden</th>
            <th>Hora Recibida</th>
            <th style="text-align:center;">Tiempo Transcurrido</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">No hay comandas preparadas en el registro de tiempos.</td></tr>'}
        </tbody>
      </table>
    `;

    this.openPrintWindow('Reporte_Tiempos_Cocina', content);
  }

  // Reporte Contable Consolidado por Intervalo
  generateLegacyReporteContable(data: ReporteIntervaloData) {
    const totalUSD = data.payments.reduce((sum, p) => sum + p.amountPaidUSD, 0);
    const totalCOP = totalUSD * data.exchangeRates.COP;
    const totalBs = totalUSD * data.exchangeRates.Bs;
    const cashOrders = data.orders.filter((o) => o.paymentMethod !== 'Mixto').length;
    const creditOrders = data.orders.length - cashOrders;
    const firstOrder = data.orders.length > 0 ? data.orders[0].orderNumber : 'N/A';
    const lastOrder = data.orders.length > 0 ? data.orders[data.orders.length - 1].orderNumber : 'N/A';

    const fmtDate = (d: string) => {
      try {
        return new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return d; }
    };

    // Sección 1: Cabecera
    const seccion1 = `
      <div class="section-title">SECCIÓN 1 — CIERRE DE CAJA EN EL INTERVALO CONSOLIDADO</div>
      <table>
        <tbody>
          <tr><td><strong>Rango:</strong></td><td colspan="3">Desde ${fmtDate(data.dateRange.from)} → Hasta ${fmtDate(data.dateRange.to)}</td></tr>
          <tr><td><strong>Comanda Inicial:</strong></td><td>#${firstOrder}</td><td><strong>Comanda Final:</strong></td><td>#${lastOrder}</td></tr>
        </tbody>
      </table>
    `;

    // Sección 2: Totales Consolidados
    const seccion2 = `
      <div class="section-title">SECCIÓN 2 — TOTALES CONSOLIDADOS</div>
      <table>
        <thead><tr><th>Moneda</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>
          <tr><td>💵 Dólares (USD)</td><td style="text-align:right; font-weight:900; color:#047857;">$${totalUSD.toFixed(2)}</td></tr>
          <tr><td>🇨🇴 Pesos (COP)</td><td style="text-align:right; font-weight:700;">$${Math.round(totalCOP).toLocaleString()}</td></tr>
          <tr><td>🇻🇪 Bolívares (Bs)</td><td style="text-align:right; font-weight:700;">Bs ${Math.round(totalBs).toLocaleString()}</td></tr>
          <tr style="background:#f9fafb;"><td><strong>Total Comandas:</strong></td><td style="text-align:right;"><strong>${data.orders.length}</strong></td></tr>
          <tr><td>Comandas de Contado:</td><td style="text-align:right;">${cashOrders}</td></tr>
          <tr><td>Comandas a Crédito/Mixto:</td><td style="text-align:right;">${creditOrders}</td></tr>
        </tbody>
      </table>
    `;

    // Sección 3: Desglose por Tipo de Cuenta
    const methodTotals: Record<string, { count: number; totalUSD: number }> = {};
    data.payments.forEach((p) => {
      if (!methodTotals[p.paymentMethod]) methodTotals[p.paymentMethod] = { count: 0, totalUSD: 0 };
      methodTotals[p.paymentMethod].count++;
      methodTotals[p.paymentMethod].totalUSD += p.amountPaidUSD;
    });
    const methodRows = Object.entries(methodTotals)
      .sort((a, b) => b[1].totalUSD - a[1].totalUSD)
      .map(([method, info]) => `
        <tr>
          <td><strong>${method}</strong></td>
          <td style="text-align:center;">${info.count}</td>
          <td style="text-align:right; font-weight:700;">$${info.totalUSD.toFixed(2)}</td>
          <td style="text-align:right; color:#059669;">$${Math.round(info.totalUSD * data.exchangeRates.COP).toLocaleString()}</td>
          <td style="text-align:right;">Bs ${Math.round(info.totalUSD * data.exchangeRates.Bs).toLocaleString()}</td>
        </tr>
      `).join('');

    const seccion3 = `
      <div class="section-title">SECCIÓN 3 — DESGLOSE POR TIPO DE CUENTA Y CAJA</div>
      <table>
        <thead><tr><th>Método de Pago</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Total USD</th><th style="text-align:right;">Total COP</th><th style="text-align:right;">Total Bs</th></tr></thead>
        <tbody>
          ${methodRows || '<tr><td colspan="5" style="text-align:center; color:#9ca3af;">Sin movimientos.</td></tr>'}
        </tbody>
      </table>
    `;

    // Sección 4: Ítems Facturados
    const itemTally: Record<string, { category: string; quantity: number; totalUSD: number }> = {};
    data.items.forEach((it) => {
      if (!itemTally[it.productName]) itemTally[it.productName] = { category: it.category, quantity: 0, totalUSD: 0 };
      itemTally[it.productName].quantity += it.quantity;
      itemTally[it.productName].totalUSD += it.price * it.quantity;
    });
    const itemEntries = Object.entries(itemTally)
      .sort((a, b) => {
        const catCmp = a[1].category.localeCompare(b[1].category);
        return catCmp !== 0 ? catCmp : a[0].localeCompare(b[0]);
      });
    const itemRows = itemEntries.map(([name, info]) => `
      <tr>
        <td><span style="background:#f3f4f6; padding:2px 8px; border-radius:6px; font-weight:700; font-size:10px;">${info.category}</span></td>
        <td><strong>${name}</strong></td>
        <td style="text-align:center;">${info.quantity}</td>
        <td style="text-align:right; font-weight:700;">$${info.totalUSD.toFixed(2)}</td>
      </tr>
    `).join('');

    const seccion4 = `
      <div class="section-title">SECCIÓN 4 — ÍTEMS FACTURADOS</div>
      <table>
        <thead><tr><th>Categoría</th><th>Ítem</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Total USD</th></tr></thead>
        <tbody>
          ${itemRows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">Sin ítems.</td></tr>'}
        </tbody>
      </table>
    `;

    // Sección 5: Comandas Editadas
    const editRowsHtml = data.edits.map((e) => `
      <tr>
        <td><strong>#${e.orderNumber}</strong></td>
        <td>${fmtDate(e.createdAt)}</td>
        <td>${e.editedBy}</td>
        <td>${e.editDetails}</td>
      </tr>
    `).join('');

    const seccion5 = `
      <div class="section-title">SECCIÓN 5 — COMANDAS EDITADAS</div>
      <table>
        <thead><tr><th>Comanda #</th><th>Fecha/Hora Edición</th><th>Usuario</th><th>Detalle del Cambio</th></tr></thead>
        <tbody>
          ${editRowsHtml || '<tr><td colspan="4" style="text-align:center; color:#9ca3af;">Sin ediciones registradas en este intervalo.</td></tr>'}
        </tbody>
      </table>
    `;

    // Sección 6: Historial por Comanda y Método
    const methodGroups: Record<string, Array<{ date: string; orderNumber: string; amount: number }>> = {};
    data.payments.forEach((p) => {
      if (!methodGroups[p.paymentMethod]) methodGroups[p.paymentMethod] = [];
      methodGroups[p.paymentMethod].push({
        date: fmtDate(p.createdAt),
        orderNumber: p.orderNumber,
        amount: p.amountPaidUSD,
      });
    });
    const historyHtml = Object.entries(methodGroups).map(([method, entries]) => `
      <div style="margin-top:10px;">
        <div style="font-weight:900; font-size:11px; color:#374151; margin-bottom:4px; padding:4px 8px; background:#f3f4f6; border-radius:6px;">${method} (${entries.length} movimientos)</div>
        <table>
          <thead><tr><th>Fecha Completa</th><th>Comanda #</th><th style="text-align:right;">Monto USD</th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr>
                <td>${e.date}</td>
                <td><strong>#${e.orderNumber}</strong></td>
                <td style="text-align:right; font-weight:700;">$${e.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    const seccion6 = `
      <div class="section-title">SECCIÓN 6 — HISTORIAL POR COMANDA Y MÉTODO</div>
      ${historyHtml || '<p style="text-align:center; color:#9ca3af; font-size:12px;">Sin pagos registrados en este intervalo.</p>'}
    `;

    const content = seccion1 + seccion2 + seccion3 + seccion4 + seccion5 + seccion6;
    this.openPrintWindow('Reporte_Contable_Intervalo', content);
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
    if (usd === 0 && cop === 0 && bs === 0 && payment.amountPaidUSD > 0) {
      const currency = this.paymentCurrency(payment.paymentMethod);
      if (currency === 'USD') usd = payment.amountPaidUSD;
      if (currency === 'COP') cop = payment.amountPaidUSD * payment.copRate;
      if (currency === 'Bs') bs = payment.amountPaidUSD * payment.bsRate;
    }
    return {
      usd,
      cop,
      bs,
      equivalentUSD: usd + (cop / payment.copRate) + (bs / payment.bsRate),
    };
  }

  private intervalTitle(data: ReporteIntervaloData) {
    return `Desde ${this.reportDate(data.dateRange.from)} hasta ${this.reportDate(data.dateRange.to)}`;
  }

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

  generateIncomeIntervalReport(data: ReporteIntervaloData) {
    const incomes = data.payments.filter((payment) => payment.amountPaidUSD > 0 || payment.cashTenderedUSD > 0 || payment.cashTenderedCOP > 0 || payment.cashTenderedBs > 0);
    const rows = incomes.map((payment) => {
      const amounts = this.registeredPaymentAmounts(payment);
      return `<tr><td>${this.reportDate(payment.createdAt)}</td><td>#${this.escapeHtml(payment.orderNumber)}</td><td>${this.escapeHtml(this.paymentMethodLabel(payment.paymentMethod))}</td><td>${this.escapeHtml(payment.payerName)}</td><td style="text-align:right;">$${amounts.usd.toFixed(2)}</td><td style="text-align:right;">${Math.round(amounts.cop).toLocaleString()}</td><td style="text-align:right;">${amounts.bs.toFixed(2)}</td></tr>`;
    }).join('');
    this.openPrintWindow('Ingresos_y_Cobros_Intervalo', `
      <div class="section-title">INGRESOS Y COBROS POR MÉTODO DE PAGO</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha</th><th>Comanda</th><th>Método</th><th>Pagador</th><th style="text-align:right;">USD</th><th style="text-align:right;">COP</th><th style="text-align:right;">Bs</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center;">Sin cobros en el intervalo.</td></tr>'}</tbody></table>
    `);
  }

  generateExpensesIntervalReport(data: ReporteIntervaloData) {
    const expenses = data.transactions.filter((transaction) => transaction.type === 'egreso');
    const rows = expenses.map((transaction) => `<tr><td>${this.reportDate(transaction.timestamp)}</td><td>${this.escapeHtml(transaction.description)}</td><td>${this.escapeHtml(transaction.paymentMethod)}</td><td style="text-align:right;">$${transaction.amountUSD.toFixed(2)}</td><td style="text-align:right;">${Math.round(transaction.amountCOP).toLocaleString()}</td><td style="text-align:right;">${transaction.amountBs.toFixed(2)}</td></tr>`).join('');
    this.openPrintWindow('Vueltos_y_Egresos_Intervalo', `
      <div class="section-title">VUELTOS Y EGRESOS DE CAJA CHICA</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Fecha</th><th>Descripción</th><th>Método</th><th style="text-align:right;">USD</th><th style="text-align:right;">COP</th><th style="text-align:right;">Bs</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;">Sin egresos en el intervalo.</td></tr>'}</tbody></table>
    `);
  }

  generateKitchenTimesIntervalReport(data: ReporteIntervaloData) {
    const rows = data.orders.map((order) => `<tr><td><strong>#${this.escapeHtml(order.orderNumber)}</strong></td><td>${this.escapeHtml(order.type)}</td><td>${this.reportDate(order.createdAt)}</td><td>${this.escapeHtml(order.status)}</td><td style="text-align:center;">Sin marca de preparación</td></tr>`).join('');
    this.openPrintWindow('Tiempos_Cocina_Intervalo', `
      <div class="section-title">TIEMPOS COCINA Y AUDITORÍA DE PREPARACIÓN</div>
      <p style="font-size:12px; color:#4b5563;">${this.intervalTitle(data)}</p>
      <table><thead><tr><th>Comanda</th><th>Tipo</th><th>Hora recibida</th><th>Estado</th><th style="text-align:center;">Tiempo preparación</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Sin comandas facturadas en el intervalo.</td></tr>'}</tbody></table>
      <p style="font-size:11px; color:#6b7280;">El sistema no persiste aún una hora de preparación; por eso el PDF no inventa tiempos.</p>
    `);
  }

  generateReporteContable(data: ReporteIntervaloData) {
    const methodNames = ['Efectivo USD', 'Binance', 'Zelle', 'Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP', 'Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'];
    const methodTotals = new Map(methodNames.map((method) => [method, { usd: 0, cop: 0, bs: 0, equivalentUSD: 0, count: 0 }]));
    const receiptTotals = { usd: 0, cop: 0, bs: 0 };
    const paymentsByOrder = new Map<string, ReporteIntervaloData['payments']>();
    data.payments.forEach((payment) => {
      if (payment.amountPaidUSD <= 0 && payment.cashTenderedUSD <= 0 && payment.cashTenderedCOP <= 0 && payment.cashTenderedBs <= 0) return;
      const amounts = this.registeredPaymentAmounts(payment);
      receiptTotals.usd += amounts.usd;
      receiptTotals.cop += amounts.cop;
      receiptTotals.bs += amounts.bs;
      const totals = methodTotals.get(payment.paymentMethod) || { usd: 0, cop: 0, bs: 0, equivalentUSD: 0, count: 0 };
      totals.usd += amounts.usd; totals.cop += amounts.cop; totals.bs += amounts.bs; totals.equivalentUSD += amounts.equivalentUSD; totals.count += 1;
      methodTotals.set(payment.paymentMethod, totals);
      paymentsByOrder.set(payment.orderId, [...(paymentsByOrder.get(payment.orderId) || []), payment]);
    });
    const cashOrders = data.orders.filter((order) => (paymentsByOrder.get(order.id) || []).some((payment) => ['Efectivo USD', 'Efectivo COP'].includes(payment.paymentMethod))).length;
    const otherOrders = Math.max(0, data.orders.length - cashOrders);
    const firstOrder = data.orders[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders[data.orders.length - 1]?.orderNumber || 'N/A';
    const methodRows = Array.from(methodTotals.entries()).map(([method, totals]) => `<tr><td>${this.escapeHtml(this.paymentMethodLabel(method))}</td><td style="text-align:center;">${totals.count}</td><td style="text-align:right;">$${totals.usd.toFixed(2)}</td><td style="text-align:right;">${Math.round(totals.cop).toLocaleString()}</td><td style="text-align:right;">${totals.bs.toFixed(2)}</td></tr>`).join('');
    const itemMap: Record<string, { category: string; name: string; quantity: number }> = {};
    data.items.forEach((item) => { const key = `${item.category}|${item.productName}`; if (!itemMap[key]) itemMap[key] = { category: item.category, name: item.productName, quantity: 0 }; itemMap[key].quantity += item.quantity; });
    const itemRows = Object.values(itemMap).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((item) => `<tr><td>${this.escapeHtml(item.category)}</td><td>${this.escapeHtml(item.name)}</td><td style="text-align:right;">${item.quantity}</td></tr>`).join('');
    const editRows = data.edits.map((edit) => `<tr><td>#${this.escapeHtml(edit.orderNumber)}</td><td>${this.reportDate(edit.createdAt)}</td><td>${this.escapeHtml(edit.editedBy)}</td><td>${this.escapeHtml(edit.editDetails)}</td></tr>`).join('');
    const historyByMethod = Array.from(methodTotals.keys()).map((method) => {
      const entries = data.payments.filter((payment) => payment.paymentMethod === method && (payment.amountPaidUSD > 0 || payment.cashTenderedUSD > 0 || payment.cashTenderedCOP > 0 || payment.cashTenderedBs > 0));
      if (entries.length === 0) return '';
      return `<h4 style="font-size:12px; margin:14px 0 4px;">${this.escapeHtml(this.paymentMethodLabel(method))}</h4><table><thead><tr><th>Fecha</th><th>Comanda</th><th style="text-align:right;">USD</th><th style="text-align:right;">COP</th><th style="text-align:right;">Bs</th></tr></thead><tbody>${entries.map((payment) => { const amounts = this.registeredPaymentAmounts(payment); return `<tr><td>${this.reportDate(payment.createdAt)}</td><td>#${this.escapeHtml(payment.orderNumber)}</td><td style="text-align:right;">$${amounts.usd.toFixed(2)}</td><td style="text-align:right;">${Math.round(amounts.cop).toLocaleString()}</td><td style="text-align:right;">${amounts.bs.toFixed(2)}</td></tr>`; }).join('')}</tbody></table>`;
    }).join('');
    this.openPrintWindow('Generar_Reporte_Intervalo', `
      <div class="section-title">SECCIÓN 1</div><h2 style="margin:0 0 12px; font-size:18px;">CIERRE DE CAJA EN EL INTERVALO CONSOLIDADO</h2><table><tbody><tr><td><strong>Rango Fecha/Hora</strong></td><td>${this.intervalTitle(data)}</td></tr><tr><td><strong>Comanda inicial</strong></td><td>#${this.escapeHtml(firstOrder)}</td></tr><tr><td><strong>Comanda final</strong></td><td>#${this.escapeHtml(lastOrder)}</td></tr></tbody></table>
      <div class="section-title">SECCIÓN 2 — TOTALES CONSOLIDADOS</div><table><thead><tr><th>Concepto</th><th style="text-align:right;">USD</th><th style="text-align:right;">COP</th><th style="text-align:right;">Bs</th></tr></thead><tbody><tr><td>Total recibido</td><td style="text-align:right;">$${receiptTotals.usd.toFixed(2)}</td><td style="text-align:right;">${Math.round(receiptTotals.cop).toLocaleString()}</td><td style="text-align:right;">${receiptTotals.bs.toFixed(2)}</td></tr><tr><td>Comandas al contado</td><td colspan="3" style="text-align:right;">${cashOrders}</td></tr><tr><td>Comandas a crédito / otros métodos</td><td colspan="3" style="text-align:right;">${otherOrders}</td></tr></tbody></table>
      <div class="section-title">SECCIÓN 3 — DESGLOSE POR TIPO DE CUENTA Y CAJA</div><table><thead><tr><th>Método / cuenta</th><th style="text-align:center;">Movimientos</th><th style="text-align:right;">USD</th><th style="text-align:right;">COP</th><th style="text-align:right;">Bs</th></tr></thead><tbody>${methodRows}</tbody></table>
      <div class="section-title">SECCIÓN 4 — ÍTEMS FACTURADOS</div><table><thead><tr><th>Categoría</th><th>Ítem</th><th style="text-align:right;">Cantidad vendida</th></tr></thead><tbody>${itemRows || '<tr><td colspan="3" style="text-align:center;">Sin ítems facturados.</td></tr>'}</tbody></table>
      <div class="section-title">SECCIÓN 5 — COMANDAS EDITADAS</div><table><thead><tr><th>Comanda</th><th>Fecha/Hora de edición</th><th>Usuario</th><th>Detalle del cambio</th></tr></thead><tbody>${editRows || '<tr><td colspan="4" style="text-align:center;">Sin ediciones en el intervalo.</td></tr>'}</tbody></table>
      <div class="section-title">SECCIÓN 6 — HISTORIAL POR MÉTODO DE PAGO</div>${historyByMethod || '<p style="font-size:12px; color:#6b7280;">Sin pagos en el intervalo.</p>'}
    `);
  }
}

export const reportService = new ReportService();

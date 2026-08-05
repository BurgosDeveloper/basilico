// Report Service - Generador de Reportes Auditables en PDF e Impresión Profesional para Basilico Pizzeria

import { Order, CajaChicaTransaction, CajaChicaCierre, ExchangeRates } from '../data/mockData';

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
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            margin: 0;
            padding: 30px;
            color: #111827;
            background: #ffffff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #10b981;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }
          .logo-title {
            font-size: 26px;
            font-weight: 900;
            color: #070707;
            letter-spacing: -0.5px;
          }
          .logo-sub {
            font-size: 12px;
            color: #10b981;
            font-weight: 800;
            text-transform: uppercase;
          }
          .doc-meta {
            text-align: right;
            font-size: 11px;
            color: #6b7280;
          }
          .section-title {
            font-size: 14px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #111827;
            margin-top: 20px;
            margin-bottom: 10px;
            padding-left: 8px;
            border-left: 4px solid #10b981;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 12px;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 10px;
            padding: 10px 12px;
            text-align: left;
            border-bottom: 2px solid #e5e7eb;
          }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #f3f4f6;
            color: #1f2937;
          }
          .total-box {
            background-color: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 12px;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
          }
          .total-label {
            font-size: 12px;
            font-weight: 800;
            color: #065f46;
            text-transform: uppercase;
          }
          .total-val {
            font-size: 22px;
            font-weight: 900;
            color: #047857;
          }
          .no-print {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 12px;
            font-weight: 900;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
          }
          @media print {
            .no-print { display: none; }
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
      Divisas: paidOrders.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0),
      COP: paidOrders.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0),
      Bs: paidOrders.filter((o) => o.paymentMethod === 'Bs').reduce((sum, o) => sum + o.totalUSD, 0),
      Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
    };

    const rows = paidOrders
      .map(
        (o) => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.type.toUpperCase()} ${o.tableNumber ? `#${o.tableNumber}` : ''}</td>
        <td>${o.customerName || 'Cliente General'}</td>
        <td><span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:6px; font-weight:800;">${o.paymentMethod || 'Divisas'}</span></td>
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
            <td>💵 Divisas (Efectivo USD)</td>
            <td style="text-align:right;"><strong>$${byMethod.Divisas.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod.Divisas * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>🇨🇴 Pesos Colombianos (COP)</td>
            <td style="text-align:right;"><strong>$${byMethod.COP.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod.COP * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>🇻🇪 Bolívares (Bs)</td>
            <td style="text-align:right;"><strong>$${byMethod.Bs.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">$${Math.round(byMethod.Bs * rates.COP).toLocaleString()} COP</td>
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

  // 5. Reporte Z de Auditoría General de Cierre
  generateAuditReportZ(orders: Order[], aperturaUSD: number, transactions: CajaChicaTransaction[], rates: ExchangeRates, ultimoCierre: CajaChicaCierre | null) {
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    const totalSalesUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

    const totalIngresos = transactions.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + t.amountUSD, 0);
    const totalEgresos = transactions.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + t.amountUSD, 0);

    const expectedCashUSD = aperturaUSD + totalIngresos - totalEgresos;

    const content = `
      <div class="section-title">REPORTE Z DE AUDITORÍA GENERAL Y ARQUEO DE CAJA CHICA</div>
      <table>
        <thead>
          <tr>
            <th>Concepto de Auditoría</th>
            <th style="text-align:right;">Monto USD</th>
            <th style="text-align:right;">Monto COP</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Apertura Inicial de Caja Chica</td>
            <td style="text-align:right;"><strong>$${aperturaUSD.toFixed(2)} USD</strong></td>
            <td style="text-align:right;">$${Math.round(aperturaUSD * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>Ventas Brutas Cobradas Hoy (${paidOrders.length} Comandas)</td>
            <td style="text-align:right; color:#059669;"><strong>+$${totalSalesUSD.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#059669;">+$${Math.round(totalSalesUSD * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr>
            <td>Egresos / Vueltos Entregados</td>
            <td style="text-align:right; color:#dc2626;"><strong>-$${totalEgresos.toFixed(2)} USD</strong></td>
            <td style="text-align:right; color:#dc2626;">-$${Math.round(totalEgresos * rates.COP).toLocaleString()} COP</td>
          </tr>
          <tr style="background:#f9fafb; font-weight:800;">
            <td>SALDO TEÓRICO EN CAJA (ESPERADO)</td>
            <td style="text-align:right; color:#1d4ed8; font-size:14px;">$${expectedCashUSD.toFixed(2)} USD</td>
            <td style="text-align:right; color:#1d4ed8; font-size:14px;">$${Math.round(expectedCashUSD * rates.COP).toLocaleString()} COP</td>
          </tr>
        </tbody>
      </table>

      ${
        ultimoCierre
          ? `
        <div class="section-title">RESULTADO DEL ÚLTIMO ARQUEO FÍSICO REGISTRADO</div>
        <table>
          <thead>
            <tr>
              <th>Cajero a Cargo</th>
              <th style="text-align:right;">Conteo Real USD</th>
              <th style="text-align:right;">Cuadre / Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${ultimoCierre.closedBy || 'Caja'}</strong></td>
              <td style="text-align:right;"><strong>$${parseFloat(ultimoCierre.actualUSD as any || 0).toFixed(2)} USD</strong></td>
              <td style="text-align:right; font-weight:900; color:${parseFloat(ultimoCierre.differenceUSD as any || 0) >= 0 ? '#059669' : '#dc2626'};">
                $${parseFloat(ultimoCierre.differenceUSD as any || 0).toFixed(2)} USD
              </td>
            </tr>
          </tbody>
        </table>
      `
          : ''
      }
    `;

    this.openPrintWindow('Reporte_Z_Auditoria_General', content);
  }
}

export const reportService = new ReportService();

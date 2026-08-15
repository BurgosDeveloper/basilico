import React, { useState } from 'react';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { OrderEditModal } from '../components/OrderEditModal';
import { PaymentLedgerModal } from '../components/PaymentLedgerModal';
import { SplitPaymentSelectionModal } from '../components/SplitPaymentSelectionModal';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PaymentMethod, Order } from '../data/mockData';
import { reportService } from '../services/reportService';
import { exportToExcel, ReporteIntervaloData } from '../services/excelExportService';
import {
  IoCard,
  IoCashOutline,
  IoCheckmarkDone,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoPrint,
  IoBarChartOutline,
  IoLockClosedOutline,
  IoDocumentTextOutline,
  IoPizza,
  IoTrendingUp,
  IoPersonOutline,
} from 'react-icons/io5';

const HISTORIC_PAYMENT_METHODS: PaymentMethod[] = [
  'Efectivo USD', 'Zelle', 'Binance', 'Efectivo COP', 'Bancolombia', 'Nequi',
  'Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito', 'Mixto',
];
const PHYSICAL_CASH_METHODS = new Set(['Efectivo USD', 'Efectivo COP']);

function paymentMovementLabels(payment: Order['paymentHistory'][number]) {
  const labels: string[] = [];
  if ((payment.cashTenderedUSD || 0) > 0) labels.push(`Entregó: $${payment.cashTenderedUSD!.toFixed(2)} USD`);
  if ((payment.cashTenderedCOP || 0) > 0) labels.push(`Entregó: ${payment.cashTenderedCOP!.toLocaleString()} COP`);
  if ((payment.cashTenderedBs || 0) > 0) labels.push(`Entregó: ${payment.cashTenderedBs!.toLocaleString()} Bs`);
  if ((payment.changeGivenUSD || 0) > 0) labels.push(`Vuelto: $${payment.changeGivenUSD!.toFixed(2)} USD`);
  if ((payment.changeGivenCOP || 0) > 0) labels.push(`Vuelto: ${payment.changeGivenCOP!.toLocaleString()} COP`);
  if ((payment.changeGivenBs || 0) > 0) labels.push(`Vuelto: ${payment.changeGivenBs!.toLocaleString()} Bs`);
  return labels;
}

export const CajaPage: React.FC = () => {
  const {
    orders,
    exchangeRates,
    cajaChicaApertura,
    cajaChicaTransactions,
    ultimoCierre,
    updateOrderStatus,
    aperturarCajaChica,
    addCajaTransaction,
    realizarCierreCaja,
    fetchReporteIntervalo,
    printReporteIntervalo,
    userSession,
    editOrder,
    deletePaymentEntry,
    reopenOrder,
    products,
    ingredients,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'comandas';

  const filteredCajaTransactions = cajaChicaTransactions.filter(t => !t.shift || t.shift === 'ambos' || t.shift === userSession?.shift);
  const filteredApertura = cajaChicaApertura.shift && cajaChicaApertura.shift !== 'ambos' && cajaChicaApertura.shift !== userSession?.shift ? { usdCash: 0, copCash: 0 } : cajaChicaApertura;
  const filteredUltimoCierre = ultimoCierre && (!ultimoCierre.shift || ultimoCierre.shift === 'ambos' || ultimoCierre.shift === userSession?.shift) ? ultimoCierre : null;

  const [activeOrderForPay, setActiveOrderForPay] = useState<Order | null>(null);
  const [orderEditModalOrder, setOrderEditModalOrder] = useState<Order | null>(null);
  const [orderDetailModalOrder, setOrderDetailModalOrder] = useState<Order | null>(null);

  // Multi-Order Table Payment & Merge state
  const [selectedOrderIdsForMultiPay, setSelectedOrderIdsForMultiPay] = useState<string[]>([]);

  // Pago dividido por ítems y persona.
  const [splitPaymentSelectionOrder, setSplitPaymentSelectionOrder] = useState<Order | null>(null);
  const [splitPaymentScope, setSplitPaymentScope] = useState<{ payerName: string; itemIds: string[] } | null>(null);
  const [isEditingSplitPayment, setIsEditingSplitPayment] = useState(false);

  // Apertura de Caja Chica Modal
  const [isAperturaModalOpen, setIsAperturaModalOpen] = useState<boolean>(false);
  const [initUSD, setInitUSD] = useState<string>(cajaChicaApertura.usdCash.toString());
  const [initCOP, setInitCOP] = useState<string>(cajaChicaApertura.copCash.toString());

  // Cierre de Caja Chica Modal
  const [isCierreModalOpen, setIsCierreModalOpen] = useState<boolean>(false);
  const [cierreActualUSD, setCierreActualUSD] = useState<string>('');
  const [cierreActualCOP, setCierreActualCOP] = useState<string>('');
  const [cierreNotes, setCierreNotes] = useState<string>('');
  const [cierreResult, setCierreResult] = useState<any>(null);
  const [cierreError, setCierreError] = useState<string>('');
  const [isSubmittingCierre, setIsSubmittingCierre] = useState<boolean>(false);

  // Transaccion Manual Egreso / Ingreso
  const [isManualTxOpen, setIsManualTxOpen] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'ingreso' | 'egreso'>('egreso');
  const [manualAmountUSD, setManualAmountUSD] = useState<string>('');
  const [manualCurrency, setManualCurrency] = useState<'USD' | 'COP' | 'Bs'>('USD');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<PaymentMethod>('Efectivo USD');
  const [manualDesc, setManualDesc] = useState<string>('');

  // Reporte por Intervalo State
  const [intervaloFrom, setIntervaloFrom] = useState<string>('');
  const [intervaloTo, setIntervaloTo] = useState<string>('');
  const [reporteIntervaloData, setReporteIntervaloData] = useState<ReporteIntervaloData | null>(null);
  const [isLoadingReporte, setIsLoadingReporte] = useState<boolean>(false);
  const [reporteError, setReporteError] = useState<string>('');

  // Comandas activas no finalizadas/pagadas totalmente (excluye canceladas y fusionadas)
  const activeComandas = orders.filter(
    (o) => o.status !== 'cancelado' && o.status !== 'fusionada' && !(o.status === 'entregada' && o.paymentStatus === 'pagado') && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)
  );
  const paidOrdersToday = orders.filter((o) => o.paymentStatus === 'pagado' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift));

  // Historico Filters
  const [historicoSearch, setHistoricoSearch] = useState<string>('');
  const [historicoMethodFilter, setHistoricoMethodFilter] = useState<'todos' | PaymentMethod>('todos');
  const [historicDetailOrder, setHistoricDetailOrder] = useState<Order | null>(null);

  const { mergeOrders } = useApp();

  const handleOpenPayModal = (order: Order) => {
    setSplitPaymentScope(null);
    setActiveOrderForPay(order);
  };

  const handleToggleOrderForMultiPay = (id: string) => {
    setSelectedOrderIdsForMultiPay((prev) =>
      prev.includes(id) ? prev.filter((oId) => oId !== id) : [...prev, id]
    );
  };

  const handleOpenSplitItemsModal = (order: Order) => {
    setSplitPaymentScope(null);
    setIsEditingSplitPayment(false);
    setSplitPaymentSelectionOrder(order);
  };

  const handleConfirmSplitPaymentSelection = (payerName: string, itemIds: string[]) => {
    if (!splitPaymentSelectionOrder || itemIds.length === 0 || !payerName) return;
    setSplitPaymentScope({ payerName, itemIds });
    setIsEditingSplitPayment(false);
    setSplitPaymentSelectionOrder(null);
    setActiveOrderForPay(splitPaymentSelectionOrder);
  };

  const handleCancelSplitPaymentSelection = () => {
    const orderToResume = splitPaymentSelectionOrder;
    setSplitPaymentSelectionOrder(null);
    if (isEditingSplitPayment && splitPaymentScope && orderToResume) {
      setActiveOrderForPay(orderToResume);
    } else {
      setSplitPaymentScope(null);
    }
    setIsEditingSplitPayment(false);
  };

  const handleEditSplitPaymentSelection = (order: Order) => {
    setActiveOrderForPay(null);
    setIsEditingSplitPayment(true);
    setSplitPaymentSelectionOrder(order);
  };

  const handleClosePaymentLedger = () => {
    setActiveOrderForPay(null);
    setSplitPaymentScope(null);
  };

  const handleConfirmMergeOrders = async () => {
    if (selectedOrderIdsForMultiPay.length < 2) return;
    const targetId = selectedOrderIdsForMultiPay[0];
    const sourceIds = selectedOrderIdsForMultiPay.slice(1);

    await mergeOrders(targetId, sourceIds);
    setSelectedOrderIdsForMultiPay([]);
  };

  const handleAperturaSubmit = async () => {
    await aperturarCajaChica(parseFloat(initUSD) || 0, parseFloat(initCOP) || 0);
    setIsAperturaModalOpen(false);
  };

  const handleCierreSubmit = async () => {
    if (isSubmittingCierre) return;
    const actualUSD = Number(cierreActualUSD);
    const actualCOP = Number(cierreActualCOP);
    if (!cierreActualUSD.trim() || !cierreActualCOP.trim() || !Number.isFinite(actualUSD) || !Number.isFinite(actualCOP) || actualUSD < 0 || actualCOP < 0) {
      setCierreError('Registra el conteo físico válido de USD y COP. Usa 0 si no hay efectivo en una moneda.');
      return;
    }
    setIsSubmittingCierre(true);
    setCierreError('');
    try {
      const res = await realizarCierreCaja(actualUSD, actualCOP, cierreNotes || 'Comprobación diaria de efectivo');
      if (res) setCierreResult(res.summary);
    } catch (error) {
      setCierreError(error instanceof Error ? error.message : 'No se pudo registrar la comprobación de caja.');
    } finally {
      setIsSubmittingCierre(false);
    }
  };

  const handleManualTxSubmit = async () => {
    const amount = parseFloat(manualAmountUSD);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await addCajaTransaction({
      type: manualType,
      amountUSD: manualCurrency === 'USD' ? amount : 0,
      amountCOP: manualCurrency === 'COP' ? amount : 0,
      amountBs: manualCurrency === 'Bs' ? amount : 0,
      paymentMethod: manualPaymentMethod,
      description: manualDesc || (manualType === 'egreso' ? 'Vuelto / Cambio entregado' : 'Ingreso manual'),
    });
    setManualAmountUSD('');
    setManualCurrency('USD');
    setManualPaymentMethod('Efectivo USD');
    setManualDesc('');
    setIsManualTxOpen(false);
  };

  const handlePrintIntervalReport = async (
    reportType: 'contable' | 'pizzas' | 'ingresos' | 'egresos' | 'cocina',
    openBrowserReport: () => void
  ) => {
    if (!reporteIntervaloData) return;
    try {
      setReporteError('');
      openBrowserReport();
      await printReporteIntervalo(reportType, reporteIntervaloData);
    } catch (error) {
      setReporteError(error instanceof Error ? error.message : 'No se pudo abrir o imprimir el reporte.');
    }
  };

  // Totales de Caja Chica
  const physicalCashTransactions = filteredCajaTransactions.filter((transaction) => PHYSICAL_CASH_METHODS.has(transaction.paymentMethod));

  const totalIngresosUSD = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountUSD, 0);

  const totalIngresosCOP = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountCOP, 0);

  const totalIngresosBs = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountBs, 0);

  const saldoEfectivoUSD = filteredApertura.usdCash + physicalCashTransactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + transaction.amountUSD, 0) - physicalCashTransactions
    .filter((transaction) => transaction.type === 'egreso')
    .reduce((sum, transaction) => sum + transaction.amountUSD, 0);

  const saldoEfectivoCOP = filteredApertura.copCash + physicalCashTransactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + transaction.amountCOP, 0) - physicalCashTransactions
    .filter((transaction) => transaction.type === 'egreso')
    .reduce((sum, transaction) => sum + transaction.amountCOP, 0);

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-white">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/80 border border-emerald-500/30 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0B2A1A] border border-emerald-500/40 flex items-center justify-center shadow-lg">
            <IoCard className="text-3xl text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Caja</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase">
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-[#D8E6DF]/70 mt-1">
              Cobro de comandas, caja chica, arqueo de cierre y reportes de ventas.
            </p>
          </div>
        </div>

        {/* Sub-Tab Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSearchParams({ tab: 'comandas' })}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'comandas' || activeSubTab === 'default'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            <IoCard />
            <span>COMANDAS ({activeComandas.length})</span>
          </button>

          <button
            onClick={() => setSearchParams({ tab: 'cajachica' })}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'cajachica'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            <IoCashOutline />
            <span>CAJA CHICA</span>
          </button>

          <button
            onClick={() => setSearchParams({ tab: 'historico' })}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'historico'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            <IoTimeOutline />
            <span>HISTÓRICO ({paidOrdersToday.length})</span>
          </button>

          <button
            onClick={() => setSearchParams({ tab: 'reportes' })}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'reportes'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'bg-white/[0.04] text-gray-300 hover:text-white'
            }`}
          >
            <IoBarChartOutline />
            <span>REPORTES & CIERRE</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: COMANDAS CON ESTADOS DUALES Y DETALLE ULTRA-COMPLETO */}
      {(activeSubTab === 'comandas' || activeSubTab === 'default') && (
        <div className="space-y-6">
          {/* Order merge action bar */}
          {selectedOrderIdsForMultiPay.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-3">
                <IoCard className="text-2xl shrink-0" />
                <div>
                  <div className="font-black text-sm">
                    {selectedOrderIdsForMultiPay.length} COMANDAS SELECCIONADAS PARA UNIFICAR
                  </div>
                  <div className="text-xs font-bold">
                    La primera comanda seleccionada será la comanda máster.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedOrderIdsForMultiPay([])}
                  className="px-3 py-1.5 rounded-xl bg-black/20 text-black font-bold text-xs hover:bg-black/30"
                >
                  DESMARCAR
                </button>
                {selectedOrderIdsForMultiPay.length >= 2 && (
                  <button
                    onClick={handleConfirmMergeOrders}
                    className="px-4 py-2.5 rounded-xl bg-purple-900 text-purple-200 font-black text-xs hover:bg-purple-800 shadow-xl border border-purple-500/40"
                  >
                    🔗 UNIFICAR EN 1 COMANDA MÁSTER
                  </button>
                )}
              </div>

            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <IoCard className="text-emerald-400 text-xl" />
              <span>COMANDAS ACTIVAS EN SISTEMA</span>
            </h2>
            <span className="text-xs text-gray-400">Total: {activeComandas.length} Comandas</span>
          </div>

          {activeComandas.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-white/[0.02] border border-white/10 space-y-3">
              <IoCheckmarkDone className="text-5xl text-emerald-400 mx-auto" />
              <p className="text-sm text-gray-400 font-bold">No hay comandas pendientes por cobrar en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activeComandas.map((ord) => {
                const isPrepared = ord.status === 'preparada' || ord.status === 'entregada';
                const isPaid = ord.paymentStatus === 'pagado';
                const isDelivered = ord.status === 'entregada';
                const isSelectedForMultiPay = selectedOrderIdsForMultiPay.includes(ord.id);

                return (
                  <div
                    key={ord.id}
                    className={`p-6 rounded-3xl border backdrop-blur-xl shadow-2xl space-y-5 transition-all ${
                      isSelectedForMultiPay
                        ? 'bg-gradient-to-br from-amber-950/90 via-[#070707] to-amber-950/40 border-amber-400 ring-2 ring-amber-400/50'
                        : isDelivered
                        ? 'bg-gradient-to-br from-[#0B2A1A]/60 via-[#070707] to-[#0B2A1A]/30 border-emerald-500/30'
                        : isPrepared
                        ? 'bg-gradient-to-br from-emerald-950/90 to-[#070707] border-emerald-400 shadow-emerald-950/80'
                        : 'bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] border-white/15'
                    }`}
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        {!isPaid && (
                          <input
                            type="checkbox"
                            checked={isSelectedForMultiPay}
                            onChange={() => handleToggleOrderForMultiPay(ord.id)}
                            className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                            title="Seleccionar para unificar comandas"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-white">{ord.orderNumber}</span>
                            <span className="text-xs px-2.5 py-0.5 rounded-md bg-white/10 font-extrabold uppercase text-gray-300">
                              {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>


                      {/* Dual Status Badges */}
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            isPrepared
                              ? 'bg-emerald-100 text-emerald-950 border-emerald-300 shadow-lg'
                              : 'bg-amber-100 text-amber-950 border-amber-300 animate-pulse'
                          }`}
                        >
                          {isPrepared ? <IoCheckmarkCircle /> : <IoTimeOutline />}
                          <span>{isDelivered ? '📦 ENTREGADA' : isPrepared ? '🔥 PREPARADA (LISTA)' : '⏳ EN COCINA'}</span>
                        </span>

                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            isPaid
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border-red-500/40'
                          }`}
                        >
                          {isPaid ? <IoCard /> : <IoCloseCircle />}
                          <span>{isPaid ? `💳 PAGADO (${ord.paymentMethod})` : '❌ PENDIENTE PAGO'}</span>
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-emerald-300 font-bold break-words flex items-center gap-1.5">
                      <IoPersonOutline />
                      <span>👤 Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                    </p>

                    {ord.kitchenNotes && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-medium break-words flex items-start gap-1.5">
                        <IoDocumentTextOutline className="mt-0.5 shrink-0" />
                        <div>📝 <span className="font-bold">Nota Cocina:</span> {ord.kitchenNotes}</div>
                      </div>
                    )}

                    {/* Order Items Breakdown with Individual Paid Flags */}
                    <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                      {(ord.items || []).map((it) => (
                        <div key={it.id} className="space-y-1 text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start font-bold text-white gap-2">
                            <span className="break-words flex-1 flex items-center gap-1">
                              • {it.quantity}x {it.productName}
                              {it.isTakeaway && <span className="text-amber-400 font-bold ml-1.5">(📦 PARA LLEVAR)</span>}
                              {it.isPaidIndividually && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-black uppercase">
                                  ✓ PAGADO POR {it.paidByName || 'PERSONA'}
                                </span>
                              )}
                            </span>
                            <span className="text-emerald-400 font-extrabold shrink-0">
                              ${(it.price * it.quantity).toFixed(2)}
                            </span>
                          </div>

                          {it.sugarPreference && (
                            <p className="text-[11px] text-cyan-300 font-medium ml-3">
                              🥤 Preferencia: {it.sugarPreference}
                            </p>
                          )}

                          {it.isHalfHalf && it.halfDetails && (
                            <div className="ml-3 my-1.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5 font-bold">
                              <div className="text-amber-300 text-[11px] uppercase tracking-wider font-black flex items-center gap-1">
                                <span>🌓 DESGLOSE MITAD Y MITAD ({it.size || 'Grande'}):</span>
                              </div>
                              <div className="text-white bg-black/40 p-2 rounded-lg border border-white/10 space-y-1">
                                <div className="text-amber-400 font-black">
                                  • 1ra Mitad: <span className="text-white">{it.halfDetails.half1Name}</span>
                                </div>
                                {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 && (
                                  <div className="text-red-400 text-[11px] font-extrabold ml-2">
                                    🚫 SIN: {it.halfDetails.half1Removed.join(', ')}
                                  </div>
                                )}
                                {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 && (
                                  <div className="text-purple-300 text-[11px] font-extrabold ml-2 space-y-0.5">
                                    {it.halfDetails.half1Extras.map((e, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span>➕ EXTRAS 1RA MITAD: {e.name}</span>
                                        {e.price > 0 && <span className="text-emerald-400">+${e.price.toFixed(2)}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="text-white bg-black/40 p-2 rounded-lg border border-white/10 space-y-1">
                                <div className="text-amber-400 font-black">
                                  • 2da Mitad: <span className="text-white">{it.halfDetails.half2Name}</span>
                                </div>
                                {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 && (
                                  <div className="text-red-400 text-[11px] font-extrabold ml-2">
                                    🚫 SIN: {it.halfDetails.half2Removed.join(', ')}
                                  </div>
                                )}
                                {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 && (
                                  <div className="text-purple-300 text-[11px] font-extrabold ml-2 space-y-0.5">
                                    {it.halfDetails.half2Extras.map((e, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span>➕ EXTRAS 2DA MITAD: {e.name}</span>
                                        {e.price > 0 && <span className="text-emerald-400">+${e.price.toFixed(2)}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                            <p className="text-[11px] text-red-400 font-semibold ml-3 break-words flex items-center gap-1">
                              <IoCloseCircle /> 🚫 SIN: {it.removedIngredients.join(', ')}
                            </p>
                          )}

                          {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                            <div className="ml-3 text-[11px] text-emerald-400 font-medium space-y-0.5">
                              {(it.extras || []).map((ex, exIdx) => (
                                <div key={exIdx} className="flex justify-between">
                                  <span className="break-words">➕ EXTRA: {ex.name}</span>
                                  {ex.price > 0 && <span>+${ex.price.toFixed(2)}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Pricing breakdown & Partial Payment Progress */}
                    {(() => {
                      const paid = ord.paidAmountUSD || 0;
                      const remaining = Math.max(0, ord.totalUSD - paid);
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl border border-white/5 text-xs">
                            <div>
                              <div className="text-gray-400">
                                Total COP: <strong className="text-white">${Math.round(ord.totalUSD * exchangeRates.COP).toLocaleString()}</strong>
                              </div>
                              {paid > 0 && (
                                <div className="text-emerald-400 text-[10px] font-bold">
                                  Abonado: ${paid.toFixed(2)} USD | Pendiente: ${remaining.toFixed(2)} USD
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-base font-black text-emerald-400 block">${ord.totalUSD.toFixed(2)} USD</span>
                              {remaining > 0 && paid > 0 && (
                                <span className="text-xs font-black text-amber-300">Por Cobrar: ${remaining.toFixed(2)} USD</span>
                              )}
                            </div>
                          </div>

                          {/* Audit Panel: Payment History & Change Breakdown */}
                          {ord.paymentHistory && ord.paymentHistory.length > 0 && (
                            <div className="p-3 rounded-2xl bg-black/60 border border-emerald-500/30 space-y-1.5 text-[11px]">
                              <div className="font-black text-emerald-400 uppercase tracking-wider text-[10px]">
                                📜 HISTORIAL AUDITABLE DE COBROS Y VUELTOS:
                              </div>
                              {ord.paymentHistory.map((pm, pmIdx) => (
                                <div key={pmIdx} className="flex flex-col border-b border-white/5 pb-1 last:border-0">
                                  <div className="flex justify-between font-bold text-white">
                                    <span>👤 {pm.payerName}: ${pm.amountPaidUSD.toFixed(2)} USD ({pm.paymentMethod})</span>
                                    <span className="text-gray-400 font-mono text-[9px]">{new Date(pm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  {paymentMovementLabels(pm).length > 0 && (
                                    <div className="text-gray-400 text-[10px] pl-2 font-medium">
                                      {paymentMovementLabels(pm).join(' | ')}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                      {!isPrepared ? (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'preparada')}
                          className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all"
                        >
                          <IoCheckmarkCircle className="text-base" />
                          <span>🔥 MARCAR LISTA</span>
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-[11px] font-black text-center flex items-center justify-center gap-1">
                          <IoCheckmarkCircle className="text-sm" />
                          <span>🔥 LISTA</span>
                        </div>
                      )}

                      {!isPaid ? (
                        <>
                          {(() => {
                            const hasIndividualPayments = ord.paymentHistory?.some((payment) => (payment.itemIds?.length || 0) > 0);
                            return hasIndividualPayments ? (
                              <div className="w-full rounded-2xl border border-blue-400/40 bg-blue-500/15 px-3 py-3 text-center text-xs font-black text-blue-200" title="Los pagos restantes deben registrarse por persona">
                                👥 COBRO POR PERSONAS ACTIVO
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenPayModal(ord)}
                                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all"
                              >
                                <IoCashOutline className="text-base" />
                                <span>💳 COBRAR (${(ord.totalUSD - (ord.paidAmountUSD || 0)).toFixed(2)})</span>
                              </button>
                            );
                          })()}

                          <button
                            onClick={() => handleOpenSplitItemsModal(ord)}
                            className="w-full py-3 rounded-2xl bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-black border border-blue-400 font-black text-xs flex items-center justify-center gap-1 transition-all"
                          >
                            <span>👥 PAGAR POR PERSONAS</span>
                          </button>
                        </>
                      ) : (
                        <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-black text-center flex items-center justify-center gap-1 sm:col-span-2">
                          <IoCheckmarkCircle className="text-sm" />
                          <span>💳 PAGADO TOTALMENTE</span>
                        </div>
                      )}

                      {userSession?.role === 'admin' && (
                        <button
                          onClick={() => setOrderEditModalOrder(ord)}
                          className="w-full py-3 rounded-2xl bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-black border border-blue-400 font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          <span>✏️ EDITAR COMANDA</span>
                        </button>
                      )}

                      {!isDelivered ? (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'entregada')}
                          className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-all"
                        >
                          <IoCheckmarkDone className="text-base text-emerald-400" />
                          <span>📦 ENTREGAR</span>
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-2xl bg-white/5 text-gray-400 text-[11px] font-bold text-center">
                          📦 ENTREGADA
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB HISTÓRICO DE COBROS DEL DÍA */}
      {activeSubTab === 'historico' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B2A1A]/40 border border-emerald-500/20">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <IoTimeOutline className="text-emerald-400 text-2xl" />
              <span>HISTÓRICO DE COBROS Y ENTREGAS DEL DÍA</span>
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="🔍 Buscar comanda o cliente..."
                value={historicoSearch}
                onChange={(e) => setHistoricoSearch(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-bold w-full sm:w-64 focus:border-emerald-400 outline-none"
              />

              <select
                value={historicoMethodFilter}
                onChange={(e) => setHistoricoMethodFilter(e.target.value as any)}
                className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-bold focus:border-emerald-400 outline-none"
              >
                <option value="todos">Todos los Métodos</option>
                {HISTORIC_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            const filteredHistoric = paidOrdersToday.filter((o) => {
              if (o.status !== 'entregada') return false;
              const matchesSearch =
                !historicoSearch ||
                o.orderNumber.toLowerCase().includes(historicoSearch.toLowerCase()) ||
                (o.customerName || '').toLowerCase().includes(historicoSearch.toLowerCase());
              const matchesMethod = historicoMethodFilter === 'todos' || o.paymentMethod === historicoMethodFilter || o.paymentHistory?.some((payment) => payment.paymentMethod === historicoMethodFilter);
              return matchesSearch && matchesMethod;
            });

            if (filteredHistoric.length === 0) {
              return (
                <div className="p-16 text-center rounded-3xl bg-white/[0.02] border border-white/10 space-y-3">
                  <IoCheckmarkDone className="text-5xl text-emerald-400 mx-auto" />
                  <p className="text-sm text-gray-400 font-bold">No se encontraron comandas cobradas en este criterio.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredHistoric.map((ord) => (
                  <div 
                    key={ord.id} 
                    onClick={() => setHistoricDetailOrder(ord)}
                    className="p-6 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] shadow-2xl space-y-4 cursor-pointer hover:border-emerald-400 hover:scale-[1.02] transition-all"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white">{ord.orderNumber}</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black uppercase">
                            {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 font-bold mt-1 block">👤 Cliente: {ord.customerName || 'General'}</span>
                      </div>
                      <div className="text-right">
                        <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500 text-black border border-emerald-400 shadow-lg">
                          💳 {ord.paymentHistory?.map((payment) => payment.paymentMethod).filter((method, index, methods) => methods.indexOf(method) === index).join(' + ') || ord.paymentMethod || 'PAGADO'}
                        </span>
                        <span className="text-xl font-black text-emerald-400 block mt-1">${ord.totalUSD.toFixed(2)} USD</span>
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                      {(ord.items || []).map((it) => (
                        <div key={it.id} className="text-xs font-bold text-white flex justify-between border-b border-white/5 pb-1.5 last:border-0">
                          <span>• {it.quantity}x {it.productName} {it.size ? `(${it.size})` : ''}</span>
                          <span className="text-emerald-400">${(it.price * it.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      {ord.type === 'delivery' && (ord.deliveryFeeUSD || 0) > 0 && (
                        <div className="text-xs font-bold text-white flex justify-between border-t border-white/10 pt-1.5">
                          <span>• Servicio delivery</span>
                          <span className="text-emerald-400">${ord.deliveryFeeUSD!.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={async (event) => {
                        event.stopPropagation();
                        await reopenOrder(ord.id);
                        setSearchParams({ tab: 'comandas' });
                      }}
                      className="w-full rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-2.5 text-xs font-black text-amber-200 hover:bg-amber-400 hover:text-black"
                    >
                      REACTIVAR COMANDA
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 2: CAJA CHICA & CONTROL DE FLUJO */}
      {activeSubTab === 'cajachica' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-2">
              <span className="text-xs text-gray-400 font-bold block">APERTURA EN CAJA (USD / COP)</span>
              <div className="text-2xl font-black text-white">${filteredApertura.usdCash.toFixed(2)} USD</div>
              <div className="text-xs text-emerald-400 font-bold">${filteredApertura.copCash.toLocaleString()} COP</div>
              <button
                onClick={() => setIsAperturaModalOpen(true)}
                className="mt-2 text-xs text-emerald-300 hover:underline font-bold"
              >
                + Modificar Apertura
              </button>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-2">
              <span className="text-xs text-gray-400 font-bold block">INGRESOS TOTALES</span>
              <div className="text-2xl font-black text-emerald-400">+${totalIngresosUSD.toFixed(2)} USD</div>
              <div className="text-xs text-emerald-300 font-bold">+{totalIngresosCOP.toLocaleString()} COP | +{totalIngresosBs.toLocaleString()} Bs</div>
              <div className="text-xs text-gray-400">Cobros e ingresos manuales por método</div>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-2">
              <span className="text-xs text-gray-400 font-bold block">SALDO DISPONIBLE EN EFECTIVO</span>
              <div className="text-3xl font-black text-emerald-300">${saldoEfectivoUSD.toFixed(2)} USD</div>
              <div className="text-xs text-emerald-300 font-bold">{saldoEfectivoCOP.toLocaleString()} COP</div>
              <div className="text-[10px] text-gray-400">Transferencias, tarjetas y Bs permanecen en el movimiento contable, no en el arqueo físico.</div>
              <button
                onClick={() => setIsManualTxOpen(true)}
                className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30 transition-all"
              >
                - Registrar Vuelto / Egreso
              </button>
            </div>
          </div>

          {/* Historial de Transacciones */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-white">MOVIMIENTOS DE CAJA CHICA</h3>
            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/40">
              <table className="w-full min-w-[860px] text-left text-xs text-gray-300">
                <thead className="bg-white/[0.04] text-white uppercase text-[10px] font-black border-b border-white/10">
                  <tr>
                    <th className="p-4">Fecha / Hora</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Moneda</th>
                    <th className="p-4">Método de pago</th>
                    <th className="p-4">Monto</th>
                    <th className="p-4">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCajaTransactions.map((tx) => {
                    const amounts = [
                      tx.amountUSD > 0 ? `$${tx.amountUSD.toFixed(2)} USD` : null,
                      tx.amountCOP > 0 ? `$${tx.amountCOP.toLocaleString()} COP` : null,
                      tx.amountBs > 0 ? `${tx.amountBs.toLocaleString()} Bs` : null,
                    ].filter(Boolean).join(' | ');

                    return (
                      <tr key={tx.id} className="hover:bg-white/[0.02]">
                        <td className="p-4 font-mono text-gray-400">{new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${tx.type === 'ingreso' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-4 font-bold">{tx.currency}</td>
                        <td className="p-4 font-semibold">{tx.paymentMethod}</td>
                        <td className="p-4 font-black text-white">{amounts || '$0.00 USD'}</td>
                        <td className="p-4">
                          <div className="font-bold">{tx.orderReference}</div>
                          <div className="mt-0.5 text-[10px]">{tx.description}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: REPORTES DE VENTAS & ARQUEO DE CIERRE DE CAJA */}
      {activeSubTab === 'reportes' && (
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <IoBarChartOutline className="text-emerald-400" />
                <span>REPORTE DIARIO DE VENTAS & ARQUEO DE CAJA</span>
              </h2>
              <p className="text-xs text-gray-400 mt-1">Genera reportes de cierre de turno y cuadre de dinero.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setCierreResult(null); setCierreError(''); setIsCierreModalOpen(true); }}
                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-2 shadow-xl"
              >
                <IoLockClosedOutline className="text-base" />
                <span>ARQUEO DIARIO DE EFECTIVO</span>
              </button>
            </div>
          </div>

          {/* Panel de Reporte Contable por Intervalo */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/50 border border-amber-500/30 space-y-5">
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <IoBarChartOutline className="text-base" />
                <span>REPORTE CONTABLE POR INTERVALO DE FECHAS</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fecha/Hora Inicio</label>
                  <input
                    type="datetime-local"
                    value={intervaloFrom}
                    onChange={(e) => { setIntervaloFrom(e.target.value); setReporteError(''); }}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/80 border border-white/20 text-white text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fecha/Hora Fin</label>
                  <input
                    type="datetime-local"
                    value={intervaloTo}
                    onChange={(e) => { setIntervaloTo(e.target.value); setReporteError(''); }}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/80 border border-white/20 text-white text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!intervaloFrom || !intervaloTo) { setReporteError('Selecciona ambas fechas.'); return; }
                    const fromDate = new Date(intervaloFrom);
                    const toDate = new Date(intervaloTo);
                    if (fromDate > toDate) { setReporteError('La fecha inicio debe ser menor o igual a la fecha fin.'); return; }
                    if (toDate > new Date()) { setReporteError('La fecha fin no puede ser mayor a la fecha/hora actual.'); return; }
                    setIsLoadingReporte(true);
                    setReporteError('');
                    setReporteIntervaloData(null);
                    try {
                      const data = await fetchReporteIntervalo(intervaloFrom, intervaloTo);
                      setReporteIntervaloData(data);
                    } catch (e: any) {
                      setReporteError(e.message || 'Error al obtener reporte.');
                    } finally {
                      setIsLoadingReporte(false);
                    }
                  }}
                  disabled={isLoadingReporte}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  {isLoadingReporte ? (
                    <span className="animate-pulse">⏳ CARGANDO...</span>
                  ) : (
                    <><IoDocumentTextOutline /> <span>GENERAR REPORTE</span></>
                  )}
                </button>
                {reporteIntervaloData && (
                  <button
                    onClick={() => exportToExcel(reporteIntervaloData)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    <IoDocumentTextOutline /> <span>EXPORTAR EXCEL (.xlsx)</span>
                  </button>
                )}
              </div>

              {reporteError && (
                <div className="text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  ⚠️ {reporteError}
                </div>
              )}

              {reporteIntervaloData && (
                <div className="border-t border-white/10 pt-5 space-y-3">
                  <p className="text-xs text-gray-300">El reporte fue generado. Elige una variante para abrirla y enviarla a la térmica.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <button onClick={() => void handlePrintIntervalReport('contable', () => reportService.generateReporteContable(reporteIntervaloData))} className="px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2"><IoPrint /> ABRIR / IMPRIMIR</button>
                    <button onClick={() => void handlePrintIntervalReport('pizzas', () => reportService.generatePizzasSoldIntervalReport(reporteIntervaloData))} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs flex items-center justify-center gap-2"><IoPizza /> PIZZAS</button>
                    <button onClick={() => void handlePrintIntervalReport('ingresos', () => reportService.generateIncomeIntervalReport(reporteIntervaloData))} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs flex items-center justify-center gap-2"><IoTrendingUp /> INGRESOS</button>
                    <button onClick={() => void handlePrintIntervalReport('egresos', () => reportService.generateExpensesIntervalReport(reporteIntervaloData))} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs flex items-center justify-center gap-2"><IoCashOutline /> VUELTOS</button>
                    <button onClick={() => void handlePrintIntervalReport('cocina', () => reportService.generateKitchenTimesIntervalReport(reporteIntervaloData))} className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs flex items-center justify-center gap-2"><IoTimeOutline /> COCINA</button>
                  </div>
                </div>
              )}

          </div>

          {/* Historial de Cierres Anteriores */}
          {filteredUltimoCierre && (
            <div className="p-6 rounded-3xl bg-black/60 border border-emerald-500/40 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm font-black text-emerald-400 flex items-center gap-2">
                  <IoCheckmarkCircle /> ÚLTIMO CIERRE REGISTRADO
                </span>
                <span className="text-xs text-gray-400 font-mono">{new Date(filteredUltimoCierre.closedAt).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-gray-400 block">Ingresos en efectivo:</span>
                  <strong className="text-white font-black">${parseFloat(filteredUltimoCierre.totalSalesUSD as any || 0).toFixed(2)} USD</strong>
                </div>
                <div>
                  <span className="text-gray-400 block">Esperado en caja:</span>
                  <strong className="text-white font-black">${parseFloat(filteredUltimoCierre.expectedUSD as any || 0).toFixed(2)} USD</strong>
                  <span className="block text-gray-400">{Math.round(filteredUltimoCierre.expectedCOP || 0).toLocaleString()} COP</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Contado por Cajero:</span>
                  <strong className="text-emerald-400 font-black">${parseFloat(filteredUltimoCierre.actualUSD as any || 0).toFixed(2)} USD</strong>
                  <span className="block text-gray-400">{Math.round(filteredUltimoCierre.actualCOP || 0).toLocaleString()} COP</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Cuadre / Diferencia:</span>
                  <strong className={parseFloat(filteredUltimoCierre.differenceUSD as any || 0) >= 0 ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                    ${parseFloat(filteredUltimoCierre.differenceUSD as any || 0).toFixed(2)} USD
                  </strong>
                  <span className={parseFloat(filteredUltimoCierre.differenceCOP as any || 0) >= 0 ? 'block text-emerald-400' : 'block text-red-400'}>{Math.round(filteredUltimoCierre.differenceCOP || 0).toLocaleString()} COP</span>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {activeOrderForPay && (
        <PaymentLedgerModal
          order={orders.find((order) => order.id === activeOrderForPay.id) || activeOrderForPay}
          onClose={handleClosePaymentLedger}
          onViewOrder={(order) => setOrderDetailModalOrder(order)}
          paymentScope={splitPaymentScope || undefined}
          onEditPaymentScope={splitPaymentScope ? handleEditSplitPaymentSelection : undefined}
        />
      )}

      {splitPaymentSelectionOrder && (
        <SplitPaymentSelectionModal
          order={orders.find((order) => order.id === splitPaymentSelectionOrder.id) || splitPaymentSelectionOrder}
          initialPayerName={splitPaymentScope?.payerName}
          initialItemIds={splitPaymentScope?.itemIds}
          onCancel={handleCancelSplitPaymentSelection}
          onConfirm={handleConfirmSplitPaymentSelection}
        />
      )}

      {/* MODAL APERTURA CAJA CHICA */}
      {isAperturaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-white border-b border-white/10 pb-3">Apertura de Saldo Inicial</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Monto Inicial USD (Efectivo):</label>
                <input
                  type="number"
                  value={initUSD}
                  onChange={(e) => setInitUSD(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Monto Inicial COP (Efectivo):</label>
                <input
                  type="number"
                  value={initCOP}
                  onChange={(e) => setInitCOP(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsAperturaModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleAperturaSubmit}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs hover:bg-emerald-400 shadow-lg"
              >
                GUARDAR APERTURA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ARQUEO DIARIO DE CAJA */}
      {isCierreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
              <IoLockClosedOutline className="text-amber-400" />
              <span>ARQUEO DIARIO DE EFECTIVO</span>
            </h3>
            <p className="-mt-3 text-xs text-gray-300">Compara el efectivo físico contra la apertura y los movimientos de caja confirmados de este turno.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Conteo físico en efectivo USD:</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Ej: 150.00"
                  value={cierreActualUSD}
                  onChange={(e) => { setCierreActualUSD(e.target.value); setCierreError(''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Conteo físico en efectivo COP:</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Ej: 250000"
                  value={cierreActualCOP}
                  onChange={(e) => { setCierreActualCOP(e.target.value); setCierreError(''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Notas de Cierre / Observaciones:</label>
                <input
                  type="text"
                  placeholder="Ej: Turno noche sin novedades"
                  value={cierreNotes}
                  onChange={(e) => setCierreNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              {cierreResult && (
                <div className="p-4 rounded-2xl bg-black/60 border border-emerald-500/40 text-xs space-y-1">
                  <div className="text-emerald-400 font-black">Comprobación registrada</div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1 text-gray-300"><div>Esperado: ${cierreResult.expectedUSD?.toFixed(2)} USD</div><div>Contado: ${cierreResult.actualUSD?.toFixed(2)} USD</div><div className={cierreResult.differenceUSD >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>Diferencia: ${cierreResult.differenceUSD?.toFixed(2)} USD</div></div>
                    <div className="space-y-1 text-gray-300"><div>Esperado: {Math.round(cierreResult.expectedCOP || 0).toLocaleString()} COP</div><div>Contado: {Math.round(cierreResult.actualCOP || 0).toLocaleString()} COP</div><div className={cierreResult.differenceCOP >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>Diferencia: {Math.round(cierreResult.differenceCOP || 0).toLocaleString()} COP</div></div>
                  </div>
                </div>
              )}
              {cierreError && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-bold text-red-200">{cierreError}</div>}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setIsCierreModalOpen(false); setCierreResult(null); setCierreError(''); }}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs"
              >
                CERRAR
              </button>
              <button
                onClick={handleCierreSubmit}
                disabled={isSubmittingCierre}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg"
              >
                {isSubmittingCierre ? 'REGISTRANDO...' : 'REGISTRAR COMPROBACIÓN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOVIMIENTO MANUAL EGRESO / VUELTO */}
      {isManualTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-white border-b border-white/10 pb-3">Registrar Movimiento Manual</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Tipo de Movimiento:</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as 'ingreso' | 'egreso')}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                >
                  <option value="egreso">Egreso / Vuelto / Gasto</option>
                  <option value="ingreso">Ingreso Manual</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Moneda:</label>
                  <select
                    value={manualCurrency}
                    onChange={(e) => {
                      const currency = e.target.value as 'USD' | 'COP' | 'Bs';
                      setManualCurrency(currency);
                      setManualPaymentMethod(currency === 'USD' ? 'Efectivo USD' : currency === 'COP' ? 'Efectivo COP' : 'Pago Móvil');
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="USD">USD</option>
                    <option value="COP">COP</option>
                    <option value="Bs">Bs</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Método de pago:</label>
                  <select
                    value={manualPaymentMethod}
                    onChange={(e) => setManualPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                  >
                    {(manualCurrency === 'USD' ? ['Efectivo USD', 'Zelle', 'Binance'] : manualCurrency === 'COP' ? ['Efectivo COP', 'Bancolombia', 'Nequi'] : ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito']).map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Monto {manualCurrency}:</label>
                <input
                  type="number"
                  placeholder={manualCurrency === 'USD' ? 'Ej: 5.00' : manualCurrency === 'COP' ? 'Ej: 20000' : 'Ej: 100'}
                  value={manualAmountUSD}
                  onChange={(e) => setManualAmountUSD(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Motivo / Descripción:</label>
                <input
                  type="text"
                  placeholder="Ej: Vuelto entregado por pago en Divisas"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsManualTxOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleManualTxSubmit}
                className={`flex-1 py-3 rounded-xl font-black text-xs shadow-lg ${
                  manualType === 'egreso'
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
              >
                {manualType === 'egreso' ? 'REGISTRAR EGRESO' : 'REGISTRAR INGRESO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE COMANDA HISTÓRICA */}
      {historicDetailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-black text-emerald-400 uppercase">Detalle Histórico</span>
                <h3 className="text-xl font-black text-white">{historicDetailOrder.orderNumber}</h3>
              </div>
              <button onClick={() => setHistoricDetailOrder(null)} className="text-gray-400 hover:text-white">
                <IoCloseCircle size={24} />
              </button>
            </div>
            
            <div className="space-y-3">
              {historicDetailOrder.items.map((it) => (
                <div key={it.id} className="p-3 rounded-xl bg-black/60 border border-white/10">
                  <div className="flex justify-between items-center text-sm font-bold text-white">
                    <span>{it.quantity}x {it.productName}</span>
                    <span className="text-emerald-400">${(it.price * it.quantity).toFixed(2)}</span>
                  </div>
                  {it.extras && it.extras.length > 0 && (
                    <div className="text-[10px] text-gray-400 mt-1">Extras: {it.extras.map(e => e.name).join(', ')}</div>
                  )}
                </div>
              ))}
              {historicDetailOrder.type === 'delivery' && (historicDetailOrder.deliveryFeeUSD || 0) > 0 && (
                <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex justify-between items-center text-sm font-bold text-white">
                  <span>Servicio delivery</span>
                  <span className="text-emerald-400">${historicDetailOrder.deliveryFeeUSD!.toFixed(2)}</span>
                </div>
              )}
            </div>

            {(() => {
              const history = historicDetailOrder.paymentHistory || [];
              const totalGivenUSD = history.reduce((sum, p) => sum + (p.changeGivenUSD || 0), 0);
              const totalGivenCOP = history.reduce((sum, p) => sum + (p.changeGivenCOP || 0), 0);
              const totalGivenBs = history.reduce((sum, p) => sum + (p.changeGivenBs || 0), 0);

              const grandTotalChangeUSD = history.reduce((sum, p) => {
                const usd = p.changeGivenUSD || 0;
                const copUsd = (p.changeGivenCOP || 0) / (p.copRate || exchangeRates.COP);
                const bsUsd = (p.changeGivenBs || 0) / (p.bsRate || exchangeRates.Bs);
                return sum + usd + copUsd + bsUsd;
              }, 0);

              return (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 space-y-2">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span>Total Cobrado:</span>
                    <span className="font-black text-emerald-400 text-sm">${historicDetailOrder.totalUSD.toFixed(2)} USD</span>
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-1">
                    {totalGivenUSD > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Vuelto Entregado (USD):</span>
                        <span className="font-bold text-amber-300">${totalGivenUSD.toFixed(2)} USD</span>
                      </div>
                    )}
                    {totalGivenCOP > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Vuelto Entregado (COP):</span>
                        <span className="font-bold text-amber-300">${totalGivenCOP.toLocaleString()} COP</span>
                      </div>
                    )}
                    {totalGivenBs > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Vuelto Entregado (Bs):</span>
                        <span className="font-bold text-amber-300">{totalGivenBs.toFixed(2)} Bs</span>
                      </div>
                    )}
                    {totalGivenUSD === 0 && totalGivenCOP === 0 && totalGivenBs === 0 && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Vuelto Entregado:</span>
                        <span className="font-bold text-white">$0.00 USD</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1.5 border-t border-white/10 font-black">
                      <span className="text-emerald-300">Total Vueltos Dados (USD Equiv.):</span>
                      <span className="text-amber-400">${grandTotalChangeUSD.toFixed(2)} USD</span>
                    </div>
                  </div>

                  {history.length > 0 ? (
                    <div className="mt-3 pt-2 border-t border-white/10 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="text-[10px] font-black text-blue-300 uppercase tracking-wider">
                        💳 Desglose de Pagos ({history.length} pago{history.length > 1 ? 's' : ''}):
                      </div>
                      {history.map((p, idx) => (
                        <div key={p.id || idx} className="flex justify-between items-center text-xs p-2 rounded-xl bg-black/50 border border-white/10">
                          <div>
                            <span className="font-bold text-white block">#{idx + 1} {p.payerName || 'Cliente General'}</span>
                            <span className="text-[10px] text-blue-300 font-semibold">{p.paymentMethod}</span>
                            {paymentMovementLabels(p).length > 0 && <span className="text-[10px] text-gray-400 block mt-0.5">{paymentMovementLabels(p).join(' | ')}</span>}
                          </div>
                          <span className="font-black text-emerald-400">${(p.amountPaidUSD || 0).toFixed(2)} USD</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex justify-between text-xs text-gray-300 pt-1 border-t border-white/10">
                      <span>Método de Pago:</span>
                      <span className="font-bold text-white">{historicDetailOrder.paymentMethod || 'Efectivo USD'}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            
            <button
              onClick={() => setHistoricDetailOrder(null)}
              className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20"
            >
              CERRAR
            </button>
          </div>
        </div>
      )}

      {/* Componentes Modulares de Detalle y Edicion Completa */}
      {orderDetailModalOrder && (
        <OrderDetailModal
          order={orderDetailModalOrder}
          isOpen={!!orderDetailModalOrder}
          onClose={() => setOrderDetailModalOrder(null)}
          exchangeRates={exchangeRates}
        />
      )}

      {orderEditModalOrder && (
        <OrderEditModal
          order={orderEditModalOrder}
          isOpen={!!orderEditModalOrder}
          onClose={() => setOrderEditModalOrder(null)}
          products={products}
          ingredients={ingredients}
          onSaveEdit={async (orderId, payload) => {
            await editOrder(orderId, {
              ...payload,
              type: payload.type === 'llevar' ? 'pickup' : payload.type,
            });
            setOrderEditModalOrder(null);
          }}
          onDeletePaymentEntry={async (orderId, paymentId) => {
            const updatedOrder = await deletePaymentEntry(orderId, paymentId);
            setOrderEditModalOrder(updatedOrder);
            return updatedOrder;
          }}
        />
      )}

    </div>
  );
};

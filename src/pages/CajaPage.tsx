import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PaymentMethod, Order } from '../data/mockData';
import { reportService } from '../services/reportService';
import {
  IoCard,
  IoCashOutline,
  IoCheckmarkDone,
  IoTimeOutline,
  IoSend,
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

export const CajaPage: React.FC = () => {
  const {
    orders,
    exchangeRates,
    cajaChicaApertura,
    cajaChicaTransactions,
    ultimoCierre,
    processPayment,
    processMultiplePayments,
    updateOrderStatus,
    aperturarCajaChica,
    addCajaTransaction,
    realizarCierreCaja,
    obtenerReporteDiario,
    queryCajaAI,
    userSession,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'comandas';

  const filteredCajaTransactions = cajaChicaTransactions.filter(t => !t.shift || t.shift === 'ambos' || t.shift === userSession?.shift);
  const filteredApertura = cajaChicaApertura.shift && cajaChicaApertura.shift !== 'ambos' && cajaChicaApertura.shift !== userSession?.shift ? { usdCash: 0, copCash: 0 } : cajaChicaApertura;
  const filteredUltimoCierre = ultimoCierre && (!ultimoCierre.shift || ultimoCierre.shift === 'ambos' || ultimoCierre.shift === userSession?.shift) ? ultimoCierre : null;

  // Estados de Modal de Cobro & Vueltos
  const [activeOrderForPay, setActiveOrderForPay] = useState<Order | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('Divisas');
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [amountCOP, setAmountCOP] = useState<string>('');

  // Cash Tendered & Change Breakdown State (Vueltos Mixtos)
  const [payerName, setPayerName] = useState<string>('Cliente General');
  const [cashTenderedUSD, setCashTenderedUSD] = useState<string>('');
  const [cashTenderedCOP, setCashTenderedCOP] = useState<string>('');
  const [cashTenderedBs, setCashTenderedBs] = useState<string>('');
  const [changeGivenUSD, setChangeGivenUSD] = useState<string>('');
  const [changeGivenCOP, setChangeGivenCOP] = useState<string>('');
  const [changeGivenBs, setChangeGivenBs] = useState<string>('');
  const [calcCurrency, setCalcCurrency] = useState<'USD' | 'COP' | 'Bs'>('USD');
  const [changeCurrency, setChangeCurrency] = useState<'USD' | 'COP' | 'Bs'>('USD');
  const [userGivenUSD, setUserGivenUSD] = useState<string>('');

  const calcChangeBreakdown = (
    tenderedVal: string,
    calcCurr: 'USD' | 'COP' | 'Bs',
    givenUsdVal: string,
    changeCurr: 'USD' | 'COP' | 'Bs',
    targetUSD: number
  ) => {
    const tendered = parseFloat(tenderedVal) || 0;
    let tenderedUSD = 0;
    if (calcCurr === 'USD') tenderedUSD = tendered;
    if (calcCurr === 'COP') tenderedUSD = tendered / exchangeRates.COP;
    if (calcCurr === 'Bs') tenderedUSD = tendered / exchangeRates.Bs;

    const totalChangeNeededUSD = Math.max(0, tenderedUSD - targetUSD);

    let desiredUSD = parseFloat(givenUsdVal) || 0;
    if (desiredUSD > totalChangeNeededUSD) desiredUSD = totalChangeNeededUSD;

    const remainingUSD = Math.max(0, totalChangeNeededUSD - desiredUSD);

    if (changeCurr === 'USD') {
      return {
        usd: totalChangeNeededUSD.toFixed(2),
        cop: '0',
        bs: '0.00',
      };
    } else if (changeCurr === 'COP') {
      return {
        usd: desiredUSD > 0 ? desiredUSD.toFixed(2) : '0.00',
        cop: Math.round(remainingUSD * exchangeRates.COP).toString(),
        bs: '0.00',
      };
    } else {
      return {
        usd: desiredUSD > 0 ? desiredUSD.toFixed(2) : '0.00',
        cop: '0',
        bs: (remainingUSD * exchangeRates.Bs).toFixed(2),
      };
    }
  };

  // Multi-Order Table Payment & Merge state
  const [selectedOrderIdsForMultiPay, setSelectedOrderIdsForMultiPay] = useState<string[]>([]);
  const [isMultiPayModalOpen, setIsMultiPayModalOpen] = useState<boolean>(false);

  // Split Pay by Items / Persons State (Pago por personas)
  const [activeOrderForSplitItems, setActiveOrderForSplitItems] = useState<Order | null>(null);
  const [selectedItemIdsForSplitPay, setSelectedItemIdsForSplitPay] = useState<string[]>([]);
  const [splitPayerName, setSplitPayerName] = useState<string>('');

  // Split / Multi-Currency Payment state
  const [isSplitPayment, setIsSplitPayment] = useState<boolean>(false);
  const [splitRows, setSplitRows] = useState<{ method: PaymentMethod; amountLocal: string }[]>([
    { method: 'Divisas', amountLocal: '' },
    { method: 'COP', amountLocal: '' },
  ]);

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

  // Transaccion Manual Egreso / Ingreso
  const [isManualTxOpen, setIsManualTxOpen] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'ingreso' | 'egreso'>('egreso');
  const [manualAmountUSD, setManualAmountUSD] = useState<string>('');
  const [manualDesc, setManualDesc] = useState<string>('');

  // Asistente IA de Texto para la Caja
  const [aiInput, setAiInput] = useState<string>('');
  const [aiChatLogs, setAiChatLogs] = useState<{ sender: 'user' | 'bot'; text: string }[]>([
    {
      sender: 'bot',
      text: '🤖 Hola Cajero. Escribe tu consulta (ej: "¿Resumen de ventas?", "¿Cierre de caja?", "¿Cuántas pizzas cobradas?").',
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Reporte Diario State
  const [reporteDiario, setReporteDiario] = useState<any>(null);

  // Comandas activas no finalizadas/pagadas totalmente (excluye canceladas y fusionadas)
  const activeComandas = orders.filter(
    (o) => o.status !== 'cancelado' && o.status !== 'fusionada' && !(o.status === 'entregada' && o.paymentStatus === 'pagado') && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)
  );
  const paidOrdersToday = orders.filter((o) => o.paymentStatus === 'pagado' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift));
  const totalSalesUSDToday = paidOrdersToday.reduce((sum, o) => sum + o.totalUSD, 0);

  // Historico Filters
  const [historicoSearch, setHistoricoSearch] = useState<string>('');
  const [historicoMethodFilter, setHistoricoMethodFilter] = useState<'todos' | PaymentMethod>('todos');
  const [historicDetailOrder, setHistoricDetailOrder] = useState<Order | null>(null);

  const { mergeOrders } = useApp();

  const handleOpenPayModal = (order: Order) => {
    const remainingUSD = order.totalUSD - (order.paidAmountUSD || 0);
    setActiveOrderForPay(order);
    setAmountUSD(remainingUSD.toFixed(2));
    setAmountCOP(Math.round(remainingUSD * exchangeRates.COP).toString());
    setSelectedMethod('Divisas');
    setPayerName(order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General'));
    setCashTenderedUSD('');
    setCashTenderedCOP('');
    setCashTenderedBs('');
    setChangeGivenUSD('');
    setChangeGivenCOP('');
    setChangeGivenBs('');
    setIsSplitPayment(false);
    setSplitRows([
      { method: 'Divisas', amountLocal: (remainingUSD / 2).toFixed(2) },
      { method: 'COP', amountLocal: Math.round((remainingUSD / 2) * exchangeRates.COP).toString() },
    ]);
  };

  const handleToggleOrderForMultiPay = (id: string) => {
    setSelectedOrderIdsForMultiPay((prev) =>
      prev.includes(id) ? prev.filter((oId) => oId !== id) : [...prev, id]
    );
  };

  const multiPayOrders = orders.filter((o) => selectedOrderIdsForMultiPay.includes(o.id));
  const multiPayTotalUSD = multiPayOrders.reduce((sum, o) => sum + (o.totalUSD - (o.paidAmountUSD || 0)), 0);

  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const handleConfirmPay = async () => {
    if (!activeOrderForPay || isSubmittingPay) return;
    setIsSubmittingPay(true);
    try {
      const remainingUSD = activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0);
      const targetPayUSD = parseFloat(amountUSD) || remainingUSD;

      const details = {
        payerName: payerName || 'Cliente General',
        cashTenderedUSD: parseFloat(cashTenderedUSD) || 0,
        cashTenderedCOP: parseFloat(cashTenderedCOP) || 0,
        cashTenderedBs: parseFloat(cashTenderedBs) || 0,
        changeGivenUSD: parseFloat(changeGivenUSD) || 0,
        changeGivenCOP: parseFloat(changeGivenCOP) || 0,
        changeGivenBs: parseFloat(changeGivenBs) || 0,
      };

      if (isSplitPayment) {
        const splitPaymentsData = splitRows
          .filter((r) => parseFloat(r.amountLocal) > 0)
          .map((r) => {
            let usdVal = parseFloat(r.amountLocal) || 0;
            if (r.method === 'COP') usdVal = usdVal / exchangeRates.COP;
            if (r.method === 'Bs') usdVal = usdVal / exchangeRates.Bs;
            return { method: r.method, amountUSD: usdVal };
          });
        const totalSplitUSD = splitPaymentsData.reduce((sum, r) => sum + r.amountUSD, 0);

        await processPayment(
          activeOrderForPay.id,
          'Mixto',
          totalSplitUSD,
          Math.round(totalSplitUSD * exchangeRates.COP),
          splitPaymentsData,
          details
        );
      } else {
        await processPayment(
          activeOrderForPay.id,
          selectedMethod,
          targetPayUSD,
          Math.round(targetPayUSD * exchangeRates.COP),
          undefined,
          details
        );
      }
      setActiveOrderForPay(null);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleOpenSplitItemsModal = (order: Order) => {
    setActiveOrderForSplitItems(order);
    setSelectedItemIdsForSplitPay([]);
    setSplitPayerName(`Persona 1`);
  };

  const handleConfirmSplitItemPay = async () => {
    if (!activeOrderForSplitItems || selectedItemIdsForSplitPay.length === 0 || isSubmittingPay) return;
    setIsSubmittingPay(true);
    try {
      const selectedItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
      const splitTotalUSD = selectedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

      const details = {
        payerName: splitPayerName || 'Persona N',
        cashTenderedUSD: parseFloat(cashTenderedUSD) || 0,
        cashTenderedCOP: parseFloat(cashTenderedCOP) || 0,
        cashTenderedBs: parseFloat(cashTenderedBs) || 0,
        changeGivenUSD: parseFloat(changeGivenUSD) || 0,
        changeGivenCOP: parseFloat(changeGivenCOP) || 0,
        changeGivenBs: parseFloat(changeGivenBs) || 0,
        itemIds: selectedItemIdsForSplitPay,
      };

      await processPayment(
        activeOrderForSplitItems.id,
        selectedMethod,
        splitTotalUSD,
        Math.round(splitTotalUSD * exchangeRates.COP),
        undefined,
        details
      );

      setActiveOrderForSplitItems(null);
      setSelectedItemIdsForSplitPay([]);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleConfirmMergeOrders = async () => {
    if (selectedOrderIdsForMultiPay.length < 2) return;
    const targetId = selectedOrderIdsForMultiPay[0];
    const sourceIds = selectedOrderIdsForMultiPay.slice(1);

    await mergeOrders(targetId, sourceIds);
    setSelectedOrderIdsForMultiPay([]);
  };

  const handleConfirmMultiPay = async () => {
    if (selectedOrderIdsForMultiPay.length === 0) return;
    const totalUSD = multiPayTotalUSD;
    const totalCOP = Math.round(totalUSD * exchangeRates.COP);

    await processMultiplePayments(
      selectedOrderIdsForMultiPay,
      selectedMethod,
      totalUSD,
      totalCOP
    );

    setSelectedOrderIdsForMultiPay([]);
    setIsMultiPayModalOpen(false);
  };



  const handleAperturaSubmit = async () => {
    await aperturarCajaChica(parseFloat(initUSD) || 0, parseFloat(initCOP) || 0);
    setIsAperturaModalOpen(false);
  };

  const handleCierreSubmit = async () => {
    const res = await realizarCierreCaja(
      parseFloat(cierreActualUSD) || 0,
      parseFloat(cierreActualCOP) || 0,
      cierreNotes || 'Cierre de turno realizado'
    );
    if (res) {
      setCierreResult(res.summary);
    }
  };

  const handleCargarReporte = async () => {
    const data = await obtenerReporteDiario();
    setReporteDiario(data);
  };

  const handleManualTxSubmit = async () => {
    if (!manualAmountUSD) return;
    await addCajaTransaction({
      type: manualType,
      amountUSD: parseFloat(manualAmountUSD) || 0,
      amountCOP: Math.round((parseFloat(manualAmountUSD) || 0) * exchangeRates.COP),
      paymentMethod: 'Divisas',
      description: manualDesc || (manualType === 'egreso' ? 'Vuelto / Cambio entregado' : 'Ingreso manual'),
    });
    setManualAmountUSD('');
    setManualDesc('');
    setIsManualTxOpen(false);
  };

  const handleSendAiMessage = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiChatLogs((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setAiInput('');
    setIsAiLoading(true);

    const botReply = await queryCajaAI(userMsg);
    setAiChatLogs((prev) => [...prev, { sender: 'bot', text: botReply }]);
    setIsAiLoading(false);
  };

  // Totales de Caja Chica
  const totalIngresosUSD = cajaChicaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountUSD, 0);

  const totalEgresosUSD = cajaChicaTransactions
    .filter((t) => t.type === 'egreso')
    .reduce((sum, t) => sum + t.amountUSD, 0);

  const saldoActualUSD = cajaChicaApertura.usdCash + totalIngresosUSD - totalEgresosUSD;

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
            onClick={() => { setSearchParams({ tab: 'reportes' }); handleCargarReporte(); }}
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
          {/* Multi-Pay Action Bar */}
          {selectedOrderIdsForMultiPay.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black flex items-center justify-between shadow-2xl animate-pulse">
              <div className="flex items-center gap-3">
                <IoCard className="text-2xl shrink-0" />
                <div>
                  <div className="font-black text-sm">
                    {selectedOrderIdsForMultiPay.length} COMANDAS SELECCIONADAS PARA COBRO AGRUPADO
                  </div>
                  <div className="text-xs font-bold">
                    Subtotal Total: ${multiPayTotalUSD.toFixed(2)} USD (${Math.round(multiPayTotalUSD * exchangeRates.COP).toLocaleString()} COP)
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
                <button
                  onClick={() => setIsMultiPayModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-black text-amber-300 font-black text-xs hover:bg-gray-900 shadow-xl"
                >
                  💳 PROCESAR COBRO AGRUPADO
                </button>
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
                            title="Seleccionar para cobro múltiple por mesa"
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
                              ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
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
                                  {(pm.cashTenderedUSD > 0 || pm.changeGivenUSD > 0 || pm.changeGivenCOP > 0) && (
                                    <div className="text-gray-400 text-[10px] pl-2 font-medium">
                                      {pm.cashTenderedUSD > 0 && `💵 Entregó: $${pm.cashTenderedUSD.toFixed(2)} USD | `}
                                      {pm.changeGivenUSD > 0 && `💵 Vuelto USD: $${pm.changeGivenUSD.toFixed(2)} USD | `}
                                      {pm.changeGivenCOP > 0 && `🇨🇴 Vuelto COP: $${pm.changeGivenCOP.toLocaleString()} COP`}
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
                        <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-black text-center flex items-center justify-center gap-1">
                          <IoCheckmarkCircle className="text-sm" />
                          <span>🔥 LISTA</span>
                        </div>
                      )}

                      {!isPaid ? (
                        <>
                          <button
                            onClick={() => handleOpenSplitItemsModal(ord)}
                            className="w-full py-3 rounded-2xl bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-black border border-blue-400 font-black text-xs flex items-center justify-center gap-1 transition-all"
                          >
                            <span>👥 PAGAR POR PERSONAS</span>
                          </button>

                          <button
                            onClick={() => handleOpenPayModal(ord)}
                            className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all"
                          >
                            <IoCashOutline className="text-base" />
                            <span>💳 COBRAR (${(ord.totalUSD - (ord.paidAmountUSD || 0)).toFixed(2)})</span>
                          </button>
                        </>
                      ) : (
                        <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-black text-center flex items-center justify-center gap-1 sm:col-span-2">
                          <IoCheckmarkCircle className="text-sm" />
                          <span>💳 PAGADO TOTALMENTE</span>
                        </div>
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
                <option value="Divisas">Divisas (USD)</option>
                <option value="COP">Pesos (COP)</option>
                <option value="Bs">Bolívares (Bs)</option>
                <option value="Binance">Binance</option>
                <option value="Mixto">Pago Mixto</option>
              </select>
            </div>
          </div>

          {(() => {
            const filteredHistoric = paidOrdersToday.filter((o) => {
              const matchesSearch =
                !historicoSearch ||
                o.orderNumber.toLowerCase().includes(historicoSearch.toLowerCase()) ||
                (o.customerName || '').toLowerCase().includes(historicoSearch.toLowerCase());
              const matchesMethod = historicoMethodFilter === 'todos' || o.paymentMethod === historicoMethodFilter;
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
                          💳 {ord.paymentMethod || 'PAGADO'}
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
                    </div>
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
              <div className="text-2xl font-black text-white">${cajaChicaApertura.usdCash.toFixed(2)} USD</div>
              <div className="text-xs text-emerald-400 font-bold">${cajaChicaApertura.copCash.toLocaleString()} COP</div>
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
              <div className="text-xs text-gray-400">Cobros + Ingresos manuales</div>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-2">
              <span className="text-xs text-gray-400 font-bold block">SALDO DISPONIBLE EN EFECTIVO</span>
              <div className="text-3xl font-black text-emerald-300">${saldoActualUSD.toFixed(2)} USD</div>
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
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-white/[0.04] text-white uppercase text-[10px] font-black border-b border-white/10">
                  <tr>
                    <th className="p-4">Fecha / Hora</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Monto USD</th>
                    <th className="p-4">Monto COP</th>
                    <th className="p-4">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cajaChicaTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                      <td className="p-4 font-mono text-gray-400">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${tx.type === 'ingreso' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="p-4 font-black text-white">${tx.amountUSD.toFixed(2)}</td>
                      <td className="p-4 text-gray-400">${tx.amountCOP.toLocaleString()} COP</td>
                      <td className="p-4 text-gray-300">{tx.description}</td>
                    </tr>
                  ))}
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
                onClick={() => setIsCierreModalOpen(true)}
                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-2 shadow-xl"
              >
                <IoLockClosedOutline className="text-base" />
                <span>REALIZAR CIERRE & ARQUEO</span>
              </button>
            </div>
          </div>

          {/* PDF Audit Reports Grid */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/50 border border-emerald-500/30 space-y-4">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <IoDocumentTextOutline className="text-base" />
              <span>EXPORTAR REPORTES DE AUDITORÍA EN PDF / IMPRESIÓN</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                onClick={() => reportService.generatePizzasSoldReport(orders, exchangeRates)}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/20 border border-white/10 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-emerald-400 font-black text-xs mb-1">
                  <IoPizza />
                  <span>PIZZAS VENDIDAS</span>
                </div>
                <div className="text-[10px] text-gray-400">Por tipo y unidades</div>
              </button>

              <button
                onClick={() => reportService.generateIncomeReport(orders, exchangeRates)}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/20 border border-white/10 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-emerald-400 font-black text-xs mb-1">
                  <IoTrendingUp />
                  <span>INGRESOS & COBROS</span>
                </div>
                <div className="text-[10px] text-gray-400">Por método de pago</div>
              </button>

              <button
                onClick={() => reportService.generateExpensesReport(filteredCajaTransactions)}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/20 border border-white/10 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-amber-400 font-black text-xs mb-1">
                  <IoCashOutline />
                  <span>VUELTOS & EGRESOS</span>
                </div>
                <div className="text-[10px] text-gray-400">Salidas de caja chica</div>
              </button>

              <button
                onClick={() => reportService.generateKitchenTimesReport(orders)}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/20 border border-white/10 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-sky-400 font-black text-xs mb-1">
                  <IoTimeOutline />
                  <span>TIEMPOS COCINA</span>
                </div>
                <div className="text-[10px] text-gray-400">Auditoría de preparación</div>
              </button>

              <button
                onClick={() => reportService.generateAuditReportZ(orders, filteredApertura.usdCash, filteredCajaTransactions, exchangeRates, filteredUltimoCierre)}
                className="p-3.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-emerald-300 font-black text-xs mb-1">
                  <IoPrint />
                  <span>REPORTE Z CIERRE</span>
                </div>
                <div className="text-[10px] text-emerald-200/80">Auditoría general Z</div>
              </button>
            </div>
          </div>

          {/* Resumen General de Cierre */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-1">
              <span className="text-[10px] text-gray-400 font-black uppercase">RECAUDADO HOY (USD)</span>
              <div className="text-3xl font-black text-emerald-400">${totalSalesUSDToday.toFixed(2)}</div>
              <span className="text-[11px] text-gray-400">{paidOrdersToday.length} Comandas Cobradas</span>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-1">
              <span className="text-[10px] text-gray-400 font-black uppercase">DIVISAS EFECTIVO</span>
              <div className="text-2xl font-black text-white">
                ${paidOrdersToday.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0).toFixed(2)}
              </div>
              <span className="text-[11px] text-emerald-400 font-bold">Pago en USD</span>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-1">
              <span className="text-[10px] text-gray-400 font-black uppercase">PESOS COP</span>
              <div className="text-2xl font-black text-white">
                ${Math.round(paidOrdersToday.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0) * exchangeRates.COP).toLocaleString()}
              </div>
              <span className="text-[11px] text-gray-400">Pesos Colombianos</span>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/30 shadow-xl space-y-1">
              <span className="text-[10px] text-gray-400 font-black uppercase">BOLÍVARES BS / BINANCE</span>
              <div className="text-2xl font-black text-white">
                ${paidOrdersToday.filter((o) => o.paymentMethod === 'Bs' || o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0).toFixed(2)}
              </div>
              <span className="text-[11px] text-gray-400">Transferencias / Digital</span>
            </div>
          </div>

          {/* Historial de Cierres Anteriores */}
          {ultimoCierre && (
            <div className="p-6 rounded-3xl bg-black/60 border border-emerald-500/40 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm font-black text-emerald-400 flex items-center gap-2">
                  <IoCheckmarkCircle /> ÚLTIMO CIERRE REGISTRADO
                </span>
                <span className="text-xs text-gray-400 font-mono">{new Date(ultimoCierre.closedAt).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-gray-400 block">Ventas Turno:</span>
                  <strong className="text-white font-black">${parseFloat(ultimoCierre.totalSalesUSD as any || 0).toFixed(2)} USD</strong>
                </div>
                <div>
                  <span className="text-gray-400 block">Esperado en Caja:</span>
                  <strong className="text-white font-black">${parseFloat(ultimoCierre.expectedUSD as any || 0).toFixed(2)} USD</strong>
                </div>
                <div>
                  <span className="text-gray-400 block">Contado por Cajero:</span>
                  <strong className="text-emerald-400 font-black">${parseFloat(ultimoCierre.actualUSD as any || 0).toFixed(2)} USD</strong>
                </div>
                <div>
                  <span className="text-gray-400 block">Cuadre / Diferencia:</span>
                  <strong className={parseFloat(ultimoCierre.differenceUSD as any || 0) >= 0 ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                    ${parseFloat(ultimoCierre.differenceUSD as any || 0).toFixed(2)} USD
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Asistente IA de Texto para Caja */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] border border-emerald-500/30 space-y-4">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              🤖 ASISTENTE IA DE CONSULTAS Y REPORTES
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto p-3 rounded-2xl bg-black/60 border border-white/10">
              {aiChatLogs.map((log, idx) => (
                <div key={idx} className={`text-xs ${log.sender === 'user' ? 'text-emerald-300 font-bold text-right' : 'text-gray-200'}`}>
                  {log.text}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Escribe tu consulta sobre ventas, pizzas cobradas o caja..."
                className="flex-1 px-4 py-3 rounded-2xl bg-black/80 border border-white/20 text-white text-xs outline-none focus:border-emerald-500 font-bold"
              />
              <button
                onClick={handleSendAiMessage}
                disabled={isAiLoading}
                className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1.5 shadow-lg"
              >
                <IoSend />
                <span>CONSULTAR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COBRO DE COMANDA (SIMPLE O DIVIDIDO MULTI-MONEDA) */}
      {activeOrderForPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-black text-emerald-400 uppercase">COBRANZA CAJA</span>
                <h3 className="text-xl font-black text-white">Comanda {activeOrderForPay.orderNumber}</h3>
              </div>
              <button onClick={() => setActiveOrderForPay(null)} className="text-gray-400 hover:text-white">
                <IoCloseCircle size={24} />
              </button>
            </div>

            {/* Modalidad: Cobro Único vs Cobro Dividido */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsSplitPayment(false)}
                className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border transition-all ${
                  !isSplitPayment
                    ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow-lg'
                    : 'bg-white/[0.04] border-white/15 text-gray-300'
                }`}
              >
                💵 Pago Único (1 Método)
              </button>

              <button
                type="button"
                onClick={() => setIsSplitPayment(true)}
                className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border transition-all ${
                  isSplitPayment
                    ? 'bg-amber-500 text-black border-amber-400 font-black shadow-lg'
                    : 'bg-white/[0.04] border-white/15 text-gray-300'
                }`}
              >
                🔀 Pago Dividido / Multi-Moneda
              </button>
            </div>

            {/* Nombre del Pagador / Cliente */}
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Nombre del Cliente / Pagador:</label>
              <input
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Ej: Cliente General, Carlos, Mesa 3"
                className="w-full px-4 py-2.5 rounded-xl bg-black/80 border border-white/20 text-white text-xs outline-none focus:border-emerald-400 font-bold"
              />
            </div>

            {!isSplitPayment ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-2">Seleccionar Método de Pago:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Divisas', 'COP', 'Bs', 'Binance'] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMethod(m)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                          selectedMethod === m
                            ? 'bg-emerald-500 text-black border-emerald-400 font-black'
                            : 'bg-white/[0.04] border-white/10 text-gray-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Total a Cobrar USD:</span>
                    <span className="text-emerald-400 font-black text-base">${(activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0)).toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Equivalente COP:</span>
                    <span className="text-white font-bold">${Math.round((activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0)) * exchangeRates.COP).toLocaleString()} COP</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t border-white/10">
                    <span className="text-amber-300 font-semibold">Equivalente en Bs (Tasa {exchangeRates.Bs}):</span>
                    <span className="text-amber-300 font-black text-sm">{((activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0)) * exchangeRates.Bs).toFixed(2)} Bs</span>
                  </div>
                </div>

                {/* MENSAJE PARA METODOS ELECTRONICOS / TRANSFERENCIA (Bs, Binance) */}
                {(selectedMethod === 'Bs' || selectedMethod === 'Binance') && (
                  <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 space-y-1">
                    <div className="font-bold text-blue-300 text-sm flex items-center gap-1.5">
                      <span>📲 Pago por Transferencia / Electrónico ({selectedMethod}):</span>
                    </div>
                    {selectedMethod === 'Bs' && (
                      <div className="text-base font-black text-amber-300 py-1">
                        Monto exacto a transferir: {((activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0)) * exchangeRates.Bs).toFixed(2)} Bs
                      </div>
                    )}
                    <div className="text-[11px] text-blue-300/80">
                      Este método es por el monto exacto por transferencia o punto. No aplica calculadora de vuelto.
                    </div>
                  </div>
                )}

                {/* CALCULADORA AVANZADA DE EFECTIVO Y VUELTOS (SOLO PARA DIVISAS Y COP) */}
                {(selectedMethod === 'Divisas' || selectedMethod === 'COP') && (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-black border border-emerald-500/40 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                        💵 CALCULADORA DE VUELTOS (EFECTIVO):
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={calcCurrency}
                          onChange={(e) => {
                            setCalcCurrency(e.target.value as 'USD' | 'COP' | 'Bs');
                            setCashTenderedUSD(''); setCashTenderedCOP(''); setCashTenderedBs('');
                            setChangeGivenUSD(''); setChangeGivenCOP(''); setChangeGivenBs('');
                          }}
                          className="px-2 py-1 rounded bg-black border border-emerald-500/50 text-xs text-white outline-none"
                        >
                          <option value="USD">Paga en USD</option>
                          <option value="COP">Paga en COP</option>
                        </select>
                      </div>
                    </div>

                    {/* Fila 1: Monto Entregado, Vuelto en USD Opcional y Vuelto Restante */}
                    {(() => {
                      const tenderedValForSingle = calcCurrency === 'USD' ? cashTenderedUSD : calcCurrency === 'COP' ? cashTenderedCOP : cashTenderedBs;
                      let tenderedUSDForSingle = parseFloat(tenderedValForSingle) || 0;
                      if (calcCurrency === 'COP') tenderedUSDForSingle = tenderedUSDForSingle / exchangeRates.COP;
                      if (calcCurrency === 'Bs') tenderedUSDForSingle = tenderedUSDForSingle / exchangeRates.Bs;

                      const totalChangeNeededUSDSingle = Math.max(0, tenderedUSDForSingle - (activeOrderForPay.totalUSD - (activeOrderForPay.paidAmountUSD || 0)));

                      const givenUsd = parseFloat(changeGivenUSD) || 0;
                      const givenCop = parseFloat(changeGivenCOP) || 0;
                      const givenBs = parseFloat(changeGivenBs) || 0;
                      const totalGivenChangeUSD = givenUsd + (givenCop / exchangeRates.COP) + (givenBs / exchangeRates.Bs);
                      const remainingChangeUSD = totalChangeNeededUSDSingle - totalGivenChangeUSD;

                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-300 block mb-1">
                                Monto Entregado por Cliente ({calcCurrency}):
                              </label>
                              <input
                                type="number"
                                placeholder={calcCurrency === 'COP' ? 'Ej: 50000' : 'Ej: 20'}
                                value={calcCurrency === 'USD' ? cashTenderedUSD : cashTenderedCOP}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (calcCurrency === 'USD') setCashTenderedUSD(val);
                                  if (calcCurrency === 'COP') setCashTenderedCOP(val);
                                }}
                                className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400"
                              />
                            </div>
                          </div>

                          {totalChangeNeededUSDSingle > 0 && (
                            <div className="p-4 rounded-2xl bg-black/80 border border-amber-500/40 space-y-3 mt-4">
                              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                <span className="text-xs font-black text-amber-300">VUELTO TOTAL A ENTREGAR:</span>
                                <span className="text-sm font-black text-emerald-400">${totalChangeNeededUSDSingle.toFixed(2)} USD</span>
                              </div>
                              
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                                ¿En qué monedas estás dando este vuelto al cliente?
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Dando en USD:</label>
                                  <input type="number" placeholder="Ej: 5" value={changeGivenUSD} onChange={(e) => setChangeGivenUSD(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Dando en COP:</label>
                                  <input type="number" placeholder="Ej: 20000" value={changeGivenCOP} onChange={(e) => setChangeGivenCOP(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-gray-300 block mb-1">Dando en Bs:</label>
                                  <input type="number" placeholder="Ej: 100" value={changeGivenBs} onChange={(e) => setChangeGivenBs(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                                </div>
                              </div>

                              <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/10 mt-2">
                                <span className="text-[10px] font-bold text-gray-300">RESTANTE POR ENTREGAR:</span>
                                <span className={`font-black text-base ${remainingChangeUSD > 0 ? 'text-amber-400' : remainingChangeUSD < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  ${remainingChangeUSD.toFixed(2)} USD
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (

              <div className="space-y-4">
                <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                  DESGLOSE DE PAGO DIVIDIDO MULTI-MONEDA:
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {splitRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-black/60 border border-white/10">
                      <select
                        value={row.method}
                        onChange={(e) => {
                          const val = e.target.value as PaymentMethod;
                          setSplitRows((prev) => prev.map((r, i) => (i === idx ? { ...r, method: val } : r)));
                        }}
                        className="px-3 py-2 rounded-lg bg-black text-white text-xs font-bold border border-white/20"
                      >
                        <option value="Divisas">💵 Divisas (USD)</option>
                        <option value="COP">🇨🇴 COP (Pesos)</option>
                        <option value="Bs">🇻🇪 Bs (Bolívares)</option>
                        <option value="Binance">🟡 Binance (Crypto)</option>
                      </select>

                      <div className="relative flex-1">
                        <span className="absolute left-3 top-2 text-xs text-gray-400">{row.method === 'Bs' ? 'Bs' : '$'}</span>
                        <input
                          type="number"
                          placeholder={`Monto en ${row.method}`}
                          value={row.amountLocal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amountLocal: val } : r)));
                          }}
                          className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setSplitRows((prev) => [...prev, { method: 'Binance', amountLocal: '' }])}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300"
                >
                  + Agregar otro Método de Pago
                </button>

                {/* Multi-currency breakdown summary */}
                {(() => {
                  const enteredUSD = splitRows.reduce((sum, r) => {
                    let usdVal = parseFloat(r.amountLocal) || 0;
                    if (r.method === 'COP') usdVal = usdVal / exchangeRates.COP;
                    if (r.method === 'Bs') usdVal = usdVal / exchangeRates.Bs;
                    return sum + usdVal;
                  }, 0);
                  const pendingUSD = activeOrderForPay.totalUSD - enteredUSD;
                  const changeUSD = Math.max(0, enteredUSD - activeOrderForPay.totalUSD);
                  const givenUsd = parseFloat(changeGivenUSD) || 0;
                  const givenCop = parseFloat(changeGivenCOP) || 0;
                  const givenBs = parseFloat(changeGivenBs) || 0;
                  const totalGivenChangeUSD = givenUsd + (givenCop / exchangeRates.COP) + (givenBs / exchangeRates.Bs);
                  const remainingChangeUSD = changeUSD - totalGivenChangeUSD;

                  return (
                    <div className="p-4 rounded-2xl bg-black/80 border border-amber-500/40 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Comanda:</span>
                        <span className="text-white font-bold">${activeOrderForPay.totalUSD.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Ingresado:</span>
                        <span className="text-amber-300 font-bold">${enteredUSD.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-2 font-black">
                        <span>{pendingUSD > 0 ? 'Saldo Pendiente:' : 'Vuelto Total a Entregar:'}</span>
                        <span className={pendingUSD > 0 ? 'text-red-400 text-sm' : 'text-emerald-400 text-sm'}>
                          ${Math.abs(pendingUSD).toFixed(2)} USD {pendingUSD <= 0 && `($${Math.round(changeUSD * exchangeRates.COP).toLocaleString()} COP)`}
                        </span>
                      </div>

                      {changeUSD > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                          <div className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-2">
                            💵 REGISTRAR VUELTOS ENTREGADOS AL CLIENTE:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-300 block mb-1">Vuelto en USD:</label>
                              <input type="number" placeholder="Ej: 5" value={changeGivenUSD} onChange={(e) => setChangeGivenUSD(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-300 block mb-1">Vuelto en COP:</label>
                              <input type="number" placeholder="Ej: 20000" value={changeGivenCOP} onChange={(e) => setChangeGivenCOP(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-300 block mb-1">Vuelto en Bs:</label>
                              <input type="number" placeholder="Ej: 100" value={changeGivenBs} onChange={(e) => setChangeGivenBs(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400" />
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center bg-black/40 p-2 rounded-xl border border-white/10">
                            <span className="text-[10px] font-bold text-gray-300">VUELTO RESTANTE POR ENTREGAR:</span>
                            <span className={`font-black text-sm ${remainingChangeUSD > 0 ? 'text-amber-400' : remainingChangeUSD < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              ${remainingChangeUSD.toFixed(2)} USD
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setActiveOrderForPay(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmPay}
                disabled={isSubmittingPay}
                className={`flex-1 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-900/50 ${
                  isSubmittingPay ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {isSubmittingPay ? 'PROCESANDO COBRO...' : 'CONFIRMAR COBRO TOTAL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COBRO AGRUPADO DE MÚLTIPLES COMANDAS POR MESA */}
      {isMultiPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase">COBRO MULTI-COMANDA</span>
                <h3 className="text-xl font-black text-white">{selectedOrderIdsForMultiPay.length} Comandas Seleccionadas</h3>
              </div>
              <button onClick={() => setIsMultiPayModalOpen(false)} className="text-gray-400 hover:text-white">
                <IoCloseCircle size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 max-h-36 overflow-y-auto p-3 rounded-2xl bg-black/60 border border-white/10 text-xs">
                {multiPayOrders.map((ord) => (
                  <div key={ord.id} className="flex justify-between items-center text-gray-300">
                    <span>{ord.orderNumber} ({ord.type.toUpperCase()})</span>
                    <strong className="text-emerald-400">${ord.totalUSD.toFixed(2)} USD</strong>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-2">Método de Pago Unificado:</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Divisas', 'COP', 'Bs', 'Binance'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMethod(m)}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                        selectedMethod === m
                          ? 'bg-amber-500 text-black border-amber-400 font-black'
                          : 'bg-white/[0.04] border-white/10 text-gray-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/80 border border-amber-500/40 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Total Agrupado USD:</span>
                  <span className="text-amber-300 font-black text-lg">${multiPayTotalUSD.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Total Agrupado COP:</span>
                  <span className="text-white font-bold">${Math.round(multiPayTotalUSD * exchangeRates.COP).toLocaleString()} COP</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsMultiPayModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmMultiPay}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition-all shadow-lg"
              >
                CONFIRMAR COBRO EN LOTE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAGO DIVIDIDO POR PERSONAS / SELECCIÓN DE ÍTEMS */}
      {activeOrderForSplitItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-blue-500/40 rounded-3xl p-6 shadow-2xl space-y-6 text-white max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-black text-blue-400 uppercase">COBRO INDIVIDUAL POR PERSONA</span>
                <h3 className="text-xl font-black text-white">Comanda {activeOrderForSplitItems.orderNumber}</h3>
              </div>
              <button onClick={() => setActiveOrderForSplitItems(null)} className="text-gray-400 hover:text-white">
                <IoCloseCircle size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Nombre / Identificador de la Persona:</label>
                <input
                  type="text"
                  value={splitPayerName}
                  onChange={(e) => setSplitPayerName(e.target.value)}
                  placeholder="Ej: Persona 1 - Carlos, Ana, Tío Pedro"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/80 border border-white/20 text-white text-xs outline-none focus:border-blue-400 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black text-blue-300 block mb-2 uppercase tracking-wider">
                  SELECCIONA LOS ÍTEMS QUE PAGA ESTA PERSONA:
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeOrderForSplitItems.items.map((it) => {
                    const isAlreadyPaid = it.isPaidIndividually;
                    const isSelected = selectedItemIdsForSplitPay.includes(it.id);

                    return (
                      <div
                        key={it.id}
                        onClick={() => {
                          if (isAlreadyPaid) return;
                          setSelectedItemIdsForSplitPay((prev) =>
                            prev.includes(it.id) ? prev.filter((id) => id !== it.id) : [...prev, it.id]
                          );
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isAlreadyPaid
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-gray-400 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500/20 border-blue-400 text-white font-bold ring-2 ring-blue-400/40'
                            : 'bg-black/60 border-white/10 text-gray-300 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            disabled={isAlreadyPaid}
                            checked={isSelected || isAlreadyPaid}
                            onChange={() => {}}
                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                          />
                          <div>
                            <div className="text-xs font-bold">{it.quantity}x {it.productName}</div>
                            {isAlreadyPaid && (
                              <span className="text-[10px] text-emerald-400 font-extrabold">✓ Pagado por {it.paidByName}</span>
                            )}
                          </div>
                        </div>

                        <span className="text-xs font-black text-emerald-400">${(it.price * it.quantity).toFixed(2)} USD</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subtotal of Selected Items */}
              {(() => {
                const selectedItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
                const splitSubtotalUSD = selectedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

                return (
                  <div className="p-4 rounded-2xl bg-black/80 border border-blue-500/40 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Subtotal a Cobrar a {splitPayerName}:</span>
                      <span className="text-blue-300 font-black text-lg">${splitSubtotalUSD.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Equivalente COP:</span>
                      <span className="text-white font-bold">${Math.round(splitSubtotalUSD * exchangeRates.COP).toLocaleString()} COP</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-white/10">
                      <span className="text-amber-300 font-semibold">Equivalente en Bs (Tasa {exchangeRates.Bs}):</span>
                      <span className="text-amber-300 font-black text-sm">{(splitSubtotalUSD * exchangeRates.Bs).toFixed(2)} Bs</span>
                    </div>
                  </div>
                );
              })()}

              {/* Method Selector */}
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-2">Método de Pago para esta Persona:</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Divisas', 'COP', 'Bs', 'Binance'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMethod(m)}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                        selectedMethod === m
                          ? 'bg-blue-500 text-black border-blue-400 font-black'
                          : 'bg-white/[0.04] border-white/10 text-gray-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* MENSAJE PARA METODOS ELECTRONICOS / TRANSFERENCIA (Bs, Binance) */}
              {(selectedMethod === 'Bs' || selectedMethod === 'Binance') && (
                <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 space-y-1">
                  <div className="font-bold text-blue-300 text-sm flex items-center gap-1.5">
                    <span>📲 Pago por Transferencia / Electrónico ({selectedMethod}):</span>
                  </div>
                  {selectedMethod === 'Bs' && (() => {
                    const selItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
                    const targetUSD = selItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
                    return (
                      <div className="text-base font-black text-amber-300 py-1">
                        Monto exacto a transferir: {(targetUSD * exchangeRates.Bs).toFixed(2)} Bs
                      </div>
                    );
                  })()}
                  <div className="text-[11px] text-blue-300/80">
                    Este método es por el monto exacto por transferencia. No aplica calculadora de vuelto.
                  </div>
                </div>
              )}

              {/* CALCULADORA DE VUELTOS AUTOMATICA (SOLO PARA DIVISAS Y COP) */}
              {(selectedMethod === 'Divisas' || selectedMethod === 'COP') && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-black border border-emerald-500/40 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-emerald-400 uppercase tracking-wider">
                      💵 CALCULADORA DE VUELTO PARA {splitPayerName.toUpperCase()}:
                    </span>
                    <select
                      value={changeCurrency}
                      onChange={(e) => setChangeCurrency(e.target.value as 'USD' | 'COP' | 'Bs')}
                      className="bg-black text-emerald-400 text-[10px] font-bold border border-emerald-500/40 px-2 py-0.5 rounded outline-none"
                    >
                      <option value="USD">Vuelto en USD</option>
                      <option value="COP">Vuelto en COP</option>
                      <option value="Bs">Vuelto en Bs</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-gray-300 block mb-1">
                        Recibido en {selectedMethod}:
                      </label>
                      <input
                        type="number"
                        placeholder={selectedMethod === 'COP' ? 'Ej: 50000' : 'Ej: 20'}
                        value={selectedMethod === 'COP' ? cashTenderedCOP : cashTenderedUSD}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (selectedMethod === 'COP') setCashTenderedCOP(val);
                          else setCashTenderedUSD(val);

                          const selItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
                          const targetUSD = selItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

                          const res = calcChangeBreakdown(val, selectedMethod === 'COP' ? 'COP' : 'USD', userGivenUSD, changeCurrency, targetUSD);
                          setChangeGivenUSD(res.usd);
                          setChangeGivenCOP(res.cop);
                          setChangeGivenBs(res.bs);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-white/20 text-white text-xs font-bold outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-amber-300 block mb-1">
                        Dar Vuelto en $ (USD):
                      </label>
                      <input
                        type="number"
                        placeholder="Ej: 10 (Opcional)"
                        value={userGivenUSD}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserGivenUSD(val);

                          const selItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
                          const targetUSD = selItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

                          const tenderedVal = selectedMethod === 'COP' ? cashTenderedCOP : cashTenderedUSD;
                          const res = calcChangeBreakdown(tenderedVal, selectedMethod === 'COP' ? 'COP' : 'USD', val, changeCurrency, targetUSD);
                          setChangeGivenUSD(res.usd);
                          setChangeGivenCOP(res.cop);
                          setChangeGivenBs(res.bs);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-amber-500/40 text-amber-300 text-xs font-bold outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-gray-300">Vuelto Restante:</label>
                        <select
                          value={changeCurrency}
                          onChange={(e) => {
                            const curr = e.target.value as 'USD' | 'COP' | 'Bs';
                            setChangeCurrency(curr);

                            const selItems = activeOrderForSplitItems.items.filter((it) => selectedItemIdsForSplitPay.includes(it.id));
                            const targetUSD = selItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

                            const tenderedVal = selectedMethod === 'COP' ? cashTenderedCOP : cashTenderedUSD;
                            const res = calcChangeBreakdown(tenderedVal, selectedMethod === 'COP' ? 'COP' : 'USD', userGivenUSD, curr, targetUSD);
                            setChangeGivenUSD(res.usd);
                            setChangeGivenCOP(res.cop);
                            setChangeGivenBs(res.bs);
                          }}
                          className="bg-transparent text-emerald-400 text-[10px] font-bold outline-none"
                        >
                          <option value="USD">en USD</option>
                          <option value="COP">en COP</option>
                          <option value="Bs">en Bs</option>
                        </select>
                      </div>
                      <div className="w-full px-3 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-black flex flex-col justify-center min-h-[38px]">
                        {parseFloat(changeGivenUSD) > 0 && changeCurrency !== 'USD' && (
                          <span className="text-amber-300 font-extrabold text-[10px]">💵 ${parseFloat(changeGivenUSD).toFixed(2)} USD</span>
                        )}
                        <span>
                          {changeCurrency === 'USD' && `💵 $${parseFloat(changeGivenUSD || '0').toFixed(2)} USD`}
                          {changeCurrency === 'COP' && `🇨🇴 $${parseInt(changeGivenCOP || '0', 10).toLocaleString()} COP`}
                          {changeCurrency === 'Bs' && `🇻🇪 ${parseFloat(changeGivenBs || '0').toFixed(2)} Bs`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setActiveOrderForSplitItems(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmSplitItemPay}
                disabled={selectedItemIdsForSplitPay.length === 0 || isSubmittingPay}
                className={`flex-1 py-3 rounded-xl bg-blue-500 text-black font-black text-xs hover:bg-blue-400 transition-all shadow-lg shadow-blue-900/50 ${
                  isSubmittingPay || selectedItemIdsForSplitPay.length === 0 ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {isSubmittingPay ? 'PROCESANDO PAGO...' : `PROCESAR PAGO DE ${splitPayerName.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
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

      {/* MODAL CIERRE & ARQUEO DE CAJA */}
      {isCierreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-[#0B2A1A] to-[#070707] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
              <IoLockClosedOutline className="text-amber-400" />
              <span>CIERRE Y ARQUEO DE CAJA</span>
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Conteo Real en Efectivo (USD $):</label>
                <input
                  type="number"
                  placeholder="Ej: 150.00"
                  value={cierreActualUSD}
                  onChange={(e) => setCierreActualUSD(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Conteo Real en Pesos (COP $):</label>
                <input
                  type="number"
                  placeholder="Ej: 250000"
                  value={cierreActualCOP}
                  onChange={(e) => setCierreActualCOP(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Notas de Cierre / Observaciones:</label>
                <input
                  type="text"
                  placeholder="Ej: Cierre de turno noche sin novedades"
                  value={cierreNotes}
                  onChange={(e) => setCierreNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>

              {cierreResult && (
                <div className="p-4 rounded-2xl bg-black/60 border border-emerald-500/40 text-xs space-y-1">
                  <div className="text-emerald-400 font-black">✓ Cierre Registrado Exitosamente</div>
                  <div className="text-gray-300">Esperado: ${cierreResult.expectedUSD?.toFixed(2)} USD</div>
                  <div className="text-gray-300">Contado: ${cierreResult.actualUSD?.toFixed(2)} USD</div>
                  <div className={cierreResult.differenceUSD >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    Cuadre: ${cierreResult.differenceUSD?.toFixed(2)} USD
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setIsCierreModalOpen(false); setCierreResult(null); }}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold text-xs"
              >
                CERRAR
              </button>
              <button
                onClick={handleCierreSubmit}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 shadow-lg"
              >
                PROCESAR CIERRE
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

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Monto USD ($):</label>
                <input
                  type="number"
                  placeholder="Ej: 5.00"
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
                          </div>
                          <span className="font-black text-emerald-400">${(p.amountPaidUSD || 0).toFixed(2)} USD</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex justify-between text-xs text-gray-300 pt-1 border-t border-white/10">
                      <span>Método de Pago:</span>
                      <span className="font-bold text-white">{historicDetailOrder.paymentMethod || 'Divisas'}</span>
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
    </div>
  );
};

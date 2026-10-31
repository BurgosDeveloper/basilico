import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../data/mockData';
import { OrderDetailModal } from './OrderDetailModal';
import { roundCOP } from '../utils/currencyRounding';
import {
  IoClose,
  IoSearchOutline,
  IoCalendarOutline,
  IoReceiptOutline,
  IoPersonOutline,
  IoChevronBack,
  IoChevronForward,
  IoRefreshOutline,
  IoWarningOutline,
  IoEyeOutline,
} from 'react-icons/io5';

interface HistoricOrdersSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricOrdersSearchModal: React.FC<HistoricOrdersSearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { fetchHistoricOrders, exchangeRates, userSession } = useApp();

  // Filters state
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<'todos' | 'manana' | 'noche'>('todos');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'todos' | 'pagado' | 'credito' | 'no_pagado' | 'cancelado'>('todos');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'todos' | 'mesa' | 'delivery' | 'pickup'>('todos');
  const [archivedFilter, setArchivedFilter] = useState<'todos' | 'archived' | 'active'>('todos');
  const [activePreset, setActivePreset] = useState<'todo' | 'hoy' | 'ayer' | 'semana' | 'mes' | 'custom'>('todo');

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const pageSize = 30;

  // Data state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalUSD: number;
    totalPaidUSD: number;
    totalPages: number;
  }>({
    totalCount: 0,
    totalUSD: 0,
    totalPaidUSD: 0,
    totalPages: 1,
  });

  // Selected order for detailed full inspection
  const [inspectingOrder, setInspectingOrder] = useState<Order | null>(null);

  // Core search runner that accepts override params for immediate execution
  const doSearch = useCallback(async (
    targetPage = 1,
    overrides?: {
      from?: string;
      to?: string;
      search?: string;
      shift?: 'todos' | 'manana' | 'noche';
      paymentStatus?: 'todos' | 'pagado' | 'credito' | 'no_pagado' | 'cancelado';
      orderType?: 'todos' | 'mesa' | 'delivery' | 'pickup';
      archived?: 'todos' | 'archived' | 'active';
    }
  ) => {
    setIsLoading(true);
    setErrorMessage('');

    const effFrom = overrides && overrides.from !== undefined ? overrides.from : fromDate;
    const effTo = overrides && overrides.to !== undefined ? overrides.to : toDate;
    const effSearch = overrides && overrides.search !== undefined ? overrides.search : searchQuery;
    const effShift = overrides && overrides.shift !== undefined ? overrides.shift : shiftFilter;
    const effPayStatus = overrides && overrides.paymentStatus !== undefined ? overrides.paymentStatus : paymentStatusFilter;
    const effOrderType = overrides && overrides.orderType !== undefined ? overrides.orderType : orderTypeFilter;
    const effArchived = overrides && overrides.archived !== undefined ? overrides.archived : archivedFilter;

    try {
      const resp = await fetchHistoricOrders({
        from: effFrom || undefined,
        to: effTo || undefined,
        search: effSearch.trim() || undefined,
        shift: effShift,
        paymentStatus: effPayStatus === 'todos' ? undefined : effPayStatus,
        orderType: effOrderType === 'todos' ? undefined : effOrderType,
        archived: effArchived === 'todos' ? undefined : effArchived,
        limit: pageSize,
        page: targetPage,
      });

      setOrders(resp.orders || []);
      setSummary({
        totalCount: resp.summary?.totalCount || 0,
        totalUSD: resp.summary?.totalUSD || 0,
        totalPaidUSD: resp.summary?.totalPaidUSD || 0,
        totalPages: resp.summary?.totalPages || 1,
      });
      setPage(targetPage);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al consultar historial de comandas.');
      setOrders([]);
      setSummary({ totalCount: 0, totalUSD: 0, totalPaidUSD: 0, totalPages: 1 });
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistoricOrders, fromDate, toDate, searchQuery, shiftFilter, paymentStatusFilter, orderTypeFilter, archivedFilter]);

  // Quick preset helper with direct execution
  const applyPresetAndSearch = useCallback((preset: 'hoy' | 'ayer' | 'semana' | 'mes' | 'todo') => {
    setActivePreset(preset);
    let targetFrom = '';
    let targetTo = '';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatDt = (d: Date, timeStr: string) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${timeStr}`;

    if (preset === 'hoy') {
      targetFrom = formatDt(now, '00:00');
      targetTo = formatDt(now, '23:59');
    } else if (preset === 'ayer') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      targetFrom = formatDt(yesterday, '00:00');
      targetTo = formatDt(yesterday, '23:59');
    } else if (preset === 'semana') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      targetFrom = formatDt(sevenDaysAgo, '00:00');
      targetTo = formatDt(now, '23:59');
    } else if (preset === 'mes') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      targetFrom = formatDt(firstDay, '00:00');
      targetTo = formatDt(now, '23:59');
    } else if (preset === 'todo') {
      targetFrom = '';
      targetTo = '';
    }

    setFromDate(targetFrom);
    setToDate(targetTo);
    doSearch(1, { from: targetFrom, to: targetTo });
  }, [doSearch]);

  // Initial load when modal opens: Show all historical orders by default
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setFromDate('');
        setToDate('');
        setActivePreset('todo');
        doSearch(1, { from: '', to: '' });
      }
    } else {
      hasInitializedRef.current = false;
    }
  }, [isOpen, doSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-6xl overflow-hidden flex flex-col h-[94vh]">
        {/* Header Superior Claro */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-800 font-black shrink-0 shadow-xs">
              <IoSearchOutline size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Búsqueda & Detalle de Comandas Anteriores
                </h2>
                <span className="px-2.5 py-0.5 rounded-xl bg-emerald-100 text-emerald-950 border border-emerald-300 font-black text-xs uppercase tracking-wider">
                  Historial Completo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
                Consulta cualquier comanda por fecha, número o cliente con el 100% de su detalle guardado (pizzas, mitades, contornos y pagos).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-700 transition-all cursor-pointer shrink-0"
            title="Cerrar búsqueda"
          >
            <IoClose size={24} />
          </button>
        </div>

        {/* Panel de Filtros y Búsqueda */}
        <div className="bg-slate-50 border-b border-gray-200 p-4 sm:p-5 shrink-0 space-y-3">
          {/* Botones de Presets Rápidos */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider mr-1 flex items-center gap-1">
              <IoCalendarOutline /> Filtro Rápido:
            </span>
            <button
              type="button"
              onClick={() => applyPresetAndSearch('todo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                activePreset === 'todo'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
              }`}
            >
              🌐 Todo el Historial
            </button>
            <button
              type="button"
              onClick={() => applyPresetAndSearch('hoy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                activePreset === 'hoy'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
              }`}
            >
              📅 Hoy
            </button>
            <button
              type="button"
              onClick={() => applyPresetAndSearch('ayer')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                activePreset === 'ayer'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
              }`}
            >
              ⏪ Ayer
            </button>
            <button
              type="button"
              onClick={() => applyPresetAndSearch('semana')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                activePreset === 'semana'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
              }`}
            >
              🗓️ Últimos 7 Días
            </button>
            <button
              type="button"
              onClick={() => applyPresetAndSearch('mes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                activePreset === 'mes'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
              }`}
            >
              📆 Este Mes
            </button>
          </div>

          {/* Formulario de Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">
                Desde (Fecha/Hora)
              </label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setActivePreset('custom'); }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 text-xs font-semibold outline-none focus:border-emerald-500 shadow-xs transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">
                Hasta (Fecha/Hora)
              </label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setActivePreset('custom'); }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 text-xs font-semibold outline-none focus:border-emerald-500 shadow-xs transition-all"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">
                Buscar (# Comanda, Cliente, Deudor, Mesa...)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ej: 1, 6, daniel, Perez, Mesa 3..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') doSearch(1); }}
                  className="w-full pl-8 pr-8 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 text-xs font-semibold outline-none focus:border-emerald-500 shadow-xs transition-all"
                />
                <IoSearchOutline className="absolute left-2.5 top-2.5 text-gray-400 text-sm" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); doSearch(1, { search: '' }); }}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-black cursor-pointer"
                  >
                    <IoClose size={14} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">
                Turno
              </label>
              <select
                value={shiftFilter}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setShiftFilter(val);
                  doSearch(1, { shift: val });
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-gray-300 text-gray-900 text-xs font-semibold outline-none focus:border-emerald-500 shadow-xs"
              >
                <option value="todos">⚖️ Todos los turnos</option>
                <option value="manana">🌅 Mañana</option>
                <option value="noche">🌙 Noche</option>
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => doSearch(1)}
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="animate-pulse">⏳ BUSCANDO...</span>
                ) : (
                  <>
                    <IoSearchOutline className="text-base" />
                    <span>BUSCAR</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filtros secundarios: Estado de pago, Tipo y Archivo */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-200 text-xs">
            <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider mr-1">
              Filtros:
            </span>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[11px]">Pago:</span>
              <select
                value={paymentStatusFilter}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPaymentStatusFilter(val);
                  doSearch(1, { paymentStatus: val });
                }}
                className="px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs font-bold"
              >
                <option value="todos">Todos</option>
                <option value="pagado">✅ Pagados</option>
                <option value="credito">⚠️ Créditos</option>
                <option value="no_pagado">❌ Pendientes</option>
                <option value="cancelado">🚫 Cancelados</option>
              </select>
            </div>

            <div className="flex items-center gap-1 ml-2">
              <span className="text-gray-500 text-[11px]">Servicio:</span>
              <select
                value={orderTypeFilter}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setOrderTypeFilter(val);
                  doSearch(1, { orderType: val });
                }}
                className="px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs font-bold"
              >
                <option value="todos">Todos</option>
                <option value="mesa">🍽️ Mesa</option>
                <option value="delivery">🛵 Delivery</option>
                <option value="pickup">🛍️ Para Llevar</option>
              </select>
            </div>

            <div className="flex items-center gap-1 ml-2">
              <span className="text-gray-500 text-[11px]">Archivo:</span>
              <select
                value={archivedFilter}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setArchivedFilter(val);
                  doSearch(1, { archived: val });
                }}
                className="px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs font-bold"
              >
                <option value="todos">📦 Todas las Comandas</option>
                <option value="archived">🏛️ Solo Archivadas</option>
                <option value="active">🟢 Solo Turno Actual</option>
              </select>
            </div>
          </div>
        </div>

        {/* Barra de Estadísticas y Resultados */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0 flex-wrap gap-2 text-xs shadow-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-black text-slate-800">
              Encontradas: <span className="text-emerald-700 font-extrabold">{summary.totalCount} comandas</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-gray-700">
              Facturado: <span className="text-slate-900 font-black">${summary.totalUSD.toFixed(2)} USD</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-gray-700">
              Cobrado: <span className="text-emerald-700 font-black">${summary.totalPaidUSD.toFixed(2)} USD</span>
            </span>
            {summary.totalUSD - summary.totalPaidUSD > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <span className="font-bold text-gray-700">
                  Por Cobrar: <span className="text-amber-800 font-black">${(summary.totalUSD - summary.totalPaidUSD).toFixed(2)} USD</span>
                </span>
              </>
            )}
          </div>

          {/* Paginación Header */}
          {summary.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[11px] font-bold">
                Pág. {page} de {summary.totalPages}
              </span>
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => doSearch(page - 1)}
                className="p-1 rounded-lg bg-gray-100 border border-gray-300 hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                title="Página anterior"
              >
                <IoChevronBack size={14} />
              </button>
              <button
                type="button"
                disabled={page >= summary.totalPages || isLoading}
                onClick={() => doSearch(page + 1)}
                className="p-1 rounded-lg bg-gray-100 border border-gray-300 hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                title="Página siguiente"
              >
                <IoChevronForward size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Área de Contenido Principal (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm font-bold flex items-center gap-2">
              <IoWarningOutline className="text-lg shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-500">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-gray-700">
                Consultando comandas históricas en la base de datos...
              </span>
            </div>
          ) : orders.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-center text-gray-500 bg-white rounded-3xl border border-dashed border-gray-300 p-8">
              <IoReceiptOutline className="text-5xl text-gray-300 mb-1" />
              <h3 className="text-base font-black text-gray-700">No se encontraron comandas</h3>
              <p className="text-xs text-gray-500 max-w-md">
                No hay comandas que coincidan con los filtros seleccionados. Prueba seleccionando "Todo el Historial" o limpiando el texto de búsqueda.
              </p>
              <button
                type="button"
                onClick={() => applyPresetAndSearch('todo')}
                className="mt-3 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-950 text-xs font-black border border-emerald-300 transition-all cursor-pointer"
              >
                🌐 Ver Todo el Historial Sin Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {orders.map((ord) => {
                const isPaid = ord.paymentStatus === 'pagado';
                const isCredito = ord.paymentStatus === 'credito';
                const isDelivered = ord.status === 'entregada';
                const isCancelled = ord.status === 'cancelado';
                const cleanNum = ord.orderNumber.toString().replace(/^#+/, '');
                const ordDate = ord.createdAt ? new Date(ord.createdAt) : null;
                const formattedDate = ordDate && !isNaN(ordDate.getTime())
                  ? ordDate.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '';
                const formattedTime = ordDate && !isNaN(ordDate.getTime())
                  ? ordDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                const totalCOP = roundCOP(ord.totalUSD * (ord.copRateAtPayment || exchangeRates.COP));
                const totalBs = (ord.totalUSD * (ord.bsRateAtPayment || exchangeRates.Bs)).toFixed(2);

                const itemsSummary = (ord.items || [])
                  .map((it) => `${it.quantity}x ${it.productName}${it.size && ord.shift !== 'manana' ? ` (${it.size})` : ''}`)
                  .join(', ');

                return (
                  <div
                    key={ord.id}
                    className="bg-white rounded-2xl border border-gray-200 hover:border-emerald-400 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                  >
                    {/* Tarjeta: Cabecera */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-black text-slate-900 tracking-tight">
                            #{cleanNum}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-950 font-black text-[11px] uppercase border border-emerald-300">
                            {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'delivery' ? '🛵 Delivery' : '🛍️ Llevar'}
                          </span>
                          {ord.shift && (
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                                ord.shift === 'manana'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                              }`}
                            >
                              {ord.shift === 'manana' ? '🌅 Mañana' : '🌙 Noche'}
                            </span>
                          )}
                          {ord.archivedAt && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300">
                              Archivada
                            </span>
                          )}
                          {isDelivered && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              Entregada
                            </span>
                          )}
                        </div>

                        {/* Badge de Estado de Pago */}
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border shrink-0 ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : isCredito
                              ? 'bg-yellow-100 text-yellow-900 border-yellow-400'
                              : isCancelled
                              ? 'bg-gray-100 text-gray-600 border-gray-300'
                              : 'bg-red-100 text-red-900 border-red-300'
                          }`}
                        >
                          {isPaid ? '💳 Pagado' : isCredito ? '⚠️ Crédito' : isCancelled ? '🚫 Cancelado' : '❌ Pendiente'}
                        </span>
                      </div>

                      {/* Datos del Cliente y Fecha */}
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 flex items-center gap-1 truncate max-w-[190px]">
                            <IoPersonOutline className="shrink-0" />
                            <span className="truncate">{ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : 'Cliente General')}</span>
                          </span>
                          <span className="text-[11px] text-gray-500 shrink-0 font-medium">
                            📅 {formattedDate} {formattedTime}
                          </span>
                        </div>

                        {ord.debtorName && (
                          <div className="text-[11px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            🏷️ Deudor: {ord.debtorName}
                          </div>
                        )}

                        {ord.waiterName && (
                          <div className="text-[11px] text-gray-500">
                            👤 Mesero: {ord.waiterName}
                          </div>
                        )}
                      </div>

                      {/* Resumen de Productos */}
                      <div className="mt-2.5 pt-2 border-t border-gray-100 text-xs">
                        <span className="text-[10px] font-black uppercase text-gray-400 block mb-0.5">
                          Ítems ({ord.items?.length || 0}):
                        </span>
                        <p className="text-gray-800 font-semibold line-clamp-2 text-xs leading-snug">
                          {itemsSummary || 'Sin ítems registrados'}
                        </p>
                      </div>
                    </div>

                    {/* Tarjeta: Pie Financiero y Botón de Detalle */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-base font-black text-slate-900">
                          ${ord.totalUSD.toFixed(2)} <span className="text-[11px] font-bold text-gray-500">USD</span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-bold">
                          🇨🇴 {totalCOP.toLocaleString()} COP | 🇻🇪 {totalBs} Bs
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setInspectingOrder(ord)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        title="Ver todo el detalle guardado de esta comanda"
                      >
                        <IoEyeOutline className="text-sm" />
                        <span>VER DETALLE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Inferior con Paginación */}
        <div className="bg-white border-t border-gray-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs border border-gray-300 transition-all cursor-pointer"
            >
              CERRAR HISTORIAL
            </button>
            <button
              type="button"
              onClick={() => doSearch(page)}
              disabled={isLoading}
              className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs border border-gray-300 transition-all flex items-center gap-1 cursor-pointer"
              title="Refrescar lista"
            >
              <IoRefreshOutline />
              <span>Refrescar</span>
            </button>
          </div>

          {/* Controles de Paginación Inferiores */}
          {summary.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs font-bold">
                Página {page} de {summary.totalPages} ({summary.totalCount} registros)
              </span>
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => doSearch(page - 1)}
                className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-300 font-bold text-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <IoChevronBack /> Anterior
              </button>
              <button
                type="button"
                disabled={page >= summary.totalPages || isLoading}
                onClick={() => doSearch(page + 1)}
                className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-300 font-bold text-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                Siguiente <IoChevronForward />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Visor de Detalle Exhaustivo de la Comanda (Solo Lectura) */}
      {inspectingOrder && (
        <OrderDetailModal
          order={inspectingOrder}
          isOpen={!!inspectingOrder}
          onClose={() => setInspectingOrder(null)}
          exchangeRates={exchangeRates}
          isReadOnly={true}
          userRole={userSession?.role}
        />
      )}
    </div>
  );
};

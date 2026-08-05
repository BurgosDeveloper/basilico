import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useSearchParams } from 'react-router-dom';
import { Order } from '../data/mockData';
import {
  IoFlame,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoReaderOutline,
  IoCheckmarkDone,
  IoBagOutline,
  IoPersonOutline,
  IoDocumentTextOutline,
  IoCloseCircleOutline,
  IoAddCircleOutline,
  IoTimerOutline,
} from 'react-icons/io5';

export const requiresKitchenPrep = (order: Order): boolean => {
  if (!order || !order.items || order.items.length === 0) return false;
  return order.items.some((it) => {
    const nameLower = (it.productName || '').toLowerCase();
    const isSoda =
      nameLower.includes('coca') ||
      nameLower.includes('pepsi') ||
      nameLower.includes('refresco') ||
      nameLower.includes('gaseosa') ||
      nameLower.includes('nestea') ||
      nameLower.includes('agua') ||
      nameLower.includes('7up') ||
      nameLower.includes('sprite');
    if (isSoda) return false;
    return true;
  });
};

export const CocinaPage: React.FC = () => {
  const { orders, updateOrderStatus, isConnected, userSession } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pendientes';
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const getElapsedMinutes = (createdAt?: string) => {
    if (!createdAt) return 0;
    const createdMs = new Date(createdAt).getTime();
    if (isNaN(createdMs)) return 0;
    const diffMs = now - createdMs;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 0 || mins > 300) return 0;
    return mins;
  };

  const kitchenOrders = orders.filter((o) => requiresKitchenPrep(o) && o.status !== 'fusionada' && o.status !== 'cancelado' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift));
  const pendingOrders = kitchenOrders.filter((o) => o.status === 'en_preparacion');
  const readyOrders = kitchenOrders.filter((o) => o.status === 'preparada');

  const displayedOrders = activeTab === 'listas' ? readyOrders : pendingOrders;

  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);

  const handleMarkReady = async (orderId: string) => {
    if (submittingOrderId === orderId) return;
    setSubmittingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, 'preparada');
      setSearchParams({ tab: 'listas' });
    } finally {
      setSubmittingOrderId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-white">
      {/* Offline Status Warning Banner */}
      {!isConnected && (
        <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300 font-black text-xs flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-2">
            <IoTimeOutline className="text-xl shrink-0" />
            <span>⚠️ SIN CONEXIÓN LAN DIRECTA — Intentando reconectar con la PC servidor...</span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-black text-[10px] uppercase font-black">
            MODO RECONEXIÓN
          </span>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/80 border border-amber-500/30 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0B2A1A] border border-amber-500/40 flex items-center justify-center shadow-lg">
            <IoFlame className="text-3xl text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Cocina & Horno</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider">
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-[#D8E6DF]/70 mt-1">
              Monitoreo en tiempo real de pizzas, jugos naturales y preparación de pedidos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10">
          <button
            onClick={() => setSearchParams({ tab: 'pendientes' })}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab !== 'listas'
                ? 'bg-amber-500 text-black shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoFlame />
            <span>COMANDAS EN COCINA ({pendingOrders.length})</span>
          </button>

          <button
            onClick={() => setSearchParams({ tab: 'listas' })}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'listas'
                ? 'bg-emerald-500 text-black shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoCheckmarkCircle />
            <span>COMANDAS LISTAS ({readyOrders.length})</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <IoReaderOutline className="text-amber-400 text-xl" />
            <span>{activeTab === 'listas' ? 'COMANDAS LISTAS EN COCINA' : 'COMANDAS EN PREPARACIÓN'}</span>
          </h2>
          <span className="text-xs text-gray-400 font-bold">Total: {displayedOrders.length} en pantalla</span>
        </div>

        {displayedOrders.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-white/[0.02] border border-white/10 space-y-3">
            <IoCheckmarkDone className="text-5xl text-emerald-400 mx-auto" />
            <h3 className="text-lg font-black text-white">
              {activeTab === 'listas' ? 'No hay comandas listas sin entregar en este momento.' : 'Cocina Despejada'}
            </h3>
            <p className="text-xs text-gray-400">
              {activeTab === 'listas'
                ? 'Las comandas marcadas como preparadas aparecerán aquí.'
                : 'Las nuevas comandas tomadas por el mesero aparecerán aquí en vivo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedOrders.map((ord) => {
              const isPrepared = ord.status === 'preparada';
              const isOrderEdited = ord.isEdited || (ord as any).is_edited;
              const elapsedMins = getElapsedMinutes(ord.createdAt);

              return (
                <div
                  key={ord.id}
                  className={`p-6 rounded-3xl border backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-6 transition-all duration-300 ${
                    isOrderEdited
                      ? 'bg-gradient-to-br from-cyan-950 via-[#070707] to-blue-950 border-cyan-400 shadow-2xl shadow-cyan-500/40 ring-4 ring-cyan-400/80 animate-pulse'
                      : isPrepared
                      ? 'bg-gradient-to-br from-emerald-950/80 via-[#070707] to-emerald-950/40 border-emerald-400 shadow-emerald-950/60'
                      : 'bg-gradient-to-br from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/40 border-amber-500/40 shadow-amber-950/40'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white">{ord.orderNumber}</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-md bg-white/10 font-black uppercase text-amber-300 border border-amber-500/30">
                            {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-emerald-400 font-bold mt-1.5 flex items-center gap-1.5 break-words">
                          <IoPersonOutline />
                          <span>👤 Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1.5">
                        {isOrderEdited && (
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-cyan-400 text-black border border-cyan-200 shadow-xl shadow-cyan-500/50 animate-bounce flex items-center gap-1">
                            🚨 COMANDA CORREGIDA / EDITADA
                          </span>
                        )}
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            isPrepared
                              ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg'
                              : 'bg-amber-500 text-black border-amber-400 shadow-lg animate-pulse'
                          }`}
                        >
                          {isPrepared ? <IoCheckmarkCircle /> : <IoTimeOutline />}
                          <span>{isPrepared ? '🔥 PREPARADA (LISTA)' : '⏳ EN COCINA'}</span>
                        </span>
                      </div>
                    </div>

                    {ord.kitchenNotes && (
                      <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold space-y-0.5">
                        <div className="text-[9px] uppercase tracking-wider text-amber-400 font-black flex items-center gap-1">
                          <IoDocumentTextOutline /> 📝 NOTA GENERAL PARA COCINA:
                        </div>
                        <p className="break-words">{ord.kitchenNotes}</p>
                      </div>
                    )}

                    <div className="space-y-3 bg-black/60 p-4 rounded-2xl border border-white/10">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-white/10 pb-1">
                        DETALLE DE PREPARACIÓN
                      </div>
                      {(ord.items || []).map((it) => (
                        <div
                          key={it.id}
                          className={`space-y-1.5 p-2.5 rounded-xl border transition-all ${
                            it.isNewOrModified
                              ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-lg shadow-blue-950/50'
                              : 'bg-white/[0.02] border-white/5'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 text-sm font-bold text-white">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-black shrink-0">
                                {it.quantity}x
                              </span>
                              <div className="break-words">
                                <span className="font-black text-white">{it.productName}</span>
                                {it.size && <span className="ml-2 text-xs font-bold text-emerald-400">({it.size})</span>}
                              </div>
                            </div>

                            {it.isTakeaway && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black shrink-0 flex items-center gap-1">
                                <IoBagOutline /> 📦 PARA LLEVAR
                              </span>
                            )}
                          </div>

                          {it.isHalfHalf && it.halfDetails && (
                            <div className="ml-8 text-xs font-black text-amber-300 bg-amber-500/20 px-2.5 py-1.5 rounded-lg border border-amber-500/40 space-y-1">
                              <div>🌓 PIZZA MITAD Y MITAD ({it.size}):</div>
                              <div className="text-white font-bold">
                                • 1ra Mitad: {it.halfDetails.half1Name}
                                {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 && (
                                  <span className="text-red-400 font-extrabold ml-1.5">(🚫 SIN: {it.halfDetails.half1Removed.join(', ')})</span>
                                )}
                                {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 && (
                                  <span className="text-purple-300 font-extrabold ml-1.5">(➕ EXTRAS: {it.halfDetails.half1Extras.map((e) => e.name).join(', ')})</span>
                                )}
                              </div>
                              <div className="text-white font-bold">
                                • 2da Mitad: {it.halfDetails.half2Name}
                                {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 && (
                                  <span className="text-red-400 font-extrabold ml-1.5">(🚫 SIN: {it.halfDetails.half2Removed.join(', ')})</span>
                                )}
                                {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 && (
                                  <span className="text-purple-300 font-extrabold ml-1.5">(➕ EXTRAS: {it.halfDetails.half2Extras.map((e) => e.name).join(', ')})</span>
                                )}
                              </div>
                            </div>
                          )}

                          {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                            <div className="ml-8 text-xs font-black text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 flex items-center gap-1">
                              <IoCloseCircleOutline /> 🚫 SIN: {it.removedIngredients.join(', ')}
                            </div>
                          )}

                          {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                            <div className="ml-8 text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                              <IoAddCircleOutline /> ➕ EXTRA: {it.extras.map((e) => e.name).join(', ')}
                            </div>
                          )}

                          {it.sugarPreference && (
                            <div className="ml-8 text-xs font-bold text-sky-300 bg-sky-500/10 px-2 py-1 rounded-lg border border-sky-500/20">
                              🥤 Preferencia: {it.sugarPreference}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <div className="flex items-center gap-1 font-bold text-[#D8E6DF]">
                        <IoTimeOutline className="text-amber-400" />
                        <span>Enviada: {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      </div>

                      {!isPrepared && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black flex items-center gap-1">
                          <IoTimerOutline /> ⏱️ {elapsedMins === 0 ? '< 1 min' : `${elapsedMins} min`} en horno
                        </span>
                      )}
                    </div>

                    {!isPrepared ? (
                      <button
                        onClick={() => handleMarkReady(ord.id)}
                        disabled={submittingOrderId === ord.id}
                        className={`w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/80 transition-all transform ${
                          submittingOrderId === ord.id ? 'opacity-50 pointer-events-none' : 'hover:scale-[1.02]'
                        }`}
                      >
                        <IoCheckmarkCircle className="text-xl" />
                        <span>{submittingOrderId === ord.id ? 'MARCANDO LISTA...' : 'MARCAR COMO LISTA'}</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-xs text-center flex items-center justify-center gap-2">
                        <IoCheckmarkCircle className="text-lg" />
                        <span>COMANDA LISTA (NOTIFICADO)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


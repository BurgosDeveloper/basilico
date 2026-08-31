import React, { useState } from 'react';
import { Order } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { IoClose, IoReceiptOutline, IoPersonOutline, IoCheckmarkCircleOutline, IoBicycleOutline, IoPrintOutline } from 'react-icons/io5';

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  exchangeRates: { COP: number; Bs: number };
  isSelectableMode?: boolean;
  selectedItemIds?: string[];
  onToggleSelectItem?: (itemId: string) => void;
  onConfirmItemSelection?: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  exchangeRates,
  isSelectableMode = false,
  selectedItemIds = [],
  onToggleSelectItem,
  onConfirmItemSelection,
}) => {
  const { reprintKitchenOrder } = useApp();
  const [isReprinting, setIsReprinting] = useState(false);
  const [reprintMessage, setReprintMessage] = useState('');

  if (!isOpen || !order) return null;

  const handleReprint = async () => {
    setIsReprinting(true);
    setReprintMessage('');
    try {
      await reprintKitchenOrder(order.id);
      setReprintMessage('✅ Enviado a cocina');
      setTimeout(() => setReprintMessage(''), 3000);
    } catch (e: any) {
      setReprintMessage(`⚠️ ${e.message || 'Error al imprimir'}`);
      setTimeout(() => setReprintMessage(''), 4000);
    } finally {
      setIsReprinting(false);
    }
  };

  const totalUSD = order.totalUSD || 0;
  const totalCOP = Math.round(totalUSD * exchangeRates.COP);
  const totalBs = (totalUSD * exchangeRates.Bs).toFixed(2);

  // Calculate sum of currently selected items if in selectable mode
  const selectedTotalUSD = order.items
    .filter((it) => selectedItemIds.includes(it.id))
    .reduce((sum, it) => {
      let price = it.price || 0;
      if (it.extras && Array.isArray(it.extras)) {
        price += it.extras.reduce((exS, ex) => exS + (ex.price || 0), 0);
      }
      return sum + price * (it.quantity || 1);
    }, 0);

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-emerald-500/30 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Elegante y Luminoso */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white p-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center font-black shadow-inner shrink-0 text-white">
              <IoReceiptOutline size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black tracking-tight text-white">
                  {isSelectableMode ? 'Seleccionar Productos a Cobrar' : `Comanda #${cleanOrderNumber}`}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 border border-white/40 text-[11px] font-black uppercase text-white tracking-wider">
                  {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : order.type}
                </span>
              </div>
              <p className="text-xs font-bold flex items-center gap-1.5 mt-1 text-emerald-100">
                <IoPersonOutline className="text-sm" />
                <span>Cliente: {order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 border border-white/30 flex items-center justify-center text-white transition-all cursor-pointer shrink-0 shadow-sm"
            title="Cerrar ventana"
          >
            <IoClose size={24} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {isSelectableMode && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs md:text-sm font-bold flex items-center justify-between shadow-sm">
              <span className="text-emerald-950 font-bold">Selecciona los productos que pagará esta persona:</span>
              <span className="font-black px-3.5 py-1.5 rounded-xl text-xs md:text-sm bg-emerald-600 text-slate-900 border border-emerald-500 shadow-sm">
                Seleccionado: ${selectedTotalUSD.toFixed(2)} USD
              </span>
            </div>
          )}

          {/* List of Items */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 px-1">
              PRODUCTOS DEL PEDIDO ({order.items.length})
            </h4>
            {order.items.map((item, index) => {
              const itemTotal = (item.price || 0) * (item.quantity || 1);
              const isSelected = selectedItemIds.includes(item.id);
              const isPaidIndividually = item.isPaidIndividually;

              return (
                <div
                  key={item.id || index}
                  onClick={() => {
                    if (isSelectableMode && !isPaidIndividually && onToggleSelectItem) {
                      onToggleSelectItem(item.id);
                    }
                  }}
                  className={`p-4 rounded-2xl border transition-all ${
                    isPaidIndividually
                      ? 'bg-slate-100 border-slate-300 opacity-60'
                      : isSelected
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-400/40'
                      : 'bg-white border-slate-200 hover:border-emerald-400 shadow-sm'
                  } ${isSelectableMode && !isPaidIndividually ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {isSelectableMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPaidIndividually}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (onToggleSelectItem && !isPaidIndividually) {
                              onToggleSelectItem(item.id);
                            }
                          }}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 font-black text-xs">
                            {item.quantity}x
                          </span>
                          <span className="font-black text-slate-900 text-base md:text-lg">
                            {item.productName}
                          </span>
                          {item.size && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-sky-100 border border-sky-300 text-sky-900">
                              {item.size}
                            </span>
                          )}
                          {isPaidIndividually && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900">
                              ✅ Pagado por {item.paidByName || 'Cliente'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-black text-base md:text-lg text-emerald-700 shrink-0">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Half and half details */}
                  {item.isHalfHalf && item.halfDetails && (
                    <div className="mt-3 pl-3.5 border-l-4 border-amber-500 bg-amber-50/90 rounded-r-2xl p-3 space-y-1.5 text-xs text-slate-900">
                      <div>
                        <span className="font-black text-amber-900">🍕 1ra Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half1Name || 'Mitad 1'}</span>
                        {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half1Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half1Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-black text-amber-900">🍕 2da Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half2Name || 'Mitad 2'}</span>
                        {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half2Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half2Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Regular pizza/item extras & removed ingredients */}
                  {!item.isHalfHalf && (
                    <>
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1.5 text-red-600">
                          🚫 Sin: {item.removedIngredients.join(', ')}
                        </div>
                      )}
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1.5 text-emerald-700">
                          {item.category && item.category !== 'Pizzas' ? '🥗 Contorno(s):' : '➕ Extras:'} {item.extras.map(e => `${e.name}${e.price > 0 ? ` (+$${e.price.toFixed(2)})` : ''}`).join(', ')}
                        </div>
                      )}
                    </>
                  )}

                  {item.sugarPreference && (
                    <div className="text-xs font-black pl-2 mt-1.5 text-sky-800">
                      🥤 Preferencia: {item.sugarPreference}
                    </div>
                  )}

                  {item.notes && (
                    <div className="text-xs font-semibold italic pl-2 mt-1.5 text-slate-600">
                      📝 Nota: "{item.notes}"
                    </div>
                  )}
                </div>
              );
            })}

            {/* Servicio de Delivery */}
            {order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-900 font-black text-xs flex items-center gap-1">
                    <IoBicycleOutline /> 1x
                  </span>
                  <span className="font-black text-slate-900 text-base md:text-lg">Servicio Delivery</span>
                </div>
                <span className="font-black text-base md:text-lg text-emerald-700">
                  ${order.deliveryFeeUSD!.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs shadow-sm">
              <span className="font-black uppercase tracking-wider block mb-1 text-amber-900">
                📝 Observaciones Generales de Cocina:
              </span>
              <p className="font-bold text-slate-800">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Resumen Financiero Claro y Limpio */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50/60 to-white border-2 border-emerald-500/30 space-y-2.5 shadow-md">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>Subtotal Productos:</span>
              <span className="text-slate-900 font-black">${((order.totalUSD || 0) - (order.deliveryFeeUSD || 0)).toFixed(2)} USD</span>
            </div>
            {order.deliveryFeeUSD ? (
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Servicio Delivery:</span>
                <span className="text-slate-900 font-black">+${order.deliveryFeeUSD.toFixed(2)} USD</span>
              </div>
            ) : null}
            <div className="border-t border-emerald-200 pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="font-black text-xs uppercase text-slate-700 block">
                  Total de la Comanda:
                </span>
                <div className="text-3xl font-black text-emerald-700 tracking-tight">
                  ${totalUSD.toFixed(2)} <span className="text-xs font-black uppercase text-emerald-900 bg-emerald-200 px-1.5 py-0.5 rounded">USD</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-black text-sky-800 bg-sky-100 border border-sky-300 px-2.5 py-1 rounded-xl shadow-sm">
                  🇨🇴 {totalCOP.toLocaleString()} COP
                </span>
                <span className="text-xs font-black text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-xl shadow-sm">
                  🇻🇪 {totalBs} Bs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs transition-all cursor-pointer shadow-sm"
            >
              CERRAR
            </button>

            <button
              type="button"
              onClick={handleReprint}
              disabled={isReprinting}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-900 hover:text-black font-black text-xs flex items-center gap-1.5 border border-emerald-300 transition-all cursor-pointer shadow-sm"
            >
              <IoPrintOutline className="text-base" />
              <span>{isReprinting ? 'ENVIANDO...' : '🖨️ REIMPRIMIR COCINA'}</span>
            </button>
            {reprintMessage && (
              <span className="text-xs font-bold text-emerald-700 animate-in fade-in">
                {reprintMessage}
              </span>
            )}
          </div>

          {isSelectableMode && onConfirmItemSelection && (
            <button
              onClick={() => {
                onConfirmItemSelection();
                onClose();
              }}
              disabled={selectedItemIds.length === 0}
              className="px-6 py-2.5 rounded-2xl font-black text-xs md:text-sm shadow-xl transition-all flex items-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
            >
              <IoCheckmarkCircleOutline className="text-xl" />
              <span>CONTINUAR CON COBRO (${selectedTotalUSD.toFixed(2)} USD)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


import React from 'react';
import { Order } from '../data/mockData';
import { IoClose, IoReceiptOutline, IoPersonOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';

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
  if (!isOpen || !order) return null;

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
          className="p-5 flex items-center justify-between border-b border-slate-800"
        >
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: '#059669', color: '#ffffff' }}
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-black shadow-md shrink-0"
            >
              <IoReceiptOutline className="text-2xl" style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight" style={{ color: '#ffffff' }}>
                {isSelectableMode ? 'Seleccionar Productos a Cobrar' : `Detalle de Comanda #${order.orderNumber.toString().replace(/^#+/, '')}`}
              </h3>
              <p className="text-xs font-bold flex items-center gap-2 mt-0.5" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1" style={{ color: '#cbd5e1' }}>
                  <IoPersonOutline /> {order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}
                </span>
                <span>•</span>
                <span className="capitalize font-black" style={{ color: '#34d399' }}>{order.type}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ backgroundColor: '#059669', color: '#ffffff' }}
            className="w-10 h-10 rounded-full flex items-center justify-center shadow transition-colors cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <IoClose className="text-2xl" style={{ color: '#ffffff' }} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-white">
          {isSelectableMode && (
            <div
              style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', color: '#064e3b' }}
              className="p-4 rounded-2xl border text-xs md:text-sm font-bold flex items-center justify-between shadow-sm"
            >
              <span style={{ color: '#064e3b' }}>Selecciona los productos que pagará esta persona:</span>
              <span
                style={{ backgroundColor: '#d1fae5', color: '#047857' }}
                className="font-black px-3.5 py-1.5 rounded-full text-xs md:text-sm border border-emerald-300"
              >
                Seleccionado: ${selectedTotalUSD.toFixed(2)} USD
              </span>
            </div>
          )}

          {/* List of Items */}
          <div className="space-y-3">
            <h4 style={{ color: '#64748b' }} className="text-xs font-black uppercase tracking-wider">
              Productos del Pedido
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
                  style={{
                    backgroundColor: isPaidIndividually ? '#f1f5f9' : isSelected ? '#f0fdf4' : '#f8fafc',
                    borderColor: isPaidIndividually ? '#cbd5e1' : isSelected ? '#10b981' : '#e2e8f0',
                  }}
                  className={`p-4 rounded-2xl border transition-all ${
                    isPaidIndividually
                      ? 'opacity-60'
                      : isSelected
                      ? 'shadow-sm'
                      : 'hover:border-slate-300'
                  } ${isSelectableMode && !isPaidIndividually ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between">
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
                        <span
                          style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                          className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black mr-2"
                        >
                          {item.quantity}x
                        </span>
                        <span style={{ color: '#0f172a' }} className="font-black text-base md:text-lg">
                          {item.productName}
                        </span>
                        {item.size && (
                          <span
                            style={{ backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }}
                            className="ml-2 text-xs font-bold border px-2 py-0.5 rounded-md"
                          >
                            {item.size}
                          </span>
                        )}
                        {isPaidIndividually && (
                          <span style={{ backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }} className="ml-2 text-xs font-bold border px-2 py-0.5 rounded-md">
                            ✅ Pagado por {item.paidByName || 'Cliente'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: '#0f172a' }} className="font-black text-base md:text-lg">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Half and half details */}
                  {item.isHalfHalf && item.halfDetails && (
                    <div
                      style={{ backgroundColor: '#fffbeb', borderColor: '#f59e0b', color: '#78350f' }}
                      className="pl-4 border-l-4 space-y-1.5 text-xs text-slate-900 p-3 rounded-r-xl font-medium mt-2"
                    >
                      <div>
                        <span className="font-black" style={{ color: '#78350f' }}>🍕 1ra Mitad:</span> {item.halfDetails.half1Name || 'Mitad 1'}
                        {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3" style={{ color: '#dc2626' }}>
                            Sin: {item.halfDetails.half1Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3" style={{ color: '#047857' }}>
                            Extras: {item.halfDetails.half1Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-black" style={{ color: '#78350f' }}>🍕 2da Mitad:</span> {item.halfDetails.half2Name || 'Mitad 2'}
                        {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3" style={{ color: '#dc2626' }}>
                            Sin: {item.halfDetails.half2Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3" style={{ color: '#047857' }}>
                            Extras: {item.halfDetails.half2Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Regular pizza/item extras & removed ingredients */}
                  {!item.isHalfHalf && (
                    <>
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1" style={{ color: '#dc2626' }}>
                          ❌ Sin: {item.removedIngredients.join(', ')}
                        </div>
                      )}
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1" style={{ color: '#047857' }}>
                          ➕ Extras: {item.extras.map(e => `${e.name} (+$${e.price.toFixed(2)})`).join(', ')}
                        </div>
                      )}
                    </>
                  )}

                  {item.notes && (
                    <div className="text-xs font-semibold italic pl-2 mt-1" style={{ color: '#475569' }}>
                      📝 Nota: "{item.notes}"
                    </div>
                  )}
                </div>
              );
            })}
            {order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 && (
              <div
                style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
                className="p-4 rounded-2xl border flex items-center justify-between"
              >
                <span style={{ color: '#0f172a' }} className="font-black text-base md:text-lg">Servicio delivery</span>
                <span style={{ color: '#0f172a' }} className="font-black text-base md:text-lg">${order.deliveryFeeUSD!.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div
              style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#78350f' }}
              className="p-3.5 rounded-2xl border text-xs"
            >
              <span className="font-black uppercase tracking-wider block mb-0.5" style={{ color: '#78350f' }}>
                📝 Observaciones Generales:
              </span>
              <p className="font-bold">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Financial summary */}
          <div
            style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
            className="p-5 rounded-2xl space-y-2 border border-slate-800 shadow-md"
          >
            <div className="flex justify-between text-xs font-bold" style={{ color: '#cbd5e1' }}>
              <span>Subtotal Pedido Completo:</span>
              <span style={{ color: '#ffffff' }}>${totalUSD.toFixed(2)} USD</span>
            </div>
            {order.deliveryFeeUSD ? (
              <div className="flex justify-between text-xs font-bold" style={{ color: '#cbd5e1' }}>
                <span>Delivery:</span>
                <span style={{ color: '#ffffff' }}>+${order.deliveryFeeUSD.toFixed(2)} USD</span>
              </div>
            ) : null}
            <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
              <span className="font-black text-sm uppercase" style={{ color: '#ffffff' }}>
                Total Comanda:
              </span>
              <div className="text-right">
                <span className="text-2xl font-black block" style={{ color: '#34d399' }}>
                  ${totalUSD.toFixed(2)} USD
                </span>
                <span className="text-xs font-bold block" style={{ color: '#cbd5e1' }}>
                  ~ ${(totalCOP).toLocaleString()} COP | {totalBs} Bs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          {isSelectableMode && onConfirmItemSelection && (
            <button
              onClick={() => {
                onConfirmItemSelection();
                onClose();
              }}
              disabled={selectedItemIds.length === 0}
              style={{
                backgroundColor: selectedItemIds.length > 0 ? '#059669' : '#cbd5e1',
                color: selectedItemIds.length > 0 ? '#ffffff' : '#64748b',
              }}
              className="px-6 py-3 rounded-xl font-black text-xs md:text-sm shadow-md transition-colors flex items-center gap-2 cursor-pointer"
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

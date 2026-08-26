import React, { useState } from 'react';
import { IoClose, IoSwapHorizontal, IoCheckmarkCircle, IoWarning } from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order } from '../data/mockData';

interface ChangeTableModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newTableNumber: number) => void;
}

export const ChangeTableModal: React.FC<ChangeTableModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tables, orders, changeOrderTable } = useApp();
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !order || order.type !== 'mesa') return null;

  // Active table numbers with orders (excluding this current order)
  const occupiedTableNumbers = new Set(
    orders
      .filter(
        (o) =>
          o.type === 'mesa' &&
          o.tableNumber &&
          o.id !== order.id &&
          o.status !== 'cancelado' &&
          o.status !== 'fusionada' &&
          o.status !== 'entregada' &&
          o.paymentStatus !== 'pagado' &&
          o.paymentStatus !== 'credito'
      )
      .map((o) => o.tableNumber!)
  );

  const handleConfirmChange = async () => {
    if (!selectedTableNumber) {
      setError('Por favor seleccione una mesa de destino.');
      return;
    }
    if (selectedTableNumber === order.tableNumber) {
      setError('La comanda ya se encuentra en esta mesa.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await changeOrderTable(order.id, selectedTableNumber);
      if (onSuccess) onSuccess(selectedTableNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo trasladar la comanda a la mesa seleccionada.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-gradient-to-br from-[#062416] via-[#091f15] to-[#04100b] border border-emerald-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5 text-emerald-400 font-black text-lg">
            <IoSwapHorizontal className="text-2xl text-emerald-400 animate-pulse" />
            <span className="tracking-wide">REUBICAR / CAMBIAR MESA</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <IoClose size={22} />
          </button>
        </div>

        {/* Info Comanda Actual */}
        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider">Comanda en Salón:</span>
            <span className="text-sm font-black text-white">#{order.orderNumber}</span>
            <span className="text-gray-300 font-bold ml-2">({order.customerName || 'Cliente General'})</span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider">Mesa Actual:</span>
            <span className="text-sm font-black text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 rounded-lg">
              Mesa #{order.tableNumber}
            </span>
          </div>
        </div>

        {/* Selector de Nueva Mesa */}
        <div className="space-y-2.5">
          <label className="text-xs font-black text-gray-200 block uppercase tracking-wider">
            Seleccione la Nueva Mesa de Destino:
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {tables
              .sort((a, b) => a.number - b.number)
              .map((table) => {
                const isCurrentTable = table.number === order.tableNumber;
                const isOccupiedByOther = occupiedTableNumbers.has(table.number);
                const isSelected = selectedTableNumber === table.number;

                return (
                  <button
                    key={table.id || table.number}
                    type="button"
                    disabled={isCurrentTable || isOccupiedByOther}
                    onClick={() => {
                      setSelectedTableNumber(table.number);
                      setError('');
                    }}
                    className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                      isCurrentTable
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 opacity-60 cursor-not-allowed'
                        : isOccupiedByOther
                        ? 'bg-red-500/10 border-red-500/25 text-red-400 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'bg-emerald-500 text-black border-emerald-300 font-black shadow-lg scale-[1.04]'
                        : 'bg-white/[0.04] border-white/10 text-white hover:bg-emerald-500/20 hover:border-emerald-500/40'
                    }`}
                  >
                    <span className="text-base font-black">Mesa #{table.number}</span>
                    <span className="text-[10px] font-bold">
                      {isCurrentTable
                        ? '(Actual)'
                        : isOccupiedByOther
                        ? 'Ocupada'
                        : `${table.capacity || 2} pers.`}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Resumen del Traslado */}
        {selectedTableNumber && selectedTableNumber !== order.tableNumber && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
            <span className="font-bold">Trasladar Comanda #{order.orderNumber}:</span>
            <div className="flex items-center gap-2 font-black">
              <span className="text-amber-400">Mesa #{order.tableNumber}</span>
              <span>➔</span>
              <span className="text-emerald-300 text-sm">Mesa #{selectedTableNumber}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-bold text-red-300 flex items-center gap-2">
            <IoWarning className="text-base shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmChange}
            disabled={!selectedTableNumber || selectedTableNumber === order.tableNumber || isSubmitting}
            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
          >
            <IoCheckmarkCircle className="text-base" />
            <span>{isSubmitting ? 'Trasladando...' : 'Confirmar Traslado'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { IoCheckmarkCircleOutline, IoClose, IoPersonOutline, IoReceiptOutline } from 'react-icons/io5';
import { Order } from '../data/mockData';

interface SplitPaymentSelectionModalProps {
  order: Order | null;
  initialPayerName?: string;
  initialItemIds?: string[];
  onCancel: () => void;
  onConfirm: (payerName: string, itemIds: string[]) => void;
}

export const SplitPaymentSelectionModal: React.FC<SplitPaymentSelectionModalProps> = ({
  order,
  initialPayerName = '',
  initialItemIds = [],
  onCancel,
  onConfirm,
}) => {
  const [payerName, setPayerName] = useState(initialPayerName);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(initialItemIds);

  const selectedTotalUSD = useMemo(() => {
    if (!order) return 0;
    return order.items
      .filter((item) => selectedItemIds.includes(item.id))
      .reduce((total, item) => total + item.price * item.quantity, 0);
  }, [order, selectedItemIds]);

  if (!order) return null;

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  };

  const normalizedPayerName = payerName.trim();
  const canContinue = normalizedPayerName.length > 0 && selectedItemIds.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#062f22]/45 p-3 backdrop-blur-sm">
      <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-emerald-200 bg-[#f6fbf8] p-4 shadow-2xl md:p-6">
        <header className="mb-5 flex items-start justify-between gap-3 border-b border-emerald-100 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#08724c]">Cobro dividido por persona</p>
            <h2 className="flex items-center gap-2 text-xl font-black text-[#062f22]"><IoReceiptOutline /> Comanda #{order.orderNumber}</h2>
          </div>
          <button onClick={onCancel} className="rounded-lg p-2 text-[#07513a] hover:bg-emerald-100" title="Cancelar selección">
            <IoClose size={22} />
          </button>
        </header>

        <label className="mb-5 block text-xs font-black text-[#07513a]">
          <span className="mb-1.5 flex items-center gap-1.5"><IoPersonOutline /> Nombre de la persona</span>
          <input
            autoFocus
            value={payerName}
            onChange={(event) => setPayerName(event.target.value)}
            placeholder="Ej: Carlos"
            maxLength={128}
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500"
          />
        </label>

        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-[#062f22]">Ítems que pagará</h3>
          <span className="rounded-lg bg-[#ddf4e8] px-3 py-1.5 text-xs font-black text-[#07513a]">${selectedTotalUSD.toFixed(2)} USD</span>
        </div>

        <div className="space-y-2">
          {order.items.map((item) => {
            const isPaid = item.isPaidIndividually;
            const isSelected = selectedItemIds.includes(item.id);
            const itemTotalUSD = item.price * item.quantity;
            return (
              <button
                key={item.id}
                type="button"
                disabled={isPaid}
                onClick={() => toggleItem(item.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                  isPaid
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                    : isSelected
                      ? 'border-emerald-500 bg-emerald-50 text-[#062f22]'
                      : 'border-emerald-100 bg-white text-[#062f22] hover:border-emerald-300'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected || isPaid ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-300 bg-white'}`}>
                    {(isSelected || isPaid) && <IoCheckmarkCircleOutline size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{item.quantity}x {item.productName}</span>
                    {isPaid && <span className="block text-xs font-bold text-[#07513a]">Pagado por {item.paidByName || 'Cliente'}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black">${itemTotalUSD.toFixed(2)}</span>
              </button>
            );
          })}
        </div>

        <footer className="mt-5 flex flex-col-reverse gap-3 border-t border-emerald-100 pt-4 sm:flex-row">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-xs font-black text-[#07513a]">Cancelar</button>
          <button
            onClick={() => onConfirm(normalizedPayerName, selectedItemIds)}
            disabled={!canContinue}
            className="flex-1 rounded-lg bg-[#08724c] px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Continuar al cobro
          </button>
        </footer>
      </section>
    </div>
  );
};
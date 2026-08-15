import React, { useEffect, useState } from 'react';
import { IoClose, IoEyeOutline, IoReceiptOutline, IoTrashOutline } from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order, PaymentMethod } from '../data/mockData';

type Currency = 'USD' | 'COP' | 'Bs';
type EntryType = 'payment' | 'change';

const methodsByCurrency: Record<Currency, { value: PaymentMethod; label: string }[]> = {
  USD: [
    { value: 'Efectivo USD', label: 'Efectivo' },
    { value: 'Binance', label: 'Binance' },
    { value: 'Zelle', label: 'Zelle' },
  ],
  COP: [
    { value: 'Efectivo COP', label: 'Efectivo' },
    { value: 'Bancolombia', label: 'Bancolombia' },
    { value: 'Nequi', label: 'Nequi' },
  ],
  Bs: [
    { value: 'Pago Móvil', label: 'Pago movil' },
    { value: 'Tarjeta de Débito', label: 'Punto debito' },
    { value: 'Tarjeta de Crédito', label: 'Punto credito' },
  ],
};

function asUSD(amount: number, currency: Currency, copRate: number, bsRate: number) {
  if (currency === 'COP') return amount / copRate;
  if (currency === 'Bs') return amount / bsRate;
  return amount;
}

function CurrencyValues({ amountUSD, rates }: { amountUSD: number; rates: { COP: number; Bs: number } }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
      <span className="rounded-lg bg-white/75 px-2 py-1 text-[#062f22]">${amountUSD.toFixed(2)}</span>
      <span className="rounded-lg bg-white/75 px-2 py-1 text-[#062f22]">{Math.round(amountUSD * rates.COP).toLocaleString()} COP</span>
      <span className="rounded-lg bg-white/75 px-2 py-1 text-[#062f22]">{(amountUSD * rates.Bs).toFixed(2)} Bs</span>
    </div>
  );
}

interface PaymentLedgerModalProps {
  order: Order | null;
  onClose: () => void;
  onViewOrder: (order: Order) => void;
  paymentScope?: {
    payerName: string;
    itemIds: string[];
  };
  onEditPaymentScope?: (order: Order) => void;
}

export const PaymentLedgerModal: React.FC<PaymentLedgerModalProps> = ({ order, onClose, onViewOrder, paymentScope, onEditPaymentScope }) => {
  const { exchangeRates, registerLedgerEntry, deletePaymentEntry, finalizeOrder } = useApp();
  const [entryType, setEntryType] = useState<EntryType>('payment');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo USD');
  const [amountLocal, setAmountLocal] = useState('');
  const [payerName, setPayerName] = useState('Cliente General');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    setPayerName(paymentScope?.payerName || order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General'));
    setEntryType('payment');
    setCurrency('USD');
    setPaymentMethod('Efectivo USD');
    setAmountLocal('');
    setError('');
  }, [order, paymentScope?.payerName]);

  if (!order) return null;

  const history = order.paymentHistory || [];
  const scopedItems = paymentScope
    ? order.items.filter((item) => paymentScope.itemIds.includes(item.id))
    : order.items;
  const scopeTotalUSD = paymentScope
    ? scopedItems.reduce((total, item) => total + item.price * item.quantity, 0)
    : order.totalUSD;
  const scopedHistory = paymentScope
    ? history.filter((entry) => entry.itemIds?.some((itemId) => paymentScope.itemIds.includes(itemId)))
    : history;
  const paidUSD = scopedHistory.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const tenderedUSD = scopedHistory.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return total + (item.cashTenderedUSD || 0) + ((item.cashTenderedCOP || 0) / rateCOP) + ((item.cashTenderedBs || 0) / rateBs);
  }, 0);
  const changeGivenUSD = scopedHistory.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return total + (item.changeGivenUSD || 0) + ((item.changeGivenCOP || 0) / rateCOP) + ((item.changeGivenBs || 0) / rateBs);
  }, 0);
  const pendingDebtUSD = Math.max(0, scopeTotalUSD - paidUSD);
  const pendingChangeUSD = Math.max(0, tenderedUSD - scopeTotalUSD - changeGivenUSD);
  const fullOrderPaidUSD = history.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const fullOrderTenderedUSD = history.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return total + (item.cashTenderedUSD || 0) + ((item.cashTenderedCOP || 0) / rateCOP) + ((item.cashTenderedBs || 0) / rateBs);
  }, 0);
  const fullOrderChangeUSD = history.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return total + (item.changeGivenUSD || 0) + ((item.changeGivenCOP || 0) / rateCOP) + ((item.changeGivenBs || 0) / rateBs);
  }, 0);
  const entryUSD = asUSD(Number(amountLocal) || 0, currency, exchangeRates.COP, exchangeRates.Bs);
  const isReadyToClose = Math.max(0, order.totalUSD - fullOrderPaidUSD) <= 0.01
    && Math.max(0, fullOrderTenderedUSD - order.totalUSD - fullOrderChangeUSD) <= 0.01;

  const changeCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setPaymentMethod(methodsByCurrency[nextCurrency][0].value);
    setError('');
  };

  const registerEntry = async () => {
    if (!Number(amountLocal) || Number(amountLocal) <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await registerLedgerEntry(order.id, {
        entryType,
        currency,
        amountLocal: Number(amountLocal),
        paymentMethod,
        payerName,
        itemIds: paymentScope?.itemIds,
      });
      setAmountLocal('');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'No se pudo registrar el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeOrder = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await finalizeOrder(order.id);
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'No se pudo cerrar la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeEntry = async (paymentId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await deletePaymentEntry(order.id, paymentId);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'No se pudo eliminar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#062f22]/45 p-3 backdrop-blur-sm">
      <section className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-emerald-200 bg-[#f6fbf8] p-4 shadow-2xl md:p-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-emerald-100 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#08724c]">{paymentScope ? 'Cobro dividido por persona' : 'Cobro de comanda'}</p>
            <h2 className="text-xl font-black text-[#062f22]">#{order.orderNumber} <span className="font-bold text-[#145c45]">{order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente general')}</span></h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => paymentScope && onEditPaymentScope ? onEditPaymentScope(order) : onViewOrder(order)} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-[#07513a]" title={paymentScope ? 'Ver o editar ítems de esta persona' : 'Ver ítems de la comanda'}>
              <IoEyeOutline /> {paymentScope ? 'Ver comanda' : 'Ver comanda'}
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-[#07513a] hover:bg-emerald-100" title="Guardar y cerrar modal">
              <IoClose size={22} />
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.7fr)]">
          <aside className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-[#ddf4e8] p-4 shadow-[inset_3px_3px_8px_rgba(5,70,48,.08),inset_-3px_-3px_8px_rgba(255,255,255,.8)]">
              <p className="mb-2 text-xs font-black uppercase text-[#07513a]">{paymentScope ? 'Monto de los ítems seleccionados' : 'Monto de la comanda'}</p>
              <CurrencyValues amountUSD={scopeTotalUSD} rates={exchangeRates} />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-[#d8f0e4] p-4 shadow-[inset_3px_3px_8px_rgba(5,70,48,.08),inset_-3px_-3px_8px_rgba(255,255,255,.8)]">
              <p className="mb-2 text-xs font-black uppercase text-[#07513a]">Total pagado</p>
              <CurrencyValues amountUSD={paidUSD} rates={exchangeRates} />
            </div>
            <div className={`rounded-xl border p-4 shadow-[inset_3px_3px_8px_rgba(5,70,48,.08),inset_-3px_-3px_8px_rgba(255,255,255,.8)] ${pendingChangeUSD > 0.01 ? 'border-amber-300 bg-[#fff4d6]' : 'border-emerald-200 bg-[#e7f7ee]'}`}>
              <p className="mb-2 text-xs font-black uppercase text-[#07513a]">Vuelto pendiente</p>
              <CurrencyValues amountUSD={pendingChangeUSD} rates={exchangeRates} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-[#062f22]">
              {pendingDebtUSD > 0.01 ? `Faltan $${pendingDebtUSD.toFixed(2)} por cobrar${paymentScope ? ` a ${paymentScope.payerName}` : ''}.` : pendingChangeUSD > 0.01 ? 'Registra el vuelto antes de cerrar.' : paymentScope ? 'Esta parte de la comanda está cubierta.' : 'Comanda lista para cerrar.'}
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-[4px_4px_12px_rgba(6,47,34,.07)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-black text-[#062f22]"><IoReceiptOutline className="text-[#08724c]" /> Registrar movimiento</h3>
                <div className="inline-flex rounded-lg border border-emerald-200 bg-[#edf8f1] p-1">
                  {(['payment', 'change'] as EntryType[]).map((type) => (
                    <button key={type} onClick={() => { setEntryType(type); setError(''); }} className={`rounded-md px-3 py-1.5 text-xs font-black ${entryType === type ? 'bg-[#08724c] text-white' : 'text-[#07513a]'}`}>
                      {type === 'payment' ? 'Pago del cliente' : 'Vuelto al cliente'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-[#07513a]">Cliente
                  <input value={payerName} onChange={(event) => setPayerName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-[#fbfefc] px-3 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500" />
                </label>
                <label className="text-xs font-black text-[#07513a]">Moneda
                  <select value={currency} onChange={(event) => changeCurrency(event.target.value as Currency)} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-[#fbfefc] px-3 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500">
                    <option value="USD">Dolares (USD)</option>
                    <option value="COP">Pesos (COP)</option>
                    <option value="Bs">Bolivares (Bs)</option>
                  </select>
                </label>
                <label className="text-xs font-black text-[#07513a]">Monto en {currency}
                  <input type="number" min="0" step="0.01" value={amountLocal} onChange={(event) => setAmountLocal(event.target.value)} placeholder={entryType === 'payment' ? `Pendiente: ${(pendingDebtUSD * (currency === 'USD' ? 1 : currency === 'COP' ? exchangeRates.COP : exchangeRates.Bs)).toFixed(2)}` : `Vuelto: ${(pendingChangeUSD * (currency === 'USD' ? 1 : currency === 'COP' ? exchangeRates.COP : exchangeRates.Bs)).toFixed(2)}`} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-[#fbfefc] px-3 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500" />
                </label>
                <label className="text-xs font-black text-[#07513a]">Metodo de pago
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-[#fbfefc] px-3 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500">
                    {methodsByCurrency[currency].map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#edf8f1] p-3">
                <p className="text-xs font-bold text-[#07513a]">Equivalente: ${entryUSD.toFixed(2)} USD | {Math.round(entryUSD * exchangeRates.COP).toLocaleString()} COP | {(entryUSD * exchangeRates.Bs).toFixed(2)} Bs</p>
                <button onClick={registerEntry} disabled={isSubmitting || !Number(amountLocal)} className="rounded-lg bg-[#08724c] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Agregar registro
                </button>
              </div>
              {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-800">{error}</p>}
            </div>

            <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
              <div className="border-b border-emerald-100 px-4 py-3 text-sm font-black text-[#062f22]">Registros de la comanda</div>
              {scopedHistory.length === 0 ? <p className="p-4 text-sm font-bold text-[#145c45]">Aun no hay pagos ni vueltos registrados.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="bg-[#edf8f1] text-[#07513a]"><tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Metodo</th><th className="px-3 py-2">Monto</th><th className="px-3 py-2">Hora</th><th className="px-3 py-2" /></tr></thead>
                    <tbody>
                      {scopedHistory.map((entry) => {
                        const isChange = (entry.changeGivenUSD || 0) > 0 || (entry.changeGivenCOP || 0) > 0 || (entry.changeGivenBs || 0) > 0;
                        const localAmount = isChange ? (entry.changeGivenUSD || entry.changeGivenCOP || entry.changeGivenBs || 0) : (entry.cashTenderedUSD || entry.cashTenderedCOP || entry.cashTenderedBs || entry.amountPaidUSD || 0);
                        const localCurrency = isChange ? (entry.changeGivenUSD ? 'USD' : entry.changeGivenCOP ? 'COP' : 'Bs') : (entry.cashTenderedUSD ? 'USD' : entry.cashTenderedCOP ? 'COP' : entry.cashTenderedBs ? 'Bs' : 'USD');
                        return <tr key={entry.id} className="border-t border-emerald-50 text-[#062f22]">
                          <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-black ${isChange ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{isChange ? 'Vuelto' : 'Pago'}</span></td>
                          <td className="px-3 py-3 font-bold">{entry.payerName || 'Cliente general'}</td>
                          <td className="px-3 py-3">{entry.paymentMethod}</td>
                          <td className="px-3 py-3 font-black">{localAmount.toLocaleString()} {localCurrency}</td>
                          <td className="px-3 py-3">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-3"><button onClick={() => removeEntry(entry.id)} className="rounded-md p-1.5 text-red-800 hover:bg-red-50" title="Eliminar registro"><IoTrashOutline /></button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-emerald-100 pt-4 sm:flex-row">
              <button onClick={onClose} className="flex-1 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-xs font-black text-[#07513a]">Guardar y cerrar</button>
              <button onClick={closeOrder} disabled={!isReadyToClose || isSubmitting} className="flex-1 rounded-lg bg-[#08724c] px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">Cerrar comanda</button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
};

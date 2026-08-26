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
    <div className="space-y-1.5">
      <div className="text-2xl sm:text-3xl font-black text-emerald-800 tracking-tight flex items-baseline gap-1">
        <span>${amountUSD.toFixed(2)}</span>
        <span className="text-xs font-black text-emerald-950 uppercase px-1.5 py-0.5 rounded bg-emerald-200">USD</span>
      </div>
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-1.5">
        <span className="inline-flex items-center text-sm font-black text-sky-800 bg-sky-100/90 border border-sky-300 px-2.5 py-1 rounded-xl shadow-sm">
          🇨🇴 {Math.round(amountUSD * rates.COP).toLocaleString()} COP
        </span>
        <span className="inline-flex items-center text-sm font-black text-amber-800 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-xl shadow-sm">
          🇻🇪 {(amountUSD * rates.Bs).toFixed(2)} Bs
        </span>
      </div>
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
  const { exchangeRates, registerLedgerEntry, deletePaymentEntry, finalizeOrder, closeOrderAsCredit } = useApp();
  const [entryType, setEntryType] = useState<EntryType>('payment');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo USD');
  const [amountLocal, setAmountLocal] = useState('');
  const [payerName, setPayerName] = useState('Cliente General');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Estados para Modal de Crédito
  const [isCreditPromptOpen, setIsCreditPromptOpen] = useState(false);
  const [creditDebtorInput, setCreditDebtorInput] = useState('');
  const [creditNotesInput, setCreditNotesInput] = useState('');
  const [creditError, setCreditError] = useState('');

  useEffect(() => {
    if (!order) return;
    setPayerName(paymentScope?.payerName || order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General'));
    setEntryType('payment');
    setCurrency('USD');
    setPaymentMethod('Efectivo USD');
    setAmountLocal('');
    setError('');
    setIsCreditPromptOpen(false);
    setCreditError('');
  }, [order, paymentScope?.payerName]);

  const history = order?.paymentHistory || [];
  const scopedItems = order
    ? paymentScope
      ? order.items.filter((item) => paymentScope.itemIds.includes(item.id))
      : order.items
    : [];
  const scopeTotalUSD = order
    ? paymentScope
      ? scopedItems.reduce((total, item) => total + item.price * item.quantity, 0)
      : order.totalUSD
    : 0;
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
  const isReadyToClose = order
    ? Math.max(0, order.totalUSD - fullOrderPaidUSD) <= 0.01 &&
      Math.max(0, fullOrderTenderedUSD - order.totalUSD - fullOrderChangeUSD) <= 0.01
    : false;

  // Al estar cubierto el monto a pagar, si hay vuelto pendiente por entregar, seleccionar automáticamente la pestaña de Vuelto
  useEffect(() => {
    if (pendingDebtUSD <= 0.01 && pendingChangeUSD > 0.01 && entryType === 'payment') {
      setEntryType('change');
      setAmountLocal('');
    }
  }, [pendingDebtUSD, pendingChangeUSD, entryType]);

  const changeCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setPaymentMethod(methodsByCurrency[nextCurrency][0].value);
    setError('');
  };

  const registerEntry = async () => {
    if (!Number(amountLocal) || Number(amountLocal) <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    const willCoverDebt = entryType === 'payment' && (entryUSD >= pendingDebtUSD - 0.01);
    const hasExcess = entryType === 'payment' && (entryUSD > pendingDebtUSD + 0.01);
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
      if (hasExcess || willCoverDebt) {
        setEntryType('change');
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'No se pudo registrar el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillExactAmount = () => {
    if (entryType === 'payment') {
      const exactDebt = pendingDebtUSD * (currency === 'USD' ? 1 : currency === 'COP' ? exchangeRates.COP : exchangeRates.Bs);
      setAmountLocal(currency === 'COP' ? Math.round(exactDebt).toString() : exactDebt.toFixed(2));
    } else {
      const exactChange = pendingChangeUSD * (currency === 'USD' ? 1 : currency === 'COP' ? exchangeRates.COP : exchangeRates.Bs);
      setAmountLocal(currency === 'COP' ? Math.round(exactChange).toString() : exactChange.toFixed(2));
    }
  };

  const handleOpenCreditPrompt = () => {
    const initialName = (payerName && payerName !== 'Cliente General')
      ? payerName
      : (order.customerName && order.customerName !== 'Cliente General')
      ? order.customerName
      : '';
    setCreditDebtorInput(initialName);
    setCreditNotesInput('');
    setCreditError('');
    setIsCreditPromptOpen(true);
  };

  const handleConfirmCloseCredit = async () => {
    if (!creditDebtorInput.trim()) {
      setCreditError('Debe ingresar el nombre del cliente/deudor de forma obligatoria.');
      return;
    }
    setIsSubmitting(true);
    setCreditError('');
    try {
      await closeOrderAsCredit(order.id, creditDebtorInput.trim(), creditNotesInput.trim());
      setIsCreditPromptOpen(false);
      onClose();
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : 'No se pudo cerrar la cuenta a crédito.');
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

  if (!order) return null;

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
                <div className="inline-flex rounded-xl border border-emerald-300 bg-slate-100 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => { setEntryType('payment'); setError(''); }}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                      entryType === 'payment'
                        ? 'bg-emerald-600 text-white shadow-md border border-emerald-500 scale-[1.02]'
                        : 'bg-transparent text-slate-600 hover:text-slate-900 font-bold'
                    }`}
                  >
                    <span>🟢 Pago del cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEntryType('change'); setError(''); }}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                      entryType === 'change'
                        ? 'bg-amber-500 text-slate-950 shadow-md border border-amber-400 scale-[1.02]'
                        : 'bg-transparent text-slate-600 hover:text-slate-900 font-bold'
                    }`}
                  >
                    <span>🟠 Vuelto al cliente</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-[#07513a]">Cliente / Pagador:
                  <input value={payerName} onChange={(event) => setPayerName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-[#fbfefc] px-3.5 py-2.5 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500" />
                </label>

                <div>
                  <span className="text-xs font-black text-[#07513a] block mb-1.5">Moneda de Pago:</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['USD', 'COP', 'Bs'] as Currency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => changeCurrency(c)}
                        className={`py-2 px-2 rounded-xl font-black text-xs transition-all border text-center ${
                          currency === c
                            ? 'bg-[#08724c] text-white border-[#08724c] shadow-md scale-[1.02]'
                            : 'bg-white text-[#07513a] border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {c === 'USD' ? '💵 USD' : c === 'COP' ? '🇨🇴 COP' : '🇻🇪 Bs'}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="text-xs font-black text-[#07513a]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">Monto en {currency}:</span>
                    {((entryType === 'payment' && pendingDebtUSD > 0.01) || (entryType === 'change' && pendingChangeUSD > 0.01)) && (
                      <button
                        type="button"
                        onClick={fillExactAmount}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-0.5 rounded-lg font-black transition-colors shadow-sm"
                      >
                        ⚡ Exacto
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountLocal}
                    onChange={(event) => setAmountLocal(event.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 w-full rounded-xl border-2 border-emerald-300 bg-white px-4 py-2 text-2xl font-black text-[#062f22] outline-none focus:border-emerald-600 shadow-inner"
                  />
                </label>

                <label className="text-xs font-black text-[#07513a]">Método de pago ({currency}):
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-[#fbfefc] px-3.5 py-3 text-sm font-bold text-[#062f22] outline-none focus:border-emerald-500">
                    {methodsByCurrency[currency].map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#edf8f1] border border-emerald-200 p-3.5">
                <div className="text-xs font-black text-[#07513a] space-y-0.5">
                  <div className="text-sm font-black text-[#062f22]">
                    Equivalente: ${entryUSD.toFixed(2)} USD
                  </div>
                  <div className="text-xs text-[#145c45]">
                    🇨🇴 {Math.round(entryUSD * exchangeRates.COP).toLocaleString()} COP | 🇻🇪 {(entryUSD * exchangeRates.Bs).toFixed(2)} Bs
                  </div>
                </div>
                <button
                  onClick={registerEntry}
                  disabled={isSubmitting || !Number(amountLocal)}
                  className="rounded-xl bg-[#08724c] hover:bg-[#065c3d] px-6 py-2.5 text-xs font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                >
                  💾 AGREGAR MOVIMIENTO
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
              <button onClick={onClose} className="flex-1 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-xs font-black text-[#07513a]">
                Guardar y cerrar
              </button>
              {!paymentScope && (
                <button
                  type="button"
                  onClick={handleOpenCreditPrompt}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 flex items-center justify-center gap-1.5 shadow-md transition-all"
                  title="Cerrar esta comanda a crédito como cuenta por cobrar"
                >
                  <span>📝 Cerrar a Crédito</span>
                </button>
              )}
              <button onClick={closeOrder} disabled={!isReadyToClose || isSubmitting} className="flex-1 rounded-lg bg-[#08724c] px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                Cerrar comanda
              </button>
            </footer>
          </div>
        </div>

        {/* MODAL DE CONFIRMACIÓN Y REGISTRO DE CRÉDITO */}
        {isCreditPromptOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                <div className="flex items-center gap-2 text-amber-900 font-black text-base">
                  <span>📝</span>
                  <span>CERRAR CUENTA A CRÉDITO</span>
                </div>
                <button
                  onClick={() => setIsCreditPromptOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <IoClose size={20} />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                <div className="font-bold flex justify-between">
                  <span>Comanda #{order.orderNumber}</span>
                  <span className="text-sm font-black text-amber-900">${pendingDebtUSD > 0.01 ? pendingDebtUSD.toFixed(2) : order.totalUSD.toFixed(2)} USD</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Esta cuenta se guardará como <strong>deuda / cuenta por cobrar</strong> y no generará ingresos en efectivo en caja chica.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Nombre del Cliente / Deudor <span className="text-red-600">(*Obligatorio)</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ej. Juan Pérez / Empresa X"
                    value={creditDebtorInput}
                    onChange={(e) => {
                      setCreditDebtorInput(e.target.value);
                      if (creditError) setCreditError('');
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Nota o referencia del crédito <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Paga el viernes / Teléfono / Contacto"
                    value={creditNotesInput}
                    onChange={(e) => setCreditNotesInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-all"
                  />
                </div>

                {creditError && (
                  <p className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                    {creditError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreditPromptOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCloseCredit}
                  disabled={isSubmitting || !creditDebtorInput.trim()}
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? 'Guardando...' : '✅ Confirmar Crédito'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

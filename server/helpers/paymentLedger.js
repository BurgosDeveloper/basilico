const PAYMENT_METHODS_BY_CURRENCY = {
  USD: ['Efectivo USD', 'Binance', 'Zelle'],
  COP: ['Efectivo COP', 'Bancolombia', 'Nequi'],
  Bs: ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'],
};

function isValidPaymentMethod(currency, paymentMethod) {
  return PAYMENT_METHODS_BY_CURRENCY[currency]?.includes(paymentMethod) || false;
}

function toUsd(amountLocal, currency, copRate, bsRate) {
  const amount = Number(amountLocal) || 0;
  if (currency === 'COP') return amount / copRate;
  if (currency === 'Bs') return amount / bsRate;
  return amount;
}

function paymentAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    cashTenderedUSD: currency === 'USD' ? amount : 0,
    cashTenderedCOP: currency === 'COP' ? amount : 0,
    cashTenderedBs: currency === 'Bs' ? amount : 0,
  };
}

function changeAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    changeGivenUSD: currency === 'USD' ? amount : 0,
    changeGivenCOP: currency === 'COP' ? amount : 0,
    changeGivenBs: currency === 'Bs' ? amount : 0,
  };
}

function paymentHistoryTotals(payments) {
  return payments.reduce((totals, payment) => {
    const copRate = Number(payment.cop_rate) || 3950;
    const bsRate = Number(payment.bs_rate) || 36.5;
    totals.paidUSD += Number(payment.amount_paid_usd) || 0;
    totals.tenderedUSD +=
      (Number(payment.cash_tendered_usd) || 0) +
      (Number(payment.cash_tendered_cop) || 0) / copRate +
      (Number(payment.cash_tendered_bs) || 0) / bsRate;
    totals.changeGivenUSD +=
      (Number(payment.change_given_usd) || 0) +
      (Number(payment.change_given_cop) || 0) / copRate +
      (Number(payment.change_given_bs) || 0) / bsRate;
    return totals;
  }, { paidUSD: 0, tenderedUSD: 0, changeGivenUSD: 0 });
}

module.exports = {
  PAYMENT_METHODS_BY_CURRENCY,
  isValidPaymentMethod,
  toUsd,
  paymentAmounts,
  changeAmounts,
  paymentHistoryTotals,
};

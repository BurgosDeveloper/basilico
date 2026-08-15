const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'CajaPage.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Incluir reopenOrder en el useApp hook
content = content.replace(
  'const { orders, exchangeRates, userSession, processPayment, processMultiplePayments, updateOrderStatus } = useApp();',
  'const { orders, exchangeRates, userSession, processPayment, processMultiplePayments, updateOrderStatus, reopenOrder } = useApp();'
);

// 2. Modificar el bloque de "Tarjetas 1, 2 y 3" en el Panel Izquierdo
const cardsRegex = /\{\/\* Tarjeta 1: Total a Pagar \*\/\}[\s\S]*?(?=\{\/\* Tarjeta 4)/g;
const newCardsHtml = `{/* Tarjeta 1: Total a Pagar */}
                    <div className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Total a Pagar:</div>
                      <div className="grid grid-cols-3 gap-1 divide-x divide-slate-100">
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">USD</span><span className="text-sm font-black text-slate-900">\${total.toFixed(2)}</span></div>
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">COP</span><span className="text-sm font-black text-slate-700">\${Math.round(total * exchangeRates.COP).toLocaleString()}</span></div>
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">Bs</span><span className="text-sm font-black text-slate-700">{(total * exchangeRates.Bs).toFixed(2)}</span></div>
                      </div>
                    </div>

                    {/* Tarjeta 2: Total Pagado Hasta Ahora */}
                    <div className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Total Pagado:</div>
                      <div className="grid grid-cols-3 gap-1 divide-x divide-emerald-100/50">
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">USD</span><span className="text-sm font-black text-emerald-700">\${simPaid.toFixed(2)}</span></div>
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">COP</span><span className="text-sm font-black text-emerald-600">\${Math.round(simPaid * exchangeRates.COP).toLocaleString()}</span></div>
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 font-bold">Bs</span><span className="text-sm font-black text-emerald-600">{(simPaid * exchangeRates.Bs).toFixed(2)}</span></div>
                      </div>
                    </div>

                    {/* Tarjeta 3: Deuda Restante */}
                    {pendingDebt > 0 ? (
                      <div className="p-2.5 rounded-2xl bg-red-50 border border-red-200 shadow-sm">
                        <div className="text-[10px] text-red-600 font-bold uppercase mb-1.5">Deuda Restante:</div>
                        <div className="grid grid-cols-3 gap-1 divide-x divide-red-200/50">
                          <div className="flex flex-col items-center"><span className="text-[9px] text-red-400 font-bold">USD</span><span className="text-sm font-black text-red-700">\${pendingDebt.toFixed(2)}</span></div>
                          <div className="flex flex-col items-center"><span className="text-[9px] text-red-400 font-bold">COP</span><span className="text-sm font-black text-red-600">\${Math.round(pendingDebt * exchangeRates.COP).toLocaleString()}</span></div>
                          <div className="flex flex-col items-center"><span className="text-[9px] text-red-400 font-bold">Bs</span><span className="text-sm font-black text-red-600">{(pendingDebt * exchangeRates.Bs).toFixed(2)}</span></div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm flex items-center gap-2">
                        <IoCheckmarkCircle className="text-2xl text-emerald-600"/>
                        <div>
                           <div className="text-[10px] text-emerald-700 font-black">ESTADO DE DEUDA:</div>
                           <div className="text-base font-black text-emerald-800">TOTALMENTE PAGADO</div>
                        </div>
                      </div>
                    )}

                    `;

content = content.replace(cardsRegex, newCardsHtml);

// 3. Modificar el processPayment para enviar isDraft: true
content = content.replace(
  'await processPayment(activeOrderForPay.id, ledgerMethod, usdEquivalent, Math.round(usdEquivalent * exchangeRates.COP), undefined, details);',
  'await processPayment(activeOrderForPay.id, ledgerMethod, usdEquivalent, Math.round(usdEquivalent * exchangeRates.COP), undefined, { ...details, isDraft: true });'
);
content = content.replace(
  'await processPayment(activeOrderForPay.id, ledgerMethod, 0, 0, undefined, details);',
  'await processPayment(activeOrderForPay.id, ledgerMethod, 0, 0, undefined, { ...details, isDraft: true });'
);

// 4. Agregar botones de Finalizar y Guardar Borrador al final de la Modal de Ledger
const historyEndRegex = /\{\/\* Historial de Registros \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\}/g;

const modalFooter = `
               {/* Historial de Registros */}
$1
               </div>

               {/* Footer con Acciones Finales */}
               <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-3">
                 <button onClick={() => setActiveOrderForPay(null)} className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 border border-slate-200">
                   <IoSaveOutline className="text-base" />
                   💾 GUARDAR BORRADOR
                 </button>
                 {(() => {
                    const total = activeOrderForPay.totalUSD;
                    const paid = activeOrderForPay.paidAmountUSD || 0;
                    const history = activeOrderForPay.paymentHistory || [];
                    const totalTenderedUSD = history.reduce((sum, h) => sum + (h.cashTenderedUSD || 0) + ((h.cashTenderedCOP || 0)/exchangeRates.COP) + ((h.cashTenderedBs || 0)/exchangeRates.Bs), 0);
                    const totalChangeGivenUSD = history.reduce((sum, h) => sum + (h.changeGivenUSD || 0) + ((h.changeGivenCOP || 0)/exchangeRates.COP) + ((h.changeGivenBs || 0)/exchangeRates.Bs), 0);
                    const pendingDebt = Math.max(0, total - paid);
                    const changeOwed = Math.max(0, totalTenderedUSD - total) - totalChangeGivenUSD;
                    
                    return (
                       <button 
                         onClick={async () => {
                           try {
                             setIsSubmittingPay(true);
                             await updateOrderStatus(activeOrderForPay.id, 'pagado');
                             setActiveOrderForPay(null);
                           } finally {
                             setIsSubmittingPay(false);
                           }
                         }}
                         disabled={pendingDebt > 0 || changeOwed > 0.05 || isSubmittingPay}
                         className={\`py-3 rounded-xl font-black text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 \${(pendingDebt > 0 || changeOwed > 0.05) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/50'}\`}
                       >
                         {isSubmittingPay ? 'CERRANDO...' : '✅ FINALIZAR Y CERRAR'}
                       </button>
                    )
                 })()}
               </div>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(historyEndRegex, modalFooter);

// 5. Agregar botón de "✏️ REABRIR (EDITAR)" en la Modal del Histórico (activeOrderForHistorical)
// Buscamos el botón de cerrar en la modal histórico
const histCloseBtnRegex = /<button onClick=\{\(\) => setActiveOrderForHistorical\(null\)\} className="px-5 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-black text-xs shadow-lg">[\s]*CERRAR[\s]*<\/button>/g;
const histCloseBtnWithReopen = `
                  <button onClick={async () => { await reopenOrder(activeOrderForHistorical.id); setActiveOrderForHistorical(null); }} className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-lg border border-amber-600 flex items-center gap-2">
                    ✏️ REABRIR COMANDA
                  </button>
                  <button onClick={() => setActiveOrderForHistorical(null)} className="px-5 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-black text-xs shadow-lg">
                    CERRAR
                  </button>`;

content = content.replace(histCloseBtnRegex, histCloseBtnWithReopen);


fs.writeFileSync(filePath, content);
console.log('CajaPage.tsx actualizado exitosamente.');

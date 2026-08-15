import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { IoClose, IoSwapHorizontal, IoCheckmark } from 'react-icons/io5';

interface ExchangeRateModalProps {
  onClose: () => void;
}

export const ExchangeRateModal: React.FC<ExchangeRateModalProps> = ({ onClose }) => {
  const { exchangeRates, updateExchangeRates } = useApp();
  const [copRate, setCopRate] = useState<number>(exchangeRates.COP);
  const [bsRate, setBsRate] = useState<number>(exchangeRates.Bs);

  const handleSave = () => {
    updateExchangeRates({
      COP: copRate,
      Bs: bsRate,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 backdrop-blur-md animate-in fade-in">
      <div className="glass-panel rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-[#D8E6DF]/30 flex flex-col">
        
        {/* Header */}
        <div className="bg-white p-4 text-slate-900 flex items-center justify-between border-b border-[#D8E6DF]/20">
          <div className="flex items-center gap-2.5">
            <IoSwapHorizontal className="text-xl text-slate-700" />
            <h3 className="font-extrabold text-base">Actualizar Tasas de Cambio</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[#D8E6DF]/10 text-slate-700">
            <IoClose className="text-lg" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 text-slate-900">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700/70 mb-1">
              TASA COP POR 1 USD ($)
            </label>
            <input
              type="number"
              value={copRate}
              onChange={(e) => setCopRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-[#D8E6DF]/20 rounded-xl font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#10b981]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700/70 mb-1">
              TASA BOLÍVARES (BS.) POR 1 USD ($)
            </label>
            <input
              type="number"
              step="0.1"
              value={bsRate}
              onChange={(e) => setBsRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-[#D8E6DF]/20 rounded-xl font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#10b981]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-[#D8E6DF]/20 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-xs font-bold text-slate-700/70 px-3 hover:text-slate-900">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="clay-btn px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5"
          >
            <IoCheckmark className="text-base" /> Guardar Tasas
          </button>
        </div>

      </div>
    </div>
  );
};

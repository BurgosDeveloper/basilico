import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DualPrintersConfig } from '../data/mockData';
import {
  IoClose,
  IoPrintOutline,
  IoRestaurantOutline,
  IoCardOutline,
  IoLayersOutline,
  IoCheckmarkCircle,
  IoAlertCircleOutline,
} from 'react-icons/io5';

interface PrinterSelectModalProps {
  isOpen: boolean;
  title?: string;
  jobDescription?: string;
  defaultTarget?: 'cocina' | 'caja' | 'ambas';
  onClose: () => void;
  onSelectPrinter: (target: 'cocina' | 'caja' | 'ambas') => Promise<void> | void;
}

export const PrinterSelectModal: React.FC<PrinterSelectModalProps> = ({
  isOpen,
  title = 'SELECCIONAR IMPRESORA DE DESTINO',
  jobDescription = '¿A cuál impresora térmica deseas enviar este documento?',
  defaultTarget = 'caja',
  onClose,
  onSelectPrinter,
}) => {
  const { getPrintersConfig } = useApp();
  const [printersConfig, setPrintersConfig] = useState<DualPrintersConfig | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<'cocina' | 'caja' | 'ambas'>(defaultTarget);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSelectedTarget(defaultTarget);
      void getPrintersConfig()
        .then((cfg) => setPrintersConfig(cfg))
        .catch(() => {});
    }
  }, [isOpen, defaultTarget, getPrintersConfig]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsPrinting(true);
    setError('');
    try {
      await onSelectPrinter(selectedTarget);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al enviar a la impresora seleccionada.');
    } finally {
      setIsPrinting(false);
    }
  };

  const cocina = printersConfig?.cocina;
  const caja = printersConfig?.caja;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-gradient-to-br from-[#062416] via-[#091f15] to-[#04100b] border border-sky-500/40 rounded-3xl p-6 shadow-2xl space-y-5">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 text-xl font-black">
              <IoPrintOutline />
            </div>
            <div>
              <h3 className="text-base font-black text-white">{title}</h3>
              <p className="text-xs text-gray-400 font-bold">{jobDescription}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2">
            <IoAlertCircleOutline className="text-lg text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PRINTER OPTIONS */}
        <div className="space-y-3">
          {/* Opción 1: Impresora de Cocina */}
          <button
            type="button"
            onClick={() => setSelectedTarget('cocina')}
            className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
              selectedTarget === 'cocina'
                ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg ring-1 ring-amber-400'
                : 'bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl">
                <IoRestaurantOutline />
              </div>
              <div>
                <div className="font-black text-sm text-white flex items-center gap-2">
                  <span>🍳 IMPRESORA DE COCINA</span>
                  {cocina?.enabled ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  ) : (
                    <span className="text-[10px] text-red-400 font-bold">(Deshabilitada)</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 font-mono">
                  {cocina?.host || '192.168.1.200'}:{cocina?.port || 9100}
                </div>
              </div>
            </div>
            {selectedTarget === 'cocina' && (
              <IoCheckmarkCircle className="text-xl text-amber-400" />
            )}
          </button>

          {/* Opción 2: Impresora de Caja */}
          <button
            type="button"
            onClick={() => setSelectedTarget('caja')}
            className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
              selectedTarget === 'caja'
                ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg ring-1 ring-emerald-400'
                : 'bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl">
                <IoCardOutline />
              </div>
              <div>
                <div className="font-black text-sm text-white flex items-center gap-2">
                  <span>💳 IMPRESORA DE CAJA</span>
                  {caja?.enabled ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  ) : (
                    <span className="text-[10px] text-red-400 font-bold">(Deshabilitada)</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 font-mono">
                  {caja?.host || '192.168.1.201'}:{caja?.port || 9100}
                </div>
              </div>
            </div>
            {selectedTarget === 'caja' && (
              <IoCheckmarkCircle className="text-xl text-emerald-400" />
            )}
          </button>

          {/* Opción 3: Ambas Impresoras */}
          <button
            type="button"
            onClick={() => setSelectedTarget('ambas')}
            className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
              selectedTarget === 'ambas'
                ? 'bg-sky-500/20 border-sky-400 text-white shadow-lg ring-1 ring-sky-400'
                : 'bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 text-xl">
                <IoLayersOutline />
              </div>
              <div>
                <div className="font-black text-sm text-white">
                  🖨️ IMPRIMIR EN AMBAS IMPRESORAS
                </div>
                <div className="text-[11px] text-gray-400">
                  Envía el ticket tanto a Cocina como a Caja simultáneamente
                </div>
              </div>
            </div>
            {selectedTarget === 'ambas' && (
              <IoCheckmarkCircle className="text-xl text-sky-400" />
            )}
          </button>
        </div>

        {/* FOOTER BUTTONS */}
        <div className="pt-3 border-t border-white/10 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPrinting}
            className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-black text-xs shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <IoPrintOutline className="text-base" />
            <span>{isPrinting ? 'IMPRIMIENDO...' : 'CONFIRMAR E IMPRIMIR'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

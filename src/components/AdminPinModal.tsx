import React, { useState, useEffect, useRef } from 'react';
import { IoLockClosed, IoClose, IoBackspace, IoCheckmarkCircle } from 'react-icons/io5';
import { useApp } from '../context/AppContext';

interface AdminPinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  actionName?: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  title = '🔐 AUTORIZACIÓN DE ADMINISTRADOR',
  description = 'Ingrese el PIN de seguridad de 4 dígitos para autorizar:',
  actionName = 'Acción administrativa',
  onSuccess,
  onClose,
}) => {
  const { verifyAdminPin } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setIsVerifying(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 4) {
        void executeVerification(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const executeVerification = async (pinToVerify: string) => {
    if (pinToVerify.length !== 4 || isVerifying) return;
    setIsVerifying(true);
    setError('');
    try {
      const isValid = await verifyAdminPin(pinToVerify);
      if (isValid) {
        onSuccess();
        onClose();
      } else {
        setError('PIN incorrecto. Intente de nuevo.');
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'PIN de seguridad incorrecto.');
      setPin('');
      inputRef.current?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeVerification(pin);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-b from-[#0e2a1e] via-[#081710] to-[#040c08] p-6 text-white shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-400">
              <IoLockClosed size={22} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white uppercase">{title}</h3>
              <p className="text-[11px] font-bold text-amber-300">{actionName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
            title="Cancelar"
          >
            <IoClose size={20} />
          </button>
        </div>

        <p className="text-xs text-gray-300 font-medium text-center">
          {description}
        </p>

        {/* Form / PIN Display */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((index) => {
              const hasDigit = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-12 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${
                    hasDigit
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 scale-105 shadow-md shadow-emerald-950'
                      : 'border-white/15 bg-black/40 text-gray-600'
                  }`}
                >
                  {hasDigit ? '•' : ''}
                </div>
              );
            })}
          </div>

          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPin(val);
              setError('');
              if (val.length === 4) void executeVerification(val);
            }}
            className="sr-only"
            autoFocus
          />

          {error && (
            <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-black text-center">
              ⚠️ {error}
            </div>
          )}

          {/* Touch Numpad */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="h-12 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-lg font-black text-white active:scale-95 transition-all shadow-sm flex items-center justify-center"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-gray-400 active:scale-95 transition-all flex items-center justify-center"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-12 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-lg font-black text-white active:scale-95 transition-all shadow-sm flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/40 text-base font-black text-amber-300 active:scale-95 transition-all flex items-center justify-center"
            >
              <IoBackspace size={20} />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-black text-gray-300 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pin.length !== 4 || isVerifying}
              className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all"
            >
              {isVerifying ? (
                <span>Validando...</span>
              ) : (
                <>
                  <IoCheckmarkCircle className="text-base" />
                  <span>Autorizar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

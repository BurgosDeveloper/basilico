import React, { useState, useEffect, useRef } from 'react';
import { IoLockClosed, IoClose, IoBackspace, IoCheckmarkCircle } from 'react-icons/io5';
import { useApp } from '../context/AppContext';

interface AdminPinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  actionName?: string;
  shift?: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  title = '🔐 AUTORIZACIÓN DE ADMINISTRADOR',
  description = 'Ingrese la clave de seguridad de 6 caracteres para autorizar:',
  actionName = 'Acción administrativa',
  shift,
  onSuccess,
  onClose,
}) => {
  const { verifyAdminPin, userSession } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveShift = (shift || userSession?.shift || 'ambos').toLowerCase();

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
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 6) {
        void executeVerification(nextPin);
      }
    }
    inputRef.current?.focus();
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setPin('');
    setError('');
    inputRef.current?.focus();
  };

  const executeVerification = async (pinToVerify: string) => {
    if (pinToVerify.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError('');
    try {
      const isValid = await verifyAdminPin(pinToVerify, effectiveShift);
      if (isValid) {
        onSuccess();
        onClose();
      } else {
        const shiftLabel = effectiveShift === 'manana' ? 'Turno Mañana' : (effectiveShift === 'noche' ? 'Turno Noche' : 'Administrador');
        setError(`Clave incorrecta para ${shiftLabel}. Intente de nuevo.`);
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'Clave de seguridad incorrecta.');
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
        className="relative w-full max-w-sm rounded-2xl border border-gray-300 bg-white p-6 text-black shadow-2xl space-y-4"
      >
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-yellow-100 border border-yellow-300 text-black">
              <IoLockClosed size={22} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide text-black uppercase">{title}</h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-[11px] font-bold text-yellow-700">{actionName}</span>
                {effectiveShift === 'manana' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                    ☀️ MAÑANA
                  </span>
                )}
                {effectiveShift === 'noche' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-black">
                    🌙 NOCHE
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-black transition-all"
            title="Cancelar"
          >
            <IoClose size={20} />
          </button>
        </div>

        <p className="text-xs text-gray-600 font-medium text-center">
          {description}
        </p>

        {/* Form / PIN Display con 6 casillas adaptables */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="flex justify-center gap-2 sm:gap-2.5 cursor-pointer"
            onClick={() => inputRef.current?.focus()}
            title="Haga clic para escribir con el teclado (números, letras o símbolos)"
          >
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const hasDigit = pin.length > index;
              return (
                <div
                  key={index}
                  onClick={() => inputRef.current?.focus()}
                  className={`w-10 sm:w-11 h-12 sm:h-13 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-black transition-all cursor-text ${
                    hasDigit
                      ? 'border-yellow-500 bg-yellow-100 text-black scale-105 shadow-xs'
                      : 'border-gray-300 bg-gray-50 text-gray-400'
                  }`}
                >
                  {hasDigit ? '•' : ''}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold text-center -mt-2">
            Admite números, letras y símbolos desde su teclado
          </p>

          {/* Input oculto para teclado físico: acepta números, letras y símbolos */}
          <input
            ref={inputRef}
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\s/g, '').slice(0, 6);
              setPin(val);
              setError('');
              if (val.length === 6) void executeVerification(val);
            }}
            className="sr-only"
            autoFocus
          />

          {error && (
            <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-black text-center">
              ⚠️ {error}
            </div>
          )}

          {/* Touch Numpad para pantallas táctiles */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="h-11 rounded-xl bg-gray-50 hover:bg-yellow-100 border border-gray-200 hover:border-yellow-400 text-lg font-black text-black active:scale-95 transition-all shadow-xs flex items-center justify-center"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl bg-gray-50 hover:bg-gray-200 border border-gray-200 text-xs font-black text-gray-500 active:scale-95 transition-all flex items-center justify-center"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-11 rounded-xl bg-gray-50 hover:bg-yellow-100 border border-gray-200 hover:border-yellow-400 text-lg font-black text-black active:scale-95 transition-all shadow-xs flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl bg-gray-50 hover:bg-yellow-100 border border-gray-200 hover:border-yellow-400 text-base font-black text-yellow-700 active:scale-95 transition-all flex items-center justify-center"
            >
              <IoBackspace size={20} />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-black text-gray-800 border border-gray-300 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pin.length !== 6 || isVerifying}
              className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-40 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all border border-yellow-500"
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

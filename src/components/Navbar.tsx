import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoPizza,
  IoSwapHorizontal,
  IoRestaurant,
  IoCard,
  IoFlame,
  IoMenu,
  IoLogOutOutline,
  IoShieldCheckmarkOutline,
  IoWifiOutline,
  IoSettingsOutline,
} from 'react-icons/io5';

interface NavbarProps {
  onOpenExchangeModal?: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenExchangeModal,
  onToggleMobileSidebar,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { exchangeRates, isConnected, syncError, userSession, logout, backendUrl, updateServerIp } = useApp();

  const [showIpModal, setShowIpModal] = useState(false);
  const [ipInput, setIpInput] = useState('');

  const handleOpenIpConfig = () => {
    const nativeBridge = typeof window !== 'undefined' ? (window as any).BasilicoNative : null;
    if (nativeBridge && typeof nativeBridge.openIpConfig === 'function') {
      nativeBridge.openIpConfig();
      return;
    }
    const raw = backendUrl || (typeof window !== 'undefined' ? window.location.host : '');
    setIpInput(raw.replace(/^https?:\/\//, ''));
    setShowIpModal(true);
  };

  const handleSaveIp = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ipInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!clean) {
      updateServerIp('');
      setShowIpModal(false);
      return;
    }
    const withPort = clean.includes(':') ? clean : `${clean}:3001`;
    updateServerIp(`http://${withPort}`);
    const nativeBridge = typeof window !== 'undefined' ? (window as any).BasilicoNative : null;
    if (nativeBridge && typeof nativeBridge.setServerIp === 'function') {
      nativeBridge.setServerIp(withPort);
    }
    setShowIpModal(false);
  };

  const getActiveUserBadge = () => {
    if (userSession?.role === 'admin') {
      return { label: 'ADMINISTRADOR', icon: <IoShieldCheckmarkOutline className="text-green-600 text-sm" /> };
    }
    switch (location.pathname) {
      case '/mesonero':
        return { label: 'MESERO', icon: <IoRestaurant className="text-green-600 text-sm" /> };
      case '/caja':
        return { label: 'CAJA POS', icon: <IoCard className="text-green-600 text-sm" /> };
      case '/cocina':
        return { label: 'COCINA KDS', icon: <IoFlame className="text-amber-500 text-sm" /> };
      default:
        return { label: 'BASILICO', icon: <IoPizza className="text-green-600 text-sm" /> };
    }
  };

  const activeBadge = getActiveUserBadge();

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-1.5 sm:gap-2">
          
          {/* Left Section: Mobile Menu Toggle + Brand Logo */}
          <div className="flex items-center gap-2 shrink-0">
            {onToggleMobileSidebar && location.pathname !== '/' && userSession && (
              <button
                onClick={onToggleMobileSidebar}
                className="md:hidden p-1.5 rounded-lg bg-gray-100 text-gray-800 border border-gray-200 hover:bg-yellow-400 hover:text-black transition-all"
                title="Abrir menú"
              >
                <IoMenu className="text-lg" />
              </button>
            )}

            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-yellow-400 border border-yellow-500 p-0.5 flex items-center justify-center shadow-sm group-hover:scale-105 transition-all overflow-hidden shrink-0">
                <img
                  src="/logo_default.png?v=basilico2026_v3"
                  alt="Basilico"
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png?v=basilico2026_v3'; }}
                />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-black text-sm sm:text-base tracking-tight text-black group-hover:text-green-600 transition-colors">
                    BASILICO
                  </span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-green-400 text-black border border-green-500 uppercase">
                    POS
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Center: Current Active Role Badge & Shift Badge */}
          {userSession && (
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {/* SHIFT BADGE: TURNO MAÑANA vs TURNO NOCHE */}
              <div className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border shadow-2xs shrink-0 ${
                userSession.shift === 'manana'
                  ? 'bg-amber-100/90 text-amber-950 border-amber-300'
                  : userSession.shift === 'noche'
                  ? 'bg-indigo-100/90 text-indigo-950 border-indigo-300'
                  : 'bg-stone-100 text-stone-900 border-stone-300'
              }`}>
                <span className="text-xs sm:text-sm">
                  {userSession.shift === 'manana' ? '☀️' : userSession.shift === 'noche' ? '🌙' : '⚖️'}
                </span>
                <span className="text-[10px] sm:text-xs font-black tracking-wide uppercase">
                  {userSession.shift === 'manana'
                    ? 'MAÑANA'
                    : userSession.shift === 'noche'
                    ? 'NOCHE'
                    : 'GLOBAL'}
                </span>
              </div>

              <div className="hidden xs:flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 shrink-0">
                {activeBadge.icon}
                <span className="text-[10px] sm:text-xs font-black tracking-wide text-gray-900 uppercase">
                  {activeBadge.label}
                </span>
              </div>

              <button
                type="button"
                onClick={handleOpenIpConfig}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-[10px] text-gray-700 cursor-pointer transition-colors shrink-0"
                title="Ver o cambiar dirección IP LAN del servidor"
              >
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                <span className="font-black hidden sm:inline">{isConnected ? 'ONLINE' : 'IP LAN'}</span>
                <IoSettingsOutline className="text-xs text-gray-600" />
              </button>
            </div>
          )}

          {/* Right Section: Multi-Currency Rates Quick Widget & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onOpenExchangeModal && userSession && (
              <button
                onClick={onOpenExchangeModal}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-yellow-50 border border-gray-200 hover:border-yellow-400 text-xs font-bold text-gray-800 transition-all"
                title="Cambiar tasas de cambio COP / Bs."
              >
                <IoSwapHorizontal className="text-green-600 text-sm" />
                <div className="hidden md:flex items-center gap-1.5 text-xs">
                  <span>COP: <strong className="text-black">${exchangeRates.COP.toLocaleString()}</strong></span>
                  <span className="text-gray-300">|</span>
                  <span>Bs: <strong className="text-black">{exchangeRates.Bs.toFixed(2)}</strong></span>
                </div>
              </button>
            )}

            {userSession && (
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-700 border border-red-500/30 text-xs transition-all"
                title="Cerrar Sesión"
              >
                <IoLogOutOutline className="text-lg" />
              </button>
            )}
          </div>

        </div>
        {syncError && (
          <div role="alert" className="border-t border-amber-300 bg-amber-100 px-3 py-1.5 text-center text-xs font-black text-amber-950 flex items-center justify-center gap-2 flex-wrap">
            <span>{syncError}</span>
            <button
              type="button"
              onClick={handleOpenIpConfig}
              className="px-2.5 py-0.5 rounded-lg bg-amber-900 text-white text-[11px] font-black uppercase cursor-pointer"
            >
              ⚙️ Cambiar IP Servidor
            </button>
          </div>
        )}
      </header>

      {showIpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-2xl space-y-4 text-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
              <div className="flex items-center gap-2">
                <IoWifiOutline className="text-green-600 text-xl" />
                <h3 className="font-black text-sm uppercase tracking-wide">Configurar IP de la PC</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIpModal(false)}
                className="text-gray-400 hover:text-gray-800 font-black text-sm px-2 py-0.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIp} className="space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                Ingresa la dirección IP LAN de la PC principal (ejemplo: <strong className="text-black">192.168.0.118:3001</strong> o <strong className="text-black">192.168.10.47:3001</strong>).
              </p>

              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Ej: 192.168.0.118:3001"
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-black font-black text-sm outline-none focus:border-green-500"
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    updateServerIp('');
                    setShowIpModal(false);
                  }}
                  className="px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs cursor-pointer border border-gray-300"
                >
                  Automática
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-black font-black text-xs uppercase cursor-pointer border border-green-600 shadow-sm"
                >
                  Guardar y Conectar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

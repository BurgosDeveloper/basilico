import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoPizza,
  IoSwapHorizontal,
  IoRestaurant,
  IoCard,
  IoFlame,
  IoMenu,
  IoWifi,
  IoLogOutOutline,
  IoShieldCheckmarkOutline,
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
  const { exchangeRates, isConnected, syncError, userSession, logout } = useApp();

  const getActiveUserBadge = () => {
    if (userSession?.role === 'admin') {
      return { label: 'ADMINISTRADOR', icon: <IoShieldCheckmarkOutline className="text-emerald-700" /> };
    }
    switch (location.pathname) {
      case '/mesonero':
        return { label: 'MESERO', icon: <IoRestaurant className="text-emerald-700" /> };
      case '/caja':
        return { label: 'CAJA', icon: <IoCard className="text-emerald-700" /> };
      case '/cocina':
        return { label: 'COCINA', icon: <IoFlame className="text-amber-600" /> };
      default:
        return { label: 'BASILICO PIZZERIA', icon: <IoPizza className="text-emerald-700" /> };
    }
  };

  const activeBadge = getActiveUserBadge();

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-50/90 backdrop-blur-xl border-b border-slate-200 shadow-2xl pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        
        {/* Left Section: Mobile Menu Toggle + Brand Logo */}
        <div className="flex items-center gap-2.5">
          {onToggleMobileSidebar && location.pathname !== '/' && userSession && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-2 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-emerald-500 hover:text-[#070707] transition-all"
              title="Abrir menú"
            >
              <IoMenu className="text-xl" />
            </button>
          )}

          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-white to-emerald-800 border border-emerald-200 flex items-center justify-center shadow-lg shadow-emerald-900/40 group-hover:scale-105 transition-all">
              <IoPizza className="text-emerald-700 text-xl" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg tracking-tight text-slate-900 group-hover:text-emerald-800 transition-colors">
                  BASILICO
                </span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-white text-emerald-700 border border-emerald-200">
                  EN VIVO
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Current Active Role Badge */}
        {userSession && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border border-emerald-200 shadow-inner">
              {activeBadge.icon}
              <span className="text-xs font-black tracking-wide text-slate-900 uppercase">
                {activeBadge.label}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-600">
              <IoWifi className={isConnected ? 'text-emerald-700' : 'text-amber-600'} />
              <span>{isConnected ? 'CONECTADO' : 'DESCONECTADO'}</span>
            </div>
          </div>
        )}

        {/* Right Section: Multi-Currency Rates Quick Widget & Logout */}
        <div className="flex items-center gap-2">
          {onOpenExchangeModal && userSession && (
            <button
              onClick={onOpenExchangeModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-white/[0.08] border border-slate-200 text-xs font-bold text-slate-700 transition-all"
              title="Cambiar tasas oficiales COP / Bs."
            >
              <IoSwapHorizontal className="text-emerald-700" />
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span>COP: <strong className="text-slate-900">${exchangeRates.COP.toLocaleString()}</strong></span>
                <span className="text-slate-400">|</span>
                <span>Bs: <strong className="text-slate-900">{exchangeRates.Bs.toFixed(2)}</strong></span>
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
        <div role="alert" className="border-t border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-black text-amber-950">
          {syncError}
        </div>
      )}
    </header>
  );
};

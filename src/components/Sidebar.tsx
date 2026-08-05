import React from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoRestaurant,
  IoFlame,
  IoCard,
  IoSwapHorizontal,
  IoGridOutline,
  IoReaderOutline,
  IoClose,
  IoPizza,
  IoCashOutline,
  IoWifi,
  IoLogOutOutline,
  IoLayersOutline,
  IoCheckmarkCircle,
} from 'react-icons/io5';

interface SidebarProps {
  onOpenExchangeModal?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenExchangeModal,
  isMobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'default';

  const { orders, exchangeRates, isConnected, userSession, logout } = useApp();

  const pendingKdsCount = orders.filter((o) => o.status === 'en_preparacion').length;
  const readyKdsCount = orders.filter((o) => o.status === 'preparada').length;
  const unpaidCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;

  const setSubTab = (tabName: string) => {
    setSearchParams({ tab: tabName });
    if (onCloseMobile) onCloseMobile();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    if (onCloseMobile) onCloseMobile();
  };

  const roleLabel = userSession?.role ? userSession.role.toUpperCase() : 'INVITADO';
  const isAdmin = userSession?.role === 'admin';

  // Render sub-navigation options
  const renderRoleSidebarContent = () => {
    switch (location.pathname) {
      case '/mesonero':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-[#D8E6DF] font-black text-xs uppercase tracking-wider">
              <IoRestaurant className="text-emerald-400 text-base" /> MESERO
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('pedidos')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab === 'pedidos' || activeTab === 'default'
                    ? 'bg-[#0B2A1A]/80 border-emerald-500/50 shadow-lg shadow-emerald-900/20 text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoGridOutline className="text-emerald-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Pedidos</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Mesas, Delivery y PickUp</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSubTab('comandas')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab === 'comandas'
                    ? 'bg-[#0B2A1A]/80 border-emerald-500/50 shadow-lg shadow-emerald-900/20 text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoReaderOutline className="text-emerald-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Mis Comandas</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Estado de comandas enviadas</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        );

      case '/caja':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-[#D8E6DF] font-black text-xs uppercase tracking-wider">
              <IoCard className="text-emerald-400 text-base" /> CAJA
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('comandas')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab === 'comandas' || activeTab === 'default'
                    ? 'bg-[#0B2A1A]/80 border-emerald-500/50 shadow-lg shadow-emerald-900/20 text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCard className="text-emerald-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Comandas</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Cobro y entrega a clientes</div>
                  </div>
                </div>
                {unpaidCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {unpaidCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setSubTab('cajachica')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab === 'cajachica'
                    ? 'bg-[#0B2A1A]/80 border-emerald-500/50 shadow-lg shadow-emerald-900/20 text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCashOutline className="text-emerald-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Caja Chica</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Apertura USD/COP & Arqueo</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        );

      case '/cocina':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-[#D8E6DF] font-black text-xs uppercase tracking-wider">
              <IoFlame className="text-amber-400 text-base" /> COCINA
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setSubTab('pendientes')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab !== 'listas'
                    ? 'bg-[#0B2A1A]/80 border-amber-500/50 shadow-lg text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoFlame className="text-amber-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Comandas en Cocina</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Pendientes en preparación</div>
                  </div>
                </div>
                {pendingKdsCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                    {pendingKdsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setSubTab('listas')}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  activeTab === 'listas'
                    ? 'bg-[#0B2A1A]/80 border-emerald-500/50 shadow-lg text-white font-bold'
                    : 'bg-white/[0.03] border-white/10 text-emerald-100/70 hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IoCheckmarkCircle className="text-emerald-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Comandas Listas</div>
                    <div className="text-[10px] text-[#D8E6DF]/60 font-normal">Preparadas y finalizadas</div>
                  </div>
                </div>
                {readyKdsCount > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {readyKdsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        );

      case '/menu-admin':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-[#D8E6DF] font-black text-xs uppercase tracking-wider">
              <IoLayersOutline className="text-purple-400 text-base" /> MENÚ PIZZERÍA
            </div>
            <div className="space-y-2">
              <button className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-purple-900/40 border border-purple-500/50 text-white font-bold shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <IoPizza className="text-purple-400 text-lg" />
                  <div className="text-left">
                    <div className="text-sm font-black">Gestión del Menú</div>
                    <div className="text-[10px] text-purple-200/70 font-normal">Pizzas, Bebidas y Adicionales</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#070707]/90 backdrop-blur-2xl border-r border-white/10 p-4 text-white">
      {/* Drawer Header for Mobile */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4 md:hidden">
        <div className="flex items-center gap-2">
          <IoPizza className="text-emerald-400 text-xl" />
          <span className="font-black text-sm tracking-wider">MENÚ DE NAVEGACIÓN</span>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-xl bg-[#0B2A1A] border border-white/10 text-emerald-100"
          >
            <IoClose size={20} />
          </button>
        )}
      </div>

      {/* Connection & Active Role Status */}
      <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-[#0B2A1A]/60 border border-emerald-500/30 mb-5 shadow-lg">
        <div className="flex items-center gap-2.5">
          <IoWifi className={isConnected ? 'text-emerald-400 animate-pulse text-base' : 'text-amber-400 text-base'} />
          <div>
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ESTADO SISTEMA</div>
            <div className="text-xs font-black text-emerald-300">Conectado ({roleLabel})</div>
          </div>
        </div>
      </div>

      {/* Admin Full Access Menu Switcher (Only visible for Admin) */}
      {isAdmin && (
        <div className="space-y-2 mb-6 p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30">
          <div className="text-[9px] font-black text-purple-300 uppercase tracking-widest px-1">
            PANEL ADMINISTRADOR
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              onClick={() => { navigate('/mesonero'); if (onCloseMobile) onCloseMobile(); }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-emerald-500/20 text-xs font-bold text-gray-300 hover:text-white"
            >
              🍽️ Mesero
            </button>
            <button
              onClick={() => { navigate('/caja'); if (onCloseMobile) onCloseMobile(); }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-emerald-500/20 text-xs font-bold text-gray-300 hover:text-white"
            >
              💳 Caja
            </button>
            <button
              onClick={() => { navigate('/cocina'); if (onCloseMobile) onCloseMobile(); }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-amber-500/20 text-xs font-bold text-gray-300 hover:text-white"
            >
              🔥 Cocina
            </button>
            <button
              onClick={() => { navigate('/menu-admin'); if (onCloseMobile) onCloseMobile(); }}
              className="p-2 rounded-xl bg-purple-600/40 text-xs font-bold text-purple-200 border border-purple-400/40"
            >
              🍕 Menú
            </button>
          </div>
        </div>
      )}

      {/* Sub-navigation Menu per Role */}
      <div className="flex-1 space-y-6">
        {renderRoleSidebarContent()}
      </div>

      {/* Exchange Rates & Logout Footer */}
      <div className="mt-auto space-y-3">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707]/90 border border-emerald-500/30 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <IoSwapHorizontal />
              <span>TASAS DÍA</span>
            </div>
            {onOpenExchangeModal && (
              <button
                onClick={onOpenExchangeModal}
                className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-lg font-bold hover:bg-emerald-500/30"
              >
                EDITAR
              </button>
            )}
          </div>
          <div className="text-xs text-[#D8E6DF] space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-400">COP:</span>
              <span className="font-bold text-white">${exchangeRates.COP.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Bs:</span>
              <span className="font-bold text-white">{exchangeRates.Bs.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full p-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <IoLogOutOutline className="text-base" />
          <span>CERRAR SESIÓN ({userSession?.username})</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block w-72 h-[calc(100vh-64px)] sticky top-16 z-30">
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-80 max-w-[85vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

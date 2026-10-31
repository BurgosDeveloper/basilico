import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoPersonOutline,
  IoKeyOutline,
  IoArrowForward,
  IoWarningOutline,
  IoShieldCheckmarkOutline,
  IoLockClosedOutline,
  IoSettingsOutline,
  IoWifiOutline,
  IoCheckmarkCircleOutline,
} from 'react-icons/io5';

export const LoginPage: React.FC = () => {
  const { login, backendUrl, updateServerIp } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Configuración de IP LAN
  const [showIpModal, setShowIpModal] = useState(false);
  const [ipInput, setIpInput] = useState(() => {
    const raw = backendUrl || (typeof window !== 'undefined' ? window.location.host : '');
    return raw.replace(/^https?:\/\//, '');
  });
  const [ipStatusMsg, setIpStatusMsg] = useState<string | null>(null);

  const currentHostDisplay = (backendUrl || (typeof window !== 'undefined' ? window.location.host : 'Automática'))
    .replace(/^https?:\/\//, '') || 'Automática';

  const handleOpenIpConfig = () => {
    const nativeBridge = typeof window !== 'undefined' ? (window as any).BasilicoNative : null;
    if (nativeBridge && typeof nativeBridge.openIpConfig === 'function') {
      nativeBridge.openIpConfig();
      return;
    }
    const raw = backendUrl || (typeof window !== 'undefined' ? window.location.host : '');
    setIpInput(raw.replace(/^https?:\/\//, ''));
    setIpStatusMsg(null);
    setShowIpModal(true);
  };

  const handleSaveIp = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ipInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!clean) {
      updateServerIp('');
      setIpStatusMsg('✅ Restablecido a detección automática LAN.');
      setTimeout(() => setShowIpModal(false), 900);
      return;
    }
    const withPort = clean.includes(':') ? clean : `${clean}:3001`;
    updateServerIp(`http://${withPort}`);
    const nativeBridge = typeof window !== 'undefined' ? (window as any).BasilicoNative : null;
    if (nativeBridge && typeof nativeBridge.setServerIp === 'function') {
      nativeBridge.setServerIp(withPort);
      return;
    }
    setIpStatusMsg(`✅ Servidor configurado en http://${withPort}`);
    setTimeout(() => {
      setShowIpModal(false);
    }, 800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await login(username, password);
      if (!res.success) {
        setErrorMessage(res.error || 'Credenciales inválidas');
      } else {
        const role = res.user?.role;
        if (role === 'caja') {
          navigate('/caja');
        } else if (role === 'mesero') {
          navigate('/mesonero');
        } else if (role === 'cocina') {
          navigate('/cocina');
        } else if (role === 'admin') {
          navigate('/caja');
        } else {
          navigate('/caja');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100 relative overflow-hidden font-sans">
      {/* Background Emerald Ambient Glow */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#1e293b] border border-slate-700 shadow-2xl space-y-5">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-slate-800 border-2 border-emerald-500/50 p-2 flex items-center justify-center shadow-lg transform hover:scale-105 transition-all overflow-hidden">
            <img
              src="/logo_default.png?v=basilico2026_v3"
              alt="Basilico POS"
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png?v=basilico2026_v3'; }}
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1.5 shadow-sm">
              <IoShieldCheckmarkOutline className="text-xs" />
              <span>SISTEMA DE CONTROL BASILICO</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">BASILICO POS 2.0</h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">Ingresa tus credenciales para acceder al sistema.</p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-bold space-y-2">
            <div className="flex items-center gap-2">
              <IoWarningOutline className="text-base shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleOpenIpConfig}
              className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <IoSettingsOutline className="text-sm" />
              <span>Cambiar IP de la PC Servidor</span>
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Usuario:</label>
            <div className="relative">
              <IoPersonOutline className="absolute left-3.5 top-3 text-emerald-400 text-base" />
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0f172a] border border-slate-600 text-white placeholder-slate-500 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-bold"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Contraseña:</label>
            <div className="relative">
              <IoKeyOutline className="absolute left-3.5 top-3 text-emerald-400 text-base" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0f172a] border border-slate-600 text-white placeholder-slate-500 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-bold"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transform active:scale-[0.99] cursor-pointer mt-2"
          >
            <span>{isLoading ? 'Iniciando sesión...' : 'Ingresar al Sistema'}</span>
            <IoArrowForward className="text-base" />
          </button>
        </form>

        {/* Botón rápido de configuración de IP LAN */}
        <div className="pt-3 border-t border-slate-700/60 flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenIpConfig}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-600/80 text-slate-200 hover:text-white text-xs font-bold flex items-center justify-between transition-all cursor-pointer"
            title="Configurar la dirección IP LAN de la PC Servidor"
          >
            <span className="flex items-center gap-1.5">
              <IoWifiOutline className="text-emerald-400 text-sm" />
              <span>Servidor LAN: <strong className="text-emerald-400 font-black">{currentHostDisplay}</strong></span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-700 text-amber-300 font-black text-[10px] uppercase flex items-center gap-1">
              <IoSettingsOutline className="text-xs" />
              <span>Cambiar IP</span>
            </span>
          </button>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <IoLockClosedOutline className="text-emerald-400 text-xs" />
            <span>Acceso seguro y aislado por turnos (Mañana / Noche)</span>
          </div>
        </div>

      </div>

      {/* Modal para cambiar IP LAN desde navegador o WebView */}
      {showIpModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-600 p-5 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
              <div className="flex items-center gap-2">
                <IoWifiOutline className="text-emerald-400 text-xl" />
                <h3 className="font-black text-sm uppercase tracking-wide">Configurar IP de la PC</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIpModal(false)}
                className="text-slate-400 hover:text-white font-black text-sm px-2 py-0.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIp} className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Si la dirección IP de la computadora principal cambió en el router Wi-Fi, ingrésala aquí (ejemplo: <strong className="text-emerald-400">192.168.0.118</strong> o <strong className="text-emerald-400">192.168.10.47:3001</strong>).
              </p>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-300 block mb-1">
                  IP LAN del Servidor (Puerto 3001):
                </label>
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="Ej: 192.168.0.118:3001"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-black text-sm outline-none focus:border-emerald-400"
                />
              </div>

              {ipStatusMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <IoCheckmarkCircleOutline className="text-base shrink-0" />
                  <span>{ipStatusMsg}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIpInput('');
                    updateServerIp('');
                    setIpStatusMsg('✅ Restablecido a IP automática.');
                    setTimeout(() => setShowIpModal(false), 800);
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-black text-xs cursor-pointer"
                >
                  Automática
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase cursor-pointer shadow-md"
                >
                  Guardar y Conectar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

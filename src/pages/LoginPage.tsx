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
} from 'react-icons/io5';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      <div className="relative w-full max-w-md p-8 rounded-3xl bg-[#1e293b] border border-slate-700 shadow-2xl space-y-6">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-800 border-2 border-emerald-500/40 p-2 flex items-center justify-center shadow-lg transform hover:scale-105 transition-all overflow-hidden">
            <img
              src="/logo_default.png"
              alt="Basilico POS"
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = '/icon.png'; }}
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
              <IoShieldCheckmarkOutline className="text-xs" />
              <span>SISTEMA DE CONTROL BASILICO</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">BASILICO POS 2.0</h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">Ingresa tus credenciales para acceder al sistema.</p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-bold space-y-1">
            <div className="flex items-center gap-2">
              <IoWarningOutline className="text-base shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
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

        {/* Security Footer Notice */}
        <div className="pt-3 border-t border-slate-700/60 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <IoLockClosedOutline className="text-emerald-400 text-xs" />
            <span>Acceso seguro y aislado por turnos (Mañana / Noche)</span>
          </div>
        </div>

      </div>
    </div>
  );
};

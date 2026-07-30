import React, { useState } from "react";
import {
  WifiOff,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Key,
  Check,
  Cpu,
  Layers,
  Lock,
} from "lucide-react";

interface OfflineBannerProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onRetry, isRetrying }) => {
  return (
    <div className="w-full bg-rose-950/80 border-b border-rose-500/50 text-rose-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs shadow-md">
      <div className="flex items-center gap-2">
        <WifiOff size={16} className="text-rose-400 shrink-0 animate-pulse" />
        <div>
          <span className="font-bold text-rose-100">BACKEND DISCONNECTED / OFFLINE</span>
          <span className="hidden sm:inline text-rose-300 ml-2">
            — Could not connect to Bybit Demo Engine server. Retrying connection...
          </span>
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="px-3 py-1 rounded bg-rose-500/30 border border-rose-400/50 text-rose-100 hover:bg-rose-500/40 transition-colors font-bold cursor-pointer flex items-center gap-1.5"
      >
        <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} />
        <span>RECONNECT NOW</span>
      </button>
    </div>
  );
};

interface ServerErrorAlertProps {
  message: string;
  onRetry: () => void;
}

export const ServerErrorAlert: React.FC<ServerErrorAlertProps> = ({ message, onRetry }) => {
  return (
    <div className="m-3 p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-200 font-mono text-xs flex flex-wrap items-center justify-between gap-3 shadow-md">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-rose-400 shrink-0" />
        <div>
          <div className="font-bold text-rose-300">SERVER API ERROR</div>
          <div className="text-slate-300 text-[11px] mt-0.5">{message}</div>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer font-bold flex items-center gap-1"
      >
        <RefreshCw size={13} />
        <span>Retry API Call</span>
      </button>
    </div>
  );
};

interface UnauthorizedModalProps {
  onSaveKeys: (key: string, secret: string) => Promise<void>;
  onDismiss: () => void;
}

export const UnauthorizedModal: React.FC<UnauthorizedModalProps> = ({ onSaveKeys, onDismiss }) => {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveKeys(key, secret);
      onDismiss();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-[#181d29] border border-amber-500/40 rounded-xl p-5 w-full max-w-lg text-slate-200 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-base border-b border-slate-800 pb-3">
          <Key size={20} />
          <span>BYBIT DEMO API CREDENTIALS REQUIRED</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          The Bybit Demo Bot engine requires valid <strong>Bybit V5 Demo API</strong> keys to authenticate order placement and balance requests.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Bybit Demo API Key:</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. demo_key_12345678"
              className="w-full bg-[#0c0f17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-400"
              required
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Bybit Demo API Secret:</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••••••••••••••"
              className="w-full bg-[#0c0f17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-400"
              required
            />
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2.5 text-[11px] text-amber-300 flex items-start gap-2">
            <Lock size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <span>
              Your keys are used exclusively for Bybit V5 Demo environment calls. Never use real live funds keys here.
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              Skip / Use Demo Simulation
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={15} />
              )}
              <span>Save & Connect Demo API</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

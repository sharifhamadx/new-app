import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';

interface PWAComponentProps {
  currentLang: Language;
}

export const PWAInstallButton: React.FC<PWAComponentProps> = ({ currentLang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { t } = useUiTranslation(currentLang);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        title={t.pwa?.installButton || 'Install App'}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden xl:inline">{t.pwa?.installButton || 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          title={t.pwa?.installIOSButton || 'Install iOS'}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="hidden xl:inline">{t.pwa?.installIOSButton || 'Install App'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-editorial text-lg font-bold text-slate-900 dark:text-white">
                  {t.pwa?.iosModalTitle || 'Install AEGEA on iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>{t.pwa?.iosStep1 || '1. Tap the Share button in the Safari browser toolbar.'}</p>
                <p>{t.pwa?.iosStep2 || '2. Scroll down and select "Add to Home Screen".'}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-sky-700 hover:bg-sky-800 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                {t.monetization?.close || 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC<PWAComponentProps> = ({ currentLang }) => {
  const isOnline = useOnlineStatus();
  const { t } = useUiTranslation(currentLang);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg print:hidden">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{t.pwa?.offlineNotice || 'Offline Mode — Cached guide & favorites remain available.'}</span>
    </div>
  );
};

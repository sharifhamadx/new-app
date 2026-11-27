import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Smartphone, WifiOff, X, Copy, Check } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';

interface PWAComponentProps {
  currentLang: Language;
}

export const PWAInstallButton: React.FC<PWAComponentProps> = ({ currentLang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { t } = useUiTranslation(currentLang);

  // Inside native Android/iOS APK or already-installed standalone PWA, no install button needed
  let isNative = false;
  try {
    isNative = Capacitor.isNativePlatform();
  } catch {
    isNative = false;
  }

  if (isInstalled || isNative) {
    return null;
  }

  const appShareUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  const handleCopyAppUrl = async () => {
    if (!appShareUrl) return;
    try {
      await navigator.clipboard.writeText(appShareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
          isInstallable
            ? 'bg-sky-700 hover:bg-sky-800 text-white'
            : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={t.pwa?.installButton || 'Install App'}
      >
        {isInstallable ? (
          <Download className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
        )}
        <span className="hidden xl:inline">{t.pwa?.installButton || 'Install App'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                </div>
                <h3 className="font-editorial text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {t.pwa?.iosModalTitle || 'Install AEGEA on Your Phone'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/70 rounded-xl p-3 leading-relaxed">
              {t.pwa?.noApkBenefit ||
                'Add AEGEA directly to your phone home screen for fast one-tap access.'}
            </p>

            <div className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {!isIOS && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  {t.pwa?.androidStep1 ||
                    'On Android (Chrome): tap the top-right menu (⋮) and choose "Install app" or "Add to Home screen".'}
                </div>
              )}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                {isIOS
                  ? t.pwa?.iosStep1 || '1. Tap Share in Safari toolbar, then "Add to Home Screen".'
                  : t.pwa?.androidStep2 ||
                    'On iPhone (Safari): tap Share at bottom and select "Add to Home Screen".'}
              </div>
              {isIOS && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  {t.pwa?.iosStep2 || '2. Tap "Add to Home Screen".'}
                </div>
              )}
            </div>

            {appShareUrl && !appShareUrl.includes('localhost') && (
              <button
                type="button"
                onClick={handleCopyAppUrl}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 py-2.5 px-4 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {t.pwa?.linkCopied || 'Link Copied!'}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                    <span>{t.pwa?.copyLinkBtn || 'Copy App Link for Phone'}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-xl bg-sky-700 hover:bg-sky-800 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              {t.monetization?.close || 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
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

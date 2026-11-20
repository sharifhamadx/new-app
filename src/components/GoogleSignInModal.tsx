import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { auth, googleProvider, syncSignedInUserProfile } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import {
  X,
  ShieldCheck,
  CheckSquare,
  Square,
  ExternalLink,
  AlertCircle,
  MonitorSmartphone,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  currentLang: Language;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  currentLang,
}) => {
  const { t } = useUiTranslation(currentLang);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showReloadAction, setShowReloadAction] = useState(false);

  const signInInFlightRef = useRef(false);
  const attemptIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setShowReloadAction(false);
      signInInFlightRef.current = false;
      return;
    }

    const onComplete = () => {
      signInInFlightRef.current = false;
      setLoading(false);
      setErrorMsg(null);
      setShowReloadAction(false);
      onClose();
    };
    const onErr = (ev: Event) => {
      const detail = (ev as CustomEvent<string>)?.detail;
      signInInFlightRef.current = false;
      setLoading(false);
      setErrorMsg(detail || t.auth.signInGenericError);
    };

    window.addEventListener('aegea:mobile-auth-complete', onComplete);
    window.addEventListener('aegea:mobile-auth-error', onErr);

    let browserHandle: any = null;
    if (Capacitor.isNativePlatform()) {
      browserHandle = Browser.addListener('browserFinished', () => {
        signInInFlightRef.current = false;
        setLoading(false);
      });
    }

    return () => {
      window.removeEventListener('aegea:mobile-auth-complete', onComplete);
      window.removeEventListener('aegea:mobile-auth-error', onErr);
      if (browserHandle?.then) {
        browserHandle.then((h: any) => h.remove()).catch(() => {});
      }
    };
  }, [isOpen, onClose, t.auth.signInGenericError]);

  if (!isOpen) return null;

  const checkHostAuthorizedNow = async (host: string): Promise<boolean> => {
    try {
      if (!firebaseConfig?.apiKey || !host) return false;
      const res = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (!res.ok) return false;
      const data = await res.json();
      const domains: string[] = Array.isArray(data?.authorizedDomains) ? data.authorizedDomains : [];
      return domains.some((d) => d.toLowerCase() === host.toLowerCase());
    } catch {
      return false;
    }
  };

  const formatAuthError = async (err: any): Promise<{ message: string; needsReload: boolean }> => {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user') {
      return { message: t.auth.popupClosedError, needsReload: false };
    }
    if (code === 'auth/cancelled-popup-request') {
      return {
        message:
          t.auth.cancelledPopupError ||
          'A Google Sign-In window is already active or was cancelled. Please wait a moment and try once more.',
        needsReload: false,
      };
    }
    if (code === 'auth/popup-blocked') {
      return { message: t.auth.popupBlockedError, needsReload: false };
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
      const authorizedNow = await checkHostAuthorizedNow(host);
      if (authorizedNow) {
        return {
          message: isAr
            ? `تم تفعيل النطاق (${host}) بنجاح، لكن المتصفح يحتفظ بالجلسة القديمة. اضغط على زر التحديث أدناه ثم سجل الدخول.`
            : `Domain (${host}) is now authorized, but this tab still holds a cached session. Click Refresh below to reload and sign in.`,
          needsReload: true,
        };
      }
      if (isAr) {
        return {
          message: `هذا النطاق (${host}) غير مضاف بعد في قائمة النطاقات المصرح بها في Firebase Authentication. أضف "${host}" في إعدادات Firebase Auth (Authorized domains) ثم حدّث الصفحة.`,
          needsReload: true,
        };
      }
      return {
        message: `Domain (${host}) is not listed in Firebase Authentication → Settings → Authorized domains yet. Add "${host}" in Firebase Console and refresh.`,
        needsReload: true,
      };
    }
    return { message: err?.message || t.auth.signInGenericError, needsReload: false };
  };

  const handleGoogleSignIn = async () => {
    if (signInInFlightRef.current || loading) {
      return;
    }

    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      setShowReloadAction(false);
      return;
    }

    signInInFlightRef.current = true;
    const currentAttemptId = ++attemptIdRef.current;
    setLoading(true);
    setErrorMsg(null);
    setShowReloadAction(false);

    try {
      // On native Android APK, prefer Chrome Custom Tab on our already-authorized backend domain
      if (Capacitor.isNativePlatform()) {
        let bridgeReady = false;
        try {
          const statusRes = await fetch(apiUrl('/api/mobile-auth/status'), {
            signal: AbortSignal.timeout(3000),
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json().catch(() => null);
            bridgeReady = Boolean(statusData?.ready);
          }
        } catch {
          bridgeReady = false;
        }

        if (bridgeReady) {
          await Browser.open({
            url: apiUrl(`/mobile-auth?lang=${encodeURIComponent(currentLang)}`),
            presentationStyle: 'popover',
          });
          return;
        }
      }

      const result = await signInWithPopup(auth, googleProvider);
      await syncSignedInUserProfile(result.user);
      if (attemptIdRef.current === currentAttemptId) {
        signInInFlightRef.current = false;
        setLoading(false);
        onClose();
      }
    } catch (err: any) {
      const code = err?.code || '';
      const isBenignPopupCancel =
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-blocked';

      if (code === 'auth/cancelled-popup-request' && attemptIdRef.current !== currentAttemptId) {
        return;
      }

      if (!isBenignPopupCancel) {
        console.warn('Google Sign-In failed:', code || err?.message || err);
      }

      const formatted = await formatAuthError(err);
      if (attemptIdRef.current === currentAttemptId) {
        signInInFlightRef.current = false;
        setLoading(false);
        setErrorMsg(formatted.message);
        setShowReloadAction(formatted.needsReload);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {t.auth.chooseAccount}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.auth.googleAccount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              {showReloadAction && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t.auth.reloadAndRetry || 'Refresh Page & Retry'}</span>
                </button>
              )}
            </div>
          )}

          {/* Cross-device info */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
            <MonitorSmartphone className="w-5 h-5 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.auth.simulationNotice}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.auth.allDevicesNotice}
              </p>
            </div>
          </div>

          {/* Mandatory Terms & Conditions Checkbox */}
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2.5">
            <p className="text-xs font-semibold text-amber-950 dark:text-amber-200 leading-snug">
              {t.auth.codeEntryConsentNotice}
            </p>

            <div className="flex items-start gap-2.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setTermsAgreed(!termsAgreed);
                  setErrorMsg(null);
                }}
                className="mt-0.5 text-amber-900 dark:text-amber-300 shrink-0 focus:outline-none cursor-pointer"
                aria-label="Agree to Terms and Conditions"
              >
                {termsAgreed ? (
                  <CheckSquare className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                ) : (
                  <Square className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                )}
              </button>

              <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                <span>{t.auth.termsAgreementCheckbox} </span>
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="font-semibold underline text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{t.auth.termsLinkText}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Real Google Sign-In Button */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all border cursor-pointer ${
              termsAgreed
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white hover:bg-slate-800 dark:hover:bg-slate-100 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{t.auth.continueWithGoogle}</span>
          </button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Firebase Google OAuth 2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

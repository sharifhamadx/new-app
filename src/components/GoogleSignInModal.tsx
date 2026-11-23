import React, { useState, useEffect } from 'react';
import { Language, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import {
  redeemActivationCode,
  adminSetupPasscode,
  adminLoginPasscode,
} from '../utils/sessionClient';
import {
  X,
  ShieldCheck,
  CheckSquare,
  Square,
  ExternalLink,
  AlertCircle,
  KeyRound,
  Loader2,
  Shield,
  MessageCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  currentLang: Language;
  initialTab?: 'vip' | 'admin';
  adminSetupRequired?: boolean;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  currentLang,
  initialTab = 'vip',
  adminSetupRequired = false,
  onSessionUpdated,
}) => {
  const { t } = useUiTranslation(currentLang);
  const [activeTab, setActiveTab] = useState<'vip' | 'admin'>(initialTab);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // VIP Activation Code form
  const [activationCode, setActivationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin Passcode form
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminConfirmPasscode, setAdminConfirmPasscode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
      setLoading(false);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const whatsappHref = apiUrl(`/api/subscribe-whatsapp?lang=${encodeURIComponent(currentLang)}`);

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }
    const cleanCode = activationCode.trim();
    if (!cleanCode) {
      setErrorMsg(t.auth.signInGenericError);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await redeemActivationCode(cleanCode, true);
      setSuccessMsg(t.auth.codeActivatedSuccess || 'VIP Access Activated Successfully!');
      setActivationCode('');
      if (onSessionUpdated) {
        onSessionUpdated(result.user, result.adminSetupRequired);
      }
      setTimeout(() => {
        onClose();
      }, 850);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (adminSetupRequired) {
      if (adminPasscode.trim().length < 8 || adminPasscode !== adminConfirmPasscode) {
        setErrorMsg(t.auth.adminPasscodeMismatch || 'Passcodes do not match or are under 8 characters.');
        return;
      }
    } else if (!adminPasscode.trim()) {
      setErrorMsg(t.auth.signInGenericError);
      return;
    }

    setLoading(true);
    try {
      const result = adminSetupRequired
        ? await adminSetupPasscode(adminPasscode.trim())
        : await adminLoginPasscode(adminPasscode);
      setAdminPasscode('');
      setAdminConfirmPasscode('');
      setSuccessMsg(t.auth.adminBadge);
      if (onSessionUpdated) {
        onSessionUpdated(result.user, false);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Admin authentication failed.');
    } finally {
      setLoading(false);
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

        {/* Mode Switcher: VIP Activation vs Admin Panel */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setActiveTab('vip');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'vip'
                  ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t.auth.vipTabLabel || 'VIP Activation'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{t.auth.adminTabLabel || 'Admin Panel'}</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'vip' ? (
            <form onSubmit={handleRedeemCode} className="space-y-4">
              {/* WhatsApp Subscription Callout */}
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-950 dark:text-emerald-100 leading-relaxed">
                    {t.auth.requestCodeViaWhatsapp}
                  </p>
                </div>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>{t.auth.subscribeWhatsappBtn}</span>
                </a>
              </div>

              {/* Mandatory Terms & Conditions Checkbox */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
                <div className="flex items-start gap-2.5">
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

              {/* Activation Code Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="vip-activation-code-input"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 block"
                >
                  {t.auth.enterActivationCode}
                </label>
                <input
                  id="vip-activation-code-input"
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                  placeholder={t.auth.activationCodePlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm font-bold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  termsAgreed
                    ? 'bg-sky-700 hover:bg-sky-800 text-white shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.auth.activatingCodeLabel}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{t.auth.activateCodeBtn}</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {adminSetupRequired
                      ? t.auth.adminSetupTitle
                      : t.auth.adminLoginTitle}
                  </span>
                </p>
                {adminSetupRequired && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t.auth.adminSetupDesc}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <input
                  type="password"
                  required
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder={t.auth.adminPasscodePlaceholder}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />

                {adminSetupRequired && (
                  <input
                    type="password"
                    required
                    value={adminConfirmPasscode}
                    onChange={(e) => setAdminConfirmPasscode(e.target.value)}
                    placeholder={t.auth.adminConfirmPasscodePlaceholder}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                <span>{adminSetupRequired ? t.auth.adminClaimBtn : t.auth.adminLoginBtn}</span>
              </button>
            </form>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t.auth.simulationNotice}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

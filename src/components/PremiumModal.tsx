import React, { useState } from 'react';
import { Language, User, SubscriptionPlan } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import { redeemActivationCode } from '../utils/sessionClient';
import {
  X,
  Crown,
  CheckCircle2,
  Check,
  AlertCircle,
  Compass,
  KeyRound,
  MessageCircle,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
  onOpenTerms?: () => void;
  currentLang: Language;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  user,
  onSessionUpdated,
  onOpenTerms,
  currentLang,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('weekly_pass');
  const [activationCode, setActivationCode] = useState('');
  const [termsAgreed, setTermsAgreed] = useState<boolean>(Boolean(user?.termsAccepted));
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { t } = useUiTranslation(currentLang);

  if (!isOpen) return null;

  const whatsappSubscribeUrl = apiUrl(
    `/api/subscribe-whatsapp?plan=${encodeURIComponent(selectedPlan)}&lang=${encodeURIComponent(currentLang)}${
      user?.email ? `&email=${encodeURIComponent(user.email)}` : ''
    }`
  );

  const confirmText =
    selectedPlan === 'weekly_pass'
      ? t.monetization.confirmWeeklyPass
      : selectedPlan === 'monthly'
      ? t.monetization.confirmMonthlyPlan
      : t.monetization.confirmAnnualPlan;

  const handleActivateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }
    if (!activationCode.trim()) {
      setErrorMsg(t.auth.signInGenericError);
      return;
    }

    setProcessing(true);
    setErrorMsg(null);
    try {
      const res = await redeemActivationCode(activationCode.trim(), true);
      setSuccess(true);
      setActivationCode('');
      if (onSessionUpdated) {
        onSessionUpdated(res.user, res.adminSetupRequired);
      }
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 950);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#061325]/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0B1D36] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#163256] overflow-hidden">
        <div className="aegean-meander-border w-full" />
        {/* Header */}
        <div className="px-6 py-5 bg-[#082F5E] text-white border-b border-[#163256] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
              <Crown className="w-4 h-4" />
              <span>{t.monetization.vipPassBadge}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {t.monetization.upgradeTitle}
            </h2>
            <p className="text-xs text-slate-300">{t.monetization.choosePlan}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {user?.isAdmin && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs space-y-1">
              <p className="font-bold">{t.auth.adminBadge}</p>
              <p className="leading-relaxed">{t.auth.adminWelcome}</p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 3-Tier Plans */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setSelectedPlan('weekly_pass')}
              className={`p-4 rounded-xl border-2 text-start transition-colors cursor-pointer flex flex-col justify-between ${
                selectedPlan === 'weekly_pass'
                  ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span>{t.monetization.weeklyPassOption}</span>
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                      selectedPlan === 'weekly_pass'
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selectedPlan === 'weekly_pass' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-extrabold text-sky-700 dark:text-sky-400">
                    {t.monetization.weeklyPassPrice}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t.monetization.weeklyPassPer}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-snug">
                {t.monetization.weeklyPassDesc}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              className={`p-4 rounded-xl border-2 text-start transition-colors cursor-pointer flex flex-col justify-between ${
                selectedPlan === 'monthly'
                  ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t.monetization.monthlyOption}
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                      selectedPlan === 'monthly'
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selectedPlan === 'monthly' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {t.monetization.monthlyPrice}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t.monetization.monthlyPer}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-snug">
                {t.monetization.monthlyDesc}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('annual')}
              className={`p-4 rounded-xl border-2 text-start transition-colors cursor-pointer flex flex-col justify-between ${
                selectedPlan === 'annual'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-400'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t.monetization.annualOption}
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                      selectedPlan === 'annual'
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selectedPlan === 'annual' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                    {t.monetization.annualPrice}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t.monetization.annualPer}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-2 leading-snug">
                {t.monetization.annualDesc}
              </p>
            </button>
          </div>

          <div className="space-y-2 pt-1">
            {(t.monetization.features || []).map((feature: string, idx: number) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{feature}</span>
              </div>
            ))}
          </div>

          {/* Primary WhatsApp Subscription Link (never exposes phone number) */}
          <a
            href={whatsappSubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>{confirmText}</span>
          </a>

          {/* Inline Activation Code Entry */}
          {success ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-center font-bold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{t.monetization.paymentSuccess}</span>
            </div>
          ) : (
            <form
              onSubmit={handleActivateCode}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
            >
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                <span>{t.auth.orEnterCodeTitle}</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                  placeholder={t.auth.activationCodePlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs sm:text-sm font-bold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2.5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  <span>{t.auth.activateCodeBtn}</span>
                </button>
              </div>

              <div className="flex items-start gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTermsAgreed(!termsAgreed);
                    setErrorMsg(null);
                  }}
                  className="mt-0.5 text-slate-700 dark:text-slate-300 shrink-0 cursor-pointer"
                  aria-label="Agree to Terms"
                >
                  {termsAgreed ? (
                    <CheckSquare className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {t.auth.termsAgreementCheckbox}{' '}
                  {onOpenTerms && (
                    <button
                      type="button"
                      onClick={onOpenTerms}
                      className="underline font-semibold text-sky-700 dark:text-sky-400 cursor-pointer"
                    >
                      {t.auth.termsLinkText}
                    </button>
                  )}
                </span>
              </div>
            </form>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              {t.monetization.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Language, User, SubscriptionPlan } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { X, Crown, CheckCircle2, Check, Zap, AlertCircle, Compass } from 'lucide-react';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUpgradeSuccess: (plan: SubscriptionPlan) => Promise<void>;
  currentLang: Language;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpgradeSuccess,
  currentLang,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('weekly_pass');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { t } = useUiTranslation(currentLang);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    setProcessing(true);
    setErrorMsg(null);
    try {
      await onUpgradeSuccess(selectedPlan);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update subscription. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const confirmText =
    selectedPlan === 'weekly_pass'
      ? t.monetization.confirmWeeklyPass
      : selectedPlan === 'monthly'
      ? t.monetization.confirmMonthlyPlan
      : t.monetization.confirmAnnualPlan;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white border-b border-slate-800 flex items-start justify-between gap-4">
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
        <div className="p-6 space-y-5">
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

          {/* 3-Tier Revenue Strategy: 7-Day Pass (€9.99) + Monthly VIP (€5) + Annual VIP (€50) */}
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

          {success ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-center font-bold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{t.monetization.paymentSuccess}</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={processing}
              onClick={handleSubscribe}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>
                {processing ? t.monetization.activatingSubscription : confirmText}
              </span>
            </button>
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

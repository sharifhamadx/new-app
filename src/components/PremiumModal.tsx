import React, { useState } from 'react';
import { Language, User, SubscriptionPlan } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import {
  reloadCurrentFirebaseUser,
  syncSignedInUserProfile,
  updateOwnSubscriptionRequest,
} from '../firebase';
import {
  X,
  Crown,
  CheckCircle2,
  Check,
  AlertCircle,
  Compass,
  MessageCircle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
  currentLang: Language;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  user,
  onSessionUpdated,
  currentLang,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('monthly');
  const [paymentNote, setPaymentNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  if (!isOpen) return null;

  const whatsappSubscribeUrl = apiUrl(
    `/api/subscribe-whatsapp?plan=${encodeURIComponent(selectedPlan)}&lang=${encodeURIComponent(currentLang)}${
      user?.email ? `&email=${encodeURIComponent(user.email)}` : ''
    }`
  );

  const confirmText =
    selectedPlan === 'annual'
      ? t.monetization.confirmAnnualPlan
      : t.monetization.confirmMonthlyPlan;

  const handleSaveRequestAndWhatsapp = async () => {
    setErrorMsg(null);
    if (user && !user.isGuest && user.emailVerified !== false) {
      try {
        await updateOwnSubscriptionRequest(
          user.uid,
          selectedPlan,
          paymentNote.trim() || `${selectedPlan} WhatsApp receipt`
        );
      } catch {
        // non-fatal request log
      }
    }
    window.open(whatsappSubscribeUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRefreshActivation = async () => {
    setRefreshing(true);
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      const fbUser = await reloadCurrentFirebaseUser();
      if (!fbUser) {
        throw new Error(isAr ? 'يرجى تسجيل الدخول بحسابك أولاً.' : 'Please sign in with your email first.');
      }
      const synced = await syncSignedInUserProfile(fbUser, { requestedPlan: selectedPlan });
      if (onSessionUpdated) {
        onSessionUpdated(synced, false);
      }
      if (synced.isPremium || synced.isAdmin) {
        setStatusMessage(t.monetization.paymentSuccess);
        setTimeout(() => {
          onClose();
        }, 850);
      } else {
        setStatusMessage(
          isAr
            ? 'لا يزال حسابك بانتظار استلام إيصال الدفع عبر واتساب وتفعيل المدير للخدمات غير المحدودة.'
            : 'Your account is still awaiting Admin verification of your WhatsApp payment receipt.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setRefreshing(false);
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
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-[#061325] border border-[#0D5EAF]/30 text-[#082F5E] dark:text-sky-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* 2 Official Plans: Monthly €5 & Annual €50 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              className={`p-5 rounded-xl border-2 text-start transition-colors cursor-pointer flex flex-col justify-between ${
                selectedPlan === 'monthly'
                  ? 'border-[#0D5EAF] bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-[#082F5E] dark:text-slate-200 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400 shrink-0" />
                    <span>{t.monetization.monthlyOption}</span>
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${
                      selectedPlan === 'monthly'
                        ? 'border-[#0D5EAF] bg-[#0D5EAF] text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selectedPlan === 'monthly' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-3xl font-extrabold text-[#0D5EAF] dark:text-sky-400">
                    {t.monetization.monthlyPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t.monetization.monthlyPer}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-snug">
                {t.monetization.monthlyDesc}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('annual')}
              className={`p-5 rounded-xl border-2 text-start transition-colors cursor-pointer flex flex-col justify-between ${
                selectedPlan === 'annual'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-400'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-[#082F5E] dark:text-slate-200 flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{t.monetization.annualOption}</span>
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
                  <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                    {t.monetization.annualPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
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

          {/* WhatsApp Payment Receipt explanation */}
          <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-3">
            <p className="text-xs font-bold text-[#082F5E] dark:text-white leading-relaxed">
              {isAr
                ? 'طريقة التفعيل: ادخل إلى واتساب وأرسل إيصال الدفع مع بريدك الإلكتروني أدناه، وسيقوم المدير فوراً بفك جميع الخدمات غير المحدودة على حسابك (€5 لشهر أو €50 لسنة).'
                : 'Activation: Open WhatsApp and send your payment receipt along with your email below. Admin will unlock unlimited services immediately (€5/month or €50/year).'}
            </p>
            {user?.email && (
              <p className="text-xs font-mono font-bold text-[#0D5EAF] dark:text-sky-300">
                {user.email}
              </p>
            )}
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              maxLength={200}
              placeholder={
                isAr
                  ? 'ملاحظة اختيارية للدفع (مثلاً: تحويل بنكي / نقدي)'
                  : 'Optional payment note (e.g. transfer reference)'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1D36] text-xs text-[#082F5E] dark:text-white"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => void handleSaveRequestAndWhatsapp()}
              className="flex-1 py-3.5 px-6 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>{confirmText}</span>
            </button>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void handleRefreshActivation()}
              className="py-3.5 px-5 rounded-xl font-bold text-xs bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>{isAr ? 'تحديث حالة التفعيل' : 'Refresh Status'}</span>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#082F5E] dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <BackArrow className="w-3.5 h-3.5" />
              <span>{isAr ? 'رجوع' : t.monetization.close}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

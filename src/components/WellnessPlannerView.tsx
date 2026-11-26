import React, { useState } from 'react';
import {
  HealthProfile,
  Language,
  User,
  WellnessActivityLevel,
  WellnessGoalType,
  WellnessPlanResult,
} from '../types';
import { apiUrl } from '../utils/apiBase';
import { apiFetch } from '../utils/sessionClient';
import {
  isAdminEmail,
  reloadCurrentFirebaseUser,
  requestOwnWellnessAddon,
  syncSignedInUserProfile,
} from '../firebase';
import { generateWellnessPdf } from '../utils/generateWellnessPdf';
import { BrandLogoMark } from './BrandLogo';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  HeartPulse,
  Sparkles,
  FileDown,
  Smartphone,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  RefreshCw,
  Shield,
  Lock,
  ExternalLink,
  Flame,
  Droplets,
  Footprints,
  MapPin,
  Utensils,
} from 'lucide-react';

const GREEK_WELLNESS_DESTINATIONS = [
  'Athens',
  'Santorini',
  'Chania, Crete',
  'Heraklion, Crete',
  'Nafplio',
  'Thessaloniki',
  'Rhodes',
  'Naxos',
  'Paros',
  'Corfu',
  'Kalamata & Mani',
  'Delphi',
  'Meteora',
  'Pelion & Volos',
];

interface WellnessPlannerViewProps {
  currentLang: Language;
  user: User | null;
  healthProfile: HealthProfile;
  onOpenHealthSettings: () => void;
  onSyncUser?: (user: User) => void;
}

export const WellnessPlannerView: React.FC<WellnessPlannerViewProps> = ({
  currentLang,
  user,
  healthProfile,
  onOpenHealthSettings,
  onSyncUser,
}) => {
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const isEl = String(currentLang || '').toLowerCase().startsWith('el');

  const [goalType, setGoalType] = useState<WellnessGoalType>('weight_loss');
  const [destination, setDestination] = useState('Athens');
  const [customDestination, setCustomDestination] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [currentWeightKg, setCurrentWeightKg] = useState(78);
  const [targetWeightKg, setTargetWeightKg] = useState('72');
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState('');
  const [activityLevel, setActivityLevel] = useState<WellnessActivityLevel>('moderate');
  const [customGoalNotes, setCustomGoalNotes] = useState('');

  const [loadingPlan, setLoadingPlan] = useState(false);
  const [exportingPdf, setExportingPdf] = useState<'download' | 'share' | null>(null);
  const [planResult, setPlanResult] = useState<WellnessPlanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [paymentNote, setPaymentNote] = useState('');
  const [refreshingStatus, setRefreshingStatus] = useState(false);

  const isVerifiedAdmin = Boolean(
    user && !user.isGuest && user.isAdmin && user.emailVerified !== false && isAdminEmail(user.email)
  );
  const hasWellnessAccess = Boolean(isVerifiedAdmin || user?.wellnessAddonActive);

  const effectiveDestination = customDestination.trim() || destination;

  const handleRequestAddonViaWhatsapp = async () => {
    setErrorMsg(null);
    if (user && !user.isGuest && user.emailVerified !== false) {
      try {
        await requestOwnWellnessAddon(
          user.uid,
          paymentNote.trim() || 'Wellness Planner +€3/mo WhatsApp receipt'
        );
      } catch {
        // non-fatal request marker
      }
    }
    const waUrl = apiUrl(
      `/api/subscribe-whatsapp?plan=wellness_addon&lang=${encodeURIComponent(currentLang)}${
        user?.email ? `&email=${encodeURIComponent(user.email)}` : ''
      }`
    );
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRefreshActivation = async () => {
    setRefreshingStatus(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const fbUser = await reloadCurrentFirebaseUser();
      if (!fbUser) {
        throw new Error(isAr ? 'يرجى تسجيل الدخول بحسابك أولاً.' : 'Please sign in first.');
      }
      const synced = await syncSignedInUserProfile(fbUser);
      if (onSyncUser) onSyncUser(synced);
      if (synced.wellnessAddonActive || synced.isAdmin) {
        setStatusNotice(
          isAr
            ? 'تم تفعيل ميزة التخطيط الصحي والوزن + تصدير PDF بنجاح!'
            : 'Wellness & Weight Planner + Branded PDF Add-On is now active!'
        );
      } else {
        setStatusNotice(
          isAr
            ? 'لا يزال حسابك بانتظار موافقة المدير بعد استلام إيصال الاشتراك الإضافي (€3/شهر) عبر واتساب.'
            : 'Still awaiting Admin verification of your €3/month WhatsApp receipt.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر تحديث الحالة.' : 'Could not refresh status.'));
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWellnessAccess) return;

    setLoadingPlan(true);
    setErrorMsg(null);
    setStatusNotice(null);

    try {
      const resp = await apiFetch('/api/wellness-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destination: effectiveDestination,
          goalType,
          durationDays,
          currentWeightKg,
          targetWeightKg: targetWeightKg.trim() ? Number(targetWeightKg) : undefined,
          dailyCalorieTarget: dailyCalorieTarget.trim() ? Number(dailyCalorieTarget) : undefined,
          activityLevel,
          customGoalNotes,
          language: currentLang,
          healthProfile,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          data?.error ||
            (isAr ? 'تعذر توليد الجدول الصحي حالياً.' : 'Could not generate wellness trip plan.')
        );
      }

      if (data?.plan) {
        setPlanResult(data.plan);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'حدث خطأ غير متوقع.' : 'Unexpected error.'));
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleExportPdf = async (mode: 'download' | 'share') => {
    if (!planResult) return;
    setExportingPdf(mode);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const todayFormatted = new Date().toLocaleDateString(
        isAr ? 'ar-EG' : isEl ? 'el-GR' : 'en-GB',
        { year: 'numeric', month: 'short', day: 'numeric' }
      );
      const res = await generateWellnessPdf({
        plan: planResult,
        user,
        currentLang,
        todayFormatted,
        brandSubtitle: t?.navbar?.brandSubtitle || 'Your Smart Guide',
        mode,
      });
      setStatusNotice(
        res.shared
          ? isAr
            ? `تمت مشاركة الملف وحفظه بنجاح: ${res.filename}`
            : `PDF shared / saved: ${res.filename}`
          : isAr
          ? `تم تصدير وحفظ ملف PDF على جهازك: ${res.filename}`
          : `PDF exported and saved to device: ${res.filename}`
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isAr ? 'تعذر تصدير ملف PDF.' : 'Could not export PDF.')
      );
    } finally {
      setExportingPdf(null);
    }
  };

  const goalOptions: {
    id: WellnessGoalType;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'weight_loss',
      title: isAr ? 'خطة تخسيس وحرق الدهون' : isEl ? 'Πρόγραμμα Απώλειας Βάρους' : 'Weight Loss Plan',
      desc: isAr
        ? 'عجز سعرات مدروس + مشي يومي + مشويات ومأكولات بحرية خفيفة'
        : isEl
        ? 'Ελεγχόμενο θερμιδικό έλλειμμα & μεσογειακά πιάτα'
        : 'Calibrated calorie deficit + active routes + lean Greek dining',
      icon: <TrendingDown className="w-5 h-5" />,
    },
    {
      id: 'weight_gain',
      title: isAr ? 'خطة زيادة الوزن والكتلة الصحية' : isEl ? 'Πρόγραμμα Αύξησης Βάρους' : 'Healthy Weight Gain',
      desc: isAr
        ? 'فائض سعرات صحي + بروتين عالي وزيت زيتون بكر ومكسرات'
        : isEl
        ? 'Υγιεινό θερμιδικό πλεόνασμα με υψηλή πρωτεΐνη'
        : 'Clean calorie surplus + high-protein Greek dishes & olive oil',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      id: 'health_maintenance',
      title: isAr ? 'خطة حسب الحالة الصحية' : isEl ? 'Πλάνο Βάσει Υγείας' : 'Health-Condition Plan',
      desc: isAr
        ? 'جدول طبي آمن للسكري والضغط والحساسية والحفاظ على النشاط'
        : isEl
        ? 'Προσαρμοσμένο για διαβήτη, πίεση & αλλεργίες'
        : 'Medical-friendly schedule tailored to diabetes, BP & allergies',
      icon: <HeartPulse className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <section className="rounded-2xl bg-[#082F5E] text-white border border-[#163256] overflow-hidden">
        <div className="aegean-meander-border w-full" />
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-300">
              <Scale className="w-4 h-4" />
              <span>
                {isAr
                  ? 'مخطط الرحلة الصحية والوزن بالذكاء الاصطناعي · بحث ويب مباشر · تصدير PDF بشعار AEGEA'
                  : 'AI Health & Weight-Goal Trip Planner · Web Grounded · Branded AEGEA PDF Export'}
              </span>
            </div>
            <h1 className="font-editorial text-2xl sm:text-3xl font-bold tracking-tight">
              {isAr
                ? 'تخطيط رحلتك حسب الحالة الصحية وأهداف الوزن'
                : isEl
                ? 'Σχεδιασμός Ταξιδιού Υγείας, Διατροφής & Βάρους'
                : 'Health, Weight-Loss & Weight-Gain Trip Planner'}
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              {isAr
                ? 'يبحث الذكاء الاصطناعي في الويب ليُنشئ لك جدولاً يومياً متكاملاً بالأماكن السياحية في اليونان، أنواع الطعام والوجبات، السعرات الحرارية الدقيقة، ونسبة فقدان أو زيادة الوزن المتوقعة مع حفظ ملف PDF احترافي بشعار التطبيق على هاتفك.'
                : 'Uses live AI web search to generate a complete Greek itinerary table with real places, authentic meal types, exact calories, projected weight gain/loss percentage, and branded mobile PDF export.'}
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
            {isVerifiedAdmin ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
                <Shield className="w-4 h-4 text-emerald-300" />
                <span>{isAr ? 'المدير · مجاني وغير محدود ∞' : 'Admin · Free & Unlimited ∞'}</span>
              </div>
            ) : hasWellnessAccess ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-100 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>{isAr ? 'الباقة الصحية مفعّلة (+€3/شهر)' : 'Wellness Add-On Active (+€3/mo)'}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold tabular-nums">
                <Lock className="w-4 h-4" />
                <span>{isAr ? 'اشتراك إضافي: €3 / شهر' : 'Add-On: €3 / month'}</span>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenHealthSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              <HeartPulse className="w-3.5 h-3.5 text-emerald-300" />
              <span>
                {isAr
                  ? `ملفك الصحي (${healthProfile.conditions.length})`
                  : `Health Profile (${healthProfile.conditions.length})`}
              </span>
            </button>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Paywall Card when user has NOT activated the +€3/month Add-on */}
      {!hasWellnessAccess && (
        <section className="rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] p-6 sm:p-8 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#163256] pb-5">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#0D5EAF]/10 dark:bg-sky-950/60 border border-[#0D5EAF]/25 flex items-center justify-center shrink-0">
                <BrandLogoMark className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0D5EAF] dark:text-sky-300">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isAr ? 'ميزة احترافية للمشتركين' : 'Subscriber Wellness Upgrade'}</span>
                </div>
                <h2 className="text-xl font-bold text-[#082F5E] dark:text-white">
                  {isAr
                    ? 'تفعيل خطة الصحة والوزن + تصدير PDF بشعار AEGEA (€3 / شهر)'
                    : 'Unlock Health & Weight-Goal Trip Planner + Branded PDF (€3 / month)'}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  {isAr
                    ? 'رسوم إضافية بقيمة €3 شهرياً للمشتركين (ومجانية بالكامل للمدير). أرسل إيصال الدفع عبر واتساب مع بريدك الإلكتروني ليتم التفعيل الفوري من لوحة المدير.'
                    : 'Optional €3/month add-on for subscribers (free & unlimited for Admin). Send your €3 payment receipt via WhatsApp for instant Admin activation.'}
                </p>
              </div>
            </div>
            <div className="text-start md:text-end shrink-0 tabular-nums">
              <p className="text-3xl font-extrabold text-[#0D5EAF] dark:text-sky-400">€3</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? '/ شهر إضافي' : '/ month add-on'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-1">
              <p className="font-bold text-[#082F5E] dark:text-white">
                {isAr ? '1. بحث ويب ذكي ومباشر' : '1. Live Web-Grounded Plan'}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'يبحث عن مطاعم صحية وأماكن مشي حقيقية في مدن اليونان حسب هدفك وحالتك.'
                  : 'Searches live sources for authentic Greek restaurants, dishes, and active routes.'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-1">
              <p className="font-bold text-[#082F5E] dark:text-white">
                {isAr ? '2. جدول سعرات ونسبة الوزن' : '2. Calorie & Weight Forecast'}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'جدول يومي بأنواع الطعام والسعرات وحساب نسبة فقدان أو زيادة الوزن المتوقعة.'
                  : 'Structured meal table with kcal, macros, and projected % / kg weight change.'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-1">
              <p className="font-bold text-[#082F5E] dark:text-white">
                {isAr ? '3. ملف PDF بشعار التطبيق وحفظ بالهاتف' : '3. Branded AEGEA PDF & Mobile Save'}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'تصدير PDF أنيق باللغة العربية أو أي لغة مع إمكانية الحفظ المباشر على الهاتف.'
                  : 'High-DPI Arabic/English/Greek PDF with AEGEA logo and phone share/save.'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-3">
            {user?.email && (
              <p className="text-xs font-mono font-bold text-[#0D5EAF] dark:text-sky-300">
                {isAr ? `حسابك: ${user.email}` : `Account: ${user.email}`}
              </p>
            )}
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              maxLength={200}
              placeholder={
                isAr
                  ? 'ملاحظة اختيارية لإيصال €3/شهر (مثلاً: تحويل بنكي / فوري)'
                  : 'Optional €3/month payment reference'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1D36] text-xs text-[#082F5E] dark:text-white"
            />
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => void handleRequestAddonViaWhatsapp()}
                className="flex-1 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'إرسال إيصال €3/شهر عبر واتساب للتفعيل'
                    : 'Send €3/mo Receipt via WhatsApp to Activate'}
                </span>
              </button>
              <button
                type="button"
                disabled={refreshingStatus}
                onClick={() => void handleRefreshActivation()}
                className="py-3 px-5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                {refreshingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{isAr ? 'تحديث حالة التفعيل' : 'Refresh Status'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Planner Input Form */}
      {hasWellnessAccess && (
        <form
          onSubmit={handleGeneratePlan}
          className="rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] p-5 sm:p-7 space-y-6"
        >
          {/* Step 1: Select Primary Wellness Goal */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              {isAr ? '1. اختر هدف الخطة الصحية' : '1. Select Your Health & Weight Goal'}
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {goalOptions.map((opt) => {
                const active = goalType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGoalType(opt.id)}
                    className={`p-4 rounded-xl border-2 text-start transition-colors cursor-pointer flex items-start gap-3 ${
                      active
                        ? 'border-[#0D5EAF] bg-sky-50/70 dark:bg-[#082F5E] dark:border-sky-400'
                        : 'border-slate-200 dark:border-[#163256] bg-[#F7FAFE]/60 dark:bg-[#061325] hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-[#0D5EAF] text-white'
                          : 'bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] text-[#0D5EAF] dark:text-sky-400'
                      }`}
                    >
                      {opt.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#082F5E] dark:text-white">{opt.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Destination, Duration, Weight & Activity Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'الوجهة في اليونان' : 'Greek Destination'}
              </label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-semibold text-[#082F5E] dark:text-white"
              >
                {GREEK_WELLNESS_DESTINATIONS.map((city) => (
                  <option key={city} value={city}>
                    {t.cities?.[city] || city}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'أو مدينة مخصصة (اختياري)' : 'Or Custom Destination (Optional)'}
              </label>
              <input
                type="text"
                value={customDestination}
                onChange={(e) => setCustomDestination(e.target.value)}
                maxLength={100}
                placeholder={isAr ? 'مثلاً: ميكونوس أو زاكينثوس...' : 'e.g. Milos, Zakynthos...'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm text-[#082F5E] dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'نطاق ومدة الخطة' : 'Plan Scope & Duration'}
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDurationDays(1)}
                  className={`flex-1 py-2.5 px-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    durationDays === 1
                      ? 'bg-[#0D5EAF] text-white border-[#0D5EAF]'
                      : 'bg-[#F7FAFE] dark:bg-[#061325] text-[#082F5E] dark:text-slate-200 border-slate-200 dark:border-[#163256] hover:border-[#0D5EAF]'
                  }`}
                >
                  {isAr ? 'اليوم فقط (1)' : isEl ? 'Σήμερα (1)' : 'Today (1d)'}
                </button>
                <button
                  type="button"
                  onClick={() => setDurationDays(7)}
                  className={`flex-1 py-2.5 px-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    durationDays === 7
                      ? 'bg-[#0D5EAF] text-white border-[#0D5EAF]'
                      : 'bg-[#F7FAFE] dark:bg-[#061325] text-[#082F5E] dark:text-slate-200 border-slate-200 dark:border-[#163256] hover:border-[#0D5EAF]'
                  }`}
                >
                  {isAr ? 'أسبوع (7)' : isEl ? 'Εβδομάδα (7)' : '1 Week (7d)'}
                </button>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={durationDays}
                  aria-label={isAr ? 'عدد الأيام' : 'Days'}
                  onChange={(e) => setDurationDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
                  className="w-14 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-bold text-center text-[#082F5E] dark:text-white tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'مستوى النشاط والحركة' : 'Daily Activity Level'}
              </label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value as WellnessActivityLevel)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-semibold text-[#082F5E] dark:text-white"
              >
                <option value="light">{isAr ? 'خفيف (مشي مريح ~6,000 خطوة)' : 'Light (~6,000 steps/day)'}</option>
                <option value="moderate">{isAr ? 'متوسط (استكشاف نشط ~8,500 خطوة)' : 'Moderate (~8,500 steps/day)'}</option>
                <option value="active">{isAr ? 'نشيط (مسارات وسباحة ~11,000 خطوة)' : 'Active (~11,000 steps/day)'}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'الوزن الحالي (كجم)' : 'Current Weight (kg)'}
              </label>
              <input
                type="number"
                min={35}
                max={240}
                step="0.5"
                value={currentWeightKg}
                onChange={(e) => setCurrentWeightKg(Number(e.target.value) || 75)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-bold text-[#082F5E] dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'الوزن المستهدف (كجم)' : 'Target Weight (kg)'}
              </label>
              <input
                type="number"
                min={35}
                max={240}
                step="0.5"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                placeholder={isAr ? 'اختياري' : 'Optional'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-bold text-[#082F5E] dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'سعرات يومية مخصصة (اختياري)' : 'Custom Daily kcal (Optional)'}
              </label>
              <input
                type="number"
                min={1100}
                max={4500}
                step={50}
                value={dailyCalorieTarget}
                onChange={(e) => setDailyCalorieTarget(e.target.value)}
                placeholder={isAr ? 'تلقائي حسب الهدف' : 'Auto-calculated'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm font-bold text-[#082F5E] dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                {isAr ? 'الحالة الصحية أو تفضيلات إضافية' : 'Health / Dietary Notes'}
              </label>
              <input
                type="text"
                value={customGoalNotes}
                onChange={(e) => setCustomGoalNotes(e.target.value)}
                maxLength={350}
                placeholder={isAr ? 'مثلاً: سكري، حلال، بدون ألبان...' : 'e.g. halal, low sodium, knee-friendly...'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#163256] bg-[#F7FAFE] dark:bg-[#061325] text-sm text-[#082F5E] dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-[#163256]">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {healthProfile.conditions.length > 0
                ? isAr
                  ? `سيتم دمج ملفك الصحي تلقائياً: ${healthProfile.conditions.join(' · ')}`
                  : `Auto-synced Health Profile: ${healthProfile.conditions.join(' · ')}`
                : isAr
                ? 'يمكنك إضافة أي أمراض مزمنة أو حساسية غذائية من زر "ملفك الصحي" بالأعلى.'
                : 'Add chronic conditions or allergies via Health Profile above if needed.'}
            </p>

            <button
              type="submit"
              disabled={loadingPlan}
              className="px-6 py-3 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {loadingPlan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {isAr ? 'جاري البحث في الويب وتوليد الجدول...' : 'Searching Web & Building Schedule...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isAr
                      ? 'بحث بالذكاء وتوليد الجدول الصحي والوزن'
                      : 'Search Web & Generate Health Schedule'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Generated Wellness Plan Output */}
      {planResult && (
        <div className="space-y-6">
          {/* Top Action & Export Bar */}
          <div className="rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-[#082F5E] border border-[#0D5EAF]/20 flex items-center justify-center shrink-0">
                  <BrandLogoMark className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#082F5E] dark:text-white">
                    {planResult.headline}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {planResult.summary}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={exportingPdf !== null}
                  onClick={() => void handleExportPdf('download')}
                  className="px-4 py-2.5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {exportingPdf === 'download' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  <span>
                    {isAr ? 'تصدير PDF احترافي بشعار AEGEA' : 'Export Branded AEGEA PDF'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={exportingPdf !== null}
                  onClick={() => void handleExportPdf('share')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {exportingPdf === 'share' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  <span>{isAr ? 'حفظ ومشاركة في الهاتف' : 'Save to Phone'}</span>
                </button>
              </div>
            </div>

            {/* 4 KPI Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
              <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'السعرات اليومية المستهدفة' : 'Daily Calorie Target'}
                </p>
                <p className="text-2xl font-extrabold text-[#0D5EAF] dark:text-sky-400 mt-1">
                  {planResult.recommendedDailyCalories} kcal
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {planResult.macroSplitSummary}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'حرق النشاط وصافي الفرق' : 'Active Burn & Net Delta'}
                </p>
                <p className="text-2xl font-extrabold text-[#082F5E] dark:text-white mt-1">
                  {planResult.estimatedDailyBurnCalories} kcal
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {planResult.dailyNetCalorieDelta >= 0 ? '+' : ''}
                  {planResult.dailyNetCalorieDelta} kcal/day
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  {isAr
                    ? `نسبة تغير الوزن (${
                        planResult.durationDays === 1
                          ? 'اليوم فقط'
                          : planResult.durationDays === 7
                          ? 'لمدة أسبوع - 7 أيام'
                          : `${planResult.durationDays} أيام`
                      })`
                    : `Expected Trip Change (${planResult.durationDays}d)`}
                </p>
                <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                  {planResult.expectedTripWeightChangePercent > 0 ? '+' : ''}
                  {planResult.expectedTripWeightChangePercent}%
                </p>
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {planResult.expectedTripWeightChangeKg > 0 ? '+' : ''}
                  {planResult.expectedTripWeightChangeKg} kg
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  {isAr ? 'المعدل الشهري المتوقع (30 يوم)' : 'Projected 30-Day Rate'}
                </p>
                <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">
                  {planResult.projectedMonthlyChangePercent > 0 ? '+' : ''}
                  {planResult.projectedMonthlyChangePercent}%
                </p>
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
                  {planResult.projectedMonthlyChangeKg > 0 ? '+' : ''}
                  {planResult.projectedMonthlyChangeKg} kg / 30d
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-[#061325] border border-sky-200 dark:border-[#163256] text-xs text-[#082F5E] dark:text-sky-200 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{planResult.healthAdaptationSummary}</span>
              <span className="font-bold text-[#0D5EAF] dark:text-sky-300 tabular-nums">
                {planResult.weightProjectionLabel}
              </span>
            </div>
          </div>

          {/* Day-by-Day Structured Schedule Tables */}
          <div className="space-y-5">
            {planResult.days.map((day) => (
              <div
                key={day.dayNumber}
                className="rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] overflow-hidden"
              >
                {/* Day Header */}
                <div className="px-5 py-4 bg-[#082F5E] text-white flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-base sm:text-lg">{day.dayTitle}</h3>
                    <p className="text-xs text-sky-200 mt-0.5 tabular-nums">
                      {day.dailyWeightTrendNote}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-bold tabular-nums">
                    <span className="inline-flex items-center gap-1.5 text-sky-200">
                      <Flame className="w-4 h-4 text-amber-300" />
                      <span>
                        {day.totalDailyCalories} kcal · {isAr ? 'حرق' : 'Burn'} {day.estimatedActiveBurnKcal}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sky-200">
                      <Droplets className="w-3.5 h-3.5 text-sky-300" />
                      <span>{day.hydrationLiters}L</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sky-200">
                      <Footprints className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{day.dailyStepGoal.toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                {/* Places & Activities Route Strip */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#F7FAFE] dark:bg-[#061325] border-b border-slate-200 dark:border-[#163256] text-xs">
                  <div className="space-y-1">
                    <p className="font-bold text-[#0D5EAF] dark:text-sky-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isAr ? 'الصباح والأماكن' : 'Morning Places & Walk'}</span>
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      {day.morningPlaceAndActivity}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-[#0D5EAF] dark:text-sky-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isAr ? 'الظهيرة والجولة' : 'Afternoon Landmark Route'}</span>
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      {day.afternoonPlaceAndActivity}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-[#0D5EAF] dark:text-sky-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isAr ? 'المساء والاسترخاء' : 'Evening Recovery'}</span>
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      {day.eveningPlaceAndActivity}
                    </p>
                  </div>
                </div>

                {/* Meals & Calorie Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#082F5E]/60 border-b border-slate-200 dark:border-[#163256] text-slate-600 dark:text-slate-300">
                        <th className="py-3 px-4 font-bold text-start">{isAr ? 'الوجبة' : 'Meal'}</th>
                        <th className="py-3 px-4 font-bold text-start">
                          {isAr ? `مكان تناول الوجبة (${planResult.destination})` : `Meal Spot (${planResult.destination})`}
                        </th>
                        <th className="py-3 px-4 font-bold text-start">{isAr ? 'الطبق المقترح' : 'Dish & Greek Name'}</th>
                        <th className="py-3 px-4 font-bold text-start">{isAr ? 'نوع الطعام والكمية' : 'Food Type & Portion'}</th>
                        <th className="py-3 px-4 font-bold text-start">{isAr ? 'السعرات والمغذيات' : 'Calories & Macros'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#163256]">
                      {day.meals.map((meal, idx) => (
                        <tr
                          key={`${day.dayNumber}-${idx}`}
                          className="hover:bg-sky-50/40 dark:hover:bg-[#061325]/70 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-bold text-[#0D5EAF] dark:text-sky-400 whitespace-nowrap align-top">
                            <span className="inline-flex items-center gap-1.5">
                              <Utensils className="w-3.5 h-3.5 shrink-0" />
                              <span>{meal.mealType}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-200 align-top">
                            <p className="font-semibold text-[#082F5E] dark:text-white leading-snug">
                              {meal.venueOrSetting}
                            </p>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                `${meal.venueOrSetting} ${planResult.destination} Greece`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline mt-1"
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{isAr ? 'الموقع على الخريطة' : 'Open on Map'}</span>
                            </a>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <p className="font-bold text-[#082F5E] dark:text-white">{meal.dishName}</p>
                            {meal.greekDishName && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {meal.greekDishName}
                              </p>
                            )}
                            {meal.healthBenefitNote && (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                                {meal.healthBenefitNote}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 align-top">
                            <p className="font-semibold text-[#082F5E] dark:text-slate-200">
                              {meal.foodCategory}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {meal.portionGuide}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 align-top tabular-nums whitespace-nowrap">
                            <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                              {meal.calories} kcal
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              P:{meal.proteinGrams}g · C:{meal.carbsGrams}g · F:{meal.fatGrams}g
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Grounded Web Sources & Medical Disclaimer */}
          <div className="space-y-3">
            {planResult.groundingSources && planResult.groundingSources.length > 0 && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] space-y-2">
                <p className="text-xs font-bold text-[#082F5E] dark:text-white">
                  {isAr ? 'مصادر البحث المباشر من الويب:' : 'Live Web Grounding Sources:'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {planResult.groundingSources.map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D5EAF] dark:text-sky-300 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[240px]">{src.title || src.uri}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {planResult.medicalSafetyNote && (
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                {planResult.medicalSafetyNote}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

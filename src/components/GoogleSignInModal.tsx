import React, { useState, useEffect } from 'react';
import { Language, SubscriptionPlan, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import {
  registerWithEmail,
  reloadCurrentFirebaseUser,
  resendVerificationEmail,
  resetPasswordEmail,
  signInWithEmail,
  syncSignedInUserProfile,
} from '../firebase';
import {
  clearRememberedEmail,
  getRememberedEmail,
  getRememberEmailPreference,
  saveRememberedEmail,
  setRememberEmailPreference,
} from '../utils/rememberedAuth';
import {
  X,
  CheckSquare,
  Square,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  MessageCircle,
  CheckCircle2,
  Mail,
  Lock,
  User as UserIcon,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  currentLang: Language;
  adminSetupRequired?: boolean;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  currentLang,
  adminSetupRequired = false,
  onSessionUpdated,
}) => {
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [fullName, setFullName] = useState('');
  const [rememberEmail, setRememberEmail] = useState<boolean>(() => getRememberEmailPreference());
  const [emailInput, setEmailInput] = useState<string>(() => getRememberedEmail());
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan>('monthly');
  const [needsVerificationUser, setNeedsVerificationUser] = useState<User | null>(null);
  const [pendingApprovalUser, setPendingApprovalUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setLoading(false);
      setNeedsVerificationUser(null);
      setPendingApprovalUser(null);
      setRememberEmail(getRememberEmailPreference());
      const remembered = getRememberedEmail();
      if (remembered) {
        setEmailInput(remembered);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const finalizeSignedInUser = (syncedUser: User) => {
    if (onSessionUpdated) {
      onSessionUpdated(syncedUser, adminSetupRequired);
    }

    if (syncedUser.isAdmin || syncedUser.isPremium) {
      setSuccessMsg(
        syncedUser.isAdmin
          ? t.auth.adminBadge
          : isAr
          ? 'تم تسجيل الدخول واشتراكك مفعّل!'
          : 'Signed in & Subscription Active!'
      );
      setTimeout(() => {
        onClose();
      }, 750);
      return;
    }

    if (syncedUser.emailVerified === false) {
      setNeedsVerificationUser(syncedUser);
      setPendingApprovalUser(null);
      return;
    }

    setNeedsVerificationUser(null);
    setPendingApprovalUser(syncedUser);
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || passwordInput.length < 6) {
      setErrorMsg(
        isAr
          ? 'أدخل بريداً إلكترونياً صحيحاً وكلمة مرور من 6 أحرف على الأقل.'
          : 'Enter a valid email address and a password of at least 6 characters.'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      saveRememberedEmail(cleanEmail, rememberEmail);
      if (authMode === 'register') {
        const { firebaseUser } = await registerWithEmail({
          name: fullName.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          password: passwordInput,
        });
        const synced = await syncSignedInUserProfile(firebaseUser, { requestedPlan });
        finalizeSignedInUser(synced);
      } else {
        const fbUser = await signInWithEmail(cleanEmail, passwordInput);
        const synced = await syncSignedInUserProfile(fbUser, { requestedPlan });
        finalizeSignedInUser(synced);
      }
    } catch (err: any) {
      const code = String(err?.code || '');
      const msgStr = String(err?.message || '');
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          isAr
            ? 'يرجى تفعيل طريقة الدخول بالبريد الإلكتروني في إعدادات المشروع.'
            : 'Email/Password sign-in needs to be enabled in authentication settings.'
        );
      } else if (code === 'auth/unauthorized-domain' || /unauthorized-domain/i.test(msgStr)) {
        setErrorMsg(t.auth.signInGenericError);
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg(
          isAr
            ? 'هذا البريد الإلكتروني مسجل مسبقاً. سجّل الدخول أو اضغط "نسيت / تعيين كلمة مرور".'
            : 'This email is already registered. Sign in or click "Forgot Password".'
        );
        setAuthMode('signin');
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          isAr
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يمكنك الضغط على "نسيت / تعيين كلمة مرور" لإعداد كلمة مرور جديدة.'
            : 'Incorrect email or password. Click "Forgot Password" to reset or set a password.'
        );
      } else {
        setErrorMsg(err?.message || t.auth.signInGenericError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(isAr ? 'اكتب بريدك الإلكتروني أولاً لاستعادة كلمة المرور.' : 'Enter your email address above first.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await resetPasswordEmail(cleanEmail);
      setSuccessMsg(t.auth.resetSentMsg);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAfterVerify = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const freshUser = await reloadCurrentFirebaseUser();
      if (!freshUser) {
        throw new Error(isAr ? 'يرجى تسجيل الدخول مرة أخرى.' : 'Please sign in again.');
      }
      const synced = await syncSignedInUserProfile(freshUser, { requestedPlan });
      finalizeSignedInUser(synced);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await resendVerificationEmail();
      setSuccessMsg(isAr ? 'تم إرسال رابط التفعيل لبريدك.' : 'Verification link re-sent to your email.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#061325]/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#0B1D36] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#163256] overflow-hidden my-6">
        <div className="aegean-meander-border w-full" />

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-[#163256] flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-[#082F5E] dark:text-white tracking-tight">
              {t.auth.chooseAccount}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.auth.googleAccount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-[#082F5E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
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

          {needsVerificationUser ? (
            <div className="space-y-4 p-4 rounded-xl bg-sky-50 dark:bg-[#061325] border border-[#0D5EAF]/30">
              <h3 className="text-sm font-bold text-[#082F5E] dark:text-white">
                {t.auth.verifyEmailTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.auth.verifyEmailDesc} ({needsVerificationUser.email})
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefreshAfterVerify}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>{t.auth.refreshStatusBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResendLink}
                  className="w-full py-2 px-4 rounded-xl border border-[#0D5EAF] text-[#0D5EAF] dark:text-sky-300 text-xs font-bold cursor-pointer"
                >
                  {t.auth.resendVerifyBtn}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsVerificationUser(null);
                    setErrorMsg(null);
                  }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BackArrow className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رجوع للسابق' : 'Back'}</span>
                </button>
              </div>
            </div>
          ) : pendingApprovalUser ? (
            <div className="space-y-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
              <h3 className="text-sm font-bold text-[#082F5E] dark:text-white">
                {t.auth.pendingApprovalTitle}
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {t.auth.pendingApprovalDesc}
              </p>
              <p className="text-xs font-mono font-bold text-[#0D5EAF] dark:text-sky-300">
                {pendingApprovalUser.email}
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href={apiUrl(
                    `/api/subscribe-whatsapp?plan=${encodeURIComponent(
                      pendingApprovalUser.requestedPlan || requestedPlan
                    )}&lang=${encodeURIComponent(currentLang)}&email=${encodeURIComponent(
                      pendingApprovalUser.email
                    )}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t.auth.subscribeWhatsappBtn}</span>
                </a>
                <button
                  type="button"
                  onClick={handleRefreshAfterVerify}
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-[#082F5E] dark:text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isAr ? 'تحديث حالة التفعيل' : 'Refresh Approval Status'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingApprovalUser(null);
                    setErrorMsg(null);
                  }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BackArrow className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رجوع للسابق' : 'Back'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode Switcher: Sign In vs Create New Account */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#061325] border border-slate-200 dark:border-[#163256]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    authMode === 'signin'
                      ? 'bg-white dark:bg-[#0B1D36] text-[#082F5E] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'تسجيل الدخول' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white dark:bg-[#0B1D36] text-[#082F5E] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'إنشاء حساب جديد' : 'Create New Account'}
                </button>
              </div>

              {/* Email Sign-In / Sign-Up Form */}
              <form method="post" onSubmit={handleEmailAuthSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <div className="space-y-1">
                    <label
                      htmlFor="modal-auth-name"
                      className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block"
                    >
                      {t.auth.fullNameLabel}
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="modal-auth-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={isAr ? 'الاسم الكامل' : 'Your full name'}
                        className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="modal-auth-email"
                      className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block"
                    >
                      {t.auth.emailLabel}
                    </label>
                    {emailInput.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          clearRememberedEmail();
                          setEmailInput('');
                          setPasswordInput('');
                          setErrorMsg(null);
                        }}
                        className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-[#0D5EAF] dark:hover:text-sky-400 transition-colors cursor-pointer"
                      >
                        {isAr ? 'تغيير البريد' : 'Switch email'}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="modal-auth-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="modal-auth-password"
                      className="text-xs font-bold text-[#082F5E] dark:text-slate-200"
                    >
                      {t.auth.passwordLabel}
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[11px] font-semibold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer"
                      >
                        {isAr ? 'نسيت / تعيين كلمة مرور' : t.auth.forgotPasswordBtn}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="modal-auth-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full ps-9 pe-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#082F5E] dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Keep email saved for next sign-in */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !rememberEmail;
                    setRememberEmail(next);
                    setRememberEmailPreference(next);
                    if (next && emailInput.trim().includes('@')) {
                      saveRememberedEmail(emailInput, true);
                    }
                  }}
                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none py-0.5"
                >
                  {rememberEmail ? (
                    <CheckSquare className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="font-semibold">
                    {isAr ? 'تثبيت البريد الإلكتروني للدخول القادم' : 'Remember my email for next visit'}
                  </span>
                </button>

                {authMode === 'register' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                      {t.auth.selectPlanLabel}
                    </label>
                    <select
                      value={requestedPlan}
                      onChange={(e) => setRequestedPlan(e.target.value as SubscriptionPlan)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs text-[#082F5E] dark:text-white cursor-pointer"
                    >
                      <option value="monthly">{isAr ? 'اشتراك شهري غير محدود (€5 شهرياً)' : 'Monthly Unlimited VIP (€5/month)'}</option>
                      <option value="annual">{isAr ? 'اشتراك سنوي غير محدود (€50 سنوياً)' : 'Annual Unlimited VIP (€50/year)'}</option>
                    </select>
                  </div>
                )}

                {/* Terms checkbox */}
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTermsAgreed(!termsAgreed);
                      setErrorMsg(null);
                    }}
                    className="mt-0.5 text-amber-900 dark:text-amber-300 shrink-0 cursor-pointer"
                    aria-label="Agree to Terms"
                  >
                    {termsAgreed ? (
                      <CheckSquare className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400" />
                    ) : (
                      <Square className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                    )}
                  </button>
                  <div className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                    <span>{t.auth.termsAgreementCheckbox} </span>
                    <button
                      type="button"
                      onClick={onOpenTerms}
                      className="font-semibold underline text-[#0D5EAF] dark:text-sky-400 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>{t.auth.termsLinkText}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {authMode === 'register' ? t.auth.createAccountBtn : t.auth.signInEmailBtn}
                  </span>
                </button>
              </form>

              <div className="flex items-center justify-between gap-2 pt-1">
                {authMode === 'register' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setErrorMsg(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    <BackArrow className="w-3.5 h-3.5" />
                    <span>{isAr ? 'رجوع لتسجيل الدخول' : 'Back to Sign In'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setErrorMsg(null);
                    }}
                    className="text-xs font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer mx-auto"
                  >
                    {t.auth.switchToRegister}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

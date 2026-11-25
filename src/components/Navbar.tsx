import React, { useState } from 'react';
import { Language, User, ActiveTab, Theme, HealthProfile } from '../types';
import {
  SUPPORTED_LANGUAGES,
  getLanguageShortLabel,
  useUiTranslation,
} from '../hooks/useTranslatedContent';
import { BrandLockup } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallBanner';
import {
  Globe,
  Shield,
  Crown,
  LogOut,
  Check,
  Sun,
  Moon,
  Clock,
  Menu,
  X,
  Loader2,
  Languages,
  HeartPulse,
  Users,
  MailCheck,
  KeyRound,
  LogIn,
} from 'lucide-react';

interface NavbarProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  user: User | null;
  authReady: boolean;
  onOpenSignIn: () => void;
  onOpenVipCode?: () => void;
  onSignOut: () => void;
  onOpenPremium: () => void;
  onOpenSubscriberDashboard?: () => void;
  pendingSubscribersCount?: number;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  theme: Theme;
  onToggleTheme: () => void;
  favoritesCount?: number;
  healthProfile?: HealthProfile;
  onOpenHealthSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLang,
  onLanguageChange,
  user,
  authReady,
  onOpenSignIn,
  onOpenVipCode,
  onSignOut,
  onOpenPremium,
  onOpenSubscriberDashboard,
  pendingSubscribersCount = 0,
  activeTab,
  onTabChange,
  theme,
  onToggleTheme,
  favoritesCount = 0,
  healthProfile,
  onOpenHealthSettings,
}) => {
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customLangInput, setCustomLangInput] = useState('');
  const { t, isTranslatingUi } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');

  const primaryNavItems: { id: ActiveTab; label: string }[] = [
    { id: 'matchmaker', label: t.nav.matchmaker },
    { id: 'explore', label: t.nav.explore },
    { id: 'dishes', label: t.nav.dishes },
    { id: 'hidden-gems', label: t.nav.hiddenGems },
    {
      id: 'favorites',
      label:
        favoritesCount > 0
          ? `${t.nav.favorites || 'Saved Trip'} (${favoritesCount})`
          : t.nav.favorites || 'Saved Trip',
    },
    { id: 'about', label: t.nav.about },
    { id: 'terms', label: t.nav.terms },
  ];

  const allNavItems: { id: ActiveTab; label: string; isTranslator?: boolean }[] = [
    ...primaryNavItems,
    { id: 'translator', label: t.nav.translator || 'Live Translator', isTranslator: true },
  ];

  const handleNavClick = (tab: ActiveTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  const handleApplyCustomLang = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customLangInput.trim();
    if (!cleaned) return;
    onLanguageChange(cleaned);
    setCustomLangInput('');
    setLangMenuOpen(false);
  };

  const isSignedInAccount = Boolean(user && (!user.isGuest || user.isPremium || user.isAdmin));
  const statusShortLabel = user?.isAdmin
    ? t.monetization.unlimitedValue || '∞'
    : user?.isPremium
    ? t.auth.approvedStatusLabel || (isAr ? 'مفعّل' : 'Active')
    : user && !user.isGuest
    ? user.emailVerified === false
      ? isAr
        ? 'تأكيد الإيميل'
        : 'Verify Email'
      : user.approvalStatus === 'rejected'
      ? t.auth.rejectedStatusLabel || (isAr ? 'موقوف' : 'Suspended')
      : t.auth.pendingStatusLabel || (isAr ? 'بانتظار الموافقة' : 'Pending')
    : isAr
    ? 'زائر'
    : 'Guest';

  const accountDisplayTitle = user?.isAdmin
    ? user.name || t.monetization.adminRoleLabel
    : user?.isPremium
    ? user.name || t.monetization.vipUnlimitedLabel
    : user && !user.isGuest
    ? user.name || user.email
    : t.auth.guestExplorerName || (isAr ? 'متصفح زائر' : 'Guest Explorer');

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#061325]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#163256] transition-colors print:hidden">
      <div className="aegean-meander-border w-full" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Row: Brand Lockup & App Utilities */}
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Zone 1: Brand Crest + AEGEA + Smart Guide Subtitle */}
          <button
            type="button"
            onClick={() => handleNavClick('matchmaker')}
            className="whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D5EAF] rounded-lg py-0.5"
          >
            <BrandLockup
              brandName={t.navbar.brandShort}
              subtitle={t.navbar.brandSubtitle || 'Your Smart Guide'}
            />
          </button>

          {/* Zone 2: Primary Action & Compact Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton currentLang={currentLang} />

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 text-[#082F5E] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0B1D36] rounded-lg transition-colors cursor-pointer"
              title={theme === 'dark' ? t.navbar.lightModeLabel : t.navbar.darkModeLabel}
              aria-label="Toggle theme mode"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#082F5E]" />
              )}
            </button>

            {/* Universal Language Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#082F5E] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0B1D36] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                aria-label="Change language"
              >
                {isTranslatingUi ? (
                  <Loader2 className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400" />
                )}
                <span className="uppercase">{getLanguageShortLabel(currentLang)}</span>
              </button>

              {langMenuOpen && (
                <div
                  className="absolute end-0 mt-2 w-64 bg-white dark:bg-[#0B1D36] rounded-2xl shadow-xl border border-slate-200 dark:border-[#163256] py-2 z-50"
                  onMouseLeave={() => setLangMenuOpen(false)}
                >
                  <div className="max-h-60 overflow-y-auto px-1.5 space-y-0.5">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          onLanguageChange(lang.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          currentLang.toLowerCase() === lang.code
                            ? 'bg-sky-50 dark:bg-[#082F5E] text-[#0D5EAF] dark:text-sky-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{lang.nativeName}</span>
                        {currentLang.toLowerCase() === lang.code && (
                          <Check className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Any Custom Global Language Input */}
                  <form
                    onSubmit={handleApplyCustomLang}
                    className="mt-2 pt-2.5 px-3 border-t border-slate-100 dark:border-[#163256] space-y-1.5"
                  >
                    <label
                      htmlFor="custom-lang-input"
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block"
                    >
                      {t.navbar.customLanguageLabel}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="custom-lang-input"
                        type="text"
                        value={customLangInput}
                        onChange={(e) => setCustomLangInput(e.target.value)}
                        placeholder={t.navbar.customLanguagePlaceholder}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#163256] bg-slate-50 dark:bg-[#061325] text-xs text-[#082F5E] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0D5EAF]"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t.navbar.applyLanguageBtn}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Admin Quick Subscribers Dashboard Button */}
            {authReady && user?.isAdmin && onOpenSubscriberDashboard && (
              <button
                type="button"
                onClick={onOpenSubscriberDashboard}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#082F5E] hover:bg-[#0D5EAF] text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-amber-300" />
                <span>{t.auth.subscriberDashboardBtn || (isAr ? 'المشتركين' : 'Subscribers')}</span>
                {pendingSubscribersCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold tabular-nums">
                    {pendingSubscribersCount}
                  </span>
                )}
              </button>
            )}

            {/* Auth CTA / Session Status */}
            {!authReady ? (
              <div className="w-24 h-9 rounded-lg bg-slate-100 dark:bg-[#0B1D36]" />
            ) : isSignedInAccount && user ? (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] transition-colors cursor-pointer"
                >
                  <div
                    className={`w-7 h-7 rounded-full text-white flex items-center justify-center shrink-0 ${
                      user.isAdmin
                        ? 'bg-emerald-700'
                        : user.isPremium
                        ? 'bg-[#0D5EAF]'
                        : user.approvalStatus === 'rejected'
                        ? 'bg-rose-600'
                        : 'bg-amber-600'
                    }`}
                  >
                    {user.isAdmin ? (
                      <Shield className="w-3.5 h-3.5" />
                    ) : user.isPremium ? (
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                    ) : user.emailVerified === false ? (
                      <MailCheck className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="text-start hidden sm:block">
                    <p className="text-xs font-semibold text-[#082F5E] dark:text-white leading-tight truncate max-w-[130px]">
                      {accountDisplayTitle}
                    </p>
                    <p
                      className={`text-[11px] font-semibold leading-tight ${
                        user.isAdmin || user.isPremium
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : user.approvalStatus === 'rejected'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {statusShortLabel}
                    </p>
                  </div>
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute end-0 top-full mt-2 w-72 bg-white dark:bg-[#0B1D36] rounded-2xl shadow-xl border border-slate-200 dark:border-[#163256] p-4 z-50 space-y-3"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="border-b border-slate-100 dark:border-[#163256] pb-3">
                      <p className="text-[11px] text-slate-400">{t.auth.signedInAs}</p>
                      <p className="text-sm font-bold text-[#082F5E] dark:text-white truncate">
                        {accountDisplayTitle}
                      </p>
                      {(user.email || user.codeHint) && (
                        <p className="text-xs text-slate-500 dark:text-slate-300 truncate mt-0.5">
                          {user.email || user.codeHint}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">
                          {t.monetization.currentPlan}
                        </span>
                        <span className="font-bold text-[#082F5E] dark:text-white flex items-center gap-1">
                          {user.isAdmin ? (
                            <>
                              <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>{t.monetization.adminRoleLabel}</span>
                            </>
                          ) : user.isPremium ? (
                            <>
                              <Crown className="w-3.5 h-3.5 text-amber-500" />
                              <span>{t.monetization.vipUnlimitedLabel}</span>
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">{statusShortLabel}</span>
                          )}
                        </span>
                      </div>

                      {user.isAdmin && onOpenSubscriberDashboard && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            onOpenSubscriberDashboard();
                          }}
                          className="w-full py-2 px-3 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span>
                              {t.auth.subscriberDashboardBtn || (isAr ? 'لوحة تحكم المشتركين' : 'Subscribers Dashboard')}
                            </span>
                          </span>
                          {pendingSubscribersCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-extrabold tabular-nums">
                              {pendingSubscribersCount}
                            </span>
                          )}
                        </button>
                      )}

                      {!user.isAdmin && !user.isPremium && (
                        <div className="space-y-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              onOpenPremium();
                            }}
                            className="w-full py-2 px-3 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Crown className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                            <span className="truncate">{t.monetization.upgradeButton}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              if (onOpenVipCode) onOpenVipCode();
                              else onOpenSignIn();
                            }}
                            className="w-full py-2 px-3 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[#082F5E] dark:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5 shrink-0" />
                            <span>{t.auth.enterActivationCode}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {onOpenHealthSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onOpenHealthSettings();
                        }}
                        className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-900 dark:text-emerald-200 transition-colors cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">{t.healthProfile?.menuBtn || 'Health & Dietary Profile'}</span>
                        </span>
                        {((healthProfile?.conditions?.length || 0) + (healthProfile?.allergiesOrNotes ? 1 : 0)) > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold tabular-nums shrink-0">
                            {(healthProfile?.conditions?.length || 0) + (healthProfile?.allergiesOrNotes ? 1 : 0)}
                          </span>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                      className="w-full flex items-center gap-2 py-2 px-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t.auth.signOut}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {onOpenHealthSettings && (
                  <button
                    type="button"
                    onClick={onOpenHealthSettings}
                    className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs font-semibold text-emerald-800 dark:text-emerald-300 cursor-pointer"
                    title={t.healthProfile?.menuBtn || 'Health & Dietary Profile'}
                  >
                    <HeartPulse className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenSignIn}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t.auth.signInWithGoogle}</span>
                </button>
              </div>
            )}

            {/* Quick grid menu toggle on small mobile screens */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 text-[#082F5E] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0B1D36] rounded-lg transition-colors cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Dedicated Full Navigation Strip */}
        <nav
          aria-label="Main Navigation"
          className="border-t border-slate-100 dark:border-[#163256] py-2 flex items-center justify-between gap-2 overflow-x-auto"
        >
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'border-[#0D5EAF] dark:border-sky-400 text-[#082F5E] dark:text-white font-bold'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleNavClick('translator')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
              activeTab === 'translator'
                ? 'bg-[#0D5EAF] border-[#0D5EAF] text-white'
                : 'bg-sky-50 dark:bg-[#0B1D36] border-[#0D5EAF]/25 dark:border-[#163256] text-[#0D5EAF] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-[#082F5E]'
            }`}
          >
            <Languages className="w-4 h-4 shrink-0" />
            <span>{t.nav.translator || 'Live Translator'}</span>
          </button>
        </nav>

        {/* Optional quick grid drawer on small screens */}
        {mobileMenuOpen && (
          <nav className="sm:hidden py-3 border-t border-slate-200 dark:border-[#163256] grid grid-cols-2 gap-2">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3 py-2.5 text-xs font-semibold rounded-lg text-start whitespace-nowrap truncate transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === item.id
                    ? 'bg-sky-50 dark:bg-[#082F5E] text-[#0D5EAF] dark:text-sky-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#0B1D36]'
                }`}
              >
                {item.isTranslator && <Languages className="w-3.5 h-3.5 shrink-0 text-[#0D5EAF] dark:text-sky-400" />}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
};

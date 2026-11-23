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
  MonitorSmartphone,
  Menu,
  X,
  Loader2,
  Languages,
  HeartPulse,
} from 'lucide-react';

interface NavbarProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  user: User | null;
  authReady: boolean;
  onOpenSignIn: () => void;
  onSignOut: () => void;
  onOpenPremium: () => void;
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
  onSignOut,
  onOpenPremium,
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

  // Original first-app navigation tabs kept intact in their original positions
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Row: Brand Lockup & App Utilities */}
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Brand Crest + AEGEA + Smart Guide Subtitle */}
          <button
            type="button"
            onClick={() => handleNavClick('matchmaker')}
            className="whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded-lg py-0.5"
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
              className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={theme === 'dark' ? t.navbar.lightModeLabel : t.navbar.darkModeLabel}
              aria-label="Toggle theme mode"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            {/* Universal Language Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                aria-label="Change language"
              >
                {isTranslatingUi ? (
                  <Loader2 className="w-4 h-4 text-sky-700 dark:text-sky-400 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                )}
                <span className="uppercase">{getLanguageShortLabel(currentLang)}</span>
              </button>

              {langMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50"
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
                            ? 'bg-sky-50 dark:bg-slate-800 text-sky-800 dark:text-sky-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{lang.nativeName}</span>
                        {currentLang.toLowerCase() === lang.code && (
                          <Check className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Any Custom Global Language Input */}
                  <form
                    onSubmit={handleApplyCustomLang}
                    className="mt-2 pt-2.5 px-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5"
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
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-600"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t.navbar.applyLanguageBtn}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Auth CTA / Session Status */}
            {!authReady ? (
              <div className="w-24 h-9 rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : user ? (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-sky-700 text-white flex items-center justify-center shrink-0">
                    {user.isAdmin ? (
                      <Shield className="w-3.5 h-3.5" />
                    ) : user.isPremium ? (
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                    ) : (
                      <MonitorSmartphone className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="text-start hidden sm:block">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[115px]">
                      {user.isAdmin
                        ? t.monetization.adminRoleLabel
                        : user.isPremium
                        ? t.monetization.vipUnlimitedLabel
                        : t.monetization.freeTrialLabel}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums leading-tight">
                      {user.isAdmin
                        ? t.monetization.unlimitedValue || '∞'
                        : user.isPremium
                        ? t.monetization.activePlan
                        : `${user.searchesRemaining}/2`}
                    </p>
                  </div>
                </button>

                {!user.isPremium && !user.isAdmin && (
                  <button
                    type="button"
                    onClick={onOpenSignIn}
                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-300" />
                    <span>{t.auth.signInWithGoogle}</span>
                  </button>
                )}

                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-50 space-y-3"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                      <p className="text-[11px] text-slate-400">{t.auth.signedInAs}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {user.isAdmin
                          ? t.monetization.adminRoleLabel
                          : user.isPremium
                          ? t.monetization.vipPassBadge
                          : t.auth.guestExplorerName || 'Guest Explorer'}
                      </p>
                      {user.codeHint && (
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {user.codeHint}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <MonitorSmartphone className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>{t.auth.guestBannerNotice || t.navbar.syncedDevicesLabel}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">{t.monetization.currentPlan}</span>
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          {user.isAdmin ? (
                            <>
                              <Shield className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                              <span>{t.monetization.adminRoleLabel}</span>
                            </>
                          ) : user.isPremium ? (
                            <>
                              <Crown className="w-3.5 h-3.5 text-amber-500" />
                              <span>{t.monetization.vipUnlimitedLabel}</span>
                            </>
                          ) : (
                            <span>{t.monetization.freeTrialLabel}</span>
                          )}
                        </span>
                      </div>

                      {(user.isAdmin || user.isPremium) ? (
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 tabular-nums pt-1 border-t border-slate-200 dark:border-slate-700">
                          <span>{t.monetization.searchesRemaining}</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {t.monetization.unlimitedValue || '∞'}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>{t.monetization.searchesRemaining}</span>
                            <span className="font-bold text-sky-700 dark:text-sky-400">
                              {user.searchesRemaining} / 2
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              onOpenPremium();
                            }}
                            className="w-full py-2 px-3 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Crown className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{t.monetization.upgradeButton}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              onOpenSignIn();
                            }}
                            className="w-full py-2 px-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <span>{t.auth.enterActivationCode}</span>
                          </button>
                        </>
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

                    {(user.isPremium || user.isAdmin) && (
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
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenSignIn}
                className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {t.auth.signInWithGoogle}
              </button>
            )}

            {/* Quick grid menu toggle on small mobile screens */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Dedicated Full Navigation Strip: Original App Menu Intact + Live Translator Beside It */}
        <nav
          aria-label="Main Navigation"
          className="border-t border-slate-100 dark:border-slate-800/80 py-2 flex items-center justify-between gap-2 overflow-x-auto"
        >
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'border-sky-700 dark:border-sky-400 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
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
                ? 'bg-sky-700 border-sky-700 text-white'
                : 'bg-sky-50 dark:bg-slate-800/90 border-sky-200 dark:border-slate-700 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-700'
            }`}
          >
            <Languages className="w-4 h-4 shrink-0" />
            <span>{t.nav.translator || 'Live Translator'}</span>
          </button>
        </nav>

        {/* Optional quick grid drawer on small screens */}
        {mobileMenuOpen && (
          <nav className="sm:hidden py-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3 py-2.5 text-xs font-semibold rounded-lg text-start whitespace-nowrap truncate transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === item.id
                    ? 'bg-sky-50 dark:bg-slate-800 text-sky-800 dark:text-sky-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {item.isTranslator && <Languages className="w-3.5 h-3.5 shrink-0 text-sky-700 dark:text-sky-400" />}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
};

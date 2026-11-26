import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  Language,
  User,
  ActiveTab,
  Theme,
  FavoriteItem,
  HealthProfile,
} from './types';
import {
  auth,
  firebaseSignOut,
  reloadCurrentFirebaseUser,
  resendVerificationEmail,
  signInWithGoogleMobileTokens,
  subscribeUserProfile,
  syncSignedInUserProfile,
  adminListSubscribers,
  isAdminEmail,
} from './firebase';
import {
  fetchSessionState,
  signOutSession,
  warmUpBackendIfNative,
} from './utils/sessionClient';
import { Navbar } from './components/Navbar';
import { AuthGateScreen } from './components/AuthGateScreen';
import { AccountStatusBanner } from './components/AccountStatusBanner';
import { SubscriberDashboardModal } from './components/SubscriberDashboardModal';
import { MatchmakerView } from './components/MatchmakerView';
import { WellnessPlannerView } from './components/WellnessPlannerView';
import { LiveTranslatorView } from './components/LiveTranslatorView';
import { ExploreView } from './components/ExploreView';
import { DishesView } from './components/DishesView';
import { HiddenGemsView } from './components/HiddenGemsView';
import { FavoritesView } from './components/FavoritesView';
import { AboutDeveloperView } from './components/AboutDeveloperView';
import { TermsView } from './components/TermsView';
import { GoogleSignInModal } from './components/GoogleSignInModal';
import { TermsModal } from './components/TermsModal';
import { PremiumModal } from './components/PremiumModal';
import { Footer } from './components/Footer';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { FloatingWhatsAppButton } from './components/FloatingWhatsAppButton';
import { HealthProfileModal } from './components/HealthProfileModal';
import { isRtlLanguage, useUiTranslation } from './hooks/useTranslatedContent';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'aegea_favorites_v2';
const HEALTH_PROFILE_STORAGE_KEY = 'aegea_health_profile_v1';

const GUEST_USER: User = {
  uid: 'guest_explorer',
  name: 'Guest Explorer',
  email: '',
  avatar: '',
  searchesRemaining: 0,
  isPremium: false,
  termsAccepted: false,
  isAdmin: false,
  isGuest: true,
  emailVerified: false,
  approvalStatus: 'pending',
  subscriptionPlan: 'free',
};

function loadStoredHealthProfile(): HealthProfile {
  try {
    const raw = localStorage.getItem(HEALTH_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        conditions: Array.isArray(parsed?.conditions) ? parsed.conditions : [],
        allergiesOrNotes: typeof parsed?.allergiesOrNotes === 'string' ? parsed.allergiesOrNotes : '',
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    }
  } catch {
    // ignore storage errors
  }
  return { conditions: [], allergiesOrNotes: '' };
}

function makeFavoriteDocId(itemType: string, nameKey: string): string {
  const safe = `${itemType}_${nameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return safe || `${itemType}_${Date.now()}`;
}

function loadStoredFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore storage read errors
  }
  return [];
}

export default function App() {
  const [currentLang, setCurrentLang] = useState<Language>(() => {
    const saved = localStorage.getItem('greek_taverna_lang');
    return (saved as Language) || 'en';
  });

  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('greek_taverna_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('matchmaker');
  const [tabHistory, setTabHistory] = useState<ActiveTab[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [pendingSubscribersCount, setPendingSubscribersCount] = useState(0);

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => loadStoredFavorites());
  const [healthProfile, setHealthProfile] = useState<HealthProfile>(() => loadStoredHealthProfile());

  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isSubscriberDashboardOpen, setIsSubscriberDashboardOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(false);

  const profileUnsubRef = useRef<(() => void) | null>(null);

  // Sync dark mode class on root HTML
  useEffect(() => {
    localStorage.setItem('greek_taverna_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useUiTranslation(currentLang);

  // Sync language and RTL/LTR direction for any language
  useEffect(() => {
    localStorage.setItem('greek_taverna_lang', currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = isRtlLanguage(currentLang) ? 'rtl' : 'ltr';
  }, [currentLang]);

  // Persist favorites cleanly on device
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore quota errors
    }
  }, [favorites]);

  // Pre-warm Render backend if running as native APK or web client
  useEffect(() => {
    void warmUpBackendIfNative();
  }, []);

  // Native Capacitor Google Sign-In Deep Link callback handler (com.aegea.smartguide://auth)
  useEffect(() => {
    let isNative = false;
    try {
      isNative = Capacitor.isNativePlatform();
    } catch {
      isNative = false;
    }
    if (!isNative) return;

    let removed = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('com.aegea.smartguide://auth')) return;
      try {
        await Browser.close().catch(() => {});
        const queryPart = url.split('?')[1] || '';
        const params = new URLSearchParams(queryPart.split('#')[0]);
        const idToken = params.get('idToken');
        const accessToken = params.get('accessToken');
        if (idToken || accessToken) {
          const fbUser = await signInWithGoogleMobileTokens(idToken, accessToken);
          await syncSignedInUserProfile(fbUser);
          setIsSignInOpen(false);
        }
      } catch (err) {
        console.error('Native mobile Google auth callback error:', err);
      }
    }).then((handle) => {
      if (removed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    });

    return () => {
      removed = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  const refreshPendingSubscribersCount = useCallback(async () => {
    try {
      const list = await adminListSubscribers();
      const count = list.filter((u) => !isAdminEmail(u.email) && u.approvalStatus === 'pending').length;
      setPendingSubscribersCount(count);
    } catch {
      // ignore non-critical pending count errors
    }
  }, []);

  // Primary Auth Lifecycle: Firebase Auth (Email + Google) with real-time Firestore approval sync,
  // plus fallback check for VIP Activation Code / Admin Backup Passcode session.
  useEffect(() => {
    let cancelled = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (fbUser) {
        try {
          const synced = await syncSignedInUserProfile(fbUser);
          if (cancelled) return;
          setUser(synced);

          if (fbUser.emailVerified) {
            profileUnsubRef.current = subscribeUserProfile(
              fbUser.uid,
              true,
              (liveUser) => {
                if (!cancelled) {
                  setUser(liveUser);
                }
              },
              (err) => {
                console.warn('Firestore profile listener error:', err);
              }
            );
          }

          if (synced.isAdmin && fbUser.emailVerified && isAdminEmail(fbUser.email)) {
            void refreshPendingSubscribersCount();
          } else {
            setPendingSubscribersCount(0);
            setIsSubscriberDashboardOpen(false);
          }

          // Also fetch adminSetupRequired status & server health profile safely in background
          fetchSessionState()
            .then((session) => {
              if (cancelled) return;
              setAdminSetupRequired(session.adminSetupRequired);
              const srvHealth = session.user?.healthProfile;
              if (srvHealth && (srvHealth.conditions.length > 0 || srvHealth.allergiesOrNotes)) {
                setHealthProfile(srvHealth);
                try {
                  localStorage.setItem(HEALTH_PROFILE_STORAGE_KEY, JSON.stringify(srvHealth));
                } catch {
                  // ignore quota
                }
              }
            })
            .catch(() => {});
        } catch (err) {
          console.error('Firebase profile sync failed:', err);
          if (!cancelled) {
            setUser({
              ...GUEST_USER,
              uid: fbUser.uid,
              email: fbUser.email || '',
              name: fbUser.displayName || fbUser.email || 'Traveler',
              isGuest: false,
              emailVerified: fbUser.emailVerified,
              approvalStatus: 'pending',
            });
          }
        } finally {
          if (!cancelled) {
            setAuthReady(true);
          }
        }
        return;
      }

      // No Firebase Google/Email user signed in -> MUST require mandatory Google/Email sign-in (never auto-promote Admin or bypass login)
      try {
        const session = await fetchSessionState();
        if (!cancelled) {
          setAdminSetupRequired(session.adminSetupRequired);
          setPendingSubscribersCount(0);
          setIsSubscriberDashboardOpen(false);
          setUser(GUEST_USER);
          const srvHealth = session.user?.healthProfile;
          if (srvHealth && (srvHealth.conditions.length > 0 || srvHealth.allergiesOrNotes)) {
            setHealthProfile(srvHealth);
            try {
              localStorage.setItem(HEALTH_PROFILE_STORAGE_KEY, JSON.stringify(srvHealth));
            } catch {
              // ignore storage quota errors
            }
          }
        }
      } catch {
        if (!cancelled) {
          setPendingSubscribersCount(0);
          setIsSubscriberDashboardOpen(false);
          setUser(GUEST_USER);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };
  }, [refreshPendingSubscribersCount]);

  const handleSessionUpdated = useCallback(
    (nextUser: User, nextAdminSetup: boolean) => {
      setAdminSetupRequired(nextAdminSetup);
      setUser((prev) => {
        if (prev && !prev.isGuest && prev.email) {
          return {
            ...prev,
            isPremium: nextUser.isPremium || prev.isPremium,
            subscriptionPlan: nextUser.subscriptionPlan || prev.subscriptionPlan,
            planExpiresAt: nextUser.planExpiresAt || prev.planExpiresAt,
            codeHint: nextUser.codeHint || prev.codeHint,
            searchesRemaining: nextUser.isPremium
              ? 999999
              : typeof nextUser.searchesRemaining === 'number'
              ? nextUser.searchesRemaining
              : prev.searchesRemaining,
          };
        }
        return nextUser;
      });
    },
    []
  );

  const handleSaveHealthProfile = useCallback((nextProfile: HealthProfile, updatedUser?: User) => {
    setHealthProfile(nextProfile);
    try {
      localStorage.setItem(HEALTH_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    } catch {
      // ignore storage quota errors
    }
    if (updatedUser) {
      setUser(updatedUser);
    }
  }, []);

  const handleRefreshAccountStatus = useCallback(async () => {
    const freshFb = await reloadCurrentFirebaseUser();
    if (freshFb) {
      const synced = await syncSignedInUserProfile(freshFb);
      setUser(synced);
      if (synced.isAdmin) {
        void refreshPendingSubscribersCount();
      }
      return;
    }
    try {
      const session = await fetchSessionState();
      setAdminSetupRequired(session.adminSetupRequired);
      if (session.user?.isAdmin || session.user?.isPremium) {
        setUser(session.user);
      }
    } catch {
      // ignore transient error
    }
  }, [refreshPendingSubscribersCount]);

  const handleResendVerification = useCallback(async () => {
    await resendVerificationEmail();
  }, []);

  const handleSignOut = async () => {
    if (profileUnsubRef.current) {
      profileUnsubRef.current();
      profileUnsubRef.current = null;
    }
    await Promise.allSettled([firebaseSignOut(), signOutSession()]);
    setPendingSubscribersCount(0);
    setIsSubscriberDashboardOpen(false);
    setTabHistory([]);
    setActiveTab('matchmaker');
    setUser(GUEST_USER);
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleTabChange = useCallback(
    (nextTab: ActiveTab) => {
      if (nextTab === activeTab) return;
      setTabHistory((prev) => [...prev.slice(-19), activeTab]);
      setActiveTab(nextTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeTab]
  );

  const handleGoBack = useCallback(() => {
    setTabHistory((prev) => {
      if (prev.length === 0) {
        setActiveTab('matchmaker');
        return [];
      }
      const next = [...prev];
      const previousTab = next.pop() || 'matchmaker';
      setActiveTab(previousTab);
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const canGoBack = tabHistory.length > 0 || activeTab !== 'matchmaker';

  const handleOpenAccountModal = () => {
    setIsSignInOpen(true);
  };

  const handleToggleFavorite = useCallback(
    async (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => {
      const favId = makeFavoriteDocId(item.itemType, item.englishName || item.name);
      setFavorites((prev) => {
        const exists = prev.some((f) => f.id === favId);
        if (exists) {
          return prev.filter((f) => f.id !== favId);
        }
        const entry: FavoriteItem = {
          id: favId,
          userId: user?.uid || 'guest',
          itemType: item.itemType,
          name: String(item.name || '').slice(0, 200),
          englishName: String(item.englishName || item.name || '').slice(0, 200),
          greekName: String(item.greekName || '').slice(0, 200),
          region: String(item.region || '').slice(0, 120),
          description: String(item.description || '').slice(0, 1500),
          officialWebsite: String(item.officialWebsite || '').slice(0, 400),
          imageUrl: String(item.imageUrl || '').slice(0, 600),
          priceLevel: String(item.priceLevel || '').slice(0, 20),
          createdAt: Date.now(),
        };
        return [entry, ...prev].slice(0, 100);
      });
    },
    [user?.uid]
  );

  const handleRemoveFavorite = useCallback(async (favId: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== favId));
  }, []);

  const isUnauthenticated = !user || user.isGuest || user.emailVerified === false;

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7FAFE] dark:bg-[#061325] text-[#082F5E] dark:text-white gap-3">
        <div className="w-10 h-10 rounded-full border-3 border-[#0D5EAF]/25 border-t-[#0D5EAF] animate-spin" />
        <p className="text-xs font-bold tracking-wider uppercase text-[#0D5EAF] dark:text-sky-300">
          AEGEA · Smart Greece Guide
        </p>
      </div>
    );
  }

  if (isUnauthenticated) {
    return (
      <>
        <AuthGateScreen
          currentLang={currentLang}
          onLanguageChange={setCurrentLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          pendingVerificationUser={user && !user.isGuest && user.emailVerified === false ? user : null}
          onAuthenticated={(synced) => {
            setUser(synced);
            if (synced.isAdmin && synced.emailVerified !== false && isAdminEmail(synced.email)) {
              void refreshPendingSubscribersCount();
            }
          }}
          onOpenTerms={() => setIsTermsOpen(true)}
          onSignedOutReset={() => {
            setPendingSubscribersCount(0);
            setIsSubscriberDashboardOpen(false);
            setUser(GUEST_USER);
          }}
        />
        <TermsModal
          isOpen={isTermsOpen}
          onClose={() => setIsTermsOpen(false)}
          currentLang={currentLang}
        />
      </>
    );
  }

  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFE] dark:bg-[#061325] text-[#082F5E] dark:text-slate-100 selection:bg-[#0D5EAF] selection:text-white transition-colors duration-200">
      <Navbar
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        user={user}
        authReady={authReady}
        onOpenSignIn={handleOpenAccountModal}
        onSignOut={handleSignOut}
        onOpenPremium={() => setIsPremiumOpen(true)}
        onOpenSubscriberDashboard={() => setIsSubscriberDashboardOpen(true)}
        pendingSubscribersCount={pendingSubscribersCount}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        canGoBack={canGoBack}
        onGoBack={handleGoBack}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        favoritesCount={favorites.length}
        healthProfile={healthProfile}
        onOpenHealthSettings={() => setIsHealthOpen(true)}
      />

      <AccountStatusBanner
        currentLang={currentLang}
        user={user}
        authReady={authReady}
        onOpenSignIn={handleOpenAccountModal}
        onRefreshStatus={handleRefreshAccountStatus}
        onResendVerification={handleResendVerification}
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 w-full">
        {canGoBack && (
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0B1D36] hover:bg-sky-50 dark:hover:bg-[#082F5E] border border-slate-200 dark:border-[#163256] text-xs font-bold text-[#082F5E] dark:text-sky-200 shadow-xs transition-colors cursor-pointer"
            >
              <BackArrow className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400" />
              <span>{isAr ? 'رجوع للسابق' : 'Back to Previous'}</span>
            </button>
          </div>
        )}

        {activeTab === 'matchmaker' && (
          <MatchmakerView
            currentLang={currentLang}
            user={user}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenSignIn={handleOpenAccountModal}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onOpenPartner={() => handleTabChange('about')}
            onOpenTranslator={() => handleTabChange('translator')}
            onSyncUser={(updatedUser) => setUser(updatedUser)}
            healthProfile={healthProfile}
            onOpenHealthSettings={() => setIsHealthOpen(true)}
          />
        )}

        {activeTab === 'wellness' && (
          <WellnessPlannerView
            currentLang={currentLang}
            user={user}
            healthProfile={healthProfile}
            onOpenHealthSettings={() => setIsHealthOpen(true)}
            onSyncUser={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {activeTab === 'translator' && (
          <LiveTranslatorView
            currentLang={currentLang}
            user={user}
            onOpenSignIn={handleOpenAccountModal}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onSyncUser={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {activeTab === 'explore' && (
          <ExploreView
            currentLang={currentLang}
            healthProfile={healthProfile}
            onOpenHealthSettings={() => setIsHealthOpen(true)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'dishes' && (
          <DishesView
            currentLang={currentLang}
            healthProfile={healthProfile}
            onOpenHealthSettings={() => setIsHealthOpen(true)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'hidden-gems' && (
          <HiddenGemsView
            currentLang={currentLang}
            healthProfile={healthProfile}
            onOpenHealthSettings={() => setIsHealthOpen(true)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            currentLang={currentLang}
            user={user}
            favorites={favorites}
            onRemoveFavorite={handleRemoveFavorite}
            onOpenSignIn={handleOpenAccountModal}
            onGoToMatchmaker={() => handleTabChange('matchmaker')}
          />
        )}

        {activeTab === 'about' && <AboutDeveloperView currentLang={currentLang} />}

        {activeTab === 'terms' && <TermsView currentLang={currentLang} />}
      </main>

      <Footer
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        onTabChange={handleTabChange}
      />

      <FloatingWhatsAppButton currentLang={currentLang} />

      <OfflineIndicator currentLang={currentLang} />

      <GoogleSignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onOpenTerms={() => setIsTermsOpen(true)}
        currentLang={currentLang}
        adminSetupRequired={adminSetupRequired}
        onSessionUpdated={handleSessionUpdated}
      />

      <SubscriberDashboardModal
        isOpen={isSubscriberDashboardOpen}
        onClose={() => setIsSubscriberDashboardOpen(false)}
        currentLang={currentLang}
        currentUser={user}
        onPendingCountChange={setPendingSubscribersCount}
      />

      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        currentLang={currentLang}
      />

      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        user={user}
        onSessionUpdated={handleSessionUpdated}
        currentLang={currentLang}
      />

      <HealthProfileModal
        isOpen={isHealthOpen}
        onClose={() => setIsHealthOpen(false)}
        currentLang={currentLang}
        healthProfile={healthProfile}
        onSaveHealthProfile={handleSaveHealthProfile}
      />
    </div>
  );
}

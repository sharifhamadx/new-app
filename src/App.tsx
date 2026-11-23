import { useState, useEffect, useCallback } from 'react';
import {
  Language,
  User,
  ActiveTab,
  Theme,
  FavoriteItem,
} from './types';
import {
  fetchSessionState,
  signOutSession,
} from './utils/sessionClient';
import { Navbar } from './components/Navbar';
import { MatchmakerView } from './components/MatchmakerView';
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
import { isRtlLanguage, useUiTranslation } from './hooks/useTranslatedContent';

const FAVORITES_STORAGE_KEY = 'aegea_favorites_v2';

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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => loadStoredFavorites());

  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [signInInitialTab, setSignInInitialTab] = useState<'vip' | 'admin'>('vip');
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

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

  // Initialize server-verified Guest Trial or restored VIP/Admin session without requiring Google login
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await fetchSessionState();
        if (!cancelled) {
          setUser(session.user);
          setAdminSetupRequired(session.adminSetupRequired);
        }
      } catch {
        if (!cancelled) {
          setUser({
            uid: 'guest_offline',
            name: 'Guest Explorer',
            email: '',
            avatar: '',
            searchesRemaining: 2,
            isPremium: false,
            termsAccepted: false,
            isAdmin: false,
            isGuest: true,
            subscriptionPlan: 'free',
          });
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSessionUpdated = useCallback((nextUser: User, nextAdminSetup: boolean) => {
    setUser(nextUser);
    setAdminSetupRequired(nextAdminSetup);
  }, []);

  const handleSignOut = async () => {
    try {
      const res = await signOutSession();
      setUser(res.user);
      setAdminSetupRequired(res.adminSetupRequired);
    } catch {
      // ignore signout network errors
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleOpenVipModal = () => {
    setSignInInitialTab('vip');
    setIsSignInOpen(true);
  };

  const handleOpenAdminModal = () => {
    setSignInInitialTab('admin');
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-sky-600 selection:text-white transition-colors duration-200">
      <Navbar
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        user={user}
        authReady={authReady}
        onOpenSignIn={handleOpenVipModal}
        onSignOut={handleSignOut}
        onOpenPremium={() => setIsPremiumOpen(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        favoritesCount={favorites.length}
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 w-full">
        {activeTab === 'matchmaker' && (
          <MatchmakerView
            currentLang={currentLang}
            user={user}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenSignIn={handleOpenVipModal}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onOpenPartner={() => {
              setActiveTab('about');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenTranslator={() => {
              setActiveTab('translator');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSyncUser={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {activeTab === 'translator' && <LiveTranslatorView currentLang={currentLang} />}

        {activeTab === 'explore' && <ExploreView currentLang={currentLang} />}

        {activeTab === 'dishes' && <DishesView currentLang={currentLang} />}

        {activeTab === 'hidden-gems' && <HiddenGemsView currentLang={currentLang} />}

        {activeTab === 'favorites' && (
          <FavoritesView
            currentLang={currentLang}
            user={user}
            favorites={favorites}
            onRemoveFavorite={handleRemoveFavorite}
            onOpenSignIn={handleOpenVipModal}
            onGoToMatchmaker={() => setActiveTab('matchmaker')}
          />
        )}

        {activeTab === 'about' && (
          <AboutDeveloperView
            currentLang={currentLang}
            user={user}
            onOpenAdminLogin={handleOpenAdminModal}
          />
        )}

        {activeTab === 'terms' && <TermsView currentLang={currentLang} />}
      </main>

      <Footer
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        onTabChange={setActiveTab}
      />

      <FloatingWhatsAppButton currentLang={currentLang} />

      <OfflineIndicator currentLang={currentLang} />

      <GoogleSignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onOpenTerms={() => setIsTermsOpen(true)}
        currentLang={currentLang}
        initialTab={signInInitialTab}
        adminSetupRequired={adminSetupRequired}
        onSessionUpdated={handleSessionUpdated}
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
        onOpenTerms={() => setIsTermsOpen(true)}
        currentLang={currentLang}
      />
    </div>
  );
}

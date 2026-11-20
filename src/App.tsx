import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { auth, db, isAdminEmail, handleFirestoreError, OperationType, syncSignedInUserProfile } from './firebase';
import {
  Language,
  User,
  ActiveTab,
  Theme,
  SubscriptionPlan,
  FavoriteItem,
} from './types';
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
import { isRtlLanguage, useUiTranslation } from './hooks/useTranslatedContent';

function makeFavoriteDocId(itemType: string, nameKey: string): string {
  const safe = `${itemType}_${nameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return safe || `${itemType}_${Date.now()}`;
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

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const [isSignInOpen, setIsSignInOpen] = useState(false);
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

  // Real Firebase Auth + Firestore real-time user + favorites listener across all devices
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubFavorites: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubFavorites) {
        unsubFavorites();
        unsubFavorites = null;
      }

      if (!fbUser || !fbUser.email) {
        setUser(null);
        setFavorites([]);
        setAuthReady(true);
        return;
      }

      const cleanEmail = fbUser.email.trim().toLowerCase();
      const admin = isAdminEmail(cleanEmail);
      const userRef = doc(db, 'users', fbUser.uid);

      // Hydrate offline favorites cache immediately
      try {
        const offlineFavs = localStorage.getItem(`aegea_favorites_offline_${fbUser.uid}`);
        if (offlineFavs) {
          setFavorites(JSON.parse(offlineFavs));
        }
      } catch {
        // ignore storage errors
      }

      unsubUserDoc = onSnapshot(
        userRef,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (
              admin &&
              (!data.isPremium ||
                data.subscriptionPlan !== 'annual' ||
                Number(data.searchesRemaining ?? 0) < 999999)
            ) {
              updateDoc(userRef, {
                isPremium: true,
                subscriptionPlan: 'annual',
                searchesRemaining: 999999,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
            setUser({
              uid: fbUser.uid,
              name: data.displayName || fbUser.displayName || cleanEmail.split('@')[0],
              email: data.email || cleanEmail,
              avatar:
                data.photoURL ||
                fbUser.photoURL ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=0284c7`,
              searchesRemaining: admin ? 999999 : Number(data.searchesRemaining ?? 2),
              isPremium: admin ? true : Boolean(data.isPremium),
              termsAccepted: Boolean(data.termsAccepted),
              isAdmin: admin,
              subscriptionPlan: admin ? 'annual' : data.subscriptionPlan || 'free',
            });
            setAuthReady(true);
          } else if (!snap.metadata.fromCache) {
            try {
              await syncSignedInUserProfile(fbUser);
            } catch (err) {
              console.error('Failed to sync signed-in profile:', err);
              setAuthReady(true);
            }
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
        }
      );

      // Sync user's Saved Trip Favorites from Firestore + persist offline
      const favsPath = `users/${fbUser.uid}/favorites`;
      unsubFavorites = onSnapshot(
        query(collection(db, favsPath), where('userId', '==', fbUser.uid), limit(100)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...(d.data() as FavoriteItem), id: d.id }))
            .sort((a: any, b: any) => (b?.createdAt?.seconds ?? 0) - (a?.createdAt?.seconds ?? 0));
          setFavorites(list);
          try {
            localStorage.setItem(`aegea_favorites_offline_${fbUser.uid}`, JSON.stringify(list));
          } catch {
            // ignore quota errors
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, favsPath);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
      if (unsubFavorites) unsubFavorites();
    };
  }, []);

  // Handle Chrome Custom Tab -> com.aegea.smartguide://auth deep-link callback inside Android APK
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handlePromise = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('com.aegea.smartguide://auth')) return;
      try {
        await Browser.close().catch(() => {});
        const parsed = new URL(url);
        const idToken = parsed.searchParams.get('idToken') || '';
        const accessToken = parsed.searchParams.get('accessToken') || '';
        if (!idToken && !accessToken) {
          window.dispatchEvent(
            new CustomEvent('aegea:mobile-auth-error', {
              detail: 'Missing Google authentication token.',
            })
          );
          return;
        }
        const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
        const res = await signInWithCredential(auth, credential);
        await syncSignedInUserProfile(res.user);
        setIsSignInOpen(false);
        window.dispatchEvent(new CustomEvent('aegea:mobile-auth-complete'));
      } catch (err: any) {
        console.error('Native mobile auth callback error:', err);
        window.dispatchEvent(
          new CustomEvent('aegea:mobile-auth-error', {
            detail: err?.message || 'Could not complete mobile Google Sign-In.',
          })
        );
      }
    });

    return () => {
      handlePromise.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setFavorites([]);
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleDecrementSearch = async () => {
    if (!user || user.isPremium || user.isAdmin) return;
    const nextCount = Math.max(0, user.searchesRemaining - 1);
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, {
        searchesRemaining: nextCount,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleUpgradeSuccess = async (plan: SubscriptionPlan) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, {
        isPremium: true,
        subscriptionPlan: plan,
        searchesRemaining: 999999,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleToggleFavorite = useCallback(
    async (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => {
      if (!user || !auth.currentUser) {
        setIsSignInOpen(true);
        return;
      }
      const favId = makeFavoriteDocId(item.itemType, item.englishName || item.name);
      const favPath = `users/${user.uid}/favorites/${favId}`;
      const existing = favorites.find((f) => f.id === favId);

      try {
        if (existing) {
          await deleteDoc(doc(db, favPath));
        } else {
          await setDoc(doc(db, favPath), {
            id: favId,
            userId: user.uid,
            itemType: item.itemType,
            name: String(item.name || '').slice(0, 200),
            englishName: String(item.englishName || item.name || '').slice(0, 200),
            greekName: String(item.greekName || '').slice(0, 200),
            region: String(item.region || '').slice(0, 120),
            description: String(item.description || '').slice(0, 1500),
            officialWebsite: String(item.officialWebsite || '').slice(0, 400),
            imageUrl: String(item.imageUrl || '').slice(0, 600),
            priceLevel: String(item.priceLevel || '').slice(0, 20),
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.DELETE : OperationType.CREATE, favPath);
      }
    },
    [user, favorites]
  );

  const handleRemoveFavorite = useCallback(
    async (favId: string) => {
      if (!user) return;
      const favPath = `users/${user.uid}/favorites/${favId}`;
      try {
        await deleteDoc(doc(db, favPath));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, favPath);
      }
    },
    [user]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-sky-600 selection:text-white transition-colors duration-200">
      <Navbar
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        user={user}
        authReady={authReady}
        onOpenSignIn={() => setIsSignInOpen(true)}
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
            onOpenSignIn={() => setIsSignInOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onOpenPartner={() => {
              setActiveTab('about');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenTranslator={() => {
              setActiveTab('translator');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDecrementSearch={handleDecrementSearch}
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
            onOpenSignIn={() => setIsSignInOpen(true)}
            onGoToMatchmaker={() => setActiveTab('matchmaker')}
          />
        )}

        {activeTab === 'about' && (
          <AboutDeveloperView
            currentLang={currentLang}
            user={user}
          />
        )}

        {activeTab === 'terms' && <TermsView currentLang={currentLang} />}
      </main>

      <Footer
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        onTabChange={setActiveTab}
      />

      <OfflineIndicator currentLang={currentLang} />

      <GoogleSignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onOpenTerms={() => setIsTermsOpen(true)}
        currentLang={currentLang}
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
        onUpgradeSuccess={handleUpgradeSuccess}
        currentLang={currentLang}
      />
    </div>
  );
}

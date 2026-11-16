import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isAdminEmail, handleFirestoreError, OperationType } from './firebase';
import { Language, User, ActiveTab, Theme, SubscriptionPlan } from './types';
import { Navbar } from './components/Navbar';
import { MatchmakerView } from './components/MatchmakerView';
import { ExploreView } from './components/ExploreView';
import { DishesView } from './components/DishesView';
import { HiddenGemsView } from './components/HiddenGemsView';
import { AboutDeveloperView } from './components/AboutDeveloperView';
import { TermsView } from './components/TermsView';
import { GoogleSignInModal } from './components/GoogleSignInModal';
import { TermsModal } from './components/TermsModal';
import { PremiumModal } from './components/PremiumModal';
import { Footer } from './components/Footer';
import { isRtlLanguage, useUiTranslation } from './hooks/useTranslatedContent';

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

  // Real Firebase Auth + Firestore real-time user listener across all devices
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!fbUser || !fbUser.email) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      const cleanEmail = fbUser.email.trim().toLowerCase();
      const admin = isAdminEmail(cleanEmail);
      const userRef = doc(db, 'users', fbUser.uid);

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
          } else {
            // Auto-provision user profile if authenticated via Google
            try {
              await setDoc(userRef, {
                uid: fbUser.uid,
                email: cleanEmail,
                displayName: (fbUser.displayName || cleanEmail.split('@')[0]).slice(0, 120),
                photoURL: (fbUser.photoURL || '').slice(0, 500),
                searchesRemaining: admin ? 999999 : 2,
                isPremium: admin,
                subscriptionPlan: admin ? 'annual' : 'free',
                termsAccepted: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `users/${fbUser.uid}`);
            }
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
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
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 w-full">
        {activeTab === 'matchmaker' && (
          <MatchmakerView
            currentLang={currentLang}
            user={user}
            onOpenSignIn={() => setIsSignInOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            onOpenPartner={() => {
              setActiveTab('about');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDecrementSearch={handleDecrementSearch}
          />
        )}

        {activeTab === 'explore' && <ExploreView currentLang={currentLang} />}

        {activeTab === 'dishes' && <DishesView currentLang={currentLang} />}

        {activeTab === 'hidden-gems' && <HiddenGemsView currentLang={currentLang} />}

        {activeTab === 'about' && <AboutDeveloperView currentLang={currentLang} user={user} />}

        {activeTab === 'terms' && <TermsView currentLang={currentLang} />}
      </main>

      <Footer
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        onTabChange={setActiveTab}
      />

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

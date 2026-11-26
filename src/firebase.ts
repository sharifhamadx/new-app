import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { ApprovalStatus, FirestoreUserRecord, SubscriptionPlan, User } from './types';

const app = initializeApp(firebaseConfig);
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const ADMIN_EMAILS = [
  'sharifhamadx122@gmail.com',
] as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(clean);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function toIsoString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 40);
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return '';
    }
  }
  return '';
}

function mapDocToUserRecord(id: string, data: Record<string, any>): FirestoreUserRecord {
  const approvalRaw = String(data.approvalStatus || 'pending');
  const approvalStatus: ApprovalStatus =
    approvalRaw === 'approved' || approvalRaw === 'rejected' ? approvalRaw : 'pending';
  const planRaw = String(data.subscriptionPlan || 'free');
  const subscriptionPlan: 'free' | SubscriptionPlan =
    planRaw === 'weekly_pass' || planRaw === 'monthly' || planRaw === 'annual' ? planRaw : 'free';
  const reqRaw = String(data.requestedPlan || subscriptionPlan || 'monthly');
  const requestedPlan: 'free' | SubscriptionPlan =
    reqRaw === 'weekly_pass' || reqRaw === 'monthly' || reqRaw === 'annual' || reqRaw === 'free'
      ? reqRaw
      : 'monthly';

  return {
    uid: String(data.uid || id),
    email: String(data.email || ''),
    displayName: String(data.displayName || 'Traveler'),
    photoURL: String(data.photoURL || ''),
    searchesRemaining: Number.isFinite(Number(data.searchesRemaining)) ? Number(data.searchesRemaining) : 0,
    isPremium: Boolean(data.isPremium),
    subscriptionPlan,
    approvalStatus,
    requestedPlan,
    subscriptionExpiresAt: String(data.subscriptionExpiresAt || ''),
    paymentNote: String(data.paymentNote || ''),
    approvedBy: String(data.approvedBy || ''),
    approvedAt: String(data.approvedAt || ''),
    wellnessAddonActive: Boolean(data.wellnessAddonActive),
    wellnessAddonExpiresAt: String(data.wellnessAddonExpiresAt || ''),
    wellnessAddonRequested: Boolean(data.wellnessAddonRequested),
    termsAccepted: Boolean(data.termsAccepted),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export function mapRecordToAppUser(rec: FirestoreUserRecord, emailVerified: boolean): User {
  const cleanEmail = rec.email.trim().toLowerCase();
  const adminMatch = isAdminEmail(cleanEmail) && emailVerified;
  const expired =
    Boolean(rec.subscriptionExpiresAt) &&
    Number.isFinite(Date.parse(rec.subscriptionExpiresAt)) &&
    Date.now() > Date.parse(rec.subscriptionExpiresAt);

  const wellnessExpired =
    Boolean(rec.wellnessAddonExpiresAt) &&
    Number.isFinite(Date.parse(rec.wellnessAddonExpiresAt)) &&
    Date.now() > Date.parse(rec.wellnessAddonExpiresAt);

  const isLegacySelfApproved =
    !adminMatch &&
    (rec.approvedBy.trim().toLowerCase() === cleanEmail ||
      rec.paymentNote.trim() === 'Site Administrator');

  const effectivelyApproved =
    adminMatch ||
    (rec.approvalStatus === 'approved' && rec.isPremium && !expired && !isLegacySelfApproved);

  const effectiveWellnessActive =
    adminMatch || (Boolean(rec.wellnessAddonActive) && !wellnessExpired && !isLegacySelfApproved);

  const rawTrials = Number.isFinite(Number(rec.searchesRemaining)) ? Number(rec.searchesRemaining) : 2;
  const boundedTrials =
    rec.approvalStatus === 'rejected' ? 0 : Math.max(0, Math.min(2, Math.floor(rawTrials)));

  return {
    uid: rec.uid,
    name: rec.displayName || rec.email.split('@')[0] || 'Traveler',
    email: rec.email,
    avatar:
      rec.photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(rec.displayName || rec.email)}&backgroundColor=0D5EAF`,
    searchesRemaining: adminMatch || effectivelyApproved ? 999999 : isLegacySelfApproved ? 2 : boundedTrials,
    isPremium: effectivelyApproved,
    termsAccepted: rec.termsAccepted,
    isAdmin: adminMatch,
    isGuest: false,
    emailVerified,
    approvalStatus: adminMatch
      ? 'approved'
      : expired || isLegacySelfApproved
      ? 'pending'
      : rec.approvalStatus,
    requestedPlan: rec.requestedPlan,
    paymentNote: isLegacySelfApproved ? '' : rec.paymentNote,
    subscriptionPlan: adminMatch
      ? 'annual'
      : expired || isLegacySelfApproved
      ? 'free'
      : rec.subscriptionPlan,
    planExpiresAt: effectivelyApproved ? rec.subscriptionExpiresAt || null : null,
    approvedBy: isLegacySelfApproved ? '' : rec.approvedBy,
    approvedAt: isLegacySelfApproved ? null : rec.approvedAt || null,
    wellnessAddonActive: effectiveWellnessActive,
    wellnessAddonExpiresAt: effectiveWellnessActive ? rec.wellnessAddonExpiresAt || null : null,
    wellnessAddonRequested: Boolean(rec.wellnessAddonRequested),
  };
}

export async function getFreshFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const current = auth.currentUser;
  if (!current) return null;
  try {
    return await current.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signInWithGoogleMobileTokens(
  idToken?: string | null,
  accessToken?: string | null
): Promise<FirebaseUser> {
  const credential = GoogleAuthProvider.credential(idToken || undefined, accessToken || undefined);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function registerWithEmail(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ firebaseUser: FirebaseUser; needsEmailVerification: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim().slice(0, 120) || cleanEmail.split('@')[0] || 'Traveler';
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
  try {
    await updateProfile(cred.user, { displayName: cleanName });
  } catch {
    // non-fatal display name update
  }
  if (!cred.user.emailVerified) {
    try {
      await sendEmailVerification(cred.user);
    } catch (err) {
      console.warn('Could not send verification email immediately:', err);
    }
  }
  return {
    firebaseUser: cred.user,
    needsEmailVerification: !cred.user.emailVerified,
  };
}

export async function signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return cred.user;
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No signed-in user session found.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function reloadCurrentFirebaseUser(): Promise<FirebaseUser | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function resetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}

export async function syncSignedInUserProfile(
  fbUser: FirebaseUser,
  options?: { requestedPlan?: 'free' | SubscriptionPlan; paymentNote?: string }
): Promise<User> {
  if (!fbUser.email) {
    throw new Error('Account email is missing.');
  }

  const cleanEmail = fbUser.email.trim().toLowerCase();
  const displayName = (fbUser.displayName || cleanEmail.split('@')[0] || 'Traveler').slice(0, 120);
  const photoURL = (fbUser.photoURL || '').slice(0, 500);
  const requestedPlan: 'free' | SubscriptionPlan = options?.requestedPlan || 'monthly';
  const paymentNote = (options?.paymentNote || '').trim().slice(0, 300);

  // Firestore rules enforce email_verified == true before writes. Return clear unverified pending User object until clicked.
  if (!fbUser.emailVerified) {
    return {
      uid: fbUser.uid,
      name: displayName,
      email: cleanEmail,
      avatar:
        photoURL ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=0D5EAF`,
      searchesRemaining: 0,
      isPremium: false,
      termsAccepted: true,
      isAdmin: false,
      isGuest: false,
      emailVerified: false,
      approvalStatus: 'pending',
      requestedPlan,
      paymentNote,
      subscriptionPlan: 'free',
      planExpiresAt: null,
    };
  }

  const adminUser = isAdminEmail(cleanEmail);
  const userRef = doc(db, 'users', fbUser.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
  }

  const nowIso = new Date().toISOString().slice(0, 40);

  if (!existingSnap || !existingSnap.exists()) {
    const createPayload = adminUser
      ? {
          uid: fbUser.uid,
          email: cleanEmail,
          displayName,
          photoURL,
          searchesRemaining: 999999,
          isPremium: true,
          subscriptionPlan: 'annual',
          approvalStatus: 'approved',
          requestedPlan: 'annual',
          subscriptionExpiresAt: '',
          paymentNote: 'Site Administrator',
          approvedBy: cleanEmail,
          approvedAt: nowIso,
          wellnessAddonActive: true,
          wellnessAddonExpiresAt: '',
          wellnessAddonRequested: false,
          termsAccepted: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      : {
          uid: fbUser.uid,
          email: cleanEmail,
          displayName,
          photoURL,
          searchesRemaining: 2,
          isPremium: false,
          subscriptionPlan: 'free',
          approvalStatus: 'pending',
          requestedPlan,
          subscriptionExpiresAt: '',
          paymentNote,
          approvedBy: '',
          approvedAt: '',
          wellnessAddonActive: false,
          wellnessAddonExpiresAt: '',
          wellnessAddonRequested: false,
          termsAccepted: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

    try {
      await setDoc(userRef, createPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${fbUser.uid}`);
    }

    const mapped = mapDocToUserRecord(fbUser.uid, {
      ...createPayload,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return mapRecordToAppUser(mapped, true);
  }

  const rawData = existingSnap.data() || {};
  const hasApprovalSchema = typeof rawData.approvalStatus === 'string';

  if (adminUser) {
    // Ensure admin email always has full admin & approved status + unlimited wellness planner synced
    const adminUpdate = {
      uid: fbUser.uid,
      email: cleanEmail,
      displayName,
      photoURL,
      searchesRemaining: 999999,
      isPremium: true,
      subscriptionPlan: 'annual',
      approvalStatus: 'approved',
      requestedPlan: 'annual',
      subscriptionExpiresAt: '',
      paymentNote: String(rawData.paymentNote || 'Site Administrator').slice(0, 300),
      approvedBy: cleanEmail,
      approvedAt: String(rawData.approvedAt || nowIso).slice(0, 40),
      wellnessAddonActive: true,
      wellnessAddonExpiresAt: '',
      wellnessAddonRequested: false,
      termsAccepted: true,
      updatedAt: serverTimestamp(),
    };
    try {
      await updateDoc(userRef, adminUpdate);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}`);
    }
    const mapped = mapDocToUserRecord(fbUser.uid, {
      ...rawData,
      ...adminUpdate,
      createdAt: toIsoString(rawData.createdAt) || nowIso,
      updatedAt: nowIso,
    });
    return mapRecordToAppUser(mapped, true);
  }

  const isLegacySelfElevatedNonAdmin =
    !adminUser &&
    (String(rawData.approvedBy || '').trim().toLowerCase() === cleanEmail ||
      String(rawData.paymentNote || '').trim() === 'Site Administrator');

  if (!hasApprovalSchema || isLegacySelfElevatedNonAdmin) {
    // Normalize legacy or formerly elevated non-admin doc into 2-free-trial pending approval state
    const migrationUpdate = {
      displayName,
      photoURL,
      searchesRemaining: 2,
      isPremium: false,
      subscriptionPlan: 'free',
      approvalStatus: 'pending',
      requestedPlan,
      subscriptionExpiresAt: '',
      paymentNote: '',
      approvedBy: '',
      approvedAt: '',
      wellnessAddonActive: false,
      wellnessAddonExpiresAt: '',
      wellnessAddonRequested: false,
      termsAccepted: true,
      updatedAt: serverTimestamp(),
    };
    try {
      await updateDoc(userRef, migrationUpdate);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}`);
    }
    const mapped = mapDocToUserRecord(fbUser.uid, {
      ...rawData,
      ...migrationUpdate,
      createdAt: toIsoString(rawData.createdAt) || nowIso,
      updatedAt: nowIso,
    });
    return mapRecordToAppUser(mapped, true);
  }

  // Standard verified non-admin owner sync (only touches allowed profile fields + backfills missing wellness fields safely)
  const ownerPatch: Record<string, any> = {
    displayName,
    photoURL,
    termsAccepted: true,
    updatedAt: serverTimestamp(),
  };
  if (typeof rawData.wellnessAddonActive !== 'boolean') {
    ownerPatch.wellnessAddonActive = false;
    ownerPatch.wellnessAddonExpiresAt = '';
    ownerPatch.wellnessAddonRequested = Boolean(rawData.wellnessAddonRequested);
  }
  if (options?.requestedPlan) {
    ownerPatch.requestedPlan = options.requestedPlan;
  }
  if (typeof options?.paymentNote === 'string') {
    ownerPatch.paymentNote = paymentNote;
  }

  try {
    await updateDoc(userRef, ownerPatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}`);
  }

  const mapped = mapDocToUserRecord(fbUser.uid, {
    ...rawData,
    ...ownerPatch,
    updatedAt: nowIso,
  });
  return mapRecordToAppUser(mapped, true);
}

export async function updateOwnSubscriptionRequest(
  uid: string,
  requestedPlan: SubscriptionPlan,
  paymentNote: string
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  try {
    await updateDoc(userRef, {
      requestedPlan,
      paymentNote: paymentNote.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function requestOwnWellnessAddon(
  uid: string,
  paymentNote: string
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const patch: Record<string, any> = {
      wellnessAddonRequested: true,
      paymentNote: paymentNote.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    };
    if (typeof data.wellnessAddonActive !== 'boolean') {
      patch.wellnessAddonActive = false;
      patch.wellnessAddonExpiresAt = '';
    }
    await updateDoc(userRef, patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function consumeOwnFreeTrialCredit(
  uid: string,
  nextRemaining: number
): Promise<void> {
  const safeRemaining = Math.max(0, Math.min(2, Math.floor(nextRemaining)));
  const userRef = doc(db, 'users', uid);
  try {
    await updateDoc(userRef, {
      searchesRemaining: safeRemaining,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  emailVerified: boolean,
  onUpdate: (user: User) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!emailVerified) {
    return () => {};
  }
  const userRef = doc(db, 'users', uid);
  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) return;
      const rec = mapDocToUserRecord(uid, snap.data() || {});
      onUpdate(mapRecordToAppUser(rec, emailVerified));
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      } catch (wrapped) {
        if (onError) onError(wrapped);
      }
    }
  );
}

// Admin Dashboard Operations (Protected by Firestore Security Rules: isAdmin())
export async function adminListSubscribers(): Promise<FirestoreUserRecord[]> {
  const colRef = collection(db, 'users');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDocToUserRecord(d.id, d.data() || {}));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function adminApproveSubscriber(params: {
  uid: string;
  plan: SubscriptionPlan;
  durationDays: number;
  paymentNote?: string;
}): Promise<FirestoreUserRecord> {
  const adminEmail = (auth.currentUser?.email || ADMIN_EMAILS[0]).toLowerCase().slice(0, 200);
  const now = new Date();
  const safeDays = Math.max(1, Math.min(1095, Number(params.durationDays) || 30));
  const expiresAt = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 40);
  const approvedAt = now.toISOString().slice(0, 40);

  const userRef = doc(db, 'users', params.uid);
  const patch = {
    approvalStatus: 'approved' as ApprovalStatus,
    isPremium: true,
    subscriptionPlan: params.plan,
    searchesRemaining: 999999,
    subscriptionExpiresAt: expiresAt,
    paymentNote: String(params.paymentNote || '').trim().slice(0, 300),
    approvedBy: adminEmail,
    approvedAt,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, patch);
    const freshSnap = await getDoc(userRef);
    return mapDocToUserRecord(params.uid, freshSnap.data() || patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}`);
  }
}

export async function adminRejectSubscriber(
  uid: string,
  reasonNote: string
): Promise<FirestoreUserRecord> {
  const adminEmail = (auth.currentUser?.email || ADMIN_EMAILS[0]).toLowerCase().slice(0, 200);
  const nowIso = new Date().toISOString().slice(0, 40);
  const userRef = doc(db, 'users', uid);
  const patch = {
    approvalStatus: 'rejected' as ApprovalStatus,
    isPremium: false,
    subscriptionPlan: 'free' as const,
    searchesRemaining: 0,
    subscriptionExpiresAt: '',
    paymentNote: String(reasonNote || '').trim().slice(0, 300),
    approvedBy: adminEmail,
    approvedAt: nowIso,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, patch);
    const freshSnap = await getDoc(userRef);
    return mapDocToUserRecord(uid, freshSnap.data() || patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminSetPendingSubscriber(uid: string): Promise<FirestoreUserRecord> {
  const userRef = doc(db, 'users', uid);
  const patch = {
    approvalStatus: 'pending' as ApprovalStatus,
    isPremium: false,
    subscriptionPlan: 'free' as const,
    searchesRemaining: 0,
    subscriptionExpiresAt: '',
    approvedBy: '',
    approvedAt: '',
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, patch);
    const freshSnap = await getDoc(userRef);
    return mapDocToUserRecord(uid, freshSnap.data() || patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminToggleWellnessAddon(params: {
  uid: string;
  active: boolean;
  durationDays?: number;
  paymentNote?: string;
}): Promise<FirestoreUserRecord> {
  const now = new Date();
  const safeDays = Math.max(1, Math.min(365, Number(params.durationDays) || 30));
  const expiresAt = params.active
    ? new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 40)
    : '';

  const userRef = doc(db, 'users', params.uid);
  const patch: Record<string, any> = {
    wellnessAddonActive: Boolean(params.active),
    wellnessAddonExpiresAt: expiresAt,
    wellnessAddonRequested: false,
    updatedAt: serverTimestamp(),
  };
  if (typeof params.paymentNote === 'string' && params.paymentNote.trim()) {
    patch.paymentNote = params.paymentNote.trim().slice(0, 300);
  }

  try {
    await updateDoc(userRef, patch);
    const freshSnap = await getDoc(userRef);
    return mapDocToUserRecord(params.uid, freshSnap.data() || patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}`);
  }
}

// Validate connection to Firestore on initial boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

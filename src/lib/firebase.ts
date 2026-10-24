import { getFirebaseConfig } from "@/lib/chat.functions";
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

let appPromise: Promise<FirebaseApp> | null = null;
let authPromise: Promise<Auth> | null = null;
let dbPromise: Promise<Firestore> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      if (getApps().length > 0) return getApp();
      const config = await getFirebaseConfig();
      return initializeApp(config);
    })();
  }
  return appPromise;
}

export function getFirebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      const { getAuth } = await import("firebase/auth");
      return getAuth(app);
    })();
  }
  return authPromise;
}

export function getFirestoreDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp();
      const { getFirestore, initializeFirestore } = await import("firebase/firestore");
      try {
        return initializeFirestore(app, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        return getFirestore(app);
      }
    })();
  }
  return dbPromise;
}

export async function signInWithGoogle(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOut(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut: firebaseSignOut } = await import("firebase/auth");
  await firebaseSignOut(auth);
}

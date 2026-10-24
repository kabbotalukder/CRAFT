import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, ready: false });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const auth = await getFirebaseAuth();
      const { onAuthStateChanged } = await import("firebase/auth");
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (u) => {
        setState({ user: u, ready: true });
        if (u) void ensureUserDoc(u);
      });
    })().catch(() => setState({ user: null, ready: true }));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

async function ensureUserDoc(user: User): Promise<void> {
  try {
    const db = await getFirestoreDb();
    const { doc, getDoc, setDoc } = await import("firebase/firestore");
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: user.displayName ?? "",
        email: user.email ?? "",
        photoURL: user.photoURL ?? "",
        createdAt: Date.now(),
      });
    }
  } catch {
    // Non-fatal: profile doc creation can be retried on next login.
  }
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

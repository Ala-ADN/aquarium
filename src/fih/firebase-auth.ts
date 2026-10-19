import { getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";

// Public tank reads do not need Auth's download, persistence, or token restore.
// Restore existing identity after the first feed, or immediately for a release.
export function connectAquariumAuth(app: FirebaseApp, emulators: boolean,
  onOwner: (ownerId: string | null) => void, onError: () => void) {
  const auth = getAuth(app);
  if (emulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const unsubscribe = onAuthStateChanged(auth, (user) => onOwner(user?.uid ?? null), onError);
  return {
    async ownerId() {
      await auth.authStateReady();
      // Reading never creates an account. Only an explicit release signs in.
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
      onOwner(user.uid);
      return user.uid;
    },
    close: unsubscribe,
  };
}

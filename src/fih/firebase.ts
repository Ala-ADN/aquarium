import { initializeApp, deleteApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getDatabase, connectDatabaseEmulator, ref, query, orderByChild, limitToLast,
  onChildAdded, onChildChanged, onChildRemoved, onValue, runTransaction,
  serverTimestamp, goOffline,
} from "firebase/database";
import type { AquariumFirebaseConfig } from "./firebase-config";
import { parseSharedDesign, parseSharedFih, SHARED_QUERY_LIMIT } from "./shared";
import type { SharedFih } from "./shared";
import type { FihDesign } from "../types";
import { startAnalytics } from "../analytics";

interface Callbacks {
  onEntries: (entries: SharedFih[]) => void;
  onOwner: (ownerId: string | null) => void;
  onError: () => void;
  onConnected: () => void;
}

export async function connectFirebaseAquarium(config: AquariumFirebaseConfig, callbacks: Callbacks) {
  const app = initializeApp(config.options, "aquarium");
  try {
    if (!config.emulators) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    const auth = getAuth(app);
    const database = getDatabase(app);
    if (config.emulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectDatabaseEmulator(database, "127.0.0.1", 9000);
    }
    const entries = new Map<string, SharedFih>();
    const school = query(ref(database, "fih"), orderByChild("updatedAt"), limitToLast(SHARED_QUERY_LIMIT));
    const changed = (snapshot: { key: string | null; val(): unknown }) => {
      if (!snapshot.key) return;
      const entry = parseSharedFih(snapshot.key, snapshot.val());
      if (entry) entries.set(snapshot.key, entry);
      else entries.delete(snapshot.key);
      callbacks.onEntries([...entries.values()]);
    };
    const unsubscribers = [
      onAuthStateChanged(auth, (user) => callbacks.onOwner(user?.uid ?? null), callbacks.onError),
      onChildAdded(school, changed, callbacks.onError),
      onChildChanged(school, changed, callbacks.onError),
      onChildRemoved(school, (snapshot) => {
        if (snapshot.key) entries.delete(snapshot.key);
        callbacks.onEntries([...entries.values()]);
      }, callbacks.onError),
      onValue(ref(database, ".info/connected"), (snapshot) => {
        if (snapshot.val() === true) callbacks.onConnected();
      }),
    ];
    // Do not wait for tracking before connecting the tank or saving a design.
    if (!config.emulators) void startAnalytics(app);
    return {
      async save(value: FihDesign) {
        const design = parseSharedDesign(value);
        if (!design) throw new Error("Invalid fih design.");
        await auth.authStateReady();
        // Reading the public tank never creates anonymous accounts.
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
        callbacks.onOwner(user.uid);
        // The transaction is restricted to this visitor's record. Concurrent visitors
        // never replace the tank; retries preserve the original creation timestamp.
        await runTransaction(ref(database, `fih/${user.uid}`), (current) => {
          return {
            design,
            createdAt: current?.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
        }, { applyLocally: false });
      },
      close() {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        goOffline(database);
        void deleteApp(app).catch(() => {});
      },
    };
  } catch (error) {
    await deleteApp(app);
    throw error;
  }
}

import { initializeApp, deleteApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getDatabase, connectDatabaseEmulator, ref, query, orderByChild, limitToLast,
  onChildAdded, onChildChanged, onChildRemoved, onValue, runTransaction,
  serverTimestamp, goOffline,
} from "firebase/database";
import type { AquariumFirebaseConfig } from "./firebase-config";
import { createSharedFihRecord, parseSharedDesign, parseSharedFih, SHARED_QUERY_LIMIT } from "./shared";
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
    const database = getDatabase(app);
    if (config.emulators) {
      connectDatabaseEmulator(database, "127.0.0.1", 9000);
    }
    let closed = false;
    type AquariumAuth = ReturnType<typeof import("./firebase-auth")["connectAquariumAuth"]>;
    let auth: AquariumAuth | null = null;
    let authLoading: Promise<AquariumAuth> | null = null;
    const ensureAuth = () => {
      if (!authLoading) authLoading = import("./firebase-auth").then(({ connectAquariumAuth }) => {
        if (closed) throw new Error("Aquarium connection is closed.");
        auth = connectAquariumAuth(app, config.emulators, callbacks.onOwner, callbacks.onError);
        return auth;
      }).catch((error: unknown) => { authLoading = null; throw error; });
      return authLoading;
    };
    const entries = new Map<string, SharedFih>();
    const school = query(ref(database, "fih"), orderByChild("updatedAt"), limitToLast(SHARED_QUERY_LIMIT));
    const changed = (snapshot: { key: string | null; val(): unknown }) => {
      if (!snapshot.key) return;
      const entry = parseSharedFih(snapshot.key, snapshot.val());
      if (entry) entries.set(snapshot.key, entry);
      else entries.delete(snapshot.key);
    };
    let receivedInitialFeed = false;
    const unsubscribers = [
      onChildAdded(school, changed, callbacks.onError),
      onChildChanged(school, changed, callbacks.onError),
      onChildRemoved(school, (snapshot) => {
        if (snapshot.key) entries.delete(snapshot.key);
      }, callbacks.onError),
      // Firebase fires child events before the corresponding value event. Use
      // that boundary to publish one complete list, including an empty tank.
      // Identical queries share one SDK subscription; this adds no second read.
      onValue(school, () => {
        callbacks.onEntries([...entries.values()]);
        if (!receivedInitialFeed) {
          receivedInitialFeed = true;
          void ensureAuth().catch(() => { /* Restore identity again on release if needed. */ });
        }
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
        if (closed) throw new Error("Aquarium connection is closed.");
        const ownerId = await (await ensureAuth()).ownerId();
        // The transaction is restricted to this visitor's record. Concurrent visitors
        // never replace the tank; retries preserve the original creation timestamp.
        await runTransaction(ref(database, `fih/${ownerId}`), (current) => {
          return createSharedFihRecord(current, design, serverTimestamp());
        }, { applyLocally: false });
      },
      close() {
        closed = true;
        auth?.close();
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        goOffline(database);
        return deleteApp(app).catch(() => {});
      },
    };
  } catch (error) {
    await deleteApp(app);
    throw error;
  }
}

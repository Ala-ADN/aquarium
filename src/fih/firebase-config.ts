export interface AquariumFirebaseConfig {
  options: {
    apiKey: string; authDomain: string; databaseURL: string; projectId: string; appId: string;
    measurementId?: string;
  };
  appCheckSiteKey: string;
  emulators: boolean;
}

export function readFirebaseConfig(env: Record<string, unknown>, development = false): AquariumFirebaseConfig | null {
  const names = ["API_KEY", "AUTH_DOMAIN", "DATABASE_URL", "PROJECT_ID", "APP_ID"] as const;
  const values = names.map((name) => String(env[`VITE_FIREBASE_${name}`] ?? "").trim());
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) throw new Error("Firebase configuration is incomplete. See .env.example.");
  const emulators = env.VITE_FIREBASE_EMULATORS === "true";
  if (emulators && !development) throw new Error("Firebase emulators may only be enabled in development.");
  const appCheckSiteKey = String(env.VITE_FIREBASE_APP_CHECK_SITE_KEY ?? "").trim();
  if (!emulators && !appCheckSiteKey) throw new Error("Firebase App Check site key is required for shared saving.");
  const [apiKey, authDomain, databaseURL, projectId, appId] = values;
  if (!emulators && !databaseURL.startsWith("https://")) throw new Error("Firebase database URL must use HTTPS.");
  const measurementId = String(env.VITE_FIREBASE_MEASUREMENT_ID ?? "").trim() || undefined;
  return { options: { apiKey, authDomain, databaseURL, projectId, appId, measurementId }, appCheckSiteKey, emulators };
}

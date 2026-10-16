import type { FirebaseApp } from "firebase/app";

export async function startAnalytics(app: FirebaseApp): Promise<void> {
  if (!import.meta.env.PROD || !app.options.measurementId) return;
  try {
    const { isSupported, getAnalytics } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(app);
  } catch {
    // Tracking is optional: blocked scripts or browser storage must not affect the app.
  }
}

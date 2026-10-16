# Deployment: GitHub Pages + Firebase Spark

The frontend stays static. Firebase Realtime Database stores one design per
anonymous visitor; every design contains a swarm count from 1 to 10. Visitors can
read a bounded public feed and update only their own record. No custom API server,
Cloud Functions, service-account credentials, or billing account is required.

Without Firebase configuration, the app runs normally with browser-only saves.
Partial cloud configuration fails the build instead of silently deploying it.

## 1. Create Firebase (one time)

1. In the [Firebase console](https://console.firebase.google.com/), use the project
   **fihh**, ID **`fihhhhhh`**, and keep the **Spark** plan. The project ID is also
   recorded in `.firebaserc`. Google Analytics can stay enabled; it is
   [available at no charge](https://firebase.google.com/docs/analytics). Do not link a Cloud
   Billing account; that changes the project to usage-based Blaze billing.
   done
2. Add a **Web app** in Project settings. Copy its public web config. Do not create
   a service account or put administrative keys in the frontend.
   done
3. Under Authentication → Sign-in method, enable **Anonymous** sign-in. Add your
   deployed hostname (for this repo, `ala-adn.github.io`) under authorized domains
   in Authentication settings.
   done
4. Create a **Realtime Database**, starting in **locked mode**. Choose a region
   close to your visitors, such as Belgium. Copy its exact URL from the console;
   it is separate from the project ID and depends on region.
   done
5. Register the Web app in **App Check**, using **reCAPTCHA Enterprise**
   (Google Cloud Fraud Defense). Use a production, score-based Web key with
   `ala-adn.github.io` as an allowed domain; leave challenges, test mode, and WAF
   integration off. Select that same public site key in Firebase App Check and
   copy it into the app configuration below. This integration needs no legacy
   secret key. Use a token TTL of **1 hour**. The minimum score is configured in
   Firebase App Check; the frontend does not set or override it.
   Enable App Check enforcement for **Realtime Database**. The local emulator
   setup does not require a real reCAPTCHA key.
   done
6. Deploy the checked-in rules from this checkout:

   ```sh
   pnpm install --frozen-lockfile
   pnpm exec firebase login
   pnpm exec firebase deploy --only database --project fihhhhhh
   ```

   done

7. In the database's Data tab, add `settings/writesEnabled` with the **boolean**
   value `true`. Missing or false disables all public writes. For a new empty
   database, `firebase.seed.json` is also an example of the initial data. Do not
   import it over an existing tank: a root import replaces existing data.
   done

## 2. Configure and check the app

Copy `.env.example` to `.env.local`, then fill all six public configuration values:

| Variable                           | Value                        |
| ---------------------------------- | ---------------------------- |
| `VITE_FIREBASE_API_KEY`            | Web app `apiKey`             |
| `VITE_FIREBASE_AUTH_DOMAIN`        | Web app `authDomain`         |
| `VITE_FIREBASE_DATABASE_URL`       | Exact Realtime Database URL  |
| `VITE_FIREBASE_PROJECT_ID`         | Web app `projectId`          |
| `VITE_FIREBASE_APP_ID`             | Web app `appId`              |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY` | Public reCAPTCHA Enterprise site key |

To track visits, also set `VITE_FIREBASE_MEASUREMENT_ID` to the Web app config's
`measurementId` (starts with `G-`). You can copy it from Firebase → Project
settings → Your apps → Web app → SDK setup and configuration. Leave it empty
to disable Analytics without affecting shared saves.

Leave `VITE_FIREBASE_EMULATORS=false` for a real project. A production build
rejects emulator mode. These six values are public browser configuration, not
secrets; ownership rules and enforced App Check protect writes.

Run `pnpm dev` to check the site. For local development against a real project,
also register `localhost` with reCAPTCHA and Firebase as appropriate, or use the
emulators below. Never ship an App Check debug token.

Before publishing, run:

```sh
pnpm test
pnpm test:rules
pnpm build
```

The rules suite starts a disposable database emulator under `demo-aquarium`, tests
real allow/deny decisions, and shuts it down. It needs Java 21+ and downloads the
database emulator on first use. It does not access your production project.

## 3. Enable GitHub Pages

1. In GitHub repository Settings → Secrets and variables → Actions → **Variables**,
   add the same six `VITE_FIREBASE_*` values. Do not set the emulator flag there.
   Also add `VITE_FIREBASE_MEASUREMENT_ID` to enable Analytics on the deployed site.
   All-empty configuration intentionally deploys a browser-only aquarium.
2. Under Settings → Pages, select **GitHub Actions** as the deployment source.
   Allow the `deploy` branch in the `github-pages` environment if GitHub requires
   deployment-branch selection.
3. Commit the implementation on `deploy` and push the branch:

   ```sh
   git push -u origin deploy
   ```

The workflow runs unit tests, emulator rules tests, and the production build
before publishing `dist/`. Later pushes to `deploy` repeat those checks. Pull
requests to `main` or `deploy` run checks without publishing. Firebase rules are
deployed separately with the explicit command above; CI needs no Firebase admin
credentials. Vite uses relative asset URLs so `/aquarium/` and a custom domain
both work.

## Google Analytics

The production build initializes Analytics when `VITE_FIREBASE_MEASUREMENT_ID`
is configured. The SDK records page views and its standard automatic events;
the app does not send fish designs or anonymous Auth IDs to Analytics. There is
no separate database record for each visit. See the
[Firebase Analytics web setup](https://firebase.google.com/docs/analytics/web/get-started).

`pnpm dev` and emulator sessions do not initialize Analytics. A production build
served with `pnpm preview` does, so use the deployed site to check visits in
Google Analytics → Reports → Realtime. Rebuild/redeploy after changing the
measurement ID. Analytics loads separately from shared saving; unsupported
browsers or blocked tracking do not prevent the aquarium from working.

## Local emulator development

Use Node 22+, pnpm 10.18.1, and Java 21+. Set these values in `.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-aquarium.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://demo-aquarium-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=demo-aquarium
VITE_FIREBASE_APP_ID=demo-app
VITE_FIREBASE_APP_CHECK_SITE_KEY=
VITE_FIREBASE_EMULATORS=true
```

Run `pnpm emulators` in one terminal and `pnpm dev` in another. Open the emulator
UI at `http://127.0.0.1:4000`, select the database, and add
`settings/writesEnabled=true`. In a fresh empty emulator you can import
`firebase.seed.json` instead. Auth/database traffic stays on localhost and App
Check is skipped only in this development mode.

## Save behavior and limits

- Initial page views read the tank without creating anonymous accounts. An account
  is created only when a visitor first shares a design (including retrying an
  intended save after a reload). Existing browser-only saves aren't published
  until the visitor presses release/update.
- Each visitor writes only `/fih/{uid}`. An owner-scoped transaction preserves the
  creation timestamp and permits independent visitors to save concurrently.
  Rules require server timestamps, known fields and enums, bounded sizes/colors,
  an integer count from 1 to 10, and at least 10 seconds between owner updates.
- Rapid releases remain immediate locally; the queue coalesces pending edits and
  sends them in order. The UI says saved only after server confirmation. An
  outbox retains the latest intended save across reloads when storage is available.
  Quota/permission failures don't trigger an automatic retry loop. Retry via the
  button, another release, or reconnecting.
- The feed requires an indexed query limited to at most 1000 records. Rendering
  prioritizes the local swarm, excludes its cloud duplicate, and displays at most
  1000 fish total. Remote fish are merged into one mesh. Movement stays local;
  only released designs are synchronized.
- This **render/read cap is not a global storage cap**. Records persist beyond
  the displayed selection. There is no custom IP throttle or global daily write
  budget in this serverless Spark implementation. App Check adds abuse resistance,
  not proof that each anonymous identity represents a different human.
- Spark quotas bound usage without overage billing while the project stays on
  Spark; quota exhaustion can disable shared persistence. The portfolio,
  animation, and existing local saves continue without the backend. See
  [Firebase pricing](https://firebase.google.com/pricing) and
  [Spark quota behavior](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).
- Clearing browser data can lose anonymous ownership; published fish remain until
  removed by the project owner. Firebase's web offline queue alone does not
  survive closing the tab, so the existing local save and outbox are retained.

To stop an incident, set `settings/writesEnabled=false` in Firebase Console.
Reads remain available and local release still works. To remove an unwanted
design, delete its `/fih/{uid}` record using the console. Export the database from
the console periodically if you want a separate backup.

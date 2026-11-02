# Alpha Digitronix Billing

Billing and inventory app for Alpha Digitronix Solution. Runs as a web app and packages to Android with Capacitor.

## Running

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the Supabase URL and anon key (optional; without them the app runs in DEMO MODE with seeded data stored in the browser).
3. `npm run dev` for development, `npm run build` for a production build.

Demo logins: `cashier@alpha.in` or `admin@alpha.in`, any password.

## Android APK

Prerequisites: Node 20+, Android Studio, and the Android SDK (installed through Android Studio's SDK Manager). Java 17 is bundled with recent Android Studio versions.

1. `npx cap add android` (once, creates the `android/` project).
2. `npm run cap:sync` builds the web app and copies it into Android.
3. `npm run cap:android` opens the project in Android Studio.
4. `npm run android:debug` builds a debug APK from the command line. The file is written to `android/app/build/outputs/apk/debug/`.

The application ID is a placeholder (`com.ammamas.billing`) in `capacitor.config.ts`. Change it before a release build.

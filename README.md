# IP Motors Fleet Manager

An installable, mobile-first React PWA for IP Motors, with a Flutter mobile client in
[`mobile/`](mobile/README.md). Both clients are local-first: the PWA stores fleet
records in the browser's IndexedDB and the Flutter app stores them in on-device
SQLite. Neither build has sign-in or cloud sync.

## Run locally

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The app opens directly to the fleet dashboard; there is no sign-in or role selector in this local version.

## Flutter app (development)

The native client lives in [`mobile/`](mobile/README.md). It needs Flutter 3.47 or
newer:

```sh
cd mobile
flutter pub get
flutter run
flutter test
```

The Flutter app stores records in on-device SQLite, supports JSON backup/restore, and
can recover the previous fleet report CSV from **Settings & backup**. It does not
share data or sync with the PWA.

## Current features

- Vehicle register with search, edit, status, assigned driver, and document/service dates.
- Driver records managed by the fleet owner or staff.
- Itemized maintenance and vehicle expense records, with totals by category and vehicle.
- Separate income and driver remittance records. The app does not infer balances or impose a settlement schedule.
- JSON backup and restore from **Backup & settings**.
- Installable PWA shell for Android and iOS browsers.

## Local data limits

Records are stored only in this browser profile on this device. They do not sync to another device or staff member, are not encrypted by this app, and are not backed up to a server. Anyone who can access this browser profile can access its records. Download backups regularly and keep them in a safe place. Clearing browser site data can erase the records.

This version is suitable for local evaluation and early single-device use. Shared accounts, team permissions, synchronized data, remote backups, and production financial workflows require a separately selected backend and security design.

## Backend foundation (Phase 1, not connected)

[`backend/`](backend/README.md) now contains the shared API foundation: a TypeScript
Fastify service, PostgreSQL migrations, tenant isolation and audit rules, and Docker
packaging. It is designed for Neon PostgreSQL and provider-neutral JWT/JWKS sign-in.

The PWA and Flutter app still use their local IndexedDB and SQLite stores. Neither
client is connected to the backend, no local data has been migrated, and nothing has
been deployed. The Neon migrations have been applied to the development branch only;
the production branch has not been touched. Authentication
fails closed until an identity provider is configured.

## Product direction

The React PWA remains available while the Flutter client in `mobile/` is developed.
Both currently store records locally on one device. The backend foundation exists but
shared accounts, synchronization, and hosted data remain unfinished; the previous
cloud integration is not part of the active app.

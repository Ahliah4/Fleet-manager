# IP Motors Fleet — Flutter app

The mobile-first Flutter client for IP Motors. Fleet records remain available in
the local SQLite database; Neon Auth provides identity for requests to the shared
Fastify API.

## Secure development build

Build against the Neon **development** branch Auth endpoint and shared Fastify
API using Dart defines (values are intentionally not committed):

```sh
flutter run \
  --dart-define=AUTH_GATEWAY_URL=<https-gateway-origin> \
  --dart-define=MOBILE_REDIRECT_URI=fleetops://auth/callback \
  --dart-define=FLEET_API_URL=<development-fastify-api-url>
```

The Flutter client opens the gateway in the system browser. Neon session cookies
stay in the gateway; Flutter stores only a rotating refresh token in platform
secure storage and keeps the short-lived API token in memory. The API resolves
application users and active memberships itself. Public signup does not grant a
fleet role. Without gateway/API defines, the app keeps its local-first workflow.

Do not pass `NEON_AUTH_URL` to a staging or release build. Direct cookie replay
from Flutter is an unsupported development investigation and is disabled by
default.

For mobile onboarding, enable email/password sign-up, verification, Google (if
wanted), and email delivery in Neon development. The gateway hosts the branded
web auth form and returns to Flutter through the `fleetops` callback scheme.

Configure Fastify separately with `AUTH_ISSUER`, `AUTH_AUDIENCE`, and
`AUTH_JWKS_URL` pointing to the gateway's HTTPS origin and JWKS route once a
durable gateway deployment exists. Keep `DATABASE_URL` and gateway signing keys
server-side. Never use production branch values in a development build.

## Requirements

- Flutter 3.47 or newer (Dart 3.13)
- Android Studio / Xcode toolchains for the platforms you want to run

## Run and check

```sh
cd mobile
flutter pub get
flutter run                 # choose a connected device or emulator
flutter analyze             # must report no issues
flutter test                # unit tests
flutter build apk --release # Android release build
```

The app opens on the dashboard. The bottom bar covers **Dashboard**, **Vehicles**,
**Service** (maintenance and expenses), **Finance**, and **More**; the **More**
menu links to Drivers, Hires, Reports, and Settings & backup.

## Data and backup

- Records are stored in `ip_motors_fleet.db` inside the app's database directory.
  Logging out or closing the app does not remove them; uninstalling the app or
  clearing app data does.
- **Settings & backup → Export backup** writes a JSON file with all six record
  tables and opens the share sheet so it can be saved off the phone.
- **Restore from backup** replaces every local record with the backup's contents.
  Export first if the current records matter.
- Records do not sync between phones. Each install is independent.

## Recovering the previous fleet report

**Settings & backup → Recover vehicle records → Import vehicle CSV** reads the
recovered `fleet-report-*.csv` export. Required columns are `Registration`, `Make`,
and `Model`; `Year`, `Colour`, document dates, `Next Service`, `Status`, and `Notes`
are imported when present.

- Existing registrations are skipped instead of overwritten, so records entered on
  the phone are safe.
- Rows with a missing required value, an impossible year, or an unreadable date are
  skipped and counted in the result message. Repair the CSV and import again.
- The old report's `Status` describes compliance (for example `Active`). Those
  labels are preserved in the vehicle notes and the vehicle starts as **Available**.
  Statuses that already match the app (`Available`, `On hire`, `Maintenance`,
  `Unavailable`) are kept as-is.

## Project layout

```
lib/
  main.dart                  app shell, navigation, snapshot refresh
  data/                      SQLite access, JSON backup, CSV recovery import
  models/                    Vehicle, Driver, Hire, Expense, finance entries
  screens/                   Dashboard, Vehicles, Maintenance, Finance, Hires,
                             Drivers, Reports, Settings & backup
  ui/                        theme, shared widgets, alerts
  utils/                     formatting, dates, CSV escaping, remittance periods
test/                        unit tests for formatting and CSV import
```

## Relationship to the React PWA

The PWA at the repository root remains available and stores records in IndexedDB.
The two clients do not share storage or sync automatically. Use the PWA's JSON
backup/restore for its data and this app's JSON backup for mobile data.

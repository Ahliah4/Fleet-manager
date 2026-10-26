# IP Motors Fleet — Flutter app

The mobile-first Flutter client for IP Motors. It mirrors the React PWA's local-first
model: all records live in a SQLite database on the device, and there is no sign-in,
cloud sync, or shared account in this build.

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
**Maintenance**, **Finance**, and **More**; the **More** sheet links to Drivers,
Hires, Reports, and Settings & backup.

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

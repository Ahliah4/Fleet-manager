# Fleet Operations sync contract (development)

The mobile database remains the offline cache. The shared server is the source
of truth after the first owner-controlled import.

## Initial import

1. Export a JSON backup from the phone before connecting it.
2. Import vehicles by normalized registration number. Existing server records
   are never silently overwritten.
3. Import drivers, hires, expenses, income, and remittances only after vehicle
   conflicts are resolved.
4. Store the returned server UUID beside each local record. Local SQLite row
   IDs are not server authority.
5. Mark the import complete only after the server count and a sampled document
   date check match the backup.

## Ongoing changes

- Every local mutation is queued with an operation ID, entity type, server ID
  (when known), payload, and creation time.
- The queue retries only transient network/5xx failures.
- A 401 signs the user out; a 403 is shown as a permission error and is not
  retried.
- A server conflict is presented to the owner by registration/record identity;
  the client never overwrites the server automatically.
- Deletes use the server's soft-delete endpoints and remain auditable.
- Pulls use server `updated_at` ordering and preserve local unsynced edits.

## Current implementation

- SQLite schema v5 adds `server_id` and `server_updated_at` to vehicles,
  drivers, hires, expenses, income, and remittances.
- SQLite triggers capture inserts, updates, and deletes in `sync_outbox`,
  guarded by a `sync_meta.applying` flag so server pulls do not echo back.
- `FleetApiClient` uses the short-lived gateway bearer token. It retries one
  401 after a refresh, never retries a 403, and exposes typed offline/server
  failures.
- `FleetSyncService` pushes drivers and vehicles before dependent records, uses
  `server_updated_at` plus a server read to detect remote changes, records
  conflicts in `sync_conflicts`, and does not overwrite local unsynced edits.
- Financial records are posted once and voided, not edited. A voided record
  with no server ID is reported as a conflict.
- `Settings > Shared workspace` shows queue/conflict counts, last sync, a sync
  button, and a vehicle-import dry run.

Known limits: server-side deletion tombstones are not pulled; the 65-record
import is dry-run only until owner approval; sync has not completed a
two-device live test; and the outbox stores an entity/local-row reference rather
than a full payload, so it reads the current local row when pushing.

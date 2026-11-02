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

## Release gate

The current Flutter app has local backup/import but does not yet implement this
queue or server-ID mapping. It must not claim multi-phone sync until those
pieces are implemented and tested against the development Worker.

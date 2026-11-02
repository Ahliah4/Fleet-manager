import 'package:sqflite/sqflite.dart';

import 'fleet_api_client.dart';
import 'fleet_database.dart';
import 'neon_auth_service.dart';

class SyncStatus {
  const SyncStatus({
    required this.configured,
    required this.running,
    required this.pending,
    required this.conflicts,
    this.lastSyncedAt,
    this.message,
  });

  final bool configured;
  final bool running;
  final int pending;
  final int conflicts;
  final DateTime? lastSyncedAt;
  final String? message;
}

class SyncResult {
  const SyncResult({
    required this.pushed,
    required this.pulled,
    required this.conflicts,
    required this.pending,
    required this.message,
    this.authRequired = false,
  });

  final int pushed;
  final int pulled;
  final int conflicts;
  final int pending;
  final String message;
  final bool authRequired;
}

class ImportPreview {
  const ImportPreview({
    required this.newVehicles,
    required this.matches,
    required this.conflicts,
    required this.invalid,
    required this.conflictSamples,
  });

  final int newVehicles;
  final int matches;
  final int conflicts;
  final int invalid;
  final List<String> conflictSamples;

  bool get hasConflicts => conflicts > 0;
}

class _SyncConflict implements Exception {
  const _SyncConflict(this.message);
  final String message;
}

/// A dependency is not on the server yet. Keep the operation queued rather
/// than discarding the user's edit as a conflict.
class _SyncDeferred implements Exception {
  const _SyncDeferred(this.message);
  final String message;
}

class _AuthRequired implements Exception {
  const _AuthRequired();
}

/// Pushes queued local edits and pulls server changes into SQLite.
///
/// SQLite remains the offline cache. The server is the shared source of truth
/// after an explicit import; local edits are never silently discarded.
class FleetSyncService {
  FleetSyncService._();

  static final FleetSyncService instance = FleetSyncService._();

  FleetApiClient? _api;
  bool _running = false;

  static const _entities = [
    'drivers',
    'vehicles',
    'hires',
    'expenses',
    'income',
    'remittances',
  ];

  void configure(NeonAuthService auth) {
    _api = FleetApiClient(auth: auth);
  }

  bool get isConfigured => _api?.isConfigured ?? false;

  Future<Database> get _db => FleetDatabase.instance.database;

  Future<SyncStatus> status({String? message}) async {
    final db = await _db;
    final pending = await _count(db, 'sync_outbox');
    final conflicts = await _count(
      db,
      'sync_conflicts',
      where: 'resolved = 0',
    );
    final last = await _setting(db, 'sync_last_at');
    return SyncStatus(
      configured: isConfigured,
      running: _running,
      pending: pending,
      conflicts: conflicts,
      lastSyncedAt: last == null ? null : DateTime.tryParse(last)?.toLocal(),
      message: message,
    );
  }

  Future<SyncResult> syncNow() async {
    if (!isConfigured) {
      final status = await this.status(
        message: 'Shared workspace is not configured for this build.',
      );
      return SyncResult(
        pushed: 0,
        pulled: 0,
        conflicts: status.conflicts,
        pending: status.pending,
        message: 'Shared workspace is not configured for this build.',
      );
    }
    if (_running) {
      final status = await this.status(message: 'A sync is already running.');
      return SyncResult(
        pushed: 0,
        pulled: 0,
        conflicts: status.conflicts,
        pending: status.pending,
        message: 'A sync is already running.',
      );
    }

    _running = true;
    try {
      final pushed = await _pushPending();
      final pulled = await _pullAll();
      final db = await _db;
      await db.insert('sync_meta', {
        'key': 'sync_last_at',
        'value': DateTime.now().toUtc().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.replace);
      final status = await this.status(
        message: 'Synced $pushed change${pushed == 1 ? '' : 's'} and '
            'received $pulled server record${pulled == 1 ? '' : 's'}.',
      );
      return SyncResult(
        pushed: pushed,
        pulled: pulled,
        conflicts: status.conflicts,
        pending: status.pending,
        message: status.message!,
      );
    } on _AuthRequired {
      final status = await this.status(
        message: 'Sign in again to sync the shared workspace.',
      );
      return SyncResult(
        pushed: 0,
        pulled: 0,
        conflicts: status.conflicts,
        pending: status.pending,
        message: status.message!,
        authRequired: true,
      );
    } on FleetApiException catch (error) {
      final status = await this.status(message: error.message);
      return SyncResult(
        pushed: 0,
        pulled: 0,
        conflicts: status.conflicts,
        pending: status.pending,
        message: error.message,
      );
    } finally {
      _running = false;
    }
  }

  /// Reads both sides and reports what a vehicle import would do. It never
  /// writes to Neon. The real import requires explicit owner approval.
  Future<ImportPreview> previewVehicleImport() async {
    final api = _api;
    if (api == null || !api.isConfigured) {
      throw const FleetApiException(
        statusCode: 0,
        code: 'NOT_CONFIGURED',
        message: 'The shared fleet service is not configured for this build.',
      );
    }
    final db = await _db;
    final local = await db.query('vehicles', orderBy: 'registration_key');
    final server = await api.listAll('/v1/vehicles', 'vehicles');
    final serverByKey = <String, Map<String, dynamic>>{};
    for (final record in server) {
      final key = _registrationKey(record['registrationNumber']);
      if (key.isNotEmpty) serverByKey[key] = record;
    }

    var matches = 0;
    var conflicts = 0;
    var invalid = 0;
    final samples = <String>[];
    for (final row in local) {
      final key = '${row['registration_key'] ?? ''}';
      final registration = '${row['registration_number'] ?? ''}';
      if (key.isEmpty || registration.isEmpty || row['year'] == null) {
        invalid++;
        continue;
      }
      final match = serverByKey[key];
      if (match == null) continue;
      matches++;
      final localUpdated = _parseDate(row['updated_at']) ?? DateTime.fromMillisecondsSinceEpoch(0);
      final serverUpdated = _parseDate(match['updatedAt']) ?? DateTime.fromMillisecondsSinceEpoch(0);
      final same =
          '${match['make'] ?? ''}'.trim().toLowerCase() ==
              '${row['make'] ?? ''}'.trim().toLowerCase() &&
          '${match['model'] ?? ''}'.trim().toLowerCase() ==
              '${row['model'] ?? ''}'.trim().toLowerCase();
      if (!same || (localUpdated.isAfter(serverUpdated) &&
          row['server_id'] == null)) {
        conflicts++;
        if (samples.length < 5) samples.add(registration);
      }
    }
    return ImportPreview(
      newVehicles: local.length - matches - invalid,
      matches: matches,
      conflicts: conflicts,
      invalid: invalid,
      conflictSamples: samples,
    );
  }

  Future<int> _pushPending() async {
    final db = await _db;
    final now = DateTime.now().toUtc().toIso8601String();
    final rows = await db.query(
      'sync_outbox',
      where: 'next_attempt_at IS NULL OR next_attempt_at <= ?',
      whereArgs: [now],
      orderBy:
          "CASE entity WHEN 'drivers' THEN 0 WHEN 'vehicles' THEN 1 "
          "WHEN 'hires' THEN 2 WHEN 'expenses' THEN 3 WHEN 'income' THEN 4 "
          "WHEN 'remittances' THEN 5 ELSE 6 END, id",
      limit: 50,
    );
    var pushed = 0;
    for (final operation in rows) {
      try {
        final changed = await _pushOne(operation);
        if (changed) pushed++;
      } on _AuthRequired {
        rethrow;
      } on FleetApiException catch (error) {
        if (error.isAuthentication) throw const _AuthRequired();
        if (error.isTransient) {
          await _retryLater(operation, error.message);
        } else if (error.statusCode == 409 &&
            '${operation['entity']}' == 'vehicles' &&
            operation['server_id'] == null) {
          // A create may have succeeded while the response was lost. Adopt the
          // existing server vehicle instead of creating a duplicate.
          final adopted = await _adoptExistingVehicle(operation);
          if (!adopted) await _recordConflict(operation, error.message);
        } else {
          await _recordConflict(operation, error.message);
        }
      } on _SyncDeferred catch (error) {
        await _retryLater(operation, error.message, baseSeconds: 60);
      } on _SyncConflict catch (error) {
        await _recordConflict(operation, error.message);
      }
    }
    return pushed;
  }

  Future<bool> _pushOne(Map<String, Object?> operation) async {
    final api = _api!;
    final entity = '${operation['entity']}';
    final localId = operation['local_id'] as int;
    final op = '${operation['operation']}';
    final db = await _db;

    if (op == 'delete') {
      if (_isFinance(entity)) {
        throw const _SyncConflict(
          'Financial records are voided instead of deleted.',
        );
      }
      final serverId = operation['server_id'] as String?;
      if (serverId != null) {
        try {
          await api.delete('${_collection(entity)}/$serverId');
        } on FleetApiException catch (error) {
          if (error.statusCode != 404) rethrow;
        }
      }
      await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
      return true;
    }

    final local = await db.query(
      entity,
      where: 'id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    if (local.isEmpty) {
      await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
      return false;
    }
    final row = local.first;
    final serverId = row['server_id'] as String?;

    if (_isFinance(entity)) {
      if (row['is_voided'] == 1) {
        if (serverId == null) {
          throw const _SyncConflict(
            'This voided record was never posted to the shared workspace.',
          );
        }
        final reason = '${row['void_reason'] ?? 'Voided on device'}';
        try {
          await api.post(
            '${_collection(entity)}/$serverId/void',
            body: {'reason': reason},
          );
        } on FleetApiException catch (error) {
          if (error.statusCode != 409) rethrow;
        }
        await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
        return true;
      }
      if (serverId == null) {
        final response = await api.post(
          _collection(entity),
          body: await _payload(entity, row, db),
        );
        final record = _record(response, entity);
        if (record == null) {
          throw const _SyncConflict('The server did not confirm this record.');
        }
        await _storeServerRecord(entity, record, localId: localId);
        await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
        return true;
      }
      throw const _SyncConflict(
        'Posted financial records cannot be edited. Void the record and post a corrected one.',
      );
    }

    final payload = await _payload(entity, row, db);
    if (serverId == null) {
      final response = await api.post(_collection(entity), body: payload);
      final record = _record(response, entity);
      if (record == null) {
        throw const _SyncConflict('The server did not confirm this record.');
      }
      await _storeServerRecord(entity, record, localId: localId);
    } else {
      await _assertNotChangedElsewhere(entity, row, serverId, api);
      final response = await api.patch(
        '${_collection(entity)}/$serverId',
        body: payload,
      );
      final record = _record(response, entity);
      if (record == null) {
        throw const _SyncConflict('The server did not confirm this record.');
      }
      await _storeServerRecord(entity, record, localId: localId);
    }
    await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
    return true;
  }

  Future<void> _assertNotChangedElsewhere(
    String entity,
    Map<String, Object?> local,
    String serverId,
    FleetApiClient api,
  ) async {
    final lastServerUpdate = _parseDate(local['server_updated_at']);
    if (lastServerUpdate == null) return;
    final response = await api.get('${_collection(entity)}/$serverId');
    final record = _record(response, entity);
    if (record == null) {
      throw const _SyncConflict('That record was removed on the server.');
    }
    final serverUpdate = _parseDate(record['updatedAt']);
    if (serverUpdate != null && serverUpdate.isAfter(lastServerUpdate)) {
      throw const _SyncConflict(
        'This record changed on another device. Your local change was kept. '
        'Review it, then save it again to overwrite the server version.',
      );
    }
  }

  Future<int> _pullAll() async {
    var pulled = 0;
    for (final entity in _entities) {
      final items = await _api!.listAll(_collection(entity), entity);
      for (final item in items) {
        final applied = await _storeServerRecord(entity, item);
        if (applied) pulled++;
      }
    }
    return pulled;
  }

  Future<bool> _storeServerRecord(
    String entity,
    Map<String, dynamic> server, {
    int? localId,
  }) async {
    final serverId = server['id'];
    if (serverId is! String || serverId.isEmpty) return false;
    final db = await _db;

    return db.transaction((txn) async {
      await txn.insert('sync_meta', {
        'key': 'applying',
        'value': '1',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
      try {
        Map<String, Object?>? local;
        if (localId != null) {
          local = (await txn.query(
            entity,
            where: 'id = ?',
            whereArgs: [localId],
            limit: 1,
          )).firstOrNull;
        }
        local ??= (await txn.query(
          entity,
          where: 'server_id = ?',
          whereArgs: [serverId],
          limit: 1,
        )).firstOrNull;
        if (local == null && entity == 'vehicles') {
          final key = _registrationKey(server['registrationNumber']);
          if (key.isNotEmpty) {
            local = (await txn.query(
              'vehicles',
              where: 'registration_key = ?',
              whereArgs: [key],
              limit: 1,
            )).firstOrNull;
          }
        }

        if (local != null && localId == null) {
          final pending = await txn.query(
            'sync_outbox',
            where: 'entity = ? AND local_id = ?',
            whereArgs: [entity, local['id']],
            limit: 1,
          );
          if (pending.isNotEmpty) return false;
          final localUpdated = _parseDate(local['updated_at']);
          final serverUpdated = _parseDate(server['updatedAt']);
          if (localUpdated != null &&
              serverUpdated != null &&
              localUpdated.isAfter(serverUpdated)) {
            await _conflictInTransaction(
              txn,
              entity,
              local['id'] as int,
              serverId,
              'Changed locally and on another device.',
            );
            return false;
          }
        }

        final values = await _localValues(entity, server, local, txn);
        if (values == null) return false;
        values['server_id'] = serverId;
        values['server_updated_at'] = _iso(server['updatedAt']);
        values['updated_at'] = _iso(server['updatedAt']) ??
            DateTime.now().toUtc().toIso8601String();

        if (local == null) {
          await txn.insert(
            entity,
            values,
            conflictAlgorithm: ConflictAlgorithm.abort,
          );
        } else {
          await txn.update(
            entity,
            values,
            where: 'id = ?',
            whereArgs: [local['id']],
          );
        }
        return true;
      } finally {
        await txn.insert('sync_meta', {
          'key': 'applying',
          'value': '0',
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<Map<String, Object?>?> _localValues(
    String entity,
    Map<String, dynamic> server,
    Map<String, Object?>? local,
    DatabaseExecutor txn,
  ) async {
    switch (entity) {
      case 'vehicles':
        final registration = '${server['registrationNumber'] ?? ''}'.trim();
        if (registration.isEmpty) return null;
        final year = server['year'];
        return {
          'registration_number': registration.toUpperCase(),
          'registration_key': _registrationKey(registration),
          'make': '${server['make'] ?? ''}',
          'model': '${server['model'] ?? ''}',
          'year': year is num ? year.toInt() : null,
          'colour': server['colour'],
          'status': local?['status'] ?? 'Available',
          'insurance_expiry': server['insuranceExpiry'],
          'road_tax_expiry': server['roadTaxExpiry'],
          'roadworthy_expiry': server['roadworthyExpiry'],
          'next_service_date': server['nextServiceDate'],
          'notes': server['notes'],
          'assigned_driver_id': local?['assigned_driver_id'],
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
      case 'drivers':
        return {
          'name': '${server['fullName'] ?? ''}',
          'phone': server['phone'],
          'licence_number': server['licenceNumber'],
          'licence_expiry': server['licenceExpiry'],
          'is_available': server['status'] == 'inactive' ? 0 : 1,
          'notes': server['notes'],
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
      case 'hires':
        final vehicleId = await _localIdForServer(
          txn,
          'vehicles',
          server['vehicleId'],
        );
        final driverId = await _localIdForServer(
          txn,
          'drivers',
          server['driverId'],
        );
        if (vehicleId == null || driverId == null) return null;
        return {
          'vehicle_id': vehicleId,
          'driver_id': driverId,
          'start_date': _dateOnly(server['startsAt']),
          'end_date': _dateOnly(server['actualEndAt'] ?? server['expectedEndAt']),
          'status': _hireStatusFromServer(server['status']),
          'notes': server['notes'],
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
      case 'expenses':
        final vehicleId = await _localIdForServer(
          txn,
          'vehicles',
          server['vehicleId'],
        );
        if (vehicleId == null) return null;
        return {
          'vehicle_id': vehicleId,
          'entry_date': _dateOnly(server['entryDate']),
          'category': '${server['category'] ?? 'Other'}',
          'description': '${server['description'] ?? ''}',
          'amount': _amount(server['amount']),
          'supplier': server['supplier'],
          'payment_method': server['paymentMethod'],
          'notes': server['notes'],
          'is_voided': server['status'] == 'voided' ? 1 : 0,
          'void_reason': server['voidReason'],
          'voided_at': _iso(server['voidedAt']),
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
      case 'income':
        return {
          'entry_date': _dateOnly(server['entryDate']),
          'description': '${server['description'] ?? ''}',
          'amount': _amount(server['amount']),
          'vehicle_id': await _localIdForServer(txn, 'vehicles', server['vehicleId']),
          'driver_id': await _localIdForServer(txn, 'drivers', server['driverId']),
          'payment_method': server['paymentMethod'],
          'reference': server['reference'],
          'notes': server['notes'],
          'is_voided': server['status'] == 'voided' ? 1 : 0,
          'void_reason': server['voidReason'],
          'voided_at': _iso(server['voidedAt']),
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
      case 'remittances':
        final driverId = await _localIdForServer(
          txn,
          'drivers',
          server['driverId'],
        );
        if (driverId == null) return null;
        return {
          'entry_date': _dateOnly(server['entryDate']),
          'driver_id': driverId,
          'period_start': _dateOnly(server['periodStart']),
          'period_end': _dateOnly(server['periodEnd']),
          'amount': _amount(server['amount']),
          'vehicle_id': await _localIdForServer(txn, 'vehicles', server['vehicleId']),
          'payment_method': server['paymentMethod'],
          'reference': server['reference'],
          'notes': server['notes'],
          'is_voided': server['status'] == 'voided' ? 1 : 0,
          'void_reason': server['voidReason'],
          'voided_at': _iso(server['voidedAt']),
          'created_at': _iso(server['createdAt']) ??
              local?['created_at'] ??
              DateTime.now().toUtc().toIso8601String(),
        };
    }
    return null;
  }

  Future<Map<String, Object?>> _payload(
    String entity,
    Map<String, Object?> row,
    DatabaseExecutor db,
  ) async {
    switch (entity) {
      case 'vehicles':
        final year = row['year'];
        if (year == null) {
          throw const _SyncConflict(
            'A vehicle needs a year before it can sync.',
          );
        }
        return {
          'registrationNumber': row['registration_number'],
          'make': row['make'],
          'model': row['model'],
          'year': year,
          'colour': row['colour'],
          'notes': row['notes'],
          'insuranceExpiry': row['insurance_expiry'],
          'roadTaxExpiry': row['road_tax_expiry'],
          'roadworthyExpiry': row['roadworthy_expiry'],
          'nextServiceDate': row['next_service_date'],
        };
      case 'drivers':
        return {
          'fullName': row['name'],
          'phone': row['phone'],
          'licenceNumber': row['licence_number'],
          'licenceExpiry': row['licence_expiry'],
          'status': row['is_available'] == 1 ? 'active' : 'inactive',
          'notes': row['notes'],
        };
      case 'hires':
        final vehicleId = await _serverIdFor(db, 'vehicles', row['vehicle_id']);
        final driverId = await _serverIdFor(db, 'drivers', row['driver_id']);
        if (vehicleId == null) {
          throw const _SyncDeferred(
            'Sync this hire’s vehicle before the hire.',
          );
        }
        if (driverId == null) {
          throw const _SyncDeferred(
            'Sync this hire’s driver before the hire.',
          );
        }
        return {
          'vehicleId': vehicleId,
          'driverId': driverId,
          'status': _hireStatusToServer(row['status']),
          'startsAt': '${row['start_date']}T00:00:00.000Z',
          'expectedEndAt': row['end_date'] == null
              ? null
              : '${row['end_date']}T23:59:59.000Z',
          'notes': row['notes'],
        };
      case 'expenses':
        final vehicleId = await _serverIdFor(db, 'vehicles', row['vehicle_id']);
        if (vehicleId == null) {
          throw const _SyncDeferred(
            'Sync this expense’s vehicle before the expense.',
          );
        }
        return {
          'vehicleId': vehicleId,
          'entryDate': row['entry_date'],
          'category': row['category'],
          'description': row['description'],
          'amount': _amount(row['amount']).toStringAsFixed(2),
          'currency': 'ZMW',
          'supplier': row['supplier'],
          'paymentMethod': row['payment_method'],
          'notes': row['notes'],
        };
      case 'income':
        return {
          'entryDate': row['entry_date'],
          'description': row['description'],
          'amount': _amount(row['amount']).toStringAsFixed(2),
          'currency': 'ZMW',
          'vehicleId': await _serverIdFor(db, 'vehicles', row['vehicle_id']),
          'driverId': await _serverIdFor(db, 'drivers', row['driver_id']),
          'paymentMethod': row['payment_method'],
          'reference': row['reference'],
          'notes': row['notes'],
        };
      case 'remittances':
        final driverId = await _serverIdFor(db, 'drivers', row['driver_id']);
        if (driverId == null) {
          throw const _SyncDeferred(
            'Sync this remittance’s driver before the remittance.',
          );
        }
        return {
          'entryDate': row['entry_date'],
          'driverId': driverId,
          'periodStart': row['period_start'],
          'periodEnd': row['period_end'],
          'amount': _amount(row['amount']).toStringAsFixed(2),
          'currency': 'ZMW',
          'vehicleId': await _serverIdFor(db, 'vehicles', row['vehicle_id']),
          'paymentMethod': row['payment_method'],
          'reference': row['reference'],
          'notes': row['notes'],
        };
    }
    throw const _SyncConflict('This record type cannot be synchronized.');
  }

  Future<int?> _localIdForServer(
    DatabaseExecutor db,
    String table,
    Object? serverId,
  ) async {
    if (serverId is! String || serverId.isEmpty) return null;
    final rows = await db.query(
      table,
      columns: ['id'],
      where: 'server_id = ?',
      whereArgs: [serverId],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['id'] as int?;
  }

  Future<String?> _serverIdFor(
    DatabaseExecutor db,
    String table,
    Object? localId,
  ) async {
    if (localId is! int) return null;
    final rows = await db.query(
      table,
      columns: ['server_id'],
      where: 'id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['server_id'] as String?;
  }

  Future<bool> _adoptExistingVehicle(Map<String, Object?> operation) async {
    final localId = operation['local_id'] as int;
    final db = await _db;
    final rows = await db.query(
      'vehicles',
      where: 'id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    if (rows.isEmpty) return false;
    final registration = '${rows.first['registration_number'] ?? ''}';
    final matches = await _api!.listAll('/v1/vehicles', 'vehicles');
    final key = _registrationKey(registration);
    for (final match in matches) {
      if (_registrationKey(match['registrationNumber']) != key) continue;
      await _storeServerRecord('vehicles', match, localId: localId);
      await db.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
      return true;
    }
    return false;
  }

  Future<void> _retryLater(
    Map<String, Object?> operation,
    String message, {
    int baseSeconds = 5,
  }) async {
    final attempts = (operation['attempts'] as int? ?? 0) + 1;
    final delay = Duration(
      seconds: (baseSeconds * (1 << attempts.clamp(0, 6))).clamp(
        baseSeconds,
        300,
      ),
    );
    final db = await _db;
    await db.update(
      'sync_outbox',
      {
        'attempts': attempts,
        'last_error': message,
        'next_attempt_at': DateTime.now().add(delay).toUtc().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [operation['id']],
    );
  }

  Future<void> _recordConflict(
    Map<String, Object?> operation,
    String message,
  ) async {
    final db = await _db;
    await db.transaction((txn) async {
      await _conflictInTransaction(
        txn,
        '${operation['entity']}',
        operation['local_id'] as int,
        operation['server_id'] as String?,
        message,
      );
      await txn.delete('sync_outbox', where: 'id = ?', whereArgs: [operation['id']]);
    });
  }

  Future<void> _conflictInTransaction(
    DatabaseExecutor txn,
    String entity,
    int localId,
    String? serverId,
    String message,
  ) async {
    await txn.insert('sync_conflicts', {
      'entity': entity,
      'local_id': localId,
      'server_id': serverId,
      'message': message,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  String _collection(String entity) => '/v1/$entity';

  String _recordKey(String entity) => switch (entity) {
    'vehicles' => 'vehicle',
    'drivers' => 'driver',
    'hires' => 'hire',
    'expenses' => 'expense',
    'income' => 'income',
    'remittances' => 'remittance',
    _ => entity,
  };

  Map<String, dynamic>? _record(Map<String, dynamic> response, String entity) {
    final value = response[_recordKey(entity)];
    return value is Map ? Map<String, dynamic>.from(value) : null;
  }

  bool _isFinance(String entity) =>
      entity == 'expenses' || entity == 'income' || entity == 'remittances';

  String _registrationKey(Object? value) =>
      '${value ?? ''}'.toUpperCase().replaceAll(RegExp(r'\s+'), '');

  DateTime? _parseDate(Object? value) =>
      value is String ? DateTime.tryParse(value)?.toUtc() : null;

  String? _iso(Object? value) {
    final parsed = _parseDate(value);
    return parsed?.toIso8601String();
  }

  String _dateOnly(Object? value) {
    if (value is String && value.length >= 10) return value.substring(0, 10);
    return DateTime.now().toUtc().toIso8601String().substring(0, 10);
  }

  double _amount(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}') ?? 0;
  }

  String _hireStatusFromServer(Object? value) => switch ('$value') {
    'planned' => 'Active',
    'active' => 'Active',
    'completed' => 'Completed',
    'cancelled' => 'Cancelled',
    _ => 'Active',
  };

  String _hireStatusToServer(Object? value) => switch ('$value') {
    'Completed' => 'completed',
    'Cancelled' => 'cancelled',
    _ => 'active',
  };

  Future<String?> _setting(Database db, String key) async {
    final rows = await db.query(
      'sync_meta',
      columns: ['value'],
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  Future<int> _count(
    Database db,
    String table, {
    String? where,
  }) async {
    final result = await db.rawQuery(
      'SELECT COUNT(*) AS total FROM $table${where == null ? '' : ' WHERE $where'}',
    );
    return (result.first['total'] as int?) ?? 0;
  }
}

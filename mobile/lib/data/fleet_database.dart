import 'package:sqflite/sqflite.dart';

import '../models/app_role.dart';
import '../models/driver.dart';
import '../models/expense.dart';
import '../models/finance_entry.dart';
import '../models/fleet_snapshot.dart';
import '../models/hire.dart';
import '../models/vehicle.dart';

class FleetDatabase {
  FleetDatabase._();

  static final FleetDatabase instance = FleetDatabase._();
  static const _databaseName = 'ip_motors_fleet.db';
  static const _databaseVersion = 4;
  static const _roleSettingKey = 'workspace_role';

  Database? _database;
  String? _resolvedPath;

  Future<Database> get database async {
    if (_database != null) return _database!;
    final directory = await getDatabasesPath();
    _resolvedPath = '$directory/$_databaseName';
    _database = await openDatabase(
      _resolvedPath!,
      version: _databaseVersion,
      onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: (db, version) async {
        await _createDriversTable(db);
        await _createVehiclesTable(db);
        await _createExpenseTable(db);
        await _createHiresTable(db);
        await _createIncomeTable(db);
        await _createRemittancesTable(db);
        await _createSettingsTable(db);
        await _createIndexes(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await _createExpenseTable(db, ifNotExists: true);
        }
        if (oldVersion < 3) {
          await _upgradeToVersion3(db);
        }
        if (oldVersion < 4) {
          await _createSettingsTable(db);
        }
      },
    );
    return _database!;
  }

  Future<String> get databasePath async {
    if (_resolvedPath != null) return _resolvedPath!;
    await database;
    return _resolvedPath!;
  }

  Future<FleetSnapshot> loadSnapshot() async {
    final results = await Future.wait([
      getVehicles(),
      getDrivers(),
      getExpenses(),
      getHires(),
      getIncome(),
      getRemittances(),
    ]);
    return FleetSnapshot(
      vehicles: results[0] as List<Vehicle>,
      drivers: results[1] as List<Driver>,
      expenses: results[2] as List<Expense>,
      hires: results[3] as List<Hire>,
      income: results[4] as List<Income>,
      remittances: results[5] as List<Remittance>,
      loadedAt: DateTime.now(),
    );
  }

  // Local preferences --------------------------------------------------------

  Future<AppRole> getAppRole() async {
    final value = await getSetting(_roleSettingKey);
    return AppRole.fromStorage(value);
  }

  Future<void> setAppRole(AppRole role) async {
    await setSetting(_roleSettingKey, role.storageKey);
  }

  Future<String?> getSetting(String key) async {
    final db = await database;
    final rows = await db.query(
      'app_settings',
      columns: ['value'],
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return rows.first['value'] as String?;
  }

  Future<void> setSetting(String key, String value) async {
    final db = await database;
    await db.insert('app_settings', {
      'key': key,
      'value': value,
      'updated_at': DateTime.now().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  // Vehicles -----------------------------------------------------------------

  Future<List<Vehicle>> getVehicles() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT v.*, d.name AS assigned_driver_name
      FROM vehicles v
      LEFT JOIN drivers d ON d.id = v.assigned_driver_id
      ORDER BY v.make COLLATE NOCASE, v.model COLLATE NOCASE
    ''');
    return rows.map(Vehicle.fromMap).toList();
  }

  Future<int> saveVehicle(Vehicle vehicle) async {
    final db = await database;
    final values = vehicle.toMap()
      ..remove('id')
      ..['updated_at'] = DateTime.now().toIso8601String();
    if (vehicle.id == null) {
      return db.insert(
        'vehicles',
        values,
        conflictAlgorithm: ConflictAlgorithm.abort,
      );
    }
    await db.update(
      'vehicles',
      values,
      where: 'id = ?',
      whereArgs: [vehicle.id],
    );
    return vehicle.id!;
  }

  /// Adds a recovered vehicle export without overwriting records already
  /// entered on this device. Registration keys are unique and normalized.
  Future<int> importVehicles(List<Vehicle> vehicles) async {
    final db = await database;
    var duplicates = 0;
    await db.transaction((txn) async {
      for (final vehicle in vehicles) {
        final values = vehicle.toMap()
          ..remove('id')
          ..['updated_at'] = DateTime.now().toIso8601String();
        final id = await txn.insert(
          'vehicles',
          values,
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
        if (id == 0) duplicates++;
      }
    });
    return duplicates;
  }

  Future<void> setVehicleStatus(int id, String status) async {
    final db = await database;
    await db.update(
      'vehicles',
      {'status': status, 'updated_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> deleteVehicle(int id) async {
    final db = await database;
    for (final table in ['expenses', 'income', 'remittances', 'hires']) {
      final linked = await db.query(
        table,
        columns: ['id'],
        where: 'vehicle_id = ?',
        whereArgs: [id],
        limit: 1,
      );
      if (linked.isNotEmpty) {
        throw StateError(
          'This vehicle has linked history and cannot be deleted. '
          'Mark it Unavailable instead so the history stays intact.',
        );
      }
    }
    await db.delete('vehicles', where: 'id = ?', whereArgs: [id]);
  }

  // Drivers ------------------------------------------------------------------

  Future<List<Driver>> getDrivers() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT d.*,
        v.id AS assigned_vehicle_id,
        v.registration_number AS assigned_vehicle_registration,
        v.make || ' ' || v.model AS assigned_vehicle_name
      FROM drivers d
      LEFT JOIN vehicles v ON v.assigned_driver_id = d.id
      ORDER BY d.name COLLATE NOCASE
    ''');
    return rows.map(Driver.fromMap).toList();
  }

  Future<int> saveDriver(Driver driver, {int? assignedVehicleId}) async {
    final db = await database;
    return db.transaction((txn) async {
      final values = driver.toMap()
        ..remove('id')
        ..['updated_at'] = DateTime.now().toIso8601String();
      int driverId;
      if (driver.id == null) {
        driverId = await txn.insert(
          'drivers',
          values,
          conflictAlgorithm: ConflictAlgorithm.abort,
        );
      } else {
        driverId = driver.id!;
        await txn.update(
          'drivers',
          values,
          where: 'id = ?',
          whereArgs: [driverId],
        );
      }

      await txn.update(
        'vehicles',
        {
          'assigned_driver_id': null,
          'updated_at': DateTime.now().toIso8601String(),
        },
        where: 'assigned_driver_id = ?',
        whereArgs: [driverId],
      );

      if (assignedVehicleId != null) {
        final rows = await txn.query(
          'vehicles',
          columns: ['id', 'assigned_driver_id', 'make', 'model'],
          where: 'id = ?',
          whereArgs: [assignedVehicleId],
          limit: 1,
        );
        if (rows.isEmpty) {
          throw StateError('The selected vehicle no longer exists.');
        }
        final currentDriver = rows.first['assigned_driver_id'] as int?;
        if (currentDriver != null && currentDriver != driverId) {
          throw StateError(
            'That vehicle is already assigned to another driver. '
            'Unassign it first.',
          );
        }
        await txn.update(
          'vehicles',
          {
            'assigned_driver_id': driverId,
            'updated_at': DateTime.now().toIso8601String(),
          },
          where: 'id = ?',
          whereArgs: [assignedVehicleId],
        );
      }
      return driverId;
    });
  }

  Future<void> setDriverAvailability(int id, bool isAvailable) async {
    final db = await database;
    await db.update(
      'drivers',
      {
        'is_available': isAvailable ? 1 : 0,
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> unassignVehicle(int driverId) async {
    final db = await database;
    await db.update(
      'vehicles',
      {
        'assigned_driver_id': null,
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'assigned_driver_id = ?',
      whereArgs: [driverId],
    );
  }

  Future<void> deleteDriver(int id) async {
    final db = await database;
    final assigned = await db.query(
      'vehicles',
      columns: ['id'],
      where: 'assigned_driver_id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (assigned.isNotEmpty) {
      throw StateError(
        'This driver is assigned to a vehicle. Remove the assignment first.',
      );
    }
    for (final table in ['hires', 'income', 'remittances']) {
      final linked = await db.query(
        table,
        columns: ['id'],
        where: 'driver_id = ?',
        whereArgs: [id],
        limit: 1,
      );
      if (linked.isNotEmpty) {
        throw StateError(
          'This driver has linked history and cannot be deleted. '
          'Mark the driver unavailable instead.',
        );
      }
    }
    await db.delete('drivers', where: 'id = ?', whereArgs: [id]);
  }

  // Hires --------------------------------------------------------------------

  Future<List<Hire>> getHires() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT h.*, v.registration_number AS vehicle_registration,
        v.make || ' ' || v.model AS vehicle_name,
        d.name AS driver_name
      FROM hires h
      JOIN vehicles v ON v.id = h.vehicle_id
      LEFT JOIN drivers d ON d.id = h.driver_id
      ORDER BY h.start_date DESC, h.id DESC
    ''');
    return rows.map(Hire.fromMap).toList();
  }

  Future<int> saveHire(Hire hire) async {
    final db = await database;
    return db.transaction((txn) async {
      final vehicleRows = await txn.query(
        'vehicles',
        columns: ['id', 'status'],
        where: 'id = ?',
        whereArgs: [hire.vehicleId],
        limit: 1,
      );
      if (vehicleRows.isEmpty) {
        throw StateError('The selected vehicle no longer exists.');
      }
      final vehicleStatus = vehicleRows.first['status'] as String;

      if (hire.status == 'Active') {
        final otherActive = await txn.query(
          'hires',
          columns: ['id'],
          where: 'vehicle_id = ? AND status = ? AND id <> ?',
          whereArgs: [hire.vehicleId, 'Active', hire.id ?? -1],
          limit: 1,
        );
        if (otherActive.isNotEmpty) {
          throw StateError('This vehicle already has an active hire.');
        }
        if (vehicleStatus != 'Available' && vehicleStatus != 'On hire') {
          throw StateError(
            'This vehicle is not available for a hire. '
            'Change its status first or choose another vehicle.',
          );
        }
      }

      final values = hire.toMap()
        ..remove('id')
        ..['updated_at'] = DateTime.now().toIso8601String();
      int hireId;
      if (hire.id == null) {
        hireId = await txn.insert(
          'hires',
          values,
          conflictAlgorithm: ConflictAlgorithm.abort,
        );
      } else {
        hireId = hire.id!;
        await txn.update('hires', values, where: 'id = ?', whereArgs: [hireId]);
      }

      if (hire.status == 'Active') {
        await txn.update(
          'vehicles',
          {'status': 'On hire', 'updated_at': DateTime.now().toIso8601String()},
          where: 'id = ?',
          whereArgs: [hire.vehicleId],
        );
      } else {
        final remaining = await txn.query(
          'hires',
          columns: ['id'],
          where: 'vehicle_id = ? AND status = ? AND id <> ?',
          whereArgs: [hire.vehicleId, 'Active', hireId],
          limit: 1,
        );
        if (remaining.isEmpty) {
          await txn.update(
            'vehicles',
            {
              'status': 'Available',
              'updated_at': DateTime.now().toIso8601String(),
            },
            where: 'id = ? AND status = ?',
            whereArgs: [hire.vehicleId, 'On hire'],
          );
        }
      }
      return hireId;
    });
  }

  // Expenses -----------------------------------------------------------------

  Future<List<Expense>> getExpenses() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT e.*, v.registration_number AS vehicle_registration,
        v.make || ' ' || v.model AS vehicle_name
      FROM expenses e
      JOIN vehicles v ON v.id = e.vehicle_id
      ORDER BY e.entry_date DESC, e.id DESC
    ''');
    return rows.map(Expense.fromMap).toList();
  }

  Future<int> saveExpense(Expense expense) async {
    final db = await database;
    final values = expense.toMap()..remove('id');
    return db.insert(
      'expenses',
      values,
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<void> voidExpense(int id, String reason) async {
    final db = await database;
    await db.update(
      'expenses',
      {
        'is_voided': 1,
        'void_reason': reason.trim(),
        'voided_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // Income and remittances ---------------------------------------------------

  Future<List<Income>> getIncome() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT i.*, v.registration_number AS vehicle_registration,
        v.make || ' ' || v.model AS vehicle_name,
        d.name AS driver_name
      FROM income i
      LEFT JOIN vehicles v ON v.id = i.vehicle_id
      LEFT JOIN drivers d ON d.id = i.driver_id
      ORDER BY i.entry_date DESC, i.id DESC
    ''');
    return rows.map(Income.fromMap).toList();
  }

  Future<int> saveIncome(Income income) async {
    final db = await database;
    final values = income.toMap()..remove('id');
    return db.insert(
      'income',
      values,
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<void> voidIncome(int id, String reason) async {
    final db = await database;
    await db.update(
      'income',
      {
        'is_voided': 1,
        'void_reason': reason.trim(),
        'voided_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<List<Remittance>> getRemittances() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT r.*, d.name AS driver_name,
        v.registration_number AS vehicle_registration,
        v.make || ' ' || v.model AS vehicle_name
      FROM remittances r
      JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      ORDER BY r.entry_date DESC, r.id DESC
    ''');
    return rows.map(Remittance.fromMap).toList();
  }

  Future<int> saveRemittance(Remittance remittance) async {
    final db = await database;
    final values = remittance.toMap()..remove('id');
    return db.insert(
      'remittances',
      values,
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<void> voidRemittance(int id, String reason) async {
    final db = await database;
    await db.update(
      'remittances',
      {
        'is_voided': 1,
        'void_reason': reason.trim(),
        'voided_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // Backup and restore -------------------------------------------------------

  Future<Map<String, Object?>> exportData() async {
    final db = await database;
    final tables = [
      'vehicles',
      'drivers',
      'expenses',
      'hires',
      'income',
      'remittances',
    ];
    final data = <String, Object?>{};
    for (final table in tables) {
      data[table] = await db.query(table);
    }
    final version = await db.getVersion();
    return {
      'app': 'IP Motors Fleet Manager',
      'format': 'ip-motors-backup',
      'format_version': 1,
      'database_version': version,
      'exported_at': DateTime.now().toIso8601String(),
      'counts': {
        for (final table in tables) table: (data[table] as List).length,
      },
      'tables': data,
    };
  }

  Future<void> restoreData(Map<String, Object?> backup) async {
    if (backup['format'] != 'ip-motors-backup') {
      throw FormatException(
        'This file is not an IP Motors Fleet Manager backup.',
      );
    }
    final rawTables = backup['tables'];
    if (rawTables is! Map) {
      throw const FormatException('The backup is missing its record tables.');
    }
    final tables = <String, List<Map<String, Object?>>>{};
    for (final table in [
      'vehicles',
      'drivers',
      'expenses',
      'hires',
      'income',
      'remittances',
    ]) {
      final value = rawTables[table];
      if (value is! List) {
        throw FormatException('The backup is missing the $table records.');
      }
      tables[table] = value
          .whereType<Map>()
          .map((row) => row.map((key, value) => MapEntry('$key', value)))
          .toList();
    }

    final db = await database;
    await db.transaction((txn) async {
      for (final table in [
        'income',
        'remittances',
        'expenses',
        'hires',
        'vehicles',
        'drivers',
      ]) {
        await txn.delete(table);
      }

      for (final key in [
        'drivers',
        'vehicles',
        'expenses',
        'hires',
        'income',
        'remittances',
      ]) {
        for (final row in tables[key]!) {
          final values = Map<String, Object?>.from(row);
          if (key == 'vehicles') {
            final registration = '${values['registration_number'] ?? ''}';
            values['registration_key'] ??= registration
                .toUpperCase()
                .replaceAll(RegExp(r'\s+'), '');
            values['updated_at'] ??= values['created_at'];
          }
          if (key == 'drivers') {
            values['updated_at'] ??= values['created_at'];
          }
          await txn.insert(
            key,
            values,
            conflictAlgorithm: ConflictAlgorithm.abort,
          );
        }
      }
    });
  }

  Future<Map<String, int>> recordCounts() async {
    final db = await database;
    final counts = <String, int>{};
    for (final table in [
      'vehicles',
      'drivers',
      'expenses',
      'hires',
      'income',
      'remittances',
    ]) {
      final result = await db.rawQuery('SELECT COUNT(*) AS total FROM $table');
      counts[table] = (result.first['total'] as int?) ?? 0;
    }
    return counts;
  }

  // Schema -------------------------------------------------------------------

  static Future<void> _createDriversTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS drivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        licence_number TEXT,
        licence_expiry TEXT,
        is_available INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    ''');
  }

  static Future<void> _createVehiclesTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        registration_number TEXT NOT NULL,
        registration_key TEXT NOT NULL UNIQUE,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER,
        colour TEXT,
        status TEXT NOT NULL DEFAULT 'Available',
        insurance_expiry TEXT,
        road_tax_expiry TEXT,
        roadworthy_expiry TEXT,
        next_service_date TEXT,
        notes TEXT,
        assigned_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    ''');
  }

  static Future<void> _createExpenseTable(
    DatabaseExecutor db, {
    bool ifNotExists = false,
  }) async {
    final modifier = ifNotExists ? 'IF NOT EXISTS ' : '';
    await db.execute('''
      CREATE TABLE ${modifier}expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
        entry_date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        supplier TEXT,
        payment_method TEXT,
        notes TEXT,
        is_voided INTEGER NOT NULL DEFAULT 0,
        void_reason TEXT,
        voided_at TEXT,
        created_at TEXT NOT NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS expenses_vehicle_date_idx '
      'ON expenses(vehicle_id, entry_date)',
    );
  }

  static Future<void> _createHiresTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS hires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
        driver_id INTEGER REFERENCES drivers(id) ON DELETE RESTRICT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    ''');
  }

  static Future<void> _createIncomeTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
        driver_id INTEGER REFERENCES drivers(id) ON DELETE RESTRICT,
        payment_method TEXT,
        reference TEXT,
        notes TEXT,
        is_voided INTEGER NOT NULL DEFAULT 0,
        void_reason TEXT,
        voided_at TEXT,
        created_at TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createRemittancesTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS remittances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date TEXT NOT NULL,
        driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
        payment_method TEXT,
        reference TEXT,
        notes TEXT,
        is_voided INTEGER NOT NULL DEFAULT 0,
        void_reason TEXT,
        voided_at TEXT,
        created_at TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createSettingsTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');
  }

  static Future<void> _createIndexes(DatabaseExecutor db) async {
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS vehicles_driver_unique '
      'ON vehicles(assigned_driver_id) '
      'WHERE assigned_driver_id IS NOT NULL',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS hires_vehicle_date_idx '
      'ON hires(vehicle_id, start_date)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS income_date_idx ON income(entry_date)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS remittances_period_idx '
      'ON remittances(period_start, period_end)',
    );
  }

  static Future<void> _upgradeToVersion3(Database db) async {
    await _createDriversTable(db);
    await _addColumnIfMissing(
      db,
      'vehicles',
      'assigned_driver_id',
      'INTEGER REFERENCES drivers(id) ON DELETE SET NULL',
    );
    await _addColumnIfMissing(db, 'vehicles', 'updated_at', 'TEXT');
    await db.execute(
      'UPDATE vehicles SET updated_at = created_at WHERE updated_at IS NULL',
    );
    for (final column in [
      ('is_voided', 'INTEGER NOT NULL DEFAULT 0'),
      ('void_reason', 'TEXT'),
      ('voided_at', 'TEXT'),
    ]) {
      await _addColumnIfMissing(db, 'expenses', column.$1, column.$2);
    }
    await _createHiresTable(db);
    await _createIncomeTable(db);
    await _createRemittancesTable(db);
    await _createIndexes(db);
  }

  static Future<void> _addColumnIfMissing(
    DatabaseExecutor db,
    String table,
    String column,
    String definition,
  ) async {
    final rows = await db.rawQuery('PRAGMA table_info($table)');
    final exists = rows.any((row) => row['name'] == column);
    if (!exists) {
      await db.execute('ALTER TABLE $table ADD COLUMN $column $definition');
    }
  }
}

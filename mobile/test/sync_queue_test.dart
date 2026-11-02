import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/fleet_database.dart';
import 'package:mobile/models/vehicle.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    await FleetDatabase.instance.close();
    final directory = await getDatabasesPath();
    await deleteDatabase('$directory/ip_motors_fleet.db');
  });

  test('local writes create a durable outbox entry that survives reopen', () async {
    final db = await FleetDatabase.instance.database;
    final id = await FleetDatabase.instance.saveVehicle(
      const Vehicle(
        registrationNumber: 'ABC 1234',
        make: 'Toyota',
        model: 'Hilux',
        year: 2020,
      ),
    );

    var outbox = await db.query('sync_outbox');
    expect(outbox, hasLength(1));
    expect(outbox.first['entity'], 'vehicles');
    expect(outbox.first['local_id'], id);
    expect(outbox.first['operation'], 'upsert');

    // Simulate a process restart: the queue is stored in SQLite, not memory.
    await FleetDatabase.instance.close();
    final reopened = await FleetDatabase.instance.database;
    outbox = await reopened.query('sync_outbox');
    expect(outbox, hasLength(1));
  });

  test('server-applied rows do not enqueue and duplicate server ids are rejected', () async {
    final db = await FleetDatabase.instance.database;
    await db.transaction((txn) async {
      await txn.insert('sync_meta', {
        'key': 'applying',
        'value': '1',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
      await txn.insert('vehicles', {
        'registration_number': 'SRV 001',
        'registration_key': 'SRV001',
        'make': 'Isuzu',
        'model': 'D-Max',
        'year': 2021,
        'status': 'Available',
        'server_id': 'server-vehicle-1',
        'server_updated_at': '2026-01-01T00:00:00.000Z',
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-01-01T00:00:00.000Z',
      });
      await txn.insert('sync_meta', {
        'key': 'applying',
        'value': '0',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    });

    final outbox = await db.query('sync_outbox');
    expect(outbox, isEmpty);

    await expectLater(
      db.insert('vehicles', {
        'registration_number': 'SRV 002',
        'registration_key': 'SRV002',
        'make': 'Isuzu',
        'model': 'D-Max',
        'year': 2022,
        'status': 'Available',
        'server_id': 'server-vehicle-1',
        'created_at': '2026-01-02T00:00:00.000Z',
      }),
      throwsA(anything),
    );
  });

  test('deleting a synced row queues a server delete with its server id', () async {
    final db = await FleetDatabase.instance.database;
    final id = await FleetDatabase.instance.saveVehicle(
      const Vehicle(
        registrationNumber: 'DEL 900',
        make: 'Ford',
        model: 'Ranger',
        year: 2019,
      ),
    );
    await db.update(
      'vehicles',
      {'server_id': 'server-delete-1'},
      where: 'id = ?',
      whereArgs: [id],
    );
    await FleetDatabase.instance.deleteVehicle(id);

    final outbox = await db.query(
      'sync_outbox',
      where: "operation = 'delete'",
    );
    expect(outbox, hasLength(1));
    expect(outbox.first['server_id'], 'server-delete-1');
  });
}

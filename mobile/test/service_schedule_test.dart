import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/vehicle.dart';
import 'package:mobile/utils/formatting.dart';
import 'package:mobile/utils/service_schedule.dart';

Vehicle _vehicle(String registration, {String? nextServiceDate}) {
  return Vehicle(
    registrationNumber: registration,
    make: 'Honda',
    model: 'Fit',
    nextServiceDate: nextServiceDate,
  );
}

void main() {
  group('vehicle service schedule', () {
    test('uses only saved, readable next-service dates', () {
      final today = DateTime.now();
      final items = buildServiceSchedule([
        _vehicle('AAA111', nextServiceDate: 'not-a-date'),
        _vehicle('BBB222'),
        _vehicle(
          'CCC333',
          nextServiceDate: dateToIso(today.subtract(const Duration(days: 2))),
        ),
        _vehicle(
          'DDD444',
          nextServiceDate: dateToIso(today.add(const Duration(days: 5))),
        ),
      ]);

      expect(items, hasLength(2));
      expect(items.first.vehicle.registrationNumber, 'CCC333');
      expect(items.first.isOverdue, isTrue);
      expect(items.last.vehicle.registrationNumber, 'DDD444');
      expect(items.last.isDueSoon, isTrue);
    });

    test('counts overdue and due-soon items separately', () {
      final today = DateTime.now();
      final items = buildServiceSchedule([
        _vehicle(
          'OVERDUE1',
          nextServiceDate: dateToIso(today.subtract(const Duration(days: 1))),
        ),
        _vehicle(
          'OVERDUE2',
          nextServiceDate: dateToIso(today.subtract(const Duration(days: 9))),
        ),
        _vehicle('SOON', nextServiceDate: dateToIso(today)),
        _vehicle(
          'LATER',
          nextServiceDate: dateToIso(today.add(const Duration(days: 60))),
        ),
      ]);

      expect(countOverdueService(items), 2);
      expect(countServiceDueSoon(items), 1);
    });

    test('returns no items when no vehicle has a service date', () {
      final items = buildServiceSchedule([
        _vehicle('NODATE1'),
        _vehicle('NODATE2'),
      ]);

      expect(items, isEmpty);
      expect(countOverdueService(items), 0);
      expect(countServiceDueSoon(items), 0);
    });

    test('sorts by due date and then registration', () {
      final today = DateTime.now();
      final sameDate = dateToIso(today.add(const Duration(days: 10)));
      final items = buildServiceSchedule([
        _vehicle('ZZZ999', nextServiceDate: sameDate),
        _vehicle('AAA111', nextServiceDate: sameDate),
        _vehicle(
          'MIDDLE',
          nextServiceDate: dateToIso(today.add(const Duration(days: 4))),
        ),
      ]);

      expect(items.map((item) => item.vehicle.registrationNumber).toList(), [
        'MIDDLE',
        'AAA111',
        'ZZZ999',
      ]);
    });
  });
}

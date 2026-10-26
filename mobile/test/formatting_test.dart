import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/formatting.dart';

void main() {
  group('month-based 10-day remittance periods', () {
    test('period 1 covers days 1 to 10', () {
      final period = RemittancePeriod.forDate(DateTime(2026, 10, 1));
      expect(period.startIso, '2026-10-01');
      expect(period.endIso, '2026-10-10');
      expect(period.contains('2026-10-10'), isTrue);
      expect(period.contains('2026-10-11'), isFalse);
    });

    test('period 2 covers days 11 to 20', () {
      final period = RemittancePeriod.forDate(DateTime(2026, 10, 20));
      expect(period.startIso, '2026-10-11');
      expect(period.endIso, '2026-10-20');
    });

    test('period 3 ends on the last day of the month', () {
      final october = RemittancePeriod.forDate(DateTime(2026, 10, 31));
      expect(october.startIso, '2026-10-21');
      expect(october.endIso, '2026-10-31');

      final february = RemittancePeriod.forDate(DateTime(2028, 2, 29));
      expect(february.startIso, '2028-02-21');
      expect(february.endIso, '2028-02-29');
    });

    test('previous and next periods cross month boundaries', () {
      final first = RemittancePeriod.forDate(DateTime(2026, 10, 1));
      expect(first.previous().startIso, '2026-09-21');
      expect(first.previous().endIso, '2026-09-30');

      final last = RemittancePeriod.forDate(DateTime(2026, 10, 31));
      expect(last.next().startIso, '2026-11-01');
      expect(last.next().endIso, '2026-11-10');
    });
  });

  group('formatting', () {
    test('formats ZMW amounts with thousands separators', () {
      expect(formatMoney(1234.5), 'ZMW 1,234.50');
      expect(formatMoney(0), 'ZMW 0.00');
      expect(formatMoney(-20), '-ZMW 20.00');
    });

    test('escapes commas, quotes, and new lines in CSV fields', () {
      expect(csvEscape('plain'), 'plain');
      expect(csvEscape('one, two'), '"one, two"');
      expect(csvEscape('say "hello"'), '"say ""hello"""');
      expect(csvEscape('line\nbreak'), '"line\nbreak"');
    });

    test('inclusive date range comparison uses date-only values', () {
      expect(isDateInRange('2026-10-01', '2026-10-01', '2026-10-10'), isTrue);
      expect(isDateInRange('2026-10-10', '2026-10-01', '2026-10-10'), isTrue);
      expect(isDateInRange('2026-10-11', '2026-10-01', '2026-10-10'), isFalse);
    });
  });
}

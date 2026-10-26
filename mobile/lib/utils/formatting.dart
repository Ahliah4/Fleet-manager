const expenseCategories = [
  'Battery',
  'Engine oil & fluids',
  'Tyres',
  'Repairs',
  'Service',
  'Inspection',
  'Parts',
  'Other',
];

const paymentMethods = [
  'Cash',
  'Mobile money',
  'Bank transfer',
  'Card',
  'Other',
];

const vehicleStatuses = ['Available', 'On hire', 'Maintenance', 'Unavailable'];

const hireStatuses = ['Active', 'Completed', 'Cancelled'];

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String twoDigits(int value) => value.toString().padLeft(2, '0');

String dateToIso(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${twoDigits(date.month)}-${twoDigits(date.day)}';

String todayIso() => dateToIso(DateTime.now());

DateTime? parseIsoDate(String? value) {
  if (value == null || value.trim().isEmpty) return null;
  return DateTime.tryParse(value);
}

String formatDate(String? value, {String fallback = 'Not set'}) {
  final date = parseIsoDate(value);
  if (date == null) return fallback;
  return '${date.day} ${_months[date.month - 1]} ${date.year}';
}

String formatDateShort(String? value, {String fallback = 'Not set'}) {
  final date = parseIsoDate(value);
  if (date == null) return fallback;
  return '${date.day} ${_months[date.month - 1]}';
}

String formatDateTime(String? value, {String fallback = '—'}) {
  if (value == null || value.isEmpty) return fallback;
  final date = DateTime.tryParse(value);
  if (date == null) return fallback;
  final local = date.toLocal();
  return '${local.day} ${_months[local.month - 1]} ${local.year}, '
      '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
}

String formatMoney(num value) {
  final negative = value < 0;
  final fixed = value.abs().toStringAsFixed(2);
  final parts = fixed.split('.');
  final whole = parts.first;
  final buffer = StringBuffer();
  for (var i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 == 0) buffer.write(',');
    buffer.write(whole[i]);
  }
  return '${negative ? '-' : ''}ZMW $buffer.${parts.last}';
}

String formatNumber(num value) {
  if (value == value.roundToDouble()) return value.toInt().toString();
  return value.toStringAsFixed(2);
}

int? daysUntil(String? value) {
  final date = parseIsoDate(value);
  if (date == null) return null;
  final today = DateTime.now();
  final start = DateTime(today.year, today.month, today.day);
  final target = DateTime(date.year, date.month, date.day);
  return target.difference(start).inDays;
}

String dueLabel(String? value) {
  final days = daysUntil(value);
  if (days == null) return 'Not set';
  if (days < 0) return '${days.abs()}d overdue';
  if (days == 0) return 'Due today';
  return '${days}d left';
}

enum DueTone { overdue, soon, valid, missing }

DueTone dueTone(String? value, {int soonDays = 30}) {
  final days = daysUntil(value);
  if (days == null) return DueTone.missing;
  if (days < 0) return DueTone.overdue;
  if (days <= soonDays) return DueTone.soon;
  return DueTone.valid;
}

bool isDateInRange(String value, String from, String to) {
  final date = value.length >= 10 ? value.substring(0, 10) : value;
  return date.compareTo(from) >= 0 && date.compareTo(to) <= 0;
}

bool isSameMonth(String value, DateTime month) {
  return value.startsWith(
    '${month.year.toString().padLeft(4, '0')}-${twoDigits(month.month)}',
  );
}

class RemittancePeriod {
  const RemittancePeriod({required this.start, required this.end});

  final DateTime start;
  final DateTime end;

  String get startIso => dateToIso(start);
  String get endIso => dateToIso(end);

  String get label {
    if (start.month == end.month) {
      return '${start.day}–${end.day} ${_months[start.month - 1]} ${start.year}';
    }
    return '${start.day} ${_months[start.month - 1]} – '
        '${end.day} ${_months[end.month - 1]} ${end.year}';
  }

  String get shortLabel =>
      '${start.day} ${_months[start.month - 1]} – '
      '${end.day} ${_months[end.month - 1]}';

  bool contains(String? value) {
    if (value == null || value.isEmpty) return false;
    final date = value.length >= 10 ? value.substring(0, 10) : value;
    return date.compareTo(startIso) >= 0 && date.compareTo(endIso) <= 0;
  }

  RemittancePeriod previous() {
    final previousEnd = start.subtract(const Duration(days: 1));
    return RemittancePeriod.forDate(previousEnd);
  }

  RemittancePeriod next() {
    final nextStart = end.add(const Duration(days: 1));
    return RemittancePeriod.forDate(nextStart);
  }

  factory RemittancePeriod.forDate(DateTime date) {
    final day = date.day;
    if (day <= 10) {
      return RemittancePeriod(
        start: DateTime(date.year, date.month, 1),
        end: DateTime(date.year, date.month, 10),
      );
    }
    if (day <= 20) {
      return RemittancePeriod(
        start: DateTime(date.year, date.month, 11),
        end: DateTime(date.year, date.month, 20),
      );
    }
    final lastDay = DateTime(date.year, date.month + 1, 0).day;
    return RemittancePeriod(
      start: DateTime(date.year, date.month, 21),
      end: DateTime(date.year, date.month, lastDay),
    );
  }

  factory RemittancePeriod.forIso(String value) {
    return RemittancePeriod.forDate(parseIsoDate(value) ?? DateTime.now());
  }

  bool get isCurrent => contains(todayIso());
}

String csvEscape(Object? value) {
  final text = value?.toString() ?? '';
  if (text.contains(',') || text.contains('"') || text.contains('\n')) {
    return '"${text.replaceAll('"', '""')}"';
  }
  return text;
}

String buildCsv(List<String> headers, List<List<Object?>> rows) {
  final buffer = StringBuffer();
  buffer.writeln(headers.map(csvEscape).join(','));
  for (final row in rows) {
    buffer.writeln(row.map(csvEscape).join(','));
  }
  return buffer.toString();
}

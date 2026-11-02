import '../models/vehicle.dart';
import 'formatting.dart';

class ServiceScheduleItem {
  const ServiceScheduleItem({
    required this.vehicle,
    required this.date,
    required this.days,
  });

  final Vehicle vehicle;
  final String date;
  final int days;

  bool get isOverdue => days < 0;
  bool get isDueSoon => days >= 0 && days <= 30;
}

/// Builds the service schedule only from next-service dates that are actually
/// saved on vehicle records. Vehicles without a readable date are skipped.
List<ServiceScheduleItem> buildServiceSchedule(Iterable<Vehicle> vehicles) {
  final items = <ServiceScheduleItem>[];
  for (final vehicle in vehicles) {
    final date = vehicle.nextServiceDate;
    if (date == null || date.trim().isEmpty) continue;
    final days = daysUntil(date);
    if (days == null) continue;
    items.add(ServiceScheduleItem(vehicle: vehicle, date: date, days: days));
  }
  items.sort((a, b) {
    final byDays = a.days.compareTo(b.days);
    if (byDays != 0) return byDays;
    return a.vehicle.registrationNumber.compareTo(b.vehicle.registrationNumber);
  });
  return items;
}

int countOverdueService(List<ServiceScheduleItem> items) =>
    items.where((item) => item.isOverdue).length;

int countServiceDueSoon(List<ServiceScheduleItem> items) =>
    items.where((item) => item.isDueSoon).length;

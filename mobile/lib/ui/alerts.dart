import '../models/fleet_snapshot.dart';
import '../utils/formatting.dart';

enum FleetAlertKind { insurance, roadTax, roadworthy, service, licence }

class FleetAlert {
  const FleetAlert({
    required this.kind,
    required this.title,
    required this.subject,
    required this.date,
    required this.days,
  });

  final FleetAlertKind kind;
  final String title;
  final String subject;
  final String date;
  final int days;

  bool get isOverdue => days < 0;
}

List<FleetAlert> buildFleetAlerts(
  FleetSnapshot snapshot, {
  int soonDays = 30,
  bool includeSoon = true,
}) {
  final alerts = <FleetAlert>[];
  void add(FleetAlertKind kind, String title, String subject, String? date) {
    if (date == null || date.isEmpty) return;
    final days = daysUntil(date);
    if (days == null) return;
    if (days < 0 || (includeSoon && days <= soonDays)) {
      alerts.add(
        FleetAlert(
          kind: kind,
          title: title,
          subject: subject,
          date: date,
          days: days,
        ),
      );
    }
  }

  for (final vehicle in snapshot.vehicles) {
    final subject =
        '${vehicle.make} ${vehicle.model} · '
        '${vehicle.registrationNumber}';
    add(
      FleetAlertKind.insurance,
      'Insurance',
      subject,
      vehicle.insuranceExpiry,
    );
    add(FleetAlertKind.roadTax, 'Road tax', subject, vehicle.roadTaxExpiry);
    add(
      FleetAlertKind.roadworthy,
      'Roadworthy',
      subject,
      vehicle.roadworthyExpiry,
    );
    add(FleetAlertKind.service, 'Service', subject, vehicle.nextServiceDate);
  }
  for (final driver in snapshot.drivers) {
    add(
      FleetAlertKind.licence,
      'Driver licence',
      driver.name,
      driver.licenceExpiry,
    );
  }
  alerts.sort((a, b) => a.days.compareTo(b.days));
  return alerts;
}

int countMissingDocuments(FleetSnapshot snapshot) {
  var count = 0;
  for (final vehicle in snapshot.vehicles) {
    if (vehicle.insuranceExpiry == null || vehicle.insuranceExpiry!.isEmpty) {
      count++;
    }
    if (vehicle.roadTaxExpiry == null || vehicle.roadTaxExpiry!.isEmpty) {
      count++;
    }
    if (vehicle.roadworthyExpiry == null || vehicle.roadworthyExpiry!.isEmpty) {
      count++;
    }
  }
  return count;
}

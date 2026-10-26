import 'driver.dart';
import 'expense.dart';
import 'finance_entry.dart';
import 'hire.dart';
import 'vehicle.dart';

class FleetSnapshot {
  const FleetSnapshot({
    required this.vehicles,
    required this.drivers,
    required this.expenses,
    required this.hires,
    required this.income,
    required this.remittances,
    required this.loadedAt,
  });

  final List<Vehicle> vehicles;
  final List<Driver> drivers;
  final List<Expense> expenses;
  final List<Hire> hires;
  final List<Income> income;
  final List<Remittance> remittances;
  final DateTime loadedAt;

  static FleetSnapshot empty() => FleetSnapshot(
    vehicles: const [],
    drivers: const [],
    expenses: const [],
    hires: const [],
    income: const [],
    remittances: const [],
    loadedAt: DateTime.now(),
  );

  bool get isEmpty =>
      vehicles.isEmpty &&
      drivers.isEmpty &&
      expenses.isEmpty &&
      hires.isEmpty &&
      income.isEmpty &&
      remittances.isEmpty;

  int get activeHires => hires.where((hire) => hire.status == 'Active').length;
}

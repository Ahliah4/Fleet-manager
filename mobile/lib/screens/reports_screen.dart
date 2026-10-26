import 'package:flutter/material.dart';

import '../data/backup_service.dart';
import '../models/fleet_snapshot.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.snapshot});

  final FleetSnapshot snapshot;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  late String _from;
  late String _to;
  String _preset = 'This month';
  bool _exporting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final range = _rangeFor('This month');
    _from = range.$1;
    _to = range.$2;
  }

  (String, String) _rangeFor(String preset) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    switch (preset) {
      case 'Last month':
        final lastMonth = DateTime(now.year, now.month - 1, 1);
        return (
          dateToIso(lastMonth),
          dateToIso(DateTime(lastMonth.year, lastMonth.month + 1, 0)),
        );
      case 'Last 30 days':
        return (
          dateToIso(today.subtract(const Duration(days: 29))),
          dateToIso(today),
        );
      case 'This year':
        return (dateToIso(DateTime(now.year, 1, 1)), dateToIso(today));
      default:
        return (
          dateToIso(DateTime(now.year, now.month, 1)),
          dateToIso(DateTime(now.year, now.month + 1, 0)),
        );
    }
  }

  bool get _validRange => _from.compareTo(_to) <= 0;

  bool _inRange(String? value) {
    if (value == null || value.isEmpty) return false;
    return isDateInRange(value, _from, _to);
  }

  Future<void> _export() async {
    if (!_validRange) {
      setState(
        () => _error = 'The start date must be on or before the end date.',
      );
      return;
    }
    setState(() {
      _exporting = true;
      _error = null;
    });
    try {
      final csv = _buildReportCsv();
      final path = await BackupService.exportCsv(
        fileName: 'ip-motors-report-$_from-to-$_to',
        csv: csv,
        subject: 'IP Motors report $_from to $_to',
      );
      if (!mounted) return;
      showAppMessage(
        context,
        'Report CSV created and the share sheet opened. File: $path',
      );
    } catch (error) {
      if (!mounted) return;
      setState(
        () =>
            _error = 'We couldn’t create the report file. ${error.toString()}',
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  String _buildReportCsv() {
    final expenses =
        widget.snapshot.expenses
            .where((entry) => _inRange(entry.entryDate))
            .toList()
          ..sort((a, b) => b.entryDate.compareTo(a.entryDate));
    final income =
        widget.snapshot.income
            .where((entry) => _inRange(entry.entryDate))
            .toList()
          ..sort((a, b) => b.entryDate.compareTo(a.entryDate));
    final remittances =
        widget.snapshot.remittances
            .where((entry) => _inRange(entry.entryDate))
            .toList()
          ..sort((a, b) => b.entryDate.compareTo(a.entryDate));
    final hires =
        widget.snapshot.hires
            .where((entry) => _inRange(entry.startDate))
            .toList()
          ..sort((a, b) => b.startDate.compareTo(a.startDate));

    final activeExpenses = expenses.where((entry) => !entry.isVoided).toList();
    final activeIncome = income.where((entry) => !entry.isVoided).toList();
    final activeRemittances = remittances
        .where((entry) => !entry.isVoided)
        .toList();

    final buffer = StringBuffer();
    void line(List<Object?> values) {
      buffer.writeln(values.map(csvEscape).join(','));
    }

    line(['IP Motors Fleet Manager report']);
    line([
      'Date basis',
      'Transaction date for money and expenses; '
          'start date for hires. Current registers included separately.',
    ]);
    line(['From', _from, 'To', _to]);
    line(['Generated', formatDateTime(DateTime.now().toIso8601String())]);
    line([]);
    line(['SUMMARY']);
    line([
      'Expenses (active)',
      activeExpenses.fold<double>(0, (sum, entry) => sum + entry.amount),
    ]);
    line([
      'Income (active)',
      activeIncome.fold<double>(0, (sum, entry) => sum + entry.amount),
    ]);
    line([
      'Remittances (active)',
      activeRemittances.fold<double>(0, (sum, entry) => sum + entry.amount),
    ]);
    line(['Income, remittances, and expenses are not netted in this export.']);
    line(['Hires started', hires.length]);
    line(['Vehicles', widget.snapshot.vehicles.length]);
    line(['Drivers', widget.snapshot.drivers.length]);
    line([]);

    line(['EXPENSES']);
    line([
      'ID',
      'Date',
      'Vehicle',
      'Registration',
      'Category',
      'Item',
      'Amount ZMW',
      'Supplier',
      'Payment method',
      'Status',
      'Void reason',
      'Notes',
    ]);
    for (final entry in expenses) {
      line([
        entry.id,
        entry.entryDate,
        entry.vehicleName,
        entry.vehicleRegistration,
        entry.category,
        entry.description,
        entry.amount,
        entry.supplier,
        entry.paymentMethod,
        entry.isVoided ? 'Voided' : 'Active',
        entry.voidReason,
        entry.notes,
      ]);
    }
    line([]);

    line(['INCOME']);
    line([
      'ID',
      'Date',
      'Description',
      'Amount ZMW',
      'Vehicle',
      'Driver',
      'Payment method',
      'Reference',
      'Status',
      'Void reason',
      'Notes',
    ]);
    for (final entry in income) {
      line([
        entry.id,
        entry.entryDate,
        entry.description,
        entry.amount,
        entry.vehicleName,
        entry.driverName,
        entry.paymentMethod,
        entry.reference,
        entry.isVoided ? 'Voided' : 'Active',
        entry.voidReason,
        entry.notes,
      ]);
    }
    line([]);

    line(['REMITTANCES']);
    line([
      'ID',
      'Payment date',
      'Period start',
      'Period end',
      'Driver',
      'Vehicle',
      'Amount ZMW',
      'Payment method',
      'Reference',
      'Status',
      'Void reason',
      'Notes',
    ]);
    for (final entry in remittances) {
      line([
        entry.id,
        entry.entryDate,
        entry.periodStart,
        entry.periodEnd,
        entry.driverName,
        entry.vehicleName,
        entry.amount,
        entry.paymentMethod,
        entry.reference,
        entry.isVoided ? 'Voided' : 'Active',
        entry.voidReason,
        entry.notes,
      ]);
    }
    line([]);

    line(['HIRES']);
    line([
      'ID',
      'Vehicle',
      'Registration',
      'Driver',
      'Start date',
      'End date',
      'Status',
      'Notes',
    ]);
    for (final entry in hires) {
      line([
        entry.id,
        entry.vehicleName,
        entry.vehicleRegistration,
        entry.driverName,
        entry.startDate,
        entry.endDate,
        entry.status,
        entry.notes,
      ]);
    }
    line([]);

    line(['CURRENT VEHICLE REGISTER']);
    line([
      'ID',
      'Registration',
      'Make',
      'Model',
      'Year',
      'Colour',
      'Status',
      'Assigned driver',
      'Insurance expiry',
      'Road tax expiry',
      'Roadworthy expiry',
      'Next service',
      'Notes',
    ]);
    for (final entry in widget.snapshot.vehicles) {
      line([
        entry.id,
        entry.registrationNumber,
        entry.make,
        entry.model,
        entry.year,
        entry.colour,
        entry.status,
        entry.assignedDriverName,
        entry.insuranceExpiry,
        entry.roadTaxExpiry,
        entry.roadworthyExpiry,
        entry.nextServiceDate,
        entry.notes,
      ]);
    }
    line([]);

    line(['CURRENT DRIVER RECORDS']);
    line([
      'ID',
      'Name',
      'Phone',
      'Licence number',
      'Licence expiry',
      'Availability',
      'Assigned vehicle',
      'Notes',
    ]);
    for (final entry in widget.snapshot.drivers) {
      line([
        entry.id,
        entry.name,
        entry.phone,
        entry.licenceNumber,
        entry.licenceExpiry,
        entry.availability,
        entry.assignedVehicleRegistration,
        entry.notes,
      ]);
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final expenses = widget.snapshot.expenses
        .where((entry) => _inRange(entry.entryDate))
        .toList();
    final income = widget.snapshot.income
        .where((entry) => _inRange(entry.entryDate))
        .toList();
    final remittances = widget.snapshot.remittances
        .where((entry) => _inRange(entry.entryDate))
        .toList();
    final hires = widget.snapshot.hires
        .where((entry) => _inRange(entry.startDate))
        .toList();

    final activeExpenses = expenses.where((entry) => !entry.isVoided).toList();
    final activeIncome = income.where((entry) => !entry.isVoided).toList();
    final activeRemittances = remittances
        .where((entry) => !entry.isVoided)
        .toList();

    final expenseTotal = activeExpenses.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final incomeTotal = activeIncome.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final remittanceTotal = activeRemittances.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );

    final categoryTotals = <String, double>{};
    final vehicleTotals = <int, double>{};
    for (final entry in activeExpenses) {
      categoryTotals[entry.category] =
          (categoryTotals[entry.category] ?? 0) + entry.amount;
      vehicleTotals[entry.vehicleId] =
          (vehicleTotals[entry.vehicleId] ?? 0) + entry.amount;
    }
    final categories = categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final vehicles = vehicleTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final maxCategory = categories.isEmpty ? 1.0 : categories.first.value;
    final maxVehicle = vehicles.isEmpty ? 1.0 : vehicles.first.value;

    final hireCounts = <String, int>{};
    for (final hire in hires) {
      hireCounts[hire.status] = (hireCounts[hire.status] ?? 0) + 1;
    }

    final remittancePeriods = <String, (double, int)>{};
    for (final entry in activeRemittances) {
      final key =
          '${formatDate(entry.periodStart)} – ${formatDate(entry.periodEnd)}';
      final current = remittancePeriods[key] ?? (0.0, 0);
      remittancePeriods[key] = (current.$1 + entry.amount, current.$2 + 1);
    }
    final periodEntries = remittancePeriods.entries.toList();

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        return ListView(
          padding: EdgeInsets.fromLTRB(wide ? 30 : 18, 22, wide ? 30 : 18, 28),
          children: [
            PageHeading(
              eyebrow: 'Reporting',
              title: 'Reports',
              description:
                  'Date-filtered summaries from saved records. Income, '
                  'remittances, and expenses are shown separately.',
              action: FilledButton.icon(
                onPressed: _exporting ? null : _export,
                icon: _exporting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: FleetColors.white,
                        ),
                      )
                    : const Icon(Icons.download_rounded, size: 18),
                label: Text(_exporting ? 'Exporting…' : 'CSV'),
                style: FilledButton.styleFrom(
                  backgroundColor: FleetColors.ink,
                  foregroundColor: FleetColors.white,
                ),
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PanelHeading(
                    title: 'Date range',
                    trailing: 'TRANSACTION DATES',
                  ),
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children:
                          [
                                'This month',
                                'Last month',
                                'Last 30 days',
                                'This year',
                              ]
                              .map(
                                (preset) => Padding(
                                  padding: const EdgeInsets.only(right: 7),
                                  child: DateFilterChip(
                                    label: preset,
                                    selected: _preset == preset,
                                    onTap: () {
                                      final range = _rangeFor(preset);
                                      setState(() {
                                        _preset = preset;
                                        _from = range.$1;
                                        _to = range.$2;
                                        _error = null;
                                      });
                                    },
                                  ),
                                ),
                              )
                              .toList(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: AppDateField(
                          label: 'From',
                          value: _from,
                          onChanged: (value) {
                            if (value == null) return;
                            setState(() {
                              _from = value;
                              _preset = 'Custom';
                            });
                          },
                        ),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: AppDateField(
                          label: 'To',
                          value: _to,
                          onChanged: (value) {
                            if (value == null) return;
                            setState(() {
                              _to = value;
                              _preset = 'Custom';
                            });
                          },
                        ),
                      ),
                    ],
                  ),
                  if (!_validRange) ...[
                    const SizedBox(height: 8),
                    const InlineAlert(
                      message:
                          'The start date must be on or before the end '
                          'date. Change the range to view totals.',
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    InlineAlert(message: _error!),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'Showing records dated $_from to $_to. Hires use their start '
                    'date; money and expenses use their transaction date.',
                    style: const TextStyle(
                      fontSize: 10,
                      color: FleetColors.muted,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (!_validRange)
              const SizedBox.shrink()
            else ...[
              GridView.count(
                crossAxisCount: wide ? 4 : 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: wide ? 1.45 : 1.18,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    label: 'Expenses',
                    value: formatMoney(expenseTotal),
                    helper: '${activeExpenses.length} active entries',
                    icon: Icons.build_outlined,
                    dark: true,
                  ),
                  MetricTile(
                    label: 'Income',
                    value: formatMoney(incomeTotal),
                    helper: '${activeIncome.length} entries',
                    icon: Icons.add_card_rounded,
                    success: incomeTotal > 0,
                  ),
                  MetricTile(
                    label: 'Remittances',
                    value: formatMoney(remittanceTotal),
                    helper: '${activeRemittances.length} payments',
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                  MetricTile(
                    label: 'Hires started',
                    value: '${hires.length}',
                    helper:
                        '${hireCounts['Active'] ?? 0} active · '
                        '${hireCounts['Completed'] ?? 0} completed',
                    icon: Icons.key_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 11),
              const InfoBanner(
                icon: Icons.call_split_rounded,
                text:
                    'No profit figure is shown. Expenses, income, and driver '
                    'remittances are distinct records and are not silently '
                    'netted together.',
              ),
              const SizedBox(height: 13),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ReportCategorySummary(
                        categories: categories,
                        maxCategory: maxCategory,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _ReportVehicleSummary(
                        entries: vehicles,
                        snapshot: widget.snapshot,
                        maxVehicle: maxVehicle,
                      ),
                    ),
                  ],
                )
              else ...[
                _ReportCategorySummary(
                  categories: categories,
                  maxCategory: maxCategory,
                ),
                const SizedBox(height: 12),
                _ReportVehicleSummary(
                  entries: vehicles,
                  snapshot: widget.snapshot,
                  maxVehicle: maxVehicle,
                ),
              ],
              const SizedBox(height: 12),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _HireSummary(hireCounts: hireCounts)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _RemittancePeriodSummary(entries: periodEntries),
                    ),
                  ],
                )
              else ...[
                _HireSummary(hireCounts: hireCounts),
                const SizedBox(height: 12),
                _RemittancePeriodSummary(entries: periodEntries),
              ],
              const SizedBox(height: 12),
              _CurrentFleetSummary(snapshot: widget.snapshot),
              const SizedBox(height: 12),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const PanelHeading(
                      title: 'Export saved records',
                      trailing: 'CSV',
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Creates a CSV with the report summary, date-filtered '
                      'expenses, income, remittances, and hires, plus the '
                      'current vehicle and driver registers. Voided financial '
                      'entries are included with a status so history is not '
                      'lost. Your phone’s share sheet opens so you can save or '
                      'send the file.',
                      style: TextStyle(
                        fontSize: 11,
                        color: FleetColors.muted,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _exporting ? null : _export,
                        icon: const Icon(Icons.ios_share_rounded, size: 18),
                        label: Text(
                          _exporting ? 'Creating CSV…' : 'Create & share CSV',
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                          minimumSize: const Size(0, 46),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 9),
            const LocalDataNotice(),
          ],
        );
      },
    );
  }
}

class _ReportCategorySummary extends StatelessWidget {
  const _ReportCategorySummary({
    required this.categories,
    required this.maxCategory,
  });

  final List<MapEntry<String, double>> categories;
  final double maxCategory;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Expenses by category'),
          const SizedBox(height: 10),
          if (categories.isEmpty)
            const Text(
              'No active expenses in this date range.',
              style: TextStyle(fontSize: 11, color: FleetColors.muted),
            )
          else
            ...categories.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            entry.key,
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                        Text(
                          formatMoney(entry.value),
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: maxCategory <= 0
                            ? 0
                            : (entry.value / maxCategory).clamp(0, 1),
                        minHeight: 5,
                        backgroundColor: FleetColors.canvas,
                        valueColor: const AlwaysStoppedAnimation(
                          FleetColors.red,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReportVehicleSummary extends StatelessWidget {
  const _ReportVehicleSummary({
    required this.entries,
    required this.snapshot,
    required this.maxVehicle,
  });

  final List<MapEntry<int, double>> entries;
  final FleetSnapshot snapshot;
  final double maxVehicle;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Expenses by vehicle'),
          const SizedBox(height: 10),
          if (entries.isEmpty)
            const Text(
              'No active vehicle expenses in this date range.',
              style: TextStyle(fontSize: 11, color: FleetColors.muted),
            )
          else
            ...entries.map((entry) {
              final matches = snapshot.vehicles.where(
                (vehicle) => vehicle.id == entry.key,
              );
              final vehicle = matches.isEmpty ? null : matches.first;
              return Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            vehicle == null
                                ? 'Vehicle #${entry.key}'
                                : '${vehicle.make} ${vehicle.model} · '
                                      '${vehicle.registrationNumber}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 10.5),
                          ),
                        ),
                        Text(
                          formatMoney(entry.value),
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: maxVehicle <= 0
                            ? 0
                            : (entry.value / maxVehicle).clamp(0, 1),
                        minHeight: 5,
                        backgroundColor: FleetColors.canvas,
                        valueColor: const AlwaysStoppedAnimation(
                          FleetColors.ink,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _HireSummary extends StatelessWidget {
  const _HireSummary({required this.hireCounts});
  final Map<String, int> hireCounts;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Hires in range'),
          const SizedBox(height: 10),
          if (hireCounts.isEmpty)
            const Text(
              'No hires started in this date range.',
              style: TextStyle(fontSize: 11, color: FleetColors.muted),
            )
          else
            ...hireStatuses.map(
              (status) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    StatusPill(status),
                    const Spacer(),
                    Text(
                      '${hireCounts[status] ?? 0}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _RemittancePeriodSummary extends StatelessWidget {
  const _RemittancePeriodSummary({required this.entries});
  final List<MapEntry<String, (double, int)>> entries;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(
            title: 'Remittances by 10-day period',
            trailing: 'PAYMENTS IN RANGE',
          ),
          const SizedBox(height: 10),
          if (entries.isEmpty)
            const Text(
              'No remittances received in this date range.',
              style: TextStyle(fontSize: 11, color: FleetColors.muted),
            )
          else
            ...entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            entry.key,
                            style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            '${entry.value.$2} payment'
                            '${entry.value.$2 == 1 ? '' : 's'}',
                            style: const TextStyle(
                              fontSize: 9,
                              color: FleetColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      formatMoney(entry.value.$1),
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CurrentFleetSummary extends StatelessWidget {
  const _CurrentFleetSummary({required this.snapshot});
  final FleetSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final available = snapshot.vehicles
        .where((vehicle) => vehicle.status == 'Available')
        .length;
    final onHire = snapshot.vehicles
        .where((vehicle) => vehicle.status == 'On hire')
        .length;
    final maintenance = snapshot.vehicles
        .where((vehicle) => vehicle.status == 'Maintenance')
        .length;
    final unavailable = snapshot.vehicles
        .where((vehicle) => vehicle.status == 'Unavailable')
        .length;
    final availableDrivers = snapshot.drivers
        .where((driver) => driver.availability == 'Available')
        .length;

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(
            title: 'Current fleet snapshot',
            trailing: 'NOT DATE-FILTERED',
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MiniStat(
                label: 'Vehicles',
                value: '${snapshot.vehicles.length}',
              ),
              _MiniStat(label: 'Available', value: '$available'),
              _MiniStat(label: 'On hire', value: '$onHire'),
              _MiniStat(label: 'Maintenance', value: '$maintenance'),
              _MiniStat(label: 'Unavailable', value: '$unavailable'),
              _MiniStat(label: 'Drivers', value: '${snapshot.drivers.length}'),
              _MiniStat(label: 'Drivers available', value: '$availableDrivers'),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: FleetColors.canvas,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 9.5, color: FleetColors.muted),
          ),
          const SizedBox(width: 5),
          Text(
            value,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

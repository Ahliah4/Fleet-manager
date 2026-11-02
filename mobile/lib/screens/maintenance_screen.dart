import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/expense.dart';
import '../models/fleet_snapshot.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';
import '../utils/service_schedule.dart';

class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({
    super.key,
    required this.snapshot,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final Future<void> Function() onChanged;

  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  String _period = 'This month';
  int _vehicleFilter = 0;
  String _categoryFilter = 'All';
  bool _showAllService = false;
  bool _showFilters = false;

  List<String> get _periods => [
    'This month',
    'Last month',
    'Last 30 days',
    'This year',
    'All time',
  ];

  bool get _hasFilters =>
      _query.trim().isNotEmpty ||
      _vehicleFilter != 0 ||
      _categoryFilter != 'All' ||
      _period != 'This month';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  (String, String) _rangeFor(String period) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    switch (period) {
      case 'This month':
        return (
          dateToIso(DateTime(now.year, now.month, 1)),
          dateToIso(DateTime(now.year, now.month + 1, 0)),
        );
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
        return ('1900-01-01', '2999-12-31');
    }
  }

  void _resetFilters() {
    _searchController.clear();
    setState(() {
      _query = '';
      _period = 'This month';
      _vehicleFilter = 0;
      _categoryFilter = 'All';
    });
  }

  Future<void> _openForm() async {
    if (widget.snapshot.vehicles.isEmpty) {
      showAppMessage(
        context,
        'Add a vehicle before recording an expense.',
        error: true,
      );
      return;
    }
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) =>
          _ExpenseFormSheet(vehicles: widget.snapshot.vehicles),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(context, 'Expense saved. Totals now include this entry.');
    }
  }

  Future<void> _scheduleService([Vehicle? vehicle]) async {
    if (widget.snapshot.vehicles.isEmpty) {
      showAppMessage(
        context,
        'Add a vehicle before scheduling service.',
        error: true,
      );
      return;
    }
    final result = await showModalBottomSheet<_ServiceScheduleResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _ScheduleServiceSheet(
        vehicles: widget.snapshot.vehicles,
        initialVehicle: vehicle,
      ),
    );
    if (result == null || !mounted) return;
    await widget.onChanged();
    if (!mounted) return;
    showAppMessage(
      context,
      'Service date saved for ${result.vehicleName} · '
      '${formatDate(result.date)}.',
    );
  }

  Future<void> _voidExpense(Expense expense) async {
    if (expense.id == null) return;
    final reason = await showReasonDialog(
      context,
      title: 'Void this expense?',
      message:
          'The entry stays in history, marked Voided, and is removed from all '
          'totals. Use this instead of deleting so the financial record is not '
          'lost.',
    );
    if (reason == null) return;
    try {
      await FleetDatabase.instance.voidExpense(expense.id!, reason);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        'Expense voided and excluded from totals. History is preserved.',
      );
    } catch (_) {
      if (!mounted) return;
      showAppMessage(
        context,
        'We couldn’t void this expense. Try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final range = _rangeFor(_period);
    final inPeriod = widget.snapshot.expenses.where(
      (expense) => isDateInRange(expense.entryDate, range.$1, range.$2),
    );
    final scoped = inPeriod.where((expense) {
      if (_vehicleFilter != 0 && expense.vehicleId != _vehicleFilter) {
        return false;
      }
      if (_categoryFilter != 'All' && expense.category != _categoryFilter) {
        return false;
      }
      return true;
    }).toList();
    final activeInPeriod = scoped
        .where((expense) => !expense.isVoided)
        .toList();
    final voidedInPeriod = scoped.where((expense) => expense.isVoided).length;
    final search = _query.trim().toLowerCase();
    final filteredHistory = scoped.where((expense) {
      if (search.isEmpty) return true;
      final haystack =
          '${expense.description} ${expense.category} '
                  '${expense.vehicleName ?? ''} '
                  '${expense.vehicleRegistration ?? ''} '
                  '${expense.supplier ?? ''} ${expense.notes ?? ''}'
              .toLowerCase();
      return haystack.contains(search);
    }).toList();

    final allActive = widget.snapshot.expenses
        .where((expense) => !expense.isVoided)
        .toList();
    final allTotal = allActive.fold<double>(
      0,
      (sum, expense) => sum + expense.amount,
    );
    final periodTotal = activeInPeriod.fold<double>(
      0,
      (sum, expense) => sum + expense.amount,
    );

    final categoryTotals = <String, double>{};
    final categoryCounts = <String, int>{};
    final vehicleTotals = <int, double>{};
    final vehicleCounts = <int, int>{};
    for (final expense in activeInPeriod) {
      categoryTotals[expense.category] =
          (categoryTotals[expense.category] ?? 0) + expense.amount;
      categoryCounts[expense.category] =
          (categoryCounts[expense.category] ?? 0) + 1;
      vehicleTotals[expense.vehicleId] =
          (vehicleTotals[expense.vehicleId] ?? 0) + expense.amount;
      vehicleCounts[expense.vehicleId] =
          (vehicleCounts[expense.vehicleId] ?? 0) + 1;
    }
    final categories = categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final vehicles = vehicleTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final maxCategory = categories.isEmpty ? 1.0 : categories.first.value;
    final maxVehicle = vehicles.isEmpty ? 1.0 : vehicles.first.value;

    final serviceItems = buildServiceSchedule(widget.snapshot.vehicles);
    final overdueService = countOverdueService(serviceItems);
    final dueSoonService = countServiceDueSoon(serviceItems);
    final serviceDue = overdueService + dueSoonService;

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: widget.onChanged,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          return ListView(
            padding: screenPadding(context),
            children: [
              PageHeading(
                title: 'Service & costs',
                subtitle:
                    '${formatMoney(periodTotal)} · '
                    '${activeInPeriod.length} '
                    '${activeInPeriod.length == 1 ? 'entry' : 'entries'} · '
                    '$_period',
                actions: [
                  FilledButton.icon(
                    onPressed: _openForm,
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Add expense'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SummaryHero(
                eyebrow: 'Spend',
                value: formatMoney(periodTotal),
                label: _period == 'All time'
                    ? 'Active spend · all time'
                    : 'Active spend · ${_period.toLowerCase()}',
                helper: '${formatMoney(allTotal)} recorded all time',
                icon: Icons.receipt_long_outlined,
                stats: [
                  HeroStat('Vehicles', '${vehicles.length}'),
                  HeroStat(
                    'Service due',
                    serviceItems.isEmpty ? 'Not set' : '$serviceDue',
                    alert: overdueService > 0,
                  ),
                  HeroStat('Voided', '$voidedInPeriod'),
                ],
              ),
              const SizedBox(height: 13),
              _ServiceScheduleCard(
                items: serviceItems,
                hasVehicles: widget.snapshot.vehicles.isNotEmpty,
                showAll: _showAllService,
                overdueCount: overdueService,
                dueSoonCount: dueSoonService,
                onToggle: () =>
                    setState(() => _showAllService = !_showAllService),
                onSchedule: _scheduleService,
              ),
              const SizedBox(height: 12),
              FleetSearchField(
                controller: _searchController,
                hint: 'Search item, category, vehicle, or supplier',
                onChanged: (value) => setState(() => _query = value),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _hasFilters ? 'Filters applied' : 'All vehicles',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: FleetColors.muted,
                      ),
                    ),
                  ),
                  if (_hasFilters)
                    TextButton(
                      onPressed: _resetFilters,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        minimumSize: const Size(0, 36),
                      ),
                      child: const Text('Reset'),
                    ),
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => _showFilters = !_showFilters),
                    icon: Icon(
                      _showFilters
                          ? Icons.expand_less_rounded
                          : Icons.tune_rounded,
                      size: 18,
                    ),
                    label: Text(_showFilters ? 'Hide filters' : 'Filters'),
                    style: TextButton.styleFrom(minimumSize: const Size(0, 36)),
                  ),
                ],
              ),
              if (_showFilters) ...[
                const SizedBox(height: 4),
                SectionCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      FilterWrap(
                        children: _periods
                            .map(
                              (period) => DateFilterChip(
                                label: period,
                                selected: _period == period,
                                onTap: () => setState(() => _period = period),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<int>(
                        initialValue: _vehicleFilter,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Vehicle',
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: 0,
                            child: Text('All vehicles'),
                          ),
                          ...widget.snapshot.vehicles.map(
                            (vehicle) => DropdownMenuItem(
                              value: vehicle.id!,
                              child: Text(
                                '${vehicle.registrationNumber} · '
                                '${vehicle.make} ${vehicle.model}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) =>
                            setState(() => _vehicleFilter = value ?? 0),
                      ),
                      const SizedBox(height: 10),
                      FilterWrap(
                        children: ['All', ...expenseCategories]
                            .map(
                              (category) => ChoiceChip(
                                label: Text(category),
                                selected: _categoryFilter == category,
                                onSelected: (_) =>
                                    setState(() => _categoryFilter = category),
                                selectedColor: FleetColors.ink,
                                labelStyle: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w600,
                                  color: _categoryFilter == category
                                      ? FleetColors.white
                                      : FleetColors.ink,
                                ),
                                backgroundColor: FleetColors.surface,
                                side: const BorderSide(
                                  color: FleetColors.warmGrey,
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 13),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _CategorySummary(
                        categories: categories,
                        counts: categoryCounts,
                        maxCategory: maxCategory,
                        period: _period,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _VehicleSummary(
                        entries: vehicles,
                        counts: vehicleCounts,
                        snapshot: widget.snapshot,
                        maxVehicle: maxVehicle,
                        period: _period,
                      ),
                    ),
                  ],
                )
              else ...[
                _CategorySummary(
                  categories: categories,
                  counts: categoryCounts,
                  maxCategory: maxCategory,
                  period: _period,
                ),
                const SizedBox(height: 12),
                _VehicleSummary(
                  entries: vehicles,
                  counts: vehicleCounts,
                  snapshot: widget.snapshot,
                  maxVehicle: maxVehicle,
                  period: _period,
                ),
              ],
              const SizedBox(height: 12),
              SectionCard(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    PanelHeading(
                      title: 'Expense history',
                      trailing:
                          '${filteredHistory.length} ${filteredHistory.length == 1 ? 'entry' : 'entries'}',
                    ),
                    const SizedBox(height: 4),
                    if (filteredHistory.isEmpty)
                      EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: widget.snapshot.expenses.isEmpty
                            ? 'No vehicle costs recorded'
                            : 'No matching expenses',
                        body: widget.snapshot.expenses.isEmpty
                            ? 'Record a battery, engine oil, tyre, repair, '
                                  'service, inspection, part, or other vehicle '
                                  'requirement. Each entry needs a vehicle, date, '
                                  'category, item, and amount in ZMW.'
                            : 'Change the period, vehicle, category, or search '
                                  'text to see other entries.',
                        actionLabel:
                            widget.snapshot.expenses.isNotEmpty && _hasFilters
                            ? 'Reset filters'
                            : null,
                        actionIcon: Icons.filter_alt_off_rounded,
                        onAction:
                            widget.snapshot.expenses.isNotEmpty && _hasFilters
                            ? _resetFilters
                            : null,
                      )
                    else
                      ...filteredHistory.map(
                        (expense) => _ExpenseRow(
                          expense: expense,
                          onVoid: expense.isVoided
                              ? null
                              : () => _voidExpense(expense),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ServiceScheduleCard extends StatelessWidget {
  const _ServiceScheduleCard({
    required this.items,
    required this.hasVehicles,
    required this.showAll,
    required this.overdueCount,
    required this.dueSoonCount,
    required this.onToggle,
    required this.onSchedule,
  });

  final List<ServiceScheduleItem> items;
  final bool hasVehicles;
  final bool showAll;
  final int overdueCount;
  final int dueSoonCount;
  final VoidCallback onToggle;
  final Future<void> Function([Vehicle? vehicle]) onSchedule;

  @override
  Widget build(BuildContext context) {
    final visible = showAll ? items : items.take(5).toList();
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Service schedule',
            trailing: items.isEmpty
                ? 'No dates'
                : '${items.length} ${items.length == 1 ? 'date' : 'dates'}',
          ),
          const SizedBox(height: 11),
          if (!hasVehicles)
            const Text(
              'Add a vehicle before scheduling service.',
              style: TextStyle(
                fontSize: 11.5,
                color: FleetColors.muted,
                height: 1.45,
              ),
            )
          else if (items.isEmpty)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'No next-service dates yet.',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: FleetColors.muted,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 11),
                OutlinedButton.icon(
                  onPressed: () => onSchedule(),
                  icon: const Icon(Icons.event_outlined, size: 16),
                  label: const Text('Schedule service'),
                ),
              ],
            )
          else ...[
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _ServiceCount(
                  label: 'Overdue',
                  value: '$overdueCount',
                  alert: overdueCount > 0,
                ),
                _ServiceCount(label: 'Due in 30 days', value: '$dueSoonCount'),
                _ServiceCount(label: 'Dated', value: '${items.length}'),
              ],
            ),
            const SizedBox(height: 6),
            ...visible.map(
              (item) => _ServiceRow(
                item: item,
                onSchedule: () => onSchedule(item.vehicle),
              ),
            ),
            if (items.length > 5)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: onToggle,
                  child: Text(
                    showAll ? 'Show less' : 'Show all ${items.length}',
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _ServiceCount extends StatelessWidget {
  const _ServiceCount({
    required this.label,
    required this.value,
    this.alert = false,
  });

  final String label;
  final String value;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: alert
            ? FleetColors.red.withValues(alpha: .07)
            : FleetColors.canvas,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: alert ? FleetColors.red : FleetColors.ink,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              fontSize: 9.5,
              color: FleetColors.muted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceRow extends StatelessWidget {
  const _ServiceRow({required this.item, required this.onSchedule});

  final ServiceScheduleItem item;
  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context) {
    final vehicle = item.vehicle;
    final overdue = item.isOverdue;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: FleetColors.warmGrey, width: .7)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: overdue
                  ? FleetColors.red.withValues(alpha: .08)
                  : FleetColors.canvas,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              overdue ? Icons.error_outline_rounded : Icons.build_outlined,
              size: 17,
              color: overdue ? FleetColors.red : FleetColors.ink,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${vehicle.make} ${vehicle.model}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: FleetColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${vehicle.registrationNumber} · '
                  '${formatDate(item.date)} · ${dueLabel(item.date)}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    height: 1.35,
                    color: overdue ? FleetColors.red : FleetColors.muted,
                    fontWeight: overdue ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          TextButton(
            onPressed: onSchedule,
            child: Text(overdue ? 'Reschedule' : 'Schedule'),
          ),
        ],
      ),
    );
  }
}

class _CategorySummary extends StatelessWidget {
  const _CategorySummary({
    required this.categories,
    required this.counts,
    required this.maxCategory,
    required this.period,
  });

  final List<MapEntry<String, double>> categories;
  final Map<String, int> counts;
  final double maxCategory;
  final String period;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Spend by category',
            trailing: period,
            subtitle: 'Active entries only',
          ),
          const SizedBox(height: 11),
          if (categories.isEmpty)
            const Text(
              'Category totals will appear after active expenses are saved '
              'for this period.',
              style: TextStyle(
                fontSize: 11,
                color: FleetColors.muted,
                height: 1.45,
              ),
            )
          else
            ...categories.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${entry.key} · ${counts[entry.key] ?? 0}',
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                        Text(
                          formatMoney(entry.value),
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: maxCategory <= 0
                            ? 0
                            : (entry.value / maxCategory).clamp(0, 1),
                        minHeight: 5,
                        backgroundColor: FleetColors.mist,
                        valueColor: const AlwaysStoppedAnimation(
                          FleetColors.ink,
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

class _VehicleSummary extends StatelessWidget {
  const _VehicleSummary({
    required this.entries,
    required this.counts,
    required this.snapshot,
    required this.maxVehicle,
    required this.period,
  });

  final List<MapEntry<int, double>> entries;
  final Map<int, int> counts;
  final FleetSnapshot snapshot;
  final double maxVehicle;
  final String period;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Spend by vehicle',
            trailing: period,
            subtitle: 'Active entries only',
          ),
          const SizedBox(height: 11),
          if (entries.isEmpty)
            const Text(
              'Vehicle totals will appear after active expenses are saved for '
              'this period.',
              style: TextStyle(
                fontSize: 11,
                color: FleetColors.muted,
                height: 1.45,
              ),
            )
          else
            ...entries.map((entry) {
              final matches = snapshot.vehicles.where(
                (item) => item.id == entry.key,
              );
              final vehicle = matches.isEmpty ? null : matches.first;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
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
                        const SizedBox(width: 8),
                        Text(
                          '${counts[entry.key] ?? 0} · ${formatMoney(entry.value)}',
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: maxVehicle <= 0
                            ? 0
                            : (entry.value / maxVehicle).clamp(0, 1),
                        minHeight: 5,
                        backgroundColor: FleetColors.mist,
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

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({required this.expense, required this.onVoid});
  final Expense expense;
  final VoidCallback? onVoid;

  @override
  Widget build(BuildContext context) {
    final supplier = expense.supplier?.trim();
    final paymentMethod = expense.paymentMethod?.trim();
    final notes = expense.notes?.trim();
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: FleetColors.warmGrey, width: .7)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: FleetColors.mist.withValues(alpha: .62),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: FleetColors.warmGrey.withValues(alpha: .65),
              ),
            ),
            child: Icon(
              _iconForCategory(expense.category),
              size: 17,
              color: expense.isVoided ? FleetColors.muted : FleetColors.ink,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        expense.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12.5,
                          height: 1.3,
                          fontWeight: FontWeight.w700,
                          color: expense.isVoided
                              ? FleetColors.muted
                              : FleetColors.ink,
                          decoration: expense.isVoided
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (expense.isVoided)
                      const StatusPill('Voided')
                    else
                      Text(
                        formatMoney(expense.amount),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${expense.category} · ${formatDate(expense.entryDate)} · '
                  '${expense.vehicleName ?? 'Vehicle'} '
                  '(${expense.vehicleRegistration ?? '—'})',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    color: FleetColors.muted,
                    height: 1.4,
                  ),
                ),
                if (supplier?.isNotEmpty == true ||
                    paymentMethod?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      [
                        if (supplier?.isNotEmpty == true) supplier,
                        if (paymentMethod?.isNotEmpty == true) paymentMethod,
                      ].join(' · '),
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.muted,
                      ),
                    ),
                  ),
                if (notes?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Notes: $notes',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.ink,
                        height: 1.4,
                      ),
                    ),
                  ),
                if (expense.isVoided && expense.voidReason?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      'Voided'
                      '${expense.voidedAt?.isNotEmpty == true ? ' ${formatDateTime(expense.voidedAt)}' : ''}'
                      ' · ${expense.voidReason}',
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.red,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (onVoid != null)
            IconButton(
              onPressed: onVoid,
              tooltip: 'Void expense',
              icon: const Icon(
                Icons.block_rounded,
                size: 17,
                color: FleetColors.muted,
              ),
            ),
        ],
      ),
    );
  }

  static IconData _iconForCategory(String category) {
    return switch (category) {
      'Battery' => Icons.battery_charging_full_rounded,
      'Engine oil & fluids' => Icons.oil_barrel_outlined,
      'Tyres' => Icons.tire_repair_rounded,
      'Repairs' => Icons.handyman_outlined,
      'Service' => Icons.build_circle_outlined,
      'Inspection' => Icons.fact_check_outlined,
      'Parts' => Icons.settings_outlined,
      _ => Icons.receipt_long_outlined,
    };
  }
}

class _ExpenseFormSheet extends StatefulWidget {
  const _ExpenseFormSheet({required this.vehicles});
  final List<Vehicle> vehicles;

  @override
  State<_ExpenseFormSheet> createState() => _ExpenseFormSheetState();
}

class _ExpenseFormSheetState extends State<_ExpenseFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late int _vehicleId;
  late String _date;
  String _category = 'Repairs';
  late final TextEditingController _description;
  late final TextEditingController _amount;
  late final TextEditingController _supplier;
  late final TextEditingController _notes;
  String _paymentMethod = 'Cash';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _vehicleId = widget.vehicles.first.id!;
    _date = todayIso();
    _description = TextEditingController();
    _amount = TextEditingController();
    _supplier = TextEditingController();
    _notes = TextEditingController();
  }

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    _supplier.dispose();
    _notes.dispose();
    super.dispose();
  }

  double? _parsedAmount() {
    final raw = _amount.text.trim().replaceAll(',', '');
    return double.tryParse(raw);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final amount = _parsedAmount();
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter an amount greater than zero.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final expense = Expense(
      vehicleId: _vehicleId,
      entryDate: _date,
      category: _category,
      description: _description.text.trim(),
      amount: amount,
      supplier: _supplier.text.trim(),
      paymentMethod: _paymentMethod,
      notes: _notes.text.trim(),
    );
    try {
      await FleetDatabase.instance.saveExpense(expense);
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error =
            'We couldn’t save this expense. Check the details and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .9,
        maxChildSize: .96,
        builder: (context, scrollController) => Column(
          children: [
            _SheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Eyebrow('New expense'),
                        SizedBox(height: 4),
                        Text(
                          'Record vehicle cost',
                          style: TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                            color: FleetColors.ink,
                            letterSpacing: -.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            const Divider(),
            Expanded(
              child: Form(
                key: _formKey,
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
                  children: [
                    const FormSectionTitle('What was recorded'),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      initialValue: _vehicleId,
                      decoration: const InputDecoration(labelText: 'Vehicle *'),
                      items: widget.vehicles.map((vehicle) {
                        return DropdownMenuItem(
                          value: vehicle.id!,
                          child: Text(
                            '${vehicle.make} ${vehicle.model} · '
                            '${vehicle.registrationNumber}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _vehicleId = value);
                        }
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _description,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Item or work done *',
                        hintText: 'e.g. Battery replacement, engine oil',
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Enter what was purchased or repaired.'
                          : null,
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(
                        labelText: 'Category *',
                      ),
                      items: expenseCategories
                          .map(
                            (category) => DropdownMenuItem(
                              value: category,
                              child: Text(category),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _category = value);
                        }
                      },
                    ),
                    const SizedBox(height: 10),
                    AppDateField(
                      label: 'Date',
                      value: _date,
                      required: true,
                      clearable: false,
                      onChanged: (value) {
                        if (value != null) setState(() => _date = value);
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _amount,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Amount in ZMW *',
                        hintText: '0.00',
                        prefixText: 'ZMW ',
                      ),
                      validator: (value) {
                        final parsed = double.tryParse(
                          (value ?? '').trim().replaceAll(',', ''),
                        );
                        if (parsed == null || parsed <= 0) {
                          return 'Enter an amount greater than zero.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _supplier,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Supplier or workshop',
                        hintText: 'Optional',
                      ),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _paymentMethod,
                      decoration: const InputDecoration(
                        labelText: 'Payment method',
                      ),
                      items: paymentMethods
                          .map(
                            (method) => DropdownMenuItem(
                              value: method,
                              child: Text(method),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _paymentMethod = value);
                        }
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional details or receipt reference',
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      InlineAlert(message: _error!),
                    ],
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        icon: _saving
                            ? const SizedBox(
                                width: 17,
                                height: 17,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: FleetColors.white,
                                ),
                              )
                            : const Icon(Icons.check_rounded),
                        label: Text(_saving ? 'Saving…' : 'Save expense'),
                      ),
                    ),
                    const SizedBox(height: 9),
                    const Text(
                      'Saved on this phone. Financial entries cannot be '
                      'deleted; use Void with a reason to correct a record.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 10, color: FleetColors.muted),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceScheduleResult {
  const _ServiceScheduleResult({required this.vehicleName, required this.date});

  final String vehicleName;
  final String date;
}

class _ScheduleServiceSheet extends StatefulWidget {
  const _ScheduleServiceSheet({required this.vehicles, this.initialVehicle});

  final List<Vehicle> vehicles;
  final Vehicle? initialVehicle;

  @override
  State<_ScheduleServiceSheet> createState() => _ScheduleServiceSheetState();
}

class _ScheduleServiceSheetState extends State<_ScheduleServiceSheet> {
  late Vehicle _vehicle;
  late String _date;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _vehicle = widget.initialVehicle ?? widget.vehicles.first;
    _date = _suggestedDate(_vehicle);
  }

  String _suggestedDate(Vehicle vehicle) {
    final existing = vehicle.nextServiceDate;
    if (existing != null && existing.isNotEmpty) return existing;
    return dateToIso(DateTime.now().add(const Duration(days: 30)));
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final latest = widget.vehicles.where((item) => item.id == _vehicle.id);
    if (latest.isEmpty) {
      setState(() {
        _saving = false;
        _error = 'That vehicle is no longer available. Close and try again.';
      });
      return;
    }
    try {
      await FleetDatabase.instance.saveVehicle(
        latest.first.copyWith(nextServiceDate: _date),
      );
      if (!mounted) return;
      Navigator.pop(
        context,
        _ServiceScheduleResult(
          vehicleName: '${_vehicle.make} ${_vehicle.model}',
          date: _date,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error =
            'We couldn’t save this service date. Check the vehicle record and '
            'try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .62,
        maxChildSize: .9,
        builder: (context, scrollController) => Column(
          children: [
            _SheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Eyebrow('Vehicle care'),
                        SizedBox(height: 4),
                        Text(
                          'Schedule next service',
                          style: TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                            color: FleetColors.ink,
                            letterSpacing: -.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            const Divider(),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
                children: [
                  DropdownButtonFormField<int>(
                    initialValue: _vehicle.id,
                    decoration: const InputDecoration(labelText: 'Vehicle *'),
                    items: widget.vehicles.map((vehicle) {
                      return DropdownMenuItem(
                        value: vehicle.id!,
                        child: Text(
                          '${vehicle.make} ${vehicle.model} · '
                          '${vehicle.registrationNumber}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      final selected = widget.vehicles.firstWhere(
                        (vehicle) => vehicle.id == value,
                      );
                      setState(() {
                        _vehicle = selected;
                        _date = _suggestedDate(selected);
                      });
                    },
                  ),
                  const SizedBox(height: 10),
                  AppDateField(
                    label: 'Next service date',
                    value: _date,
                    required: true,
                    clearable: false,
                    onChanged: (value) {
                      if (value != null) setState(() => _date = value);
                    },
                  ),
                  const SizedBox(height: 12),
                  const InfoBanner(
                    icon: Icons.event_outlined,
                    text:
                        'This saves the next-service date on the vehicle '
                        'record. It does not create a work order, job card, or '
                        'garage booking.',
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    InlineAlert(message: _error!),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 48,
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: _saving
                          ? const SizedBox(
                              width: 17,
                              height: 17,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: FleetColors.white,
                              ),
                            )
                          : const Icon(Icons.check_rounded),
                      label: Text(_saving ? 'Saving…' : 'Save service date'),
                    ),
                  ),
                  const SizedBox(height: 9),
                  const Text(
                    'Saved on this phone only. Reschedule at any time by '
                    'updating this date.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10, color: FleetColors.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 4,
      margin: const EdgeInsets.only(top: 10, bottom: 12),
      decoration: BoxDecoration(
        color: FleetColors.warmGrey,
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}

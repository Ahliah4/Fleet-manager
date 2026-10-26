import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/expense.dart';
import '../models/fleet_snapshot.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

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
  String _query = '';
  String _period = 'This month';
  int _vehicleFilter = 0;
  String _categoryFilter = 'All';

  List<String> get _periods => [
    'This month',
    'Last month',
    'Last 30 days',
    'This year',
    'All time',
  ];

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
    final activeInPeriod = widget.snapshot.expenses.where((expense) {
      if (expense.isVoided) return false;
      if (!isDateInRange(expense.entryDate, range.$1, range.$2)) return false;
      if (_vehicleFilter != 0 && expense.vehicleId != _vehicleFilter) {
        return false;
      }
      if (_categoryFilter != 'All' && expense.category != _categoryFilter) {
        return false;
      }
      return true;
    }).toList();

    final filteredHistory = widget.snapshot.expenses.where((expense) {
      final haystack =
          '${expense.description} ${expense.category} '
                  '${expense.vehicleName ?? ''} '
                  '${expense.vehicleRegistration ?? ''} ${expense.supplier ?? ''}'
              .toLowerCase();
      if (!haystack.contains(_query.trim().toLowerCase())) return false;
      if (_vehicleFilter != 0 && expense.vehicleId != _vehicleFilter) {
        return false;
      }
      if (_categoryFilter != 'All' && expense.category != _categoryFilter) {
        return false;
      }
      return true;
    }).toList();

    final periodTotal = activeInPeriod.fold<double>(
      0,
      (sum, expense) => sum + expense.amount,
    );
    final allTotal = widget.snapshot.expenses
        .where((expense) => !expense.isVoided)
        .fold<double>(0, (sum, expense) => sum + expense.amount);

    final categoryTotals = <String, double>{};
    final vehicleTotals = <int, double>{};
    for (final expense in activeInPeriod) {
      categoryTotals[expense.category] =
          (categoryTotals[expense.category] ?? 0) + expense.amount;
      vehicleTotals[expense.vehicleId] =
          (vehicleTotals[expense.vehicleId] ?? 0) + expense.amount;
    }
    final categories = categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final vehicles = vehicleTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final maxCategory = categories.isEmpty ? 1.0 : categories.first.value;
    final maxVehicle = vehicles.isEmpty ? 1.0 : vehicles.first.value;

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: widget.onChanged,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          return ListView(
            padding: EdgeInsets.fromLTRB(
              wide ? 30 : 18,
              22,
              wide ? 30 : 18,
              28,
            ),
            children: [
              PageHeading(
                eyebrow: 'Vehicle care',
                title: 'Maintenance & expenses',
                description:
                    'Record real items and costs in ZMW. Voided entries stay '
                    'in history but are excluded from totals.',
                action: FilledButton.icon(
                  onPressed: _openForm,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Expense'),
                  style: FilledButton.styleFrom(
                    backgroundColor: FleetColors.ink,
                    foregroundColor: FleetColors.white,
                  ),
                ),
              ),
              const SizedBox(height: 15),
              GridView.count(
                crossAxisCount: wide ? 4 : 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: wide ? 1.5 : 1.2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    label: '$_period total',
                    value: formatMoney(periodTotal),
                    helper: '${activeInPeriod.length} active entries',
                    icon: Icons.receipt_long_outlined,
                    dark: true,
                  ),
                  MetricTile(
                    label: 'Fleet total',
                    value: formatMoney(allTotal),
                    helper: 'All active entries',
                    icon: Icons.account_balance_outlined,
                  ),
                  MetricTile(
                    label: 'Vehicles with costs',
                    value: '${vehicles.length}',
                    helper: 'In $_period',
                    icon: Icons.directions_car_outlined,
                  ),
                  MetricTile(
                    label: 'Voided entries',
                    value:
                        '${widget.snapshot.expenses.where((e) => e.isVoided).length}',
                    helper: 'Kept in history, not in totals',
                    icon: Icons.history_rounded,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              TextField(
                onChanged: (value) => setState(() => _query = value),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search item, category, vehicle, or supplier',
                ),
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _periods
                      .map(
                        (period) => Padding(
                          padding: const EdgeInsets.only(right: 7),
                          child: DateFilterChip(
                            label: period,
                            selected: _period == period,
                            onTap: () => setState(() => _period = period),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _vehicleFilter,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Vehicle filter',
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
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['All', ...expenseCategories]
                      .map(
                        (category) => Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(category),
                            selected: _categoryFilter == category,
                            onSelected: (_) =>
                                setState(() => _categoryFilter = category),
                            selectedColor: FleetColors.ink,
                            labelStyle: TextStyle(
                              fontSize: 10.5,
                              color: _categoryFilter == category
                                  ? FleetColors.white
                                  : FleetColors.ink,
                            ),
                            backgroundColor: FleetColors.white,
                            side: const BorderSide(color: FleetColors.warmGrey),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 13),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _CategorySummary(
                        categories: categories,
                        maxCategory: maxCategory,
                        period: _period,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _VehicleSummary(
                        entries: vehicles,
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
                  maxCategory: maxCategory,
                  period: _period,
                ),
                const SizedBox(height: 12),
                _VehicleSummary(
                  entries: vehicles,
                  snapshot: widget.snapshot,
                  maxVehicle: maxVehicle,
                  period: _period,
                ),
              ],
              const SizedBox(height: 14),
              SectionCard(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    PanelHeading(
                      title: 'Expense history',
                      trailing: '${filteredHistory.length} ENTRIES',
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'Newest first. Voided entries remain visible but do not '
                      'affect totals.',
                      style: TextStyle(fontSize: 10, color: FleetColors.muted),
                    ),
                    const SizedBox(height: 8),
                    if (filteredHistory.isEmpty)
                      EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: widget.snapshot.expenses.isEmpty
                            ? 'No vehicle costs recorded'
                            : 'No matching expenses',
                        body: widget.snapshot.expenses.isEmpty
                            ? 'Record a battery, engine oil, tyres, repairs, '
                                  'service, inspection, parts, or other vehicle '
                                  'requirement. Each entry needs a vehicle, date, '
                                  'category, item, and amount in ZMW.'
                            : 'Change the period, vehicle, category, or search '
                                  'text to see other entries.',
                        actionLabel: widget.snapshot.expenses.isEmpty
                            ? 'Record first expense'
                            : null,
                        onAction: widget.snapshot.expenses.isEmpty
                            ? _openForm
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
              const SizedBox(height: 10),
              const InfoBanner(
                icon: Icons.lock_outline_rounded,
                text:
                    'Financial records are protected. Expenses cannot be '
                    'deleted; use Void with a reason to correct a mistake while '
                    'keeping the audit history.',
              ),
              const SizedBox(height: 9),
              const LocalDataNotice(),
            ],
          );
        },
      ),
    );
  }
}

class _CategorySummary extends StatelessWidget {
  const _CategorySummary({
    required this.categories,
    required this.maxCategory,
    required this.period,
  });

  final List<MapEntry<String, double>> categories;
  final double maxCategory;
  final String period;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(title: 'Costs by category', trailing: period),
          const SizedBox(height: 10),
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

class _VehicleSummary extends StatelessWidget {
  const _VehicleSummary({
    required this.entries,
    required this.snapshot,
    required this.maxVehicle,
    required this.period,
  });

  final List<MapEntry<int, double>> entries;
  final FleetSnapshot snapshot;
  final double maxVehicle;
  final String period;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(title: 'Costs by vehicle', trailing: period),
          const SizedBox(height: 10),
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
                        const SizedBox(width: 8),
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

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({required this.expense, required this.onVoid});
  final Expense expense;
  final VoidCallback? onVoid;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: FleetColors.warmGrey, width: .7)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: FleetColors.canvas,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              _iconForCategory(expense.category),
              size: 17,
              color: expense.isVoided ? FleetColors.muted : FleetColors.ink,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        expense.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
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
                    const SizedBox(width: 6),
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
                    height: 1.35,
                  ),
                ),
                if (expense.supplier?.isNotEmpty == true ||
                    expense.paymentMethod?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      [
                        if (expense.supplier?.isNotEmpty == true)
                          expense.supplier!,
                        if (expense.paymentMethod?.isNotEmpty == true)
                          expense.paymentMethod!,
                      ].join(' · '),
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.muted,
                      ),
                    ),
                  ),
                if (expense.isVoided && expense.voidReason?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'Void reason: ${expense.voidReason}',
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.red,
                        fontWeight: FontWeight.w600,
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

  IconData _iconForCategory(String category) {
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

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final amount = double.tryParse(_amount.text.trim());
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
      setState(() {
        _saving = false;
        _error =
            'We couldn’t save this expense. Check the details and try '
            'again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .88,
        maxChildSize: .95,
        builder: (context, scrollController) => Column(
          children: [
            Container(
              width: 38,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 12),
              decoration: BoxDecoration(
                color: FleetColors.warmGrey,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
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
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
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
                        final parsed = double.tryParse(value?.trim() ?? '');
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
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                        ),
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

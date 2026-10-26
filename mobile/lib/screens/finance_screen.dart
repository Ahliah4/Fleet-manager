import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/driver.dart';
import '../models/finance_entry.dart';
import '../models/fleet_snapshot.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({
    super.key,
    required this.snapshot,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final Future<void> Function() onChanged;

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  String _tab = 'Income';
  RemittancePeriod _period = RemittancePeriod.forDate(DateTime.now());
  bool _showPeriodOnly = true;
  String _query = '';

  Future<void> _recordIncome() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _IncomeFormSheet(
        vehicles: widget.snapshot.vehicles,
        drivers: widget.snapshot.drivers,
      ),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(context, 'Income saved as a separate finance entry.');
    }
  }

  Future<void> _recordRemittance() async {
    if (widget.snapshot.drivers.isEmpty) {
      showAppMessage(
        context,
        'Add a driver record before recording a remittance.',
        error: true,
      );
      return;
    }
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _RemittanceFormSheet(
        drivers: widget.snapshot.drivers,
        vehicles: widget.snapshot.vehicles,
        initialPeriod: _period,
      ),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        'Driver remittance saved for the selected 10-day period.',
      );
    }
  }

  Future<void> _voidIncome(Income income) async {
    if (income.id == null) return;
    final reason = await showReasonDialog(
      context,
      title: 'Void this income entry?',
      message:
          'The entry stays in history, marked Voided, and is excluded from '
          'all totals. Use this instead of deleting financial history.',
    );
    if (reason == null) return;
    try {
      await FleetDatabase.instance.voidIncome(income.id!, reason);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        'Income voided and excluded from totals. History is preserved.',
      );
    } catch (_) {
      if (!mounted) return;
      showAppMessage(
        context,
        'We couldn’t void this income entry. Try again.',
        error: true,
      );
    }
  }

  Future<void> _voidRemittance(Remittance remittance) async {
    if (remittance.id == null) return;
    final reason = await showReasonDialog(
      context,
      title: 'Void this remittance?',
      message:
          'The payment stays in history, marked Voided, and is excluded from '
          'remittance totals. Use this instead of deleting financial history.',
    );
    if (reason == null) return;
    try {
      await FleetDatabase.instance.voidRemittance(remittance.id!, reason);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        'Remittance voided and excluded from totals. History is preserved.',
      );
    } catch (_) {
      if (!mounted) return;
      showAppMessage(
        context,
        'We couldn’t void this remittance. Try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeIncome = widget.snapshot.income
        .where((entry) => !entry.isVoided)
        .toList();
    final activeRemittances = widget.snapshot.remittances
        .where((entry) => !entry.isVoided)
        .toList();
    final activeExpenses = widget.snapshot.expenses
        .where((entry) => !entry.isVoided)
        .toList();

    final periodIncome = activeIncome
        .where((entry) => _period.contains(entry.entryDate))
        .toList();
    final periodRemittances = activeRemittances
        .where(
          (entry) =>
              entry.periodStart == _period.startIso &&
              entry.periodEnd == _period.endIso,
        )
        .toList();
    final periodExpenses = activeExpenses
        .where((entry) => _period.contains(entry.entryDate))
        .toList();

    final incomeTotal = periodIncome.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final remittanceTotal = periodRemittances.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final expenseTotal = periodExpenses.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final balance = incomeTotal - remittanceTotal;

    final allIncome = activeIncome.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final allRemittances = activeRemittances.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final allExpenses = activeExpenses.fold<double>(
      0,
      (sum, entry) => sum + entry.amount,
    );

    final incomeEntries = (widget.snapshot.income.where((entry) {
      if (_showPeriodOnly && !_period.contains(entry.entryDate)) return false;
      final haystack =
          '${entry.description} ${entry.driverName ?? ''} '
                  '${entry.vehicleName ?? ''} ${entry.reference ?? ''} '
                  '${entry.paymentMethod ?? ''}'
              .toLowerCase();
      return haystack.contains(_query.trim().toLowerCase());
    }).toList()..sort((a, b) => b.entryDate.compareTo(a.entryDate)));

    final remittanceEntries = (widget.snapshot.remittances.where((entry) {
      if (_showPeriodOnly &&
          (entry.periodStart != _period.startIso ||
              entry.periodEnd != _period.endIso)) {
        return false;
      }
      final haystack =
          '${entry.driverName ?? ''} '
                  '${entry.vehicleName ?? ''} ${entry.reference ?? ''} '
                  '${entry.notes ?? ''} ${entry.paymentMethod ?? ''}'
              .toLowerCase();
      return haystack.contains(_query.trim().toLowerCase());
    }).toList()..sort((a, b) => b.entryDate.compareTo(a.entryDate)));

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
                eyebrow: 'Fleet finance',
                title: 'Income & remittances',
                description:
                    'Daily income and driver remittances are separate records. '
                    'Income is never silently netted against expenses.',
                action: PopupMenuButton<String>(
                  tooltip: 'Add finance entry',
                  onSelected: (value) {
                    if (value == 'income') {
                      _recordIncome();
                    } else {
                      _recordRemittance();
                    }
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(
                      value: 'income',
                      child: Text('Record income'),
                    ),
                    PopupMenuItem(
                      value: 'remittance',
                      child: Text('Record remittance'),
                    ),
                  ],
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 13,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: FleetColors.ink,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.add_rounded,
                          size: 18,
                          color: FleetColors.white,
                        ),
                        SizedBox(width: 5),
                        Text(
                          'Record',
                          style: TextStyle(
                            color: FleetColors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _PeriodSelector(
                period: _period,
                onPrevious: () => setState(() => _period = _period.previous()),
                onNext: () => setState(() => _period = _period.next()),
                onCurrent: () => setState(
                  () => _period = RemittancePeriod.forDate(DateTime.now()),
                ),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: wide ? 4 : 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: wide ? 1.45 : 1.18,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    label: 'Income in period',
                    value: formatMoney(incomeTotal),
                    helper: '${periodIncome.length} income entries',
                    icon: Icons.add_card_rounded,
                    dark: true,
                  ),
                  MetricTile(
                    label: 'Remittances in period',
                    value: formatMoney(remittanceTotal),
                    helper: '${periodRemittances.length} payments',
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                  MetricTile(
                    label: 'Remittance balance',
                    value: formatMoney(balance),
                    helper: 'Income minus remittances only',
                    icon: balance < 0
                        ? Icons.trending_down_rounded
                        : Icons.trending_up_rounded,
                    alert: balance < 0,
                    success: balance > 0,
                  ),
                  MetricTile(
                    label: 'Operating costs',
                    value: formatMoney(expenseTotal),
                    helper: 'Tracked separately, not netted',
                    icon: Icons.build_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 11),
              const InfoBanner(
                icon: Icons.call_split_rounded,
                text:
                    'The remittance balance is a reconciliation figure for '
                    'this 10-day period (income recorded minus remittances '
                    'received). It is not profit. Vehicle operating costs are '
                    'shown separately and are never silently subtracted.',
              ),
              const SizedBox(height: 15),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'Income',
                    label: Text('Income'),
                    icon: Icon(Icons.add_card_rounded, size: 16),
                  ),
                  ButtonSegment(
                    value: 'Remittances',
                    label: Text('Remittances'),
                    icon: Icon(Icons.account_balance_wallet_outlined, size: 16),
                  ),
                ],
                selected: {_tab},
                onSelectionChanged: (values) {
                  setState(() {
                    _tab = values.first;
                    _query = '';
                  });
                },
                style: ButtonStyle(
                  visualDensity: VisualDensity.compact,
                  backgroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return FleetColors.ink;
                    }
                    return FleetColors.white;
                  }),
                  foregroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return FleetColors.white;
                    }
                    return FleetColors.ink;
                  }),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      onChanged: (value) => setState(() => _query = value),
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search_rounded),
                        hintText: _tab == 'Income'
                            ? 'Search description, driver, vehicle'
                            : 'Search driver, vehicle, reference',
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilterChip(
                    label: Text(
                      _showPeriodOnly ? 'This period' : 'All history',
                    ),
                    selected: _showPeriodOnly,
                    onSelected: (value) =>
                        setState(() => _showPeriodOnly = value),
                    selectedColor: FleetColors.ink,
                    labelStyle: TextStyle(
                      fontSize: 10.5,
                      color: _showPeriodOnly
                          ? FleetColors.white
                          : FleetColors.ink,
                    ),
                    backgroundColor: FleetColors.white,
                    side: const BorderSide(color: FleetColors.warmGrey),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_tab == 'Income')
                _IncomeList(
                  entries: incomeEntries,
                  hasAny: widget.snapshot.income.isNotEmpty,
                  onAdd: _recordIncome,
                  onVoid: _voidIncome,
                  onClearSearch: () => setState(() => _query = ''),
                  hasQuery: _query.trim().isNotEmpty,
                  showPeriodOnly: _showPeriodOnly,
                )
              else
                _RemittanceList(
                  entries: remittanceEntries,
                  hasAny: widget.snapshot.remittances.isNotEmpty,
                  onAdd: _recordRemittance,
                  onVoid: _voidRemittance,
                  onClearSearch: () => setState(() => _query = ''),
                  hasQuery: _query.trim().isNotEmpty,
                  showPeriodOnly: _showPeriodOnly,
                ),
              const SizedBox(height: 13),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const PanelHeading(
                      title: 'All-time recorded totals',
                      trailing: 'SEPARATE',
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _TotalStat(
                            label: 'INCOME',
                            value: formatMoney(allIncome),
                            color: FleetColors.green,
                          ),
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: _TotalStat(
                            label: 'REMITTANCES',
                            value: formatMoney(allRemittances),
                            color: FleetColors.ink,
                          ),
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: _TotalStat(
                            label: 'EXPENSES',
                            value: formatMoney(allExpenses),
                            color: FleetColors.red,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${activeIncome.length} income, '
                      '${activeRemittances.length} remittance, and '
                      '${activeExpenses.length} expense entries. Voided '
                      'entries are excluded from these totals.',
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              const InfoBanner(
                icon: Icons.lock_outline_rounded,
                text:
                    'Financial history is protected. Income and remittance '
                    'entries cannot be deleted; void an entry with a reason to '
                    'correct it while keeping the record.',
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

class _PeriodSelector extends StatelessWidget {
  const _PeriodSelector({
    required this.period,
    required this.onPrevious,
    required this.onNext,
    required this.onCurrent,
  });

  final RemittancePeriod period;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onCurrent;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onPrevious,
            tooltip: 'Previous 10-day period',
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Expanded(
            child: Column(
              children: [
                const Text(
                  '10-DAY REMITTANCE PERIOD',
                  style: TextStyle(
                    fontSize: 8.5,
                    letterSpacing: .9,
                    fontWeight: FontWeight.w700,
                    color: FleetColors.muted,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  period.label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FleetColors.ink,
                  ),
                ),
                if (period.isCurrent)
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Text(
                      'CURRENT PERIOD',
                      style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .6,
                        color: FleetColors.green,
                      ),
                    ),
                  )
                else
                  TextButton(
                    onPressed: onCurrent,
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      minimumSize: const Size(0, 26),
                    ),
                    child: const Text(
                      'Go to current period',
                      style: TextStyle(fontSize: 9.5),
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            onPressed: onNext,
            tooltip: 'Next 10-day period',
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

class _IncomeList extends StatelessWidget {
  const _IncomeList({
    required this.entries,
    required this.hasAny,
    required this.onAdd,
    required this.onVoid,
    required this.onClearSearch,
    required this.hasQuery,
    required this.showPeriodOnly,
  });

  final List<Income> entries;
  final bool hasAny;
  final VoidCallback onAdd;
  final ValueChanged<Income> onVoid;
  final VoidCallback onClearSearch;
  final bool hasQuery;
  final bool showPeriodOnly;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: PanelHeading(title: 'Income history')),
              FilledButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('Income'),
                style: FilledButton.styleFrom(
                  backgroundColor: FleetColors.ink,
                  foregroundColor: FleetColors.white,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          const Text(
            'Daily earnings recorded by the owner or finance manager.',
            style: TextStyle(fontSize: 10, color: FleetColors.muted),
          ),
          const SizedBox(height: 8),
          if (entries.isEmpty)
            EmptyState(
              icon: Icons.add_card_rounded,
              title: hasAny ? 'No matching income' : 'No income recorded yet',
              body: hasAny
                  ? 'Change the period or clear the search to see other income '
                        'entries.'
                  : 'Record daily income when it is received. Income is stored '
                        'separately from driver remittances and expenses.',
              actionLabel: hasQuery ? 'Clear search' : 'Record income',
              onAction: hasQuery ? onClearSearch : onAdd,
            )
          else
            ...entries.map(
              (entry) => _IncomeRow(
                income: entry,
                onVoid: entry.isVoided ? null : () => onVoid(entry),
              ),
            ),
          if (showPeriodOnly && entries.isNotEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 5, bottom: 4),
              child: Text(
                'Showing entries for the selected period. Tap “This period” to '
                'show all saved history.',
                style: TextStyle(fontSize: 9.5, color: FleetColors.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _RemittanceList extends StatelessWidget {
  const _RemittanceList({
    required this.entries,
    required this.hasAny,
    required this.onAdd,
    required this.onVoid,
    required this.onClearSearch,
    required this.hasQuery,
    required this.showPeriodOnly,
  });

  final List<Remittance> entries;
  final bool hasAny;
  final VoidCallback onAdd;
  final ValueChanged<Remittance> onVoid;
  final VoidCallback onClearSearch;
  final bool hasQuery;
  final bool showPeriodOnly;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: PanelHeading(title: 'Remittance history')),
              FilledButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('Remittance'),
                style: FilledButton.styleFrom(
                  backgroundColor: FleetColors.ink,
                  foregroundColor: FleetColors.white,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          const Text(
            'Money received from drivers, tracked against 10-day periods.',
            style: TextStyle(fontSize: 10, color: FleetColors.muted),
          ),
          const SizedBox(height: 8),
          if (entries.isEmpty)
            EmptyState(
              icon: Icons.account_balance_wallet_outlined,
              title: hasAny
                  ? 'No matching remittances'
                  : 'No remittances recorded yet',
              body: hasAny
                  ? 'Change the period or clear the search to see other '
                        'payments.'
                  : 'Record a remittance after receiving money from a driver. '
                        'Payments are separate from income and are never matched '
                        'automatically.',
              actionLabel: hasQuery ? 'Clear search' : 'Record remittance',
              onAction: hasQuery ? onClearSearch : onAdd,
            )
          else
            ...entries.map(
              (entry) => _RemittanceRow(
                remittance: entry,
                onVoid: entry.isVoided ? null : () => onVoid(entry),
              ),
            ),
          if (showPeriodOnly && entries.isNotEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 5, bottom: 4),
              child: Text(
                'Showing payments assigned to the selected period. Tap “This '
                'period” to show all saved history.',
                style: TextStyle(fontSize: 9.5, color: FleetColors.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _IncomeRow extends StatelessWidget {
  const _IncomeRow({required this.income, required this.onVoid});
  final Income income;
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
              Icons.add_card_rounded,
              size: 17,
              color: income.isVoided ? FleetColors.muted : FleetColors.green,
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
                        income.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: income.isVoided
                              ? FleetColors.muted
                              : FleetColors.ink,
                          decoration: income.isVoided
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    if (income.isVoided)
                      const StatusPill('Voided')
                    else
                      Text(
                        formatMoney(income.amount),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.green,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    formatDate(income.entryDate),
                    if (income.driverName != null) income.driverName!,
                    if (income.vehicleRegistration != null)
                      income.vehicleRegistration!,
                    if (income.paymentMethod != null) income.paymentMethod!,
                    if (income.reference?.isNotEmpty == true)
                      'Ref ${income.reference}',
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    color: FleetColors.muted,
                    height: 1.35,
                  ),
                ),
                if (income.isVoided && income.voidReason?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'Void reason: ${income.voidReason}',
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
              tooltip: 'Void income',
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
}

class _RemittanceRow extends StatelessWidget {
  const _RemittanceRow({required this.remittance, required this.onVoid});
  final Remittance remittance;
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
              Icons.account_balance_wallet_outlined,
              size: 17,
              color: remittance.isVoided ? FleetColors.muted : FleetColors.ink,
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
                        remittance.driverName ?? 'Driver',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: remittance.isVoided
                              ? FleetColors.muted
                              : FleetColors.ink,
                          decoration: remittance.isVoided
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    if (remittance.isVoided)
                      const StatusPill('Voided')
                    else
                      Text(
                        formatMoney(remittance.amount),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  'Period ${formatDate(remittance.periodStart)} – '
                  '${formatDate(remittance.periodEnd)}',
                  style: const TextStyle(
                    fontSize: 10,
                    color: FleetColors.muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    'Paid ${formatDate(remittance.entryDate)}',
                    if (remittance.vehicleRegistration != null)
                      remittance.vehicleRegistration!,
                    if (remittance.paymentMethod != null)
                      remittance.paymentMethod!,
                    if (remittance.reference?.isNotEmpty == true)
                      'Ref ${remittance.reference}',
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    color: FleetColors.muted,
                    height: 1.35,
                  ),
                ),
                if (remittance.isVoided &&
                    remittance.voidReason?.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'Void reason: ${remittance.voidReason}',
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
              tooltip: 'Void remittance',
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
}

class _TotalStat extends StatelessWidget {
  const _TotalStat({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: FleetColors.canvas,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: .7,
              fontWeight: FontWeight.w700,
              color: FleetColors.muted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _IncomeFormSheet extends StatefulWidget {
  const _IncomeFormSheet({required this.vehicles, required this.drivers});
  final List<Vehicle> vehicles;
  final List<Driver> drivers;

  @override
  State<_IncomeFormSheet> createState() => _IncomeFormSheetState();
}

class _IncomeFormSheetState extends State<_IncomeFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _description;
  late final TextEditingController _amount;
  late final TextEditingController _reference;
  late final TextEditingController _notes;
  late String _date;
  String _paymentMethod = 'Cash';
  int _vehicleId = 0;
  int _driverId = 0;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _date = todayIso();
    _description = TextEditingController();
    _amount = TextEditingController();
    _reference = TextEditingController();
    _notes = TextEditingController();
  }

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    _reference.dispose();
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
    final income = Income(
      entryDate: _date,
      description: _description.text.trim(),
      amount: amount,
      vehicleId: _vehicleId == 0 ? null : _vehicleId,
      driverId: _driverId == 0 ? null : _driverId,
      paymentMethod: _paymentMethod,
      reference: _reference.text.trim(),
      notes: _notes.text.trim(),
    );
    try {
      await FleetDatabase.instance.saveIncome(income);
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      setState(() {
        _saving = false;
        _error = 'We couldn’t save this income entry. Check the details and try again.';
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
                        Eyebrow('Finance entry'),
                        SizedBox(height: 4),
                        Text(
                          'Record income',
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
                    const FormSectionTitle('Income details'),
                    const SizedBox(height: 10),
                    AppDateField(
                      label: 'Date received',
                      value: _date,
                      required: true,
                      onChanged: (value) {
                        if (value != null) setState(() => _date = value);
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _description,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Description *',
                        hintText: 'e.g. Daily hire income, contract payment',
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Describe what this income is for.'
                          : null,
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
                    DropdownButtonFormField<int>(
                      initialValue: _vehicleId,
                      decoration: const InputDecoration(
                        labelText: 'Vehicle (optional)',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: 0,
                          child: Text('No vehicle linked'),
                        ),
                        ...widget.vehicles.map(
                          (vehicle) => DropdownMenuItem(
                            value: vehicle.id!,
                            child: Text(
                              '${vehicle.make} ${vehicle.model} · '
                              '${vehicle.registrationNumber}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _vehicleId = value ?? 0),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      initialValue: _driverId,
                      decoration: const InputDecoration(
                        labelText: 'Driver (optional)',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: 0,
                          child: Text('No driver linked'),
                        ),
                        ...widget.drivers.map(
                          (driver) => DropdownMenuItem(
                            value: driver.id!,
                            child: Text(driver.name),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _driverId = value ?? 0),
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
                      controller: _reference,
                      decoration: const InputDecoration(
                        labelText: 'Reference',
                        hintText: 'Optional receipt or transaction number',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional details',
                      ),
                    ),
                    const SizedBox(height: 10),
                    const InfoBanner(
                      text:
                          'Income is saved as its own record. It is not '
                          'automatically matched to remittances or expenses.',
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
                        label: Text(_saving ? 'Saving…' : 'Save income'),
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                        ),
                      ),
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

class _RemittanceFormSheet extends StatefulWidget {
  const _RemittanceFormSheet({
    required this.drivers,
    required this.vehicles,
    required this.initialPeriod,
  });

  final List<Driver> drivers;
  final List<Vehicle> vehicles;
  final RemittancePeriod initialPeriod;

  @override
  State<_RemittanceFormSheet> createState() => _RemittanceFormSheetState();
}

class _RemittanceFormSheetState extends State<_RemittanceFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amount;
  late final TextEditingController _reference;
  late final TextEditingController _notes;
  late int _driverId;
  late String _date;
  late RemittancePeriod _period;
  int _vehicleId = 0;
  String _paymentMethod = 'Cash';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _driverId = widget.drivers.first.id!;
    _date = todayIso();
    _period = widget.initialPeriod;
    _amount = TextEditingController();
    _reference = TextEditingController();
    _notes = TextEditingController();
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
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
    final remittance = Remittance(
      entryDate: _date,
      driverId: _driverId,
      periodStart: _period.startIso,
      periodEnd: _period.endIso,
      amount: amount,
      vehicleId: _vehicleId == 0 ? null : _vehicleId,
      paymentMethod: _paymentMethod,
      reference: _reference.text.trim(),
      notes: _notes.text.trim(),
    );
    try {
      await FleetDatabase.instance.saveRemittance(remittance);
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      setState(() {
        _saving = false;
        _error =
            'We couldn’t save this remittance. Check the details and try '
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
        initialChildSize: .9,
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
                        Eyebrow('Finance entry'),
                        SizedBox(height: 4),
                        Text(
                          'Record remittance',
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
                    const FormSectionTitle('Payment details'),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      initialValue: _driverId,
                      decoration: const InputDecoration(labelText: 'Driver *'),
                      items: widget.drivers
                          .map(
                            (driver) => DropdownMenuItem(
                              value: driver.id!,
                              child: Text(driver.name),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _driverId = value);
                        }
                      },
                    ),
                    const SizedBox(height: 10),
                    AppDateField(
                      label: 'Date payment received',
                      value: _date,
                      required: true,
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() {
                          _date = value;
                          _period = RemittancePeriod.forDate(
                            parseIsoDate(value) ?? DateTime.now(),
                          );
                        });
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _amount,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Amount received in ZMW *',
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
                    DropdownButtonFormField<int>(
                      initialValue: _vehicleId,
                      decoration: const InputDecoration(
                        labelText: 'Vehicle (optional)',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: 0,
                          child: Text('No vehicle linked'),
                        ),
                        ...widget.vehicles.map(
                          (vehicle) => DropdownMenuItem(
                            value: vehicle.id!,
                            child: Text(
                              '${vehicle.make} ${vehicle.model} · '
                              '${vehicle.registrationNumber}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _vehicleId = value ?? 0),
                    ),
                    const SizedBox(height: 18),
                    const FormSectionTitle('Remittance period'),
                    const SizedBox(height: 6),
                    const Text(
                      'The 10-day period can differ from the payment date when '
                      'a driver pays late. Use the arrows to assign the payment '
                      'to the correct period.',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: FleetColors.canvas,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: FleetColors.warmGrey),
                      ),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () =>
                                setState(() => _period = _period.previous()),
                            icon: const Icon(Icons.chevron_left_rounded),
                          ),
                          Expanded(
                            child: Column(
                              children: [
                                Text(
                                  _period.label,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: FleetColors.ink,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Days 1–10, 11–20, or 21–month end',
                                  style: TextStyle(
                                    fontSize: 8.5,
                                    color: FleetColors.muted.withValues(
                                      alpha: .9,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: () =>
                                setState(() => _period = _period.next()),
                            icon: const Icon(Icons.chevron_right_rounded),
                          ),
                        ],
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
                      controller: _reference,
                      decoration: const InputDecoration(
                        labelText: 'Reference',
                        hintText: 'Optional receipt or transaction number',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional details',
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
                        label: Text(_saving ? 'Saving…' : 'Save remittance'),
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                        ),
                      ),
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

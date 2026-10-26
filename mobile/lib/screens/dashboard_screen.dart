import 'package:flutter/material.dart';

import '../models/expense.dart';
import '../models/fleet_snapshot.dart';
import '../ui/alerts.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({
    super.key,
    required this.snapshot,
    required this.isLoading,
    required this.onNavigate,
    required this.onRefresh,
  });

  final FleetSnapshot snapshot;
  final bool isLoading;
  final ValueChanged<String> onNavigate;
  final Future<void> Function() onRefresh;

  List<Expense> get _activeExpenses =>
      snapshot.expenses.where((expense) => !expense.isVoided).toList();

  @override
  Widget build(BuildContext context) {
    final available = snapshot.vehicles
        .where((v) => v.status == 'Available')
        .length;
    final onHire = snapshot.vehicles.where((v) => v.status == 'On hire').length;
    final maintenance = snapshot.vehicles
        .where((v) => v.status == 'Maintenance')
        .length;
    final alerts = buildFleetAlerts(snapshot);
    final overdue = alerts.where((alert) => alert.isOverdue).length;
    final dueSoon = alerts.length - overdue;
    final missingDocs = countMissingDocuments(snapshot);
    final today = todayIso();
    final now = DateTime.now();

    final activeExpenses = _activeExpenses;
    final monthExpenses = activeExpenses
        .where((expense) => isSameMonth(expense.entryDate, now))
        .fold<double>(0, (sum, expense) => sum + expense.amount);
    final monthExpenseCount = activeExpenses
        .where((expense) => isSameMonth(expense.entryDate, now))
        .length;
    final allExpenses = activeExpenses.fold<double>(
      0,
      (sum, expense) => sum + expense.amount,
    );

    final activeIncome = snapshot.income.where((entry) => !entry.isVoided);
    final activeRemittances = snapshot.remittances.where(
      (entry) => !entry.isVoided,
    );
    final todayIncome = activeIncome
        .where((entry) => entry.entryDate == today)
        .fold<double>(0, (sum, entry) => sum + entry.amount);
    final todayRemittances = activeRemittances
        .where((entry) => entry.entryDate == today)
        .fold<double>(0, (sum, entry) => sum + entry.amount);

    final categoryTotals = <String, double>{};
    for (final expense in activeExpenses) {
      categoryTotals[expense.category] =
          (categoryTotals[expense.category] ?? 0) + expense.amount;
    }
    final categories = categoryTotals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final maxCategory = categories.isEmpty ? 1.0 : categories.first.value;
    final activities = _buildActivity(snapshot).take(7).toList();

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: onRefresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          return ListView(
            padding: EdgeInsets.fromLTRB(
              wide ? 30 : 18,
              24,
              wide ? 30 : 18,
              28,
            ),
            children: [
              PageHeading(
                eyebrow: 'Fleet overview',
                title: 'Fleet dashboard',
                description:
                    'Real counts from the records saved on this device.',
                action: FilledButton.icon(
                  onPressed: () => onNavigate('Vehicles'),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Vehicle'),
                  style: FilledButton.styleFrom(
                    backgroundColor: FleetColors.ink,
                    foregroundColor: FleetColors.white,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              GridView.count(
                crossAxisCount: wide ? 4 : 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: wide ? 1.45 : 1.2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    label: 'Total vehicles',
                    value: isLoading ? '—' : '${snapshot.vehicles.length}',
                    helper: '${snapshot.drivers.length} driver records',
                    icon: Icons.directions_car_outlined,
                    dark: true,
                  ),
                  MetricTile(
                    label: 'Available',
                    value: isLoading ? '—' : '$available',
                    helper: '$onHire on hire · $maintenance in maintenance',
                    icon: Icons.check_circle_outline_rounded,
                    success: available > 0,
                  ),
                  MetricTile(
                    label: 'Document alerts',
                    value: isLoading ? '—' : '${alerts.length}',
                    helper: overdue > 0
                        ? '$overdue overdue · $dueSoon due soon'
                        : '$dueSoon due within 30 days',
                    icon: Icons.notifications_active_outlined,
                    alert: overdue > 0,
                  ),
                  MetricTile(
                    label: 'Costs this month',
                    value: isLoading ? '—' : formatMoney(monthExpenses),
                    helper:
                        '$monthExpenseCount entries · '
                        '${formatMoney(allExpenses)} all time',
                    icon: Icons.build_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 11),
              const LocalDataNotice(),
              if (isLoading) ...[
                const SizedBox(height: 10),
                const LinearProgressIndicator(
                  color: FleetColors.ink,
                  backgroundColor: FleetColors.warmGrey,
                ),
              ],
              const SizedBox(height: 18),
              _QuickActions(onNavigate: onNavigate),
              const SizedBox(height: 16),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: _AttentionPanel(
                        alerts: alerts,
                        missingDocs: missingDocs,
                        onNavigate: onNavigate,
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      flex: 2,
                      child: _FinanceSnapshot(
                        income: todayIncome,
                        remittances: todayRemittances,
                        monthExpenses: monthExpenses,
                        onNavigate: onNavigate,
                      ),
                    ),
                  ],
                )
              else ...[
                _AttentionPanel(
                  alerts: alerts,
                  missingDocs: missingDocs,
                  onNavigate: onNavigate,
                ),
                const SizedBox(height: 13),
                _FinanceSnapshot(
                  income: todayIncome,
                  remittances: todayRemittances,
                  monthExpenses: monthExpenses,
                  onNavigate: onNavigate,
                ),
              ],
              const SizedBox(height: 13),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: _CostSummary(
                        monthExpenses: monthExpenses,
                        allExpenses: allExpenses,
                        count: activeExpenses.length,
                        categories: categories,
                        maxCategory: maxCategory,
                        onNavigate: onNavigate,
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      flex: 2,
                      child: _RecentActivity(items: activities),
                    ),
                  ],
                )
              else ...[
                _CostSummary(
                  monthExpenses: monthExpenses,
                  allExpenses: allExpenses,
                  count: activeExpenses.length,
                  categories: categories,
                  maxCategory: maxCategory,
                  onNavigate: onNavigate,
                ),
                const SizedBox(height: 13),
                _RecentActivity(items: activities),
              ],
            ],
          );
        },
      ),
    );
  }
}

List<_Activity> _buildActivity(FleetSnapshot snapshot) {
  final items = <_Activity>[];
  for (final vehicle in snapshot.vehicles) {
    items.add(
      _Activity(
        at: vehicle.updatedAt ?? vehicle.createdAt,
        title: 'Vehicle record saved',
        subtitle:
            '${vehicle.make} ${vehicle.model} · '
            '${vehicle.registrationNumber}',
        icon: Icons.directions_car_outlined,
        page: 'Vehicles',
      ),
    );
  }
  for (final driver in snapshot.drivers) {
    items.add(
      _Activity(
        at: driver.updatedAt ?? driver.createdAt,
        title: 'Driver record saved',
        subtitle: driver.name,
        icon: Icons.people_outline_rounded,
        page: 'Drivers',
      ),
    );
  }
  for (final expense in snapshot.expenses) {
    items.add(
      _Activity(
        at: expense.createdAt,
        title: expense.isVoided
            ? 'Expense voided · ${expense.category}'
            : 'Expense recorded · ${expense.category}',
        subtitle: '${expense.description} · ${formatMoney(expense.amount)}',
        icon: Icons.build_outlined,
        page: 'Maintenance',
      ),
    );
  }
  for (final hire in snapshot.hires) {
    items.add(
      _Activity(
        at: hire.createdAt,
        title: 'Hire ${hire.status.toLowerCase()}',
        subtitle:
            '${hire.vehicleName ?? 'Vehicle'} · '
            '${hire.driverName ?? 'No driver'} · '
            '${formatDate(hire.startDate)}',
        icon: Icons.key_outlined,
        page: 'Hires',
      ),
    );
  }
  for (final income in snapshot.income) {
    items.add(
      _Activity(
        at: income.createdAt,
        title: income.isVoided ? 'Income voided' : 'Income recorded',
        subtitle: '${income.description} · ${formatMoney(income.amount)}',
        icon: Icons.add_card_rounded,
        page: 'Finance',
      ),
    );
  }
  for (final remittance in snapshot.remittances) {
    items.add(
      _Activity(
        at: remittance.createdAt,
        title: remittance.isVoided
            ? 'Remittance voided'
            : 'Driver remittance received',
        subtitle:
            '${remittance.driverName ?? 'Driver'} · '
            '${formatMoney(remittance.amount)}',
        icon: Icons.account_balance_wallet_outlined,
        page: 'Finance',
      ),
    );
  }
  items.sort((a, b) {
    final aDate = DateTime.tryParse(a.at ?? '');
    final bDate = DateTime.tryParse(b.at ?? '');
    if (aDate == null && bDate == null) return 0;
    if (aDate == null) return 1;
    if (bDate == null) return -1;
    return bDate.compareTo(aDate);
  });
  return items;
}

class _Activity {
  const _Activity({
    required this.at,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.page,
  });

  final String? at;
  final String title;
  final String subtitle;
  final IconData icon;
  final String page;
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onNavigate});
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    final actions = [
      ('Add vehicle', Icons.directions_car_outlined, 'Vehicles'),
      ('Add driver', Icons.person_add_alt_1_rounded, 'Drivers'),
      ('Add expense', Icons.receipt_long_outlined, 'Maintenance'),
      ('Record finance', Icons.add_card_rounded, 'Finance'),
      ('Create report', Icons.insert_chart_outlined_rounded, 'Reports'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Eyebrow('Quick actions'),
        const SizedBox(height: 9),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: actions
              .map(
                (action) => OutlinedButton.icon(
                  onPressed: () => onNavigate(action.$3),
                  icon: Icon(action.$2, size: 16),
                  label: Text(action.$1),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: action.$1 == 'Add vehicle'
                        ? FleetColors.white
                        : FleetColors.ink,
                    backgroundColor: action.$1 == 'Add vehicle'
                        ? FleetColors.ink
                        : FleetColors.white,
                    side: BorderSide(
                      color: action.$1 == 'Add vehicle'
                          ? FleetColors.ink
                          : FleetColors.warmGrey,
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    textStyle: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 11.5,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _AttentionPanel extends StatelessWidget {
  const _AttentionPanel({
    required this.alerts,
    required this.missingDocs,
    required this.onNavigate,
  });

  final List<FleetAlert> alerts;
  final int missingDocs;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Needs attention',
            trailing: alerts.isEmpty ? 'CLEAR' : '${alerts.length} ALERTS',
          ),
          const SizedBox(height: 10),
          if (alerts.isEmpty)
            EmptyState(
              icon: Icons.verified_outlined,
              title: 'No dated alerts',
              body: missingDocs > 0
                  ? '$missingDocs vehicle document date${missingDocs == 1 ? '' : 's'} '
                        'are not tracked yet. Add insurance, road tax, and '
                        'roadworthy dates to monitor them.'
                  : 'Insurance, road tax, roadworthy, service, and licence '
                        'dates are not due within 30 days.',
              actionLabel: missingDocs > 0 ? 'Open vehicles' : null,
              onAction: missingDocs > 0 ? () => onNavigate('Vehicles') : null,
            )
          else ...[
            ...alerts
                .take(5)
                .map(
                  (alert) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      onTap: () => onNavigate(
                        alert.kind == FleetAlertKind.licence
                            ? 'Drivers'
                            : 'Vehicles',
                      ),
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                color: alert.isOverdue
                                    ? FleetColors.red.withValues(alpha: .10)
                                    : FleetColors.canvas,
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: Icon(
                                alert.isOverdue
                                    ? Icons.error_outline_rounded
                                    : Icons.schedule_rounded,
                                size: 16,
                                color: alert.isOverdue
                                    ? FleetColors.red
                                    : FleetColors.ink,
                              ),
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${alert.title} · ${alert.subject}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w700,
                                      color: FleetColors.ink,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${formatDate(alert.date)} · '
                                    '${dueLabel(alert.date)}',
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      color: alert.isOverdue
                                          ? FleetColors.red
                                          : FleetColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right_rounded,
                              size: 17,
                              color: FleetColors.muted,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            if (alerts.length > 5)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => onNavigate('Vehicles'),
                  child: Text('+${alerts.length - 5} more'),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _FinanceSnapshot extends StatelessWidget {
  const _FinanceSnapshot({
    required this.income,
    required this.remittances,
    required this.monthExpenses,
    required this.onNavigate,
  });

  final double income;
  final double remittances;
  final double monthExpenses;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Today’s money', trailing: 'SEPARATE'),
          const SizedBox(height: 11),
          _MoneyRow(
            label: 'Income recorded today',
            value: formatMoney(income),
            color: FleetColors.green,
          ),
          const SizedBox(height: 8),
          _MoneyRow(
            label: 'Remittances received today',
            value: formatMoney(remittances),
            color: FleetColors.ink,
          ),
          const SizedBox(height: 8),
          _MoneyRow(
            label: 'Vehicle costs this month',
            value: formatMoney(monthExpenses),
            color: FleetColors.red,
          ),
          const SizedBox(height: 10),
          const Divider(),
          const SizedBox(height: 6),
          const Text(
            'These figures are kept separate. This app does not silently net '
            'income against expenses or remittances.',
            style: TextStyle(
              fontSize: 10,
              color: FleetColors.muted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => onNavigate('Finance'),
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: const Text('Open finance'),
            ),
          ),
        ],
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 10.5, color: FleetColors.muted),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          value,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _CostSummary extends StatelessWidget {
  const _CostSummary({
    required this.monthExpenses,
    required this.allExpenses,
    required this.count,
    required this.categories,
    required this.maxCategory,
    required this.onNavigate,
  });

  final double monthExpenses;
  final double allExpenses;
  final int count;
  final List<MapEntry<String, double>> categories;
  final double maxCategory;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Maintenance & cost summary',
            trailing: '$count ENTRIES',
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              Expanded(
                child: _CostStat(
                  label: 'THIS MONTH',
                  value: formatMoney(monthExpenses),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _CostStat(
                  label: 'ALL RECORDED',
                  value: formatMoney(allExpenses),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (categories.isEmpty)
            const Text(
              'No expenses recorded yet. Add a battery, engine oil, tyres, '
              'repair, service, or other vehicle cost to start a real cost '
              'summary.',
              style: TextStyle(
                fontSize: 11,
                height: 1.45,
                color: FleetColors.muted,
              ),
            )
          else ...[
            const Text(
              'Spend by category (active entries)',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: FleetColors.muted,
              ),
            ),
            const SizedBox(height: 9),
            ...categories
                .take(4)
                .map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
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
                              FleetColors.ink,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ],
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => onNavigate('Maintenance'),
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: const Text('Open maintenance'),
            ),
          ),
        ],
      ),
    );
  }
}

class _CostStat extends StatelessWidget {
  const _CostStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: FleetColors.canvas,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8.5,
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
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _RecentActivity extends StatelessWidget {
  const _RecentActivity({required this.items});
  final List<_Activity> items;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Recent activity', trailing: 'SAVED'),
          const SizedBox(height: 10),
          if (items.isEmpty)
            const EmptyState(
              icon: Icons.history_rounded,
              title: 'No activity yet',
              body:
                  'Vehicle, driver, hire, expense, income, and remittance '
                  'records will appear here after you save them.',
            )
          else
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: FleetColors.canvas,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Icon(item.icon, size: 15, color: FleetColors.ink),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10,
                              color: FleetColors.muted,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            formatDateTime(item.at),
                            style: const TextStyle(
                              fontSize: 9,
                              color: FleetColors.muted,
                            ),
                          ),
                        ],
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

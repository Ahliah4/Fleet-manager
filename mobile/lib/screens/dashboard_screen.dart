import 'package:flutter/material.dart';

import '../models/expense.dart';
import '../models/fleet_snapshot.dart';
import '../ui/alerts.dart';
import '../ui/common.dart';
import '../ui/fleet_chart.dart';
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
    final unavailable = snapshot.vehicles
        .where((v) => v.status == 'Unavailable')
        .length;
    final alerts = buildFleetAlerts(snapshot);
    final today = todayIso();
    final now = DateTime.now();

    final activeExpenses = _activeExpenses;
    final monthExpenses = activeExpenses
        .where((expense) => isSameMonth(expense.entryDate, now))
        .fold<double>(0, (sum, expense) => sum + expense.amount);

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

    final activities = _buildActivity(snapshot).take(6).toList();
    final totalVehicles = snapshot.vehicles.length;
    final notAvailable = maintenance + unavailable;
    final hasRecords = !snapshot.isEmpty;

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: onRefresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          return ListView(
            padding: screenPadding(context),
            children: [
              PageHeading(
                title: 'Dashboard',
                subtitle: hasRecords
                    ? '${snapshot.drivers.length} '
                          '${snapshot.drivers.length == 1 ? 'driver' : 'drivers'}'
                          ' · ${snapshot.activeHires} active '
                          '${snapshot.activeHires == 1 ? 'hire' : 'hires'}'
                    : 'Your fleet at a glance',
              ),
              const SizedBox(height: 14),
              SummaryHero(
                eyebrow: 'Fleet',
                value: isLoading ? '—' : '$totalVehicles',
                label: 'Vehicles',
                chart: isLoading
                    ? null
                    : FleetMixChart(
                        segments: [
                          FleetChartSegment(
                            label: 'Available',
                            value: available,
                            color: FleetColors.silver,
                          ),
                          FleetChartSegment(
                            label: 'On hire',
                            value: onHire,
                            color: FleetColors.white,
                          ),
                          FleetChartSegment(
                            label: 'Unavailable',
                            value: notAvailable,
                            color: FleetColors.steel,
                          ),
                        ],
                        centerValue: totalVehicles == 0
                            ? '0'
                            : '${((available / totalVehicles) * 100).round()}%',
                        centerLabel: totalVehicles == 0
                            ? 'VEHICLES'
                            : 'AVAILABLE',
                      ),
                stats: [
                  HeroStat('Available', isLoading ? '—' : '$available'),
                  HeroStat('On hire', isLoading ? '—' : '$onHire'),
                  HeroStat('Unavailable', isLoading ? '—' : '$notAvailable'),
                ],
              ),
              if (isLoading) ...[
                const SizedBox(height: 10),
                const LinearProgressIndicator(
                  color: FleetColors.ink,
                  backgroundColor: FleetColors.warmGrey,
                ),
              ],
              const SizedBox(height: 12),
              _QuickActions(onNavigate: onNavigate),
              if (!hasRecords && !isLoading) ...[
                const SizedBox(height: 14),
                SectionCard(
                  child: EmptyState(
                    icon: Icons.space_dashboard_outlined,
                    title: 'Add your first vehicle',
                    body:
                        'Vehicle records power every total, alert, and report in '
                        'this app.',
                    actionLabel: 'Add vehicle',
                    onAction: () => onNavigate('Vehicles'),
                  ),
                ),
              ] else ...[
                const SizedBox(height: 14),
                if (wide)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: _AttentionPanel(
                          alerts: alerts,
                          onNavigate: onNavigate,
                        ),
                      ),
                      const SizedBox(width: 12),
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
                  _FinanceSnapshot(
                    income: todayIncome,
                    remittances: todayRemittances,
                    monthExpenses: monthExpenses,
                    onNavigate: onNavigate,
                  ),
                  const SizedBox(height: 12),
                  _AttentionPanel(alerts: alerts, onNavigate: onNavigate),
                ],
                const SizedBox(height: 12),
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
        title: 'Vehicle saved',
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
        title: 'Driver saved',
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
            : 'Expense · ${expense.category}',
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
            '${hire.driverName ?? 'No driver'}',
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
            : 'Remittance received',
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
      ('Drivers', Icons.people_outline_rounded, 'Drivers'),
      ('Service', Icons.build_outlined, 'Maintenance'),
      ('Finance', Icons.account_balance_wallet_outlined, 'Finance'),
      ('Reports', Icons.insert_chart_outlined_rounded, 'Reports'),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
      decoration: BoxDecoration(
        color: FleetColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: FleetColors.warmGrey, width: .7),
      ),
      child: Row(
        children: [
          for (final action in actions)
            Expanded(
              child: InkWell(
                onTap: () => onNavigate(action.$3),
                borderRadius: BorderRadius.circular(14),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(action.$2, size: 19, color: FleetColors.ink),
                      const SizedBox(height: 6),
                      Text(
                        action.$1,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: FleetColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AttentionPanel extends StatelessWidget {
  const _AttentionPanel({required this.alerts, required this.onNavigate});

  final List<FleetAlert> alerts;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelHeading(
            title: 'Needs attention',
            trailing: alerts.isEmpty ? 'Clear' : '${alerts.length}',
          ),
          const SizedBox(height: 6),
          if (alerts.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.verified_outlined,
                    size: 18,
                    color: FleetColors.muted,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No documents due in the next 30 days.',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            ...alerts
                .take(4)
                .map(
                  (alert) => InkWell(
                    onTap: () => onNavigate(
                      alert.kind == FleetAlertKind.licence
                          ? 'Drivers'
                          : 'Vehicles',
                    ),
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: alert.isOverdue
                                  ? FleetColors.red.withValues(alpha: .09)
                                  : FleetColors.mist,
                              borderRadius: BorderRadius.circular(9),
                            ),
                            child: Icon(
                              alert.isOverdue
                                  ? Icons.error_outline_rounded
                                  : Icons.schedule_rounded,
                              size: 15,
                              color: alert.isOverdue
                                  ? FleetColors.red
                                  : FleetColors.ink,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${alert.title} · ${alert.subject}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: FleetColors.ink,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  dueLabel(alert.date),
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
                            color: FleetColors.faint,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
          if (alerts.length > 4)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: TextButton(
                onPressed: () => onNavigate('Vehicles'),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 34),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text('${alerts.length - 4} more'),
              ),
            ),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Today',
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                  color: FleetColors.ink,
                  letterSpacing: -.35,
                ),
              ),
            ),
            TextButton(
              onPressed: () => onNavigate('Finance'),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 34),
              ),
              child: const Text('Finance'),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
          decoration: BoxDecoration(
            color: FleetColors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: FleetColors.warmGrey, width: .7),
          ),
          child: Row(
            children: [
              Expanded(child: _MoneyStat('Income', income)),
              const _MoneyDivider(),
              Expanded(child: _MoneyStat('Remittances', remittances)),
              const _MoneyDivider(),
              Expanded(child: _MoneyStat('Costs · month', monthExpenses)),
            ],
          ),
        ),
      ],
    );
  }
}

class _MoneyDivider extends StatelessWidget {
  const _MoneyDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: .7, height: 30, color: FleetColors.warmGrey);
}

class _MoneyStat extends StatelessWidget {
  const _MoneyStat(this.label, this.amount);

  final String label;
  final double amount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatMoney(amount),
              maxLines: 1,
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 14,
                fontWeight: FontWeight.w800,
                letterSpacing: -.3,
                color: FleetColors.ink,
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 10,
              color: FleetColors.muted,
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
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Recent activity'),
          const SizedBox(height: 4),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text(
                'Saved records will appear here.',
                style: TextStyle(fontSize: 11.5, color: FleetColors.muted),
              ),
            )
          else
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    Icon(item.icon, size: 17, color: FleetColors.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            item.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: FleetColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formatDate(item.at),
                      style: const TextStyle(
                        fontSize: 10,
                        color: FleetColors.faint,
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

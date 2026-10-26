import 'package:flutter/material.dart';

import 'data/fleet_database.dart';
import 'models/fleet_snapshot.dart';
import 'screens/dashboard_screen.dart';
import 'screens/drivers_screen.dart';
import 'screens/finance_screen.dart';
import 'screens/hires_screen.dart';
import 'screens/maintenance_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/vehicles_screen.dart';
import 'ui/alerts.dart';
import 'ui/common.dart';
import 'ui/fleet_theme.dart';
import 'utils/formatting.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const IpMotorsApp());
}

class IpMotorsApp extends StatelessWidget {
  const IpMotorsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'IP Motors Fleet',
      debugShowCheckedModeBanner: false,
      theme: buildFleetTheme(),
      home: const FleetHome(),
    );
  }
}

class FleetHome extends StatefulWidget {
  const FleetHome({super.key});

  @override
  State<FleetHome> createState() => _FleetHomeState();
}

class _FleetHomeState extends State<FleetHome> {
  static const _bottomPages = [
    ('Dashboard', Icons.grid_view_rounded),
    ('Vehicles', Icons.directions_car_outlined),
    ('Maintenance', Icons.build_outlined),
    ('Finance', Icons.account_balance_wallet_outlined),
    ('More', Icons.apps_rounded),
  ];

  static const _allPages = [
    ('Dashboard', Icons.grid_view_rounded),
    ('Vehicles', Icons.directions_car_outlined),
    ('Drivers', Icons.people_outline_rounded),
    ('Hires', Icons.key_outlined),
    ('Maintenance', Icons.build_outlined),
    ('Finance', Icons.account_balance_wallet_outlined),
    ('Reports', Icons.insert_chart_outlined_rounded),
    ('Settings & backup', Icons.settings_outlined),
  ];

  String _page = 'Dashboard';
  FleetSnapshot _snapshot = FleetSnapshot.empty();
  bool _loading = true;
  String? _storageError;

  int get _bottomIndex {
    final index = _bottomPages.indexWhere((item) => item.$1 == _page);
    if (index >= 0) return index;
    if (_page == 'Drivers' ||
        _page == 'Hires' ||
        _page == 'Reports' ||
        _page == 'Settings & backup') {
      return 4;
    }
    return 0;
  }

  int get _railIndex {
    final index = _allPages.indexWhere((item) => item.$1 == _page);
    return index < 0 ? 0 : index;
  }

  String get _pageLabel {
    if (_page == 'More') return 'More sections';
    return _page;
  }

  void _go(String page) => setState(() => _page = page);

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final snapshot = await FleetDatabase.instance.loadSnapshot();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _storageError = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _storageError =
            'We couldn’t open the fleet records on this phone. Try again.';
        _loading = false;
      });
    }
  }

  void _showAlerts() {
    final alerts = buildFleetAlerts(_snapshot);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: .62,
        maxChildSize: .92,
        builder: (context, controller) => Column(
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
                        Eyebrow('Fleet alerts'),
                        SizedBox(height: 4),
                        Text(
                          'Document dates',
                          style: TextStyle(
                            fontSize: 20,
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
              child: alerts.isEmpty
                  ? const SingleChildScrollView(
                      padding: EdgeInsets.all(24),
                      child: EmptyState(
                        icon: Icons.verified_outlined,
                        title: 'No dated alerts',
                        body:
                            'No insurance, road tax, roadworthy, service, or '
                            'driver licence dates are due within 30 days or '
                            'overdue. Add dates to vehicle and driver records '
                            'to track them here.',
                      ),
                    )
                  : ListView.separated(
                      controller: controller,
                      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
                      itemCount: alerts.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final alert = alerts[index];
                        return SectionCard(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                alert.isOverdue
                                    ? Icons.error_outline_rounded
                                    : Icons.schedule_rounded,
                                size: 19,
                                color: alert.isOverdue
                                    ? FleetColors.red
                                    : FleetColors.ink,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${alert.title} · ${alert.subject}',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${formatDate(alert.date)} · '
                                      '${dueLabel(alert.date)}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: alert.isOverdue
                                            ? FleetColors.red
                                            : FleetColors.muted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        final alerts = buildFleetAlerts(_snapshot).length;
        return Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                _TopBar(
                  pageLabel: _pageLabel,
                  alertCount: alerts,
                  onAlerts: _showAlerts,
                  onLogo: () => _go('Dashboard'),
                ),
                if (_storageError != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                    child: InlineAlert(
                      message: _storageError!,
                      onDismiss: _refresh,
                    ),
                  ),
                Expanded(
                  child: Row(
                    children: [
                      if (wide)
                        _DesktopNavigation(
                          selected: _railIndex,
                          onSelect: (index) => _go(_allPages[index].$1),
                        ),
                      Expanded(
                        child: _loading && _snapshot.isEmpty
                            ? const Center(
                                child: CircularProgressIndicator(
                                  color: FleetColors.ink,
                                ),
                              )
                            : _pageBody(),
                      ),
                    ],
                  ),
                ),
                if (!wide)
                  NavigationBar(
                    selectedIndex: _bottomIndex,
                    onDestinationSelected: (index) =>
                        _go(_bottomPages[index].$1),
                    destinations: _bottomPages
                        .map(
                          (item) => NavigationDestination(
                            icon: Icon(item.$2),
                            selectedIcon: Icon(item.$2),
                            label: item.$1,
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _pageBody() {
    return switch (_page) {
      'Dashboard' => DashboardScreen(
        snapshot: _snapshot,
        isLoading: _loading,
        onNavigate: _go,
        onRefresh: _refresh,
      ),
      'Vehicles' => VehiclesScreen(
        snapshot: _snapshot,
        isLoading: _loading,
        onChanged: _refresh,
      ),
      'Drivers' => DriversScreen(snapshot: _snapshot, onChanged: _refresh),
      'Hires' => HiresScreen(snapshot: _snapshot, onChanged: _refresh),
      'Maintenance' => MaintenanceScreen(
        snapshot: _snapshot,
        onChanged: _refresh,
      ),
      'Finance' => FinanceScreen(snapshot: _snapshot, onChanged: _refresh),
      'Reports' => ReportsScreen(snapshot: _snapshot),
      'Settings & backup' => SettingsScreen(
        snapshot: _snapshot,
        onChanged: _refresh,
      ),
      _ => _MorePage(snapshot: _snapshot, onNavigate: _go),
    };
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.pageLabel,
    required this.alertCount,
    required this.onAlerts,
    required this.onLogo,
  });

  final String pageLabel;
  final int alertCount;
  final VoidCallback onAlerts;
  final VoidCallback onLogo;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 66,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      decoration: const BoxDecoration(
        color: FleetColors.white,
        border: Border(
          bottom: BorderSide(color: FleetColors.warmGrey, width: .7),
        ),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: onLogo,
            borderRadius: BorderRadius.circular(12),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: FleetColors.ink,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'IP',
                    style: TextStyle(
                      color: FleetColors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'IP MOTORS',
                      style: TextStyle(
                        fontSize: 10,
                        letterSpacing: 1.15,
                        fontWeight: FontWeight.w800,
                        color: FleetColors.ink,
                      ),
                    ),
                    Text(
                      'FLEET MANAGER',
                      style: TextStyle(
                        fontSize: 9,
                        letterSpacing: 1.3,
                        fontWeight: FontWeight.w600,
                        color: FleetColors.muted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              pageLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: FleetColors.muted,
              ),
            ),
          ),
          IconButton(
            onPressed: onAlerts,
            tooltip: 'Fleet alerts',
            icon: Badge(
              isLabelVisible: alertCount > 0,
              label: Text('$alertCount'),
              backgroundColor: FleetColors.red,
              child: const Icon(
                Icons.notifications_none_rounded,
                color: FleetColors.ink,
              ),
            ),
          ),
          const SizedBox(width: 4),
          Container(
            width: 34,
            height: 34,
            decoration: const BoxDecoration(
              color: FleetColors.ink,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Text(
              'FO',
              style: TextStyle(
                color: FleetColors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DesktopNavigation extends StatelessWidget {
  const _DesktopNavigation({required this.selected, required this.onSelect});
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return NavigationRail(
      selectedIndex: selected,
      onDestinationSelected: onSelect,
      labelType: NavigationRailLabelType.all,
      backgroundColor: FleetColors.white,
      indicatorColor: FleetColors.red.withValues(alpha: .10),
      destinations: _FleetHomeState._allPages
          .map(
            (item) => NavigationRailDestination(
              icon: Icon(item.$2),
              selectedIcon: Icon(item.$2),
              label: Text(item.$1),
            ),
          )
          .toList(),
    );
  }
}

class _MorePage extends StatelessWidget {
  const _MorePage({required this.snapshot, required this.onNavigate});

  final FleetSnapshot snapshot;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    final items = [
      (
        'Drivers',
        Icons.people_outline_rounded,
        'Manage driver records, availability, and vehicle assignments.',
        '${snapshot.drivers.length} driver${snapshot.drivers.length == 1 ? '' : 's'} saved',
      ),
      (
        'Hires',
        Icons.key_outlined,
        'Record hire dates, drivers, and vehicle hire history.',
        '${snapshot.activeHires} active hire${snapshot.activeHires == 1 ? '' : 's'}',
      ),
      (
        'Reports',
        Icons.insert_chart_outlined_rounded,
        'Review date-filtered summaries and export saved records.',
        'CSV export and date filters',
      ),
      (
        'Settings & backup',
        Icons.settings_outlined,
        'Export a backup, restore this device, and review data safety.',
        'Local backup and restore',
      ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 22, 18, 28),
      children: [
        const Eyebrow('FLEET WORKSPACE'),
        const SizedBox(height: 6),
        Text(
          'More sections',
          style: Theme.of(context).textTheme.headlineMedium
              ?.copyWith(fontWeight: FontWeight.w800, color: FleetColors.ink),
        ),
        const SizedBox(height: 5),
        const Text(
          'Open a separate workspace for drivers, hires, reporting, and backup.',
          style: TextStyle(color: FleetColors.muted, fontSize: 12),
        ),
        const SizedBox(height: 18),
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 15,
                  vertical: 5,
                ),
                leading: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: FleetColors.canvas,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(item.$2, color: FleetColors.ink, size: 20),
                ),
                title: Text(
                  item.$1,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: FleetColors.ink,
                  ),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.$3,
                        style: const TextStyle(
                          fontSize: 11,
                          color: FleetColors.muted,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.$4,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: FleetColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
                trailing: const Icon(
                  Icons.chevron_right_rounded,
                  color: FleetColors.muted,
                ),
                onTap: () => onNavigate(item.$1),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const LocalDataNotice(),
      ],
    );
  }
}

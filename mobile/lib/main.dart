import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'data/fleet_database.dart';
import 'data/fleet_sync_service.dart';
import 'data/gateway_auth_service.dart';
import 'data/neon_auth_service.dart';
import 'models/app_role.dart';
import 'models/fleet_snapshot.dart';
import 'screens/dashboard_screen.dart';
import 'screens/auth_screen.dart';
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
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
      systemNavigationBarColor: FleetColors.surface,
      systemNavigationBarIconBrightness: Brightness.dark,
      systemNavigationBarDividerColor: FleetColors.warmGrey,
    ),
  );
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
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  final NeonAuthService _auth = authGatewayUrl.isNotEmpty
      ? GatewayAuthService()
      : NeonAuthService();
  NeonAuthSession? _session;
  bool _checking = true;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    FleetSyncService.instance.configure(_auth);
    _restore();
  }

  Future<void> _restore() async {
    if (!_auth.isConfigured) {
      if (mounted) {
        setState(() {
          _offline = true;
          _checking = false;
        });
      }
      return;
    }
    try {
      final session = await _auth.restoreSession();
      if (session != null && _auth.apiConfigured) {
        await _auth.loadApiSession();
      }
      if (mounted) {
        setState(() {
          _session = session;
          _checking = false;
        });
      }
    } on NeonAuthException {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: FleetColors.ink)),
      );
    }
    if (_session != null || _offline) {
      return FleetHome(
        onSignIn: () => setState(() => _offline = false),
        onSignOut: _session == null
            ? null
            : () async {
                await _auth.signOut();
                if (mounted) {
                  setState(() {
                    _session = null;
                    _offline = false;
                  });
                }
              },
      );
    }
    return AuthScreen(
      auth: _auth,
      onSignedIn: (session) => setState(() => _session = session),
      onContinueOffline: () => setState(() => _offline = true),
    );
  }
}

enum _NavGroup { overview, operations, money, device }

const _groupLabels = <_NavGroup, String>{
  _NavGroup.overview: 'Overview',
  _NavGroup.operations: 'Operations',
  _NavGroup.money: 'Money',
  _NavGroup.device: 'Device',
};

class _NavItem {
  const _NavItem({
    required this.page,
    required this.label,
    required this.icon,
    required this.group,
    this.bottomBarLabel,
  });

  /// Internal page id used by the screen switcher.
  final String page;

  /// Full label for headings, the rail, and the sections menu.
  final String label;

  final IconData icon;
  final _NavGroup group;

  /// Set only for destinations shown in the bottom bar.
  final String? bottomBarLabel;

  bool get inBottomBar => bottomBarLabel != null;
  String get tabLabel => bottomBarLabel ?? label;
}

const _navItems = <_NavItem>[
  _NavItem(
    page: 'Dashboard',
    label: 'Dashboard',
    icon: Icons.grid_view_rounded,
    group: _NavGroup.overview,
    bottomBarLabel: 'Dashboard',
  ),
  _NavItem(
    page: 'Vehicles',
    label: 'Vehicles',
    icon: Icons.directions_car_outlined,
    group: _NavGroup.operations,
    bottomBarLabel: 'Vehicles',
  ),
  _NavItem(
    page: 'Drivers',
    label: 'Drivers',
    icon: Icons.people_outline_rounded,
    group: _NavGroup.operations,
  ),
  _NavItem(
    page: 'Hires',
    label: 'Hires',
    icon: Icons.key_outlined,
    group: _NavGroup.operations,
  ),
  _NavItem(
    page: 'Maintenance',
    label: 'Service & costs',
    icon: Icons.build_outlined,
    group: _NavGroup.operations,
    bottomBarLabel: 'Service',
  ),
  _NavItem(
    page: 'Finance',
    label: 'Finance',
    icon: Icons.account_balance_wallet_outlined,
    group: _NavGroup.money,
    bottomBarLabel: 'Finance',
  ),
  _NavItem(
    page: 'Reports',
    label: 'Reports',
    icon: Icons.insert_chart_outlined_rounded,
    group: _NavGroup.money,
  ),
  _NavItem(
    page: 'Settings',
    label: 'Settings & backup',
    icon: Icons.settings_outlined,
    group: _NavGroup.device,
  ),
];

class FleetHome extends StatefulWidget {
  const FleetHome({this.onSignIn, this.onSignOut, super.key});
  final VoidCallback? onSignIn;
  final VoidCallback? onSignOut;

  @override
  State<FleetHome> createState() => _FleetHomeState();
}

class _FleetHomeState extends State<FleetHome> {
  static final _bottomItems = _navItems
      .where((item) => item.inBottomBar)
      .toList(growable: false);

  String _page = 'Dashboard';
  FleetSnapshot _snapshot = FleetSnapshot.empty();
  AppRole _role = AppRole.fleetOwner;
  bool _loading = true;
  String? _storageError;

  /// The More tab stays selected for every page that lives in its menu.
  int get _bottomIndex {
    final index = _bottomItems.indexWhere((item) => item.page == _page);
    return index >= 0 ? index : _bottomItems.length;
  }

  void _go(String page) {
    if (page == _page) return;
    HapticFeedback.selectionClick();
    setState(() => _page = page);
  }

  Future<void> _openSections() async {
    HapticFeedback.selectionClick();
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      constraints: const BoxConstraints(maxWidth: 560),
      sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      builder: (sheetContext) => _SectionsSheet(
        currentPage: _page,
        snapshot: _snapshot,
        onSelect: (page) => Navigator.pop(sheetContext, page),
      ),
    );
    if (!mounted || selected == null) return;
    _go(selected);
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final snapshot = await FleetDatabase.instance.loadSnapshot();
      final role = await FleetDatabase.instance.getAppRole();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _role = role;
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
      constraints: const BoxConstraints(maxWidth: 560),
      sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: .62,
        maxChildSize: .92,
        builder: (context, controller) => Column(
          children: [
            Container(
              width: 42,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 12),
              decoration: BoxDecoration(
                color: FleetColors.ink.withValues(alpha: .22),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Alerts',
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: FleetColors.ink,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          alerts.isEmpty
                              ? 'Nothing due in the next 30 days'
                              : '${alerts.length} due or overdue',
                          style: const TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 11.5,
                            color: FleetColors.muted,
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
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        final alerts = buildFleetAlerts(_snapshot).length;
        return Scaffold(
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                _TopBar(
                  role: _role,
                  alertCount: alerts,
                  onAlerts: _showAlerts,
                  onLogo: () => _go('Dashboard'),
                  onSettings: () => _go('Settings'),
                  onSignIn: widget.onSignIn,
                  onSignOut: widget.onSignOut,
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
                        _SideNavigation(currentPage: _page, onSelect: _go),
                      Expanded(
                        child: _loading && _snapshot.isEmpty
                            ? const Center(
                                child: CircularProgressIndicator(
                                  color: FleetColors.ink,
                                ),
                              )
                            : AnimatedSwitcher(
                                duration: reduceMotion
                                    ? Duration.zero
                                    : const Duration(milliseconds: 240),
                                switchInCurve: Curves.easeOutCubic,
                                switchOutCurve: Curves.easeInCubic,
                                transitionBuilder: (child, animation) {
                                  final fade = FadeTransition(
                                    opacity: animation,
                                    child: child,
                                  );
                                  if (reduceMotion) return fade;
                                  return SlideTransition(
                                    position: Tween(
                                      begin: const Offset(0, .018),
                                      end: Offset.zero,
                                    ).animate(animation),
                                    child: fade,
                                  );
                                },
                                child: KeyedSubtree(
                                  key: ValueKey(_page),
                                  child: Align(
                                    alignment: Alignment.topCenter,
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(
                                        maxWidth: 1240,
                                      ),
                                      child: _pageBody(),
                                    ),
                                  ),
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                if (!wide)
                  DecoratedBox(
                    decoration: const BoxDecoration(
                      color: FleetColors.surface,
                      border: Border(
                        top: BorderSide(color: FleetColors.warmGrey, width: .7),
                      ),
                    ),
                    child: SafeArea(
                      top: false,
                      child: NavigationBar(
                        selectedIndex: _bottomIndex,
                        onDestinationSelected: (index) {
                          if (index >= _bottomItems.length) {
                            _openSections();
                          } else {
                            _go(_bottomItems[index].page);
                          }
                        },
                        destinations: [
                          for (final item in _bottomItems)
                            NavigationDestination(
                              icon: Icon(item.icon),
                              selectedIcon: Icon(item.icon),
                              label: item.tabLabel,
                            ),
                          const NavigationDestination(
                            icon: Icon(Icons.apps_rounded),
                            selectedIcon: Icon(Icons.apps_rounded),
                            label: 'More',
                          ),
                        ],
                      ),
                    ),
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
        role: _role,
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
      'Settings' => SettingsScreen(snapshot: _snapshot, onChanged: _refresh),
      _ => const SizedBox.shrink(),
    };
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.role,
    required this.alertCount,
    required this.onAlerts,
    required this.onLogo,
    required this.onSettings,
    this.onSignIn,
    this.onSignOut,
  });

  final AppRole role;
  final int alertCount;
  final VoidCallback onAlerts;
  final VoidCallback onLogo;
  final VoidCallback onSettings;
  final VoidCallback? onSignIn;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    final signedIn = onSignOut != null;
    return Material(
      color: FleetColors.surface,
      child: Container(
        height: 58,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: FleetColors.warmGrey, width: .7),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onLogo,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 6,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          height: 28,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: FleetColors.obsidian,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Image.asset(
                            'assets/images/ip_mark.png',
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(width: 9),
                        const Flexible(
                          child: Text(
                            'FLEET OPERATIONS',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'Manrope',
                              fontSize: 9.5,
                              letterSpacing: .9,
                              fontWeight: FontWeight.w800,
                              color: FleetColors.ink,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            IconButton(
              onPressed: onAlerts,
              tooltip: alertCount == 0
                  ? 'Alerts'
                  : '$alertCount fleet ${alertCount == 1 ? 'alert' : 'alerts'}',
              style: IconButton.styleFrom(
                backgroundColor: FleetColors.mist.withValues(alpha: .55),
                minimumSize: const Size(42, 42),
              ),
              icon: Badge(
                isLabelVisible: alertCount > 0,
                label: Text(alertCount > 9 ? '9+' : '$alertCount'),
                backgroundColor: FleetColors.red,
                child: const Icon(
                  Icons.notifications_none_rounded,
                  color: FleetColors.ink,
                  size: 21,
                ),
              ),
            ),
            const SizedBox(width: 6),
            PopupMenuButton<String>(
              tooltip: 'Account',
              offset: const Offset(0, 46),
              onSelected: (value) {
                if (value == 'settings') onSettings();
                if (value == 'signin') onSignIn?.call();
                if (value == 'signout') onSignOut?.call();
              },
              itemBuilder: (context) => [
                PopupMenuItem<String>(
                  enabled: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        signedIn ? role.label : 'Local workspace',
                        style: const TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            signedIn
                                ? Icons.cloud_done_outlined
                                : Icons.phone_android_rounded,
                            size: 13,
                            color: FleetColors.muted,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            signedIn ? 'Signed in' : 'Offline · saved records',
                            style: const TextStyle(
                              fontFamily: 'Manrope',
                              fontSize: 10.5,
                              color: FleetColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const PopupMenuDivider(),
                const PopupMenuItem<String>(
                  value: 'settings',
                  child: Row(
                    children: [
                      Icon(Icons.settings_outlined, size: 18),
                      SizedBox(width: 10),
                      Text('Settings & backup'),
                    ],
                  ),
                ),
                const PopupMenuDivider(),
                if (!signedIn)
                  const PopupMenuItem<String>(
                    value: 'signin',
                    child: Row(
                      children: [
                        Icon(Icons.login_rounded, size: 18),
                        SizedBox(width: 10),
                        Text('Sign in'),
                      ],
                    ),
                  )
                else
                  const PopupMenuItem<String>(
                    value: 'signout',
                    child: Row(
                      children: [
                        Icon(Icons.logout_rounded, size: 18),
                        SizedBox(width: 10),
                        Text('Sign out'),
                      ],
                    ),
                  ),
              ],
              child: Tooltip(
                message: signedIn ? 'Signed in' : 'Local workspace',
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: FleetColors.heroGradient,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: signedIn
                          ? FleetColors.success
                          : FleetColors.warmGrey,
                      width: 1.5,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: signedIn
                      ? Text(
                          role.shortLabel,
                          style: const TextStyle(
                            fontFamily: 'Manrope',
                            color: FleetColors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        )
                      : const Icon(
                          Icons.person_outline_rounded,
                          color: FleetColors.white,
                          size: 19,
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SideNavigation extends StatelessWidget {
  const _SideNavigation({required this.currentPage, required this.onSelect});

  final String currentPage;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 236,
      decoration: const BoxDecoration(
        color: FleetColors.surface,
        border: Border(
          right: BorderSide(color: FleetColors.warmGrey, width: .7),
        ),
      ),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 18),
        children: [
          for (final group in _NavGroup.values)
            if (_navItems.any((item) => item.group == group)) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
                child: Text(
                  _groupLabels[group]!.toUpperCase(),
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 8.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w800,
                    color: FleetColors.faint,
                  ),
                ),
              ),
              for (final item in _navItems.where((item) => item.group == group))
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: _SideNavTile(
                    item: item,
                    selected: item.page == currentPage,
                    onTap: () => onSelect(item.page),
                  ),
                ),
            ],
        ],
      ),
    );
  }
}

class _SideNavTile extends StatelessWidget {
  const _SideNavTile({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? FleetColors.mist : Colors.transparent,
        borderRadius: BorderRadius.circular(13),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              children: [
                Icon(
                  item.icon,
                  size: 19,
                  color: selected ? FleetColors.ink : FleetColors.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 12,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected ? FleetColors.ink : FleetColors.muted,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionsSheet extends StatelessWidget {
  const _SectionsSheet({
    required this.currentPage,
    required this.snapshot,
    required this.onSelect,
  });

  final String currentPage;
  final FleetSnapshot snapshot;
  final ValueChanged<String> onSelect;

  String? _metaFor(String page) => switch (page) {
    'Drivers' => '${snapshot.drivers.length}',
    'Hires' => '${snapshot.activeHires} active',
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final menuItems = _navItems
        .where((item) => !item.inBottomBar)
        .toList(growable: false);
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .74,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 42,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 12),
              decoration: BoxDecoration(
                color: FleetColors.ink.withValues(alpha: .22),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 12, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Eyebrow('Fleet workspace'),
                        SizedBox(height: 5),
                        Text(
                          'All sections',
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.6,
                            color: FleetColors.ink,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Drivers, hires, reports, and device settings.',
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 11,
                            color: FleetColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    tooltip: 'Close sections',
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Flexible(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 20),
                children: [
                  for (final group in _NavGroup.values.where(
                    (group) => menuItems.any((item) => item.group == group),
                  )) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(6, 10, 6, 6),
                      child: Text(
                        _groupLabels[group]!.toUpperCase(),
                        style: const TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 8.5,
                          letterSpacing: 1.35,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.faint,
                        ),
                      ),
                    ),
                    for (final item in menuItems.where(
                      (item) => item.group == group,
                    ))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SectionCard(
                          padding: EdgeInsets.zero,
                          child: _SectionMenuTile(
                            item: item,
                            meta: _metaFor(item.page),
                            selected: item.page == currentPage,
                            onTap: () => onSelect(item.page),
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 4),
                  const InfoBanner(
                    icon: Icons.shield_outlined,
                    text: 'Records stay on this device. Export a backup from Settings & backup.',
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

class _SectionMenuTile extends StatelessWidget {
  const _SectionMenuTile({
    required this.item,
    required this.meta,
    required this.selected,
    required this.onTap,
  });

  final _NavItem item;
  final String? meta;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? FleetColors.mist : Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            child: Row(
              children: [
                Icon(
                  item.icon,
                  size: 19,
                  color: selected ? FleetColors.ink : FleetColors.muted,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: FleetColors.ink,
                    ),
                  ),
                ),
                if (meta != null) ...[
                  Text(
                    meta!,
                    style: const TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 11,
                      color: FleetColors.muted,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Icon(
                  selected ? Icons.check_rounded : Icons.chevron_right_rounded,
                  size: 18,
                  color: selected ? FleetColors.ink : FleetColors.faint,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

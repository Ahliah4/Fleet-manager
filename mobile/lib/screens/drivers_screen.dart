import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/driver.dart';
import '../models/fleet_snapshot.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class DriversScreen extends StatefulWidget {
  const DriversScreen({
    super.key,
    required this.snapshot,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final Future<void> Function() onChanged;

  @override
  State<DriversScreen> createState() => _DriversScreenState();
}

class _DriversScreenState extends State<DriversScreen> {
  String _query = '';
  String _filter = 'All';

  Future<void> _openForm([Driver? driver]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) =>
          _DriverFormSheet(driver: driver, vehicles: widget.snapshot.vehicles),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        driver == null
            ? 'Driver saved on this phone.'
            : 'Driver details and assignment updated.',
      );
    }
  }

  Future<void> _toggleAvailability(Driver driver) async {
    if (driver.id == null) return;
    try {
      await FleetDatabase.instance.setDriverAvailability(
        driver.id!,
        !driver.isAvailable,
      );
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        driver.isAvailable
            ? 'Driver marked unavailable for assignment.'
            : 'Driver marked available for assignment.',
      );
    } catch (_) {
      if (!mounted) return;
      showAppMessage(
        context,
        'We couldn’t update driver availability. Try again.',
        error: true,
      );
    }
  }

  Future<void> _deleteDriver(Driver driver) async {
    final linkedHires = widget.snapshot.hires
        .where((hire) => hire.driverId == driver.id)
        .length;
    final linkedIncome = widget.snapshot.income
        .where((income) => income.driverId == driver.id)
        .length;
    final linkedRemittances = widget.snapshot.remittances
        .where((remittance) => remittance.driverId == driver.id)
        .length;
    final linked = linkedHires + linkedIncome + linkedRemittances;

    if (driver.assignedVehicleId != null) {
      final unassign = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Driver is assigned'),
          content: Text(
            '${driver.name} is assigned to '
            '${driver.assignedVehicleName ?? 'a vehicle'} '
            '(${driver.assignedVehicleRegistration ?? 'unknown registration'}). '
            'Remove the assignment first, then delete the driver record.',
            style: const TextStyle(height: 1.5),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.ink,
                foregroundColor: FleetColors.white,
              ),
              child: const Text('Remove assignment'),
            ),
          ],
        ),
      );
      if (unassign == true && driver.id != null) {
        try {
          await FleetDatabase.instance.unassignVehicle(driver.id!);
          await widget.onChanged();
          if (!mounted) return;
          showAppMessage(
            context,
            'Vehicle assignment removed. The driver record is still saved.',
          );
        } catch (_) {
          if (!mounted) return;
          showAppMessage(
            context,
            'We couldn’t remove the assignment. Try again.',
            error: true,
          );
        }
      }
      return;
    }

    if (linked > 0) {
      final markUnavailable = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('History is protected'),
          content: Text(
            '${driver.name} is linked to $linked saved hire, income, or '
            'remittance record${linked == 1 ? '' : 's'}. Deleting the driver '
            'would remove that history.\n\n'
            'Mark the driver unavailable instead to keep all records.',
            style: const TextStyle(height: 1.5),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.ink,
                foregroundColor: FleetColors.white,
              ),
              child: const Text('Mark Unavailable'),
            ),
          ],
        ),
      );
      if (markUnavailable == true && driver.isAvailable && driver.id != null) {
        await _toggleAvailability(driver);
      }
      return;
    }

    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete ${driver.name}?',
      message:
          'This removes the driver record from this phone. No hire, '
          'income, or remittance records are linked to this driver. This '
          'cannot be undone.',
      confirmLabel: 'Delete driver',
      destructive: true,
    );
    if (!confirmed || driver.id == null) return;
    try {
      await FleetDatabase.instance.deleteDriver(driver.id!);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(context, 'Driver record deleted from this phone.');
    } catch (error) {
      if (!mounted) return;
      showAppMessage(
        context,
        error is StateError
            ? error.message
            : 'We couldn’t delete the driver. Try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final drivers = widget.snapshot.drivers.where((driver) {
      final haystack =
          '${driver.name} ${driver.phone ?? ''} '
                  '${driver.licenceNumber ?? ''} '
                  '${driver.assignedVehicleRegistration ?? ''}'
              .toLowerCase();
      final matchesSearch = haystack.contains(_query.trim().toLowerCase());
      final matchesFilter = _filter == 'All' || driver.availability == _filter;
      return matchesSearch && matchesFilter;
    }).toList();

    final available = widget.snapshot.drivers
        .where((driver) => driver.availability == 'Available')
        .length;
    final assigned = widget.snapshot.drivers
        .where((driver) => driver.availability == 'Assigned')
        .length;
    final licenceAlerts = widget.snapshot.drivers.where((driver) {
      final tone = dueTone(driver.licenceExpiry);
      return tone == DueTone.overdue || tone == DueTone.soon;
    }).length;

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: widget.onChanged,
      child: ListView(
        padding: screenPadding(context),
        children: [
          PageHeading(
            title: 'Drivers',
            subtitle: widget.snapshot.drivers.isEmpty
                ? 'Add your first driver'
                : '$available available · $assigned assigned'
                      '${licenceAlerts > 0 ? ' · $licenceAlerts licence alerts' : ''}',
            actions: [
              FilledButton.icon(
                onPressed: () => _openForm(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add driver'),
              ),
            ],
          ),
          const SizedBox(height: 14),
          StatBar(
            stats: [
              HeroStat('Drivers', '${widget.snapshot.drivers.length}'),
              HeroStat('Available', '$available'),
              HeroStat('Assigned', '$assigned'),
              HeroStat(
                'Licence alerts',
                '$licenceAlerts',
                alert: licenceAlerts > 0,
              ),
            ],
          ),
          const SizedBox(height: 12),
          FleetSearchField(
            hint: 'Search name, phone, licence, or vehicle',
            onChanged: (value) => setState(() => _query = value),
          ),
          const SizedBox(height: 8),
          FilterWrap(
            children: ['All', 'Available', 'Assigned', 'Unavailable']
                .map(
                  (filter) => DateFilterChip(
                    label: filter,
                    selected: _filter == filter,
                    onTap: () => setState(() => _filter = filter),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          if (drivers.isEmpty)
            SectionCard(
              child: EmptyState(
                icon: Icons.people_outline_rounded,
                title: widget.snapshot.drivers.isEmpty
                    ? 'No drivers yet'
                    : 'No matching drivers',
                body: widget.snapshot.drivers.isEmpty
                    ? 'Add a driver, then assign them to a vehicle.'
                    : 'Try another name, phone number, licence, or filter.',
              ),
            )
          else
            ...drivers.map(
              (driver) => _DriverCard(
                driver: driver,
                onEdit: () => _openForm(driver),
                onToggleAvailability: () => _toggleAvailability(driver),
                onDelete: () => _deleteDriver(driver),
              ),
            ),
        ],
      ),
    );
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({
    required this.driver,
    required this.onEdit,
    required this.onToggleAvailability,
    required this.onDelete,
  });

  final Driver driver;
  final VoidCallback onEdit;
  final VoidCallback onToggleAvailability;
  final VoidCallback onDelete;

  String get _initials {
    final parts = driver.name.trim().split(RegExp(r'\s+'));
    return parts
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();
  }

  @override
  Widget build(BuildContext context) {
    final licenceTone = dueTone(driver.licenceExpiry);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(15, 14, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: FleetColors.ink,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    _initials.isEmpty ? 'DR' : _initials,
                    style: const TextStyle(
                      color: FleetColors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        driver.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        driver.phone?.isNotEmpty == true
                            ? driver.phone!
                            : 'No phone recorded',
                        style: const TextStyle(
                          fontSize: 11,
                          color: FleetColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusPill(driver.availability),
                PopupMenuButton<String>(
                  tooltip: 'Driver actions',
                  onSelected: (value) {
                    if (value == 'delete') onDelete();
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(
                            Icons.delete_outline_rounded,
                            size: 18,
                            color: FleetColors.red,
                          ),
                          SizedBox(width: 8),
                          Text(
                            'Delete driver',
                            style: TextStyle(
                              color: FleetColors.red,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: FleetColors.canvas,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.directions_car_outlined,
                    size: 16,
                    color: FleetColors.ink,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ASSIGNED VEHICLE',
                          style: TextStyle(
                            fontSize: 8.5,
                            letterSpacing: .7,
                            fontWeight: FontWeight.w700,
                            color: FleetColors.muted,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          driver.assignedVehicleId == null
                              ? 'No vehicle assigned'
                              : '${driver.assignedVehicleName ?? 'Vehicle'} · '
                                    '${driver.assignedVehicleRegistration ?? ''}',
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: FleetColors.ink,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (driver.assignedVehicleId == null)
                    Switch.adaptive(
                      value: driver.isAvailable,
                      onChanged: (_) => onToggleAvailability(),
                      activeTrackColor: FleetColors.ink,
                    ),
                ],
              ),
            ),
            if (driver.licenceNumber?.isNotEmpty == true ||
                driver.licenceExpiry?.isNotEmpty == true) ...[
              const SizedBox(height: 7),
              Row(
                children: [
                  const Icon(
                    Icons.badge_outlined,
                    size: 14,
                    color: FleetColors.muted,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      [
                        if (driver.licenceNumber?.isNotEmpty == true)
                          'Licence ${driver.licenceNumber}',
                        if (driver.licenceExpiry?.isNotEmpty == true)
                          'expires ${formatDate(driver.licenceExpiry)} '
                              '(${dueLabel(driver.licenceExpiry)})',
                      ].join(' · '),
                      style: TextStyle(
                        fontSize: 10.5,
                        color: licenceTone == DueTone.overdue
                            ? FleetColors.red
                            : FleetColors.muted,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 7),
            const Divider(height: 1),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined, size: 15),
                label: const Text('Edit & assign'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverFormSheet extends StatefulWidget {
  const _DriverFormSheet({this.driver, required this.vehicles});
  final Driver? driver;
  final List<Vehicle> vehicles;

  @override
  State<_DriverFormSheet> createState() => _DriverFormSheetState();
}

class _DriverFormSheetState extends State<_DriverFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _licence;
  late final TextEditingController _notes;
  late String? _licenceExpiry;
  late bool _available;
  late int _assignedVehicleId;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final driver = widget.driver;
    _name = TextEditingController(text: driver?.name ?? '');
    _phone = TextEditingController(text: driver?.phone ?? '');
    _licence = TextEditingController(text: driver?.licenceNumber ?? '');
    _notes = TextEditingController(text: driver?.notes ?? '');
    _licenceExpiry = driver?.licenceExpiry;
    _available = driver?.isAvailable ?? true;
    _assignedVehicleId = driver?.assignedVehicleId ?? 0;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _licence.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final driver = Driver(
      id: widget.driver?.id,
      name: _name.text.trim(),
      phone: _phone.text.trim(),
      licenceNumber: _licence.text.trim(),
      licenceExpiry: _licenceExpiry,
      isAvailable: _available,
      notes: _notes.text.trim(),
      createdAt: widget.driver?.createdAt,
    );
    try {
      await FleetDatabase.instance.saveDriver(
        driver,
        assignedVehicleId: _assignedVehicleId == 0 ? null : _assignedVehicleId,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      setState(() {
        _saving = false;
        _error = error is StateError
            ? error.message
            : 'We couldn’t save this driver. Check the details and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.driver != null;
    final vehicles = widget.vehicles.where((vehicle) {
      return vehicle.assignedDriverId == null ||
          vehicle.assignedDriverId == widget.driver?.id;
    }).toList();

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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Eyebrow(editing ? 'Driver record' : 'New driver'),
                        const SizedBox(height: 4),
                        Text(
                          editing ? 'Edit driver' : 'Add driver',
                          style: const TextStyle(
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
                    const FormSectionTitle('Driver details'),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Full name *',
                        hintText: 'Driver name',
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Enter the driver’s name.'
                          : null,
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Phone',
                        hintText: '+260…',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _licence,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Licence number',
                        hintText: 'Optional',
                      ),
                    ),
                    const SizedBox(height: 8),
                    AppDateField(
                      label: 'Licence expiry',
                      value: _licenceExpiry,
                      onChanged: (value) =>
                          setState(() => _licenceExpiry = value),
                    ),
                    const SizedBox(height: 8),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: _available,
                      onChanged: (value) => setState(() => _available = value),
                      title: const Text(
                        'Available for assignment',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: const Text(
                        'Availability is separate from the current vehicle '
                        'assignment.',
                        style: TextStyle(fontSize: 10.5),
                      ),
                      activeTrackColor: FleetColors.ink,
                    ),
                    const SizedBox(height: 8),
                    const FormSectionTitle('Vehicle assignment'),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<int>(
                      initialValue: _assignedVehicleId,
                      decoration: const InputDecoration(
                        labelText: 'Assigned vehicle',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: 0,
                          child: Text('No vehicle assigned'),
                        ),
                        ...vehicles.map(
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
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _assignedVehicleId = value);
                        }
                      },
                    ),
                    const SizedBox(height: 7),
                    const Text(
                      'A driver can be assigned to one vehicle. If the vehicle '
                      'is already assigned, choose another vehicle or remove '
                      'the existing assignment first.',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional driver notes',
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
                        label: Text(
                          _saving
                              ? 'Saving…'
                              : editing
                              ? 'Save driver'
                              : 'Add driver',
                        ),
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

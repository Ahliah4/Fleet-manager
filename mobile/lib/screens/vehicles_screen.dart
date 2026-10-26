import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/fleet_snapshot.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({
    super.key,
    required this.snapshot,
    required this.isLoading,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final bool isLoading;
  final Future<void> Function() onChanged;

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  String _query = '';
  String _filter = 'All';

  Future<void> _openForm([Vehicle? vehicle]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _VehicleFormSheet(vehicle: vehicle),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        vehicle == null
            ? 'Vehicle saved on this phone.'
            : 'Vehicle details updated. Document dates are now tracked.',
      );
    }
  }

  Future<void> _openDetails(Vehicle vehicle) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _VehicleDetailSheet(
        vehicle: vehicle,
        hasActiveHire: widget.snapshot.hires.any(
          (hire) => hire.vehicleId == vehicle.id && hire.status == 'Active',
        ),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'edit') {
      await _openForm(vehicle);
    } else if (action == 'delete') {
      await _deleteVehicle(vehicle);
    } else if (action.startsWith('status:')) {
      await _changeStatus(vehicle, action.substring('status:'.length));
    }
  }

  Future<void> _changeStatus(Vehicle vehicle, String status) async {
    if (vehicle.status == status) return;
    final hasActiveHire = widget.snapshot.hires.any(
      (hire) => hire.vehicleId == vehicle.id && hire.status == 'Active',
    );
    if (hasActiveHire && status != 'On hire') {
      showAppMessage(
        context,
        'This vehicle has an active hire. Complete or cancel the hire before '
        'changing its status.',
        error: true,
      );
      return;
    }
    if (vehicle.id == null) return;
    try {
      await FleetDatabase.instance.setVehicleStatus(vehicle.id!, status);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(context, 'Vehicle status changed to $status.');
    } catch (_) {
      if (!mounted) return;
      showAppMessage(
        context,
        'We couldn’t change the vehicle status. Try again.',
        error: true,
      );
    }
  }

  Future<void> _deleteVehicle(Vehicle vehicle) async {
    final linkedExpenses = widget.snapshot.expenses
        .where((expense) => expense.vehicleId == vehicle.id)
        .length;
    final linkedHires = widget.snapshot.hires
        .where((hire) => hire.vehicleId == vehicle.id)
        .length;
    final linkedIncome = widget.snapshot.income
        .where((income) => income.vehicleId == vehicle.id)
        .length;
    final linkedRemittances = widget.snapshot.remittances
        .where((remittance) => remittance.vehicleId == vehicle.id)
        .length;
    final linkedCount =
        linkedExpenses + linkedHires + linkedIncome + linkedRemittances;

    if (linkedCount > 0) {
      final markUnavailable = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('History is protected'),
          content: Text(
            '${vehicle.make} ${vehicle.model} (${vehicle.registrationNumber}) '
            'is linked to $linkedCount saved record'
            '${linkedCount == 1 ? '' : 's'} (expenses, hires, income, or '
            'remittances). It cannot be deleted without losing that history.\n\n'
            'Mark it Unavailable instead to keep the vehicle and every linked '
            'record on this phone.',
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
      if (markUnavailable == true) {
        await _changeStatus(vehicle, 'Unavailable');
      }
      return;
    }

    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete ${vehicle.make} ${vehicle.model}?',
      message:
          'This removes the vehicle and its document dates from this '
          'phone. It has no linked expense, hire, income, or remittance '
          'records, so no financial history will be deleted. This cannot be '
          'undone.',
      confirmLabel: 'Delete vehicle',
      destructive: true,
    );
    if (!confirmed || vehicle.id == null) return;
    try {
      await FleetDatabase.instance.deleteVehicle(vehicle.id!);
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(context, 'Vehicle deleted from this phone.');
    } catch (error) {
      if (!mounted) return;
      showAppMessage(
        context,
        error is StateError
            ? error.message
            : 'We couldn’t delete the vehicle. Try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicles = widget.snapshot.vehicles.where((vehicle) {
      final haystack =
          '${vehicle.registrationNumber} ${vehicle.make} ${vehicle.model} '
                  '${vehicle.assignedDriverName ?? ''}'
              .toLowerCase();
      final matchesText = haystack.contains(_query.trim().toLowerCase());
      final matchesFilter = _filter == 'All' || vehicle.status == _filter;
      return matchesText && matchesFilter;
    }).toList();

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: widget.onChanged,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 22, 18, 28),
        children: [
          PageHeading(
            eyebrow: 'Fleet register',
            title: 'Vehicles',
            description:
                '${widget.snapshot.vehicles.length} vehicle'
                '${widget.snapshot.vehicles.length == 1 ? '' : 's'} saved on '
                'this device. Search, update status, and track document dates.',
            action: FilledButton.icon(
              onPressed: () => _openForm(),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add'),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.ink,
                foregroundColor: FleetColors.white,
              ),
            ),
          ),
          const SizedBox(height: 15),
          TextField(
            onChanged: (value) => setState(() => _query = value),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search_rounded),
              hintText: 'Search registration, make, model, or driver',
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['All', ...vehicleStatuses].map((status) {
                final count = status == 'All'
                    ? widget.snapshot.vehicles.length
                    : widget.snapshot.vehicles
                          .where((vehicle) => vehicle.status == status)
                          .length;
                return Padding(
                  padding: const EdgeInsets.only(right: 7),
                  child: DateFilterChip(
                    label: '$status ($count)',
                    selected: _filter == status,
                    onTap: () => setState(() => _filter = status),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),
          if (widget.isLoading)
            const Padding(
              padding: EdgeInsets.all(28),
              child: Center(
                child: CircularProgressIndicator(color: FleetColors.ink),
              ),
            )
          else if (vehicles.isEmpty)
            SectionCard(
              child: EmptyState(
                icon: Icons.directions_car_outlined,
                title: widget.snapshot.vehicles.isEmpty
                    ? 'Your fleet register is empty'
                    : 'No matching vehicles',
                body: widget.snapshot.vehicles.isEmpty
                    ? 'Add your first vehicle to keep its details, status, and '
                          'insurance, road tax, roadworthy, and service dates in '
                          'one place.'
                    : 'Try another registration, model, driver, or status filter.',
                actionLabel: widget.snapshot.vehicles.isEmpty
                    ? 'Add first vehicle'
                    : null,
                onAction: widget.snapshot.vehicles.isEmpty
                    ? () => _openForm()
                    : null,
              ),
            )
          else
            ...vehicles.map(
              (vehicle) => _VehicleCard(
                vehicle: vehicle,
                onOpen: () => _openDetails(vehicle),
                onEdit: () => _openForm(vehicle),
                onStatus: (status) => _changeStatus(vehicle, status),
                onDelete: () => _deleteVehicle(vehicle),
              ),
            ),
          const SizedBox(height: 8),
          const LocalDataNotice(),
        ],
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.vehicle,
    required this.onOpen,
    required this.onEdit,
    required this.onStatus,
    required this.onDelete,
  });

  final Vehicle vehicle;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final ValueChanged<String> onStatus;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final docAlerts = _documentAlerts(vehicle);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(15, 14, 8, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: FleetColors.canvas,
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: const Icon(
                      Icons.directions_car_outlined,
                      color: FleetColors.ink,
                    ),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${vehicle.make} ${vehicle.model}',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: FleetColors.ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          [
                            if (vehicle.year != null) '${vehicle.year}',
                            if (vehicle.colour?.isNotEmpty == true)
                              vehicle.colour!,
                            if (vehicle.assignedDriverName != null)
                              'Driver: ${vehicle.assignedDriverName}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: FleetColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  PopupMenuButton<String>(
                    tooltip: 'Vehicle actions',
                    onSelected: (value) {
                      if (value == 'view') {
                        onOpen();
                      } else if (value == 'edit') {
                        onEdit();
                      } else if (value == 'delete') {
                        onDelete();
                      } else if (value.startsWith('status:')) {
                        onStatus(value.substring('status:'.length));
                      }
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'view',
                        child: Text('View details'),
                      ),
                      const PopupMenuItem(
                        value: 'edit',
                        child: Text('Edit vehicle'),
                      ),
                      const PopupMenuDivider(),
                      ...vehicleStatuses.map(
                        (status) => PopupMenuItem(
                          value: 'status:$status',
                          child: Text(
                            status == vehicle.status
                                ? 'Status: $status (current)'
                                : 'Set status: $status',
                          ),
                        ),
                      ),
                      const PopupMenuDivider(),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Text('Delete vehicle'),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 11),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: FleetColors.canvas,
                      borderRadius: BorderRadius.circular(7),
                    ),
                    child: Text(
                      vehicle.registrationNumber,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .6,
                        color: FleetColors.ink,
                      ),
                    ),
                  ),
                  const Spacer(),
                  StatusPill(vehicle.status),
                ],
              ),
              if (vehicle.nextServiceDate?.isNotEmpty == true) ...[
                const SizedBox(height: 9),
                Row(
                  children: [
                    Icon(
                      Icons.build_outlined,
                      size: 14,
                      color: dueTone(vehicle.nextServiceDate) == DueTone.overdue
                          ? FleetColors.red
                          : FleetColors.muted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Next service · ${formatDate(vehicle.nextServiceDate)} '
                      '(${dueLabel(vehicle.nextServiceDate)})',
                      style: TextStyle(
                        fontSize: 10.5,
                        color:
                            dueTone(vehicle.nextServiceDate) == DueTone.overdue
                            ? FleetColors.red
                            : FleetColors.muted,
                      ),
                    ),
                  ],
                ),
              ],
              if (docAlerts.isNotEmpty) ...[
                const SizedBox(height: 7),
                Wrap(
                  spacing: 6,
                  runSpacing: 5,
                  children: docAlerts
                      .map(
                        (alert) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: FleetColors.red.withValues(alpha: .07),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            alert,
                            style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: FleetColors.red,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: 7),
              const Divider(height: 1),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: onOpen,
                    icon: const Icon(Icons.visibility_outlined, size: 15),
                    label: const Text('View'),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined, size: 15),
                    label: const Text('Edit'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static List<String> _documentAlerts(Vehicle vehicle) {
    final alerts = <String>[];
    void check(String label, String? value) {
      final tone = dueTone(value);
      if (tone == DueTone.overdue) {
        alerts.add('$label expired');
      } else if (tone == DueTone.soon) {
        alerts.add('$label ${dueLabel(value)}');
      }
    }

    check('Insurance', vehicle.insuranceExpiry);
    check('Road tax', vehicle.roadTaxExpiry);
    check('Roadworthy', vehicle.roadworthyExpiry);
    return alerts;
  }
}

class _VehicleDetailSheet extends StatelessWidget {
  const _VehicleDetailSheet({
    required this.vehicle,
    required this.hasActiveHire,
  });

  final Vehicle vehicle;
  final bool hasActiveHire;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .82,
      maxChildSize: .95,
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Eyebrow('Vehicle record'),
                      const SizedBox(height: 4),
                      Text(
                        '${vehicle.make} ${vehicle.model}',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        vehicle.registrationNumber,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: .6,
                          color: FleetColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusPill(vehicle.status),
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
              controller: controller,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              children: [
                const FormSectionTitle('Details'),
                const SizedBox(height: 8),
                DetailRow(
                  label: 'Registration',
                  value: vehicle.registrationNumber,
                ),
                DetailRow(
                  label: 'Year',
                  value: vehicle.year?.toString() ?? 'Not set',
                ),
                DetailRow(
                  label: 'Colour',
                  value: vehicle.colour?.isNotEmpty == true
                      ? vehicle.colour!
                      : 'Not set',
                ),
                DetailRow(
                  label: 'Assigned driver',
                  value: vehicle.assignedDriverName ?? 'No driver assigned',
                ),
                const SizedBox(height: 14),
                const FormSectionTitle('Documents & service'),
                const SizedBox(height: 8),
                _DueDetail(
                  label: 'Insurance expiry',
                  value: vehicle.insuranceExpiry,
                ),
                _DueDetail(
                  label: 'Road tax expiry',
                  value: vehicle.roadTaxExpiry,
                ),
                _DueDetail(
                  label: 'Roadworthy expiry',
                  value: vehicle.roadworthyExpiry,
                ),
                _DueDetail(
                  label: 'Next service',
                  value: vehicle.nextServiceDate,
                ),
                if (vehicle.notes?.isNotEmpty == true) ...[
                  const SizedBox(height: 14),
                  const FormSectionTitle('Notes'),
                  const SizedBox(height: 6),
                  Text(
                    vehicle.notes!,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: FleetColors.ink,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                if (hasActiveHire)
                  const InfoBanner(
                    text:
                        'This vehicle has an active hire. Complete or cancel '
                        'the hire before changing its status away from On hire.',
                    tone: AlertTone.warning,
                  ),
                const SizedBox(height: 10),
                const FormSectionTitle('Set status'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: vehicleStatuses.map((status) {
                    final disabled = status != 'On hire' && hasActiveHire;
                    return ChoiceChip(
                      label: Text(status),
                      selected: vehicle.status == status,
                      onSelected: disabled
                          ? null
                          : (_) => Navigator.pop(context, 'status:$status'),
                      selectedColor: FleetColors.ink,
                      labelStyle: TextStyle(
                        fontSize: 11,
                        color: vehicle.status == status
                            ? FleetColors.white
                            : FleetColors.ink,
                      ),
                      backgroundColor: FleetColors.white,
                      side: const BorderSide(color: FleetColors.warmGrey),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => Navigator.pop(context, 'edit'),
                        icon: const Icon(Icons.edit_outlined, size: 17),
                        label: const Text('Edit vehicle'),
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                          minimumSize: const Size(0, 46),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pop(context, 'delete'),
                      icon: const Icon(
                        Icons.delete_outline_rounded,
                        size: 17,
                        color: FleetColors.red,
                      ),
                      label: const Text(
                        'Delete',
                        style: TextStyle(color: FleetColors.red),
                      ),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 46),
                        side: const BorderSide(color: FleetColors.warmGrey),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 9),
                const Text(
                  'Financial and hire history is protected: a vehicle with '
                  'linked records cannot be deleted.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 10,
                    color: FleetColors.muted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DueDetail extends StatelessWidget {
  const _DueDetail({required this.label, required this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final tone = dueTone(value);
    final color = switch (tone) {
      DueTone.overdue => FleetColors.red,
      DueTone.soon => FleetColors.red,
      DueTone.valid => FleetColors.green,
      DueTone.missing => FleetColors.muted,
    };
    return DetailRow(
      label: label,
      value: value == null || value!.isEmpty
          ? 'Not recorded'
          : '${formatDate(value)} · ${dueLabel(value)}',
      valueColor: color,
    );
  }
}

class _VehicleFormSheet extends StatefulWidget {
  const _VehicleFormSheet({this.vehicle});
  final Vehicle? vehicle;

  @override
  State<_VehicleFormSheet> createState() => _VehicleFormSheetState();
}

class _VehicleFormSheetState extends State<_VehicleFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _registration;
  late final TextEditingController _make;
  late final TextEditingController _model;
  late final TextEditingController _year;
  late final TextEditingController _colour;
  late final TextEditingController _notes;
  late String _status;
  late String? _insuranceExpiry;
  late String? _roadTaxExpiry;
  late String? _roadworthyExpiry;
  late String? _nextServiceDate;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final vehicle = widget.vehicle;
    _registration = TextEditingController(
      text: vehicle?.registrationNumber ?? '',
    );
    _make = TextEditingController(text: vehicle?.make ?? '');
    _model = TextEditingController(text: vehicle?.model ?? '');
    _year = TextEditingController(text: vehicle?.year?.toString() ?? '');
    _colour = TextEditingController(text: vehicle?.colour ?? '');
    _notes = TextEditingController(text: vehicle?.notes ?? '');
    _status = vehicle?.status ?? 'Available';
    _insuranceExpiry = vehicle?.insuranceExpiry;
    _roadTaxExpiry = vehicle?.roadTaxExpiry;
    _roadworthyExpiry = vehicle?.roadworthyExpiry;
    _nextServiceDate = vehicle?.nextServiceDate;
  }

  @override
  void dispose() {
    _registration.dispose();
    _make.dispose();
    _model.dispose();
    _year.dispose();
    _colour.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final vehicle = Vehicle(
      id: widget.vehicle?.id,
      registrationNumber: _registration.text.trim().toUpperCase(),
      make: _make.text.trim(),
      model: _model.text.trim(),
      year: int.tryParse(_year.text.trim()),
      colour: _colour.text.trim(),
      status: _status,
      insuranceExpiry: _insuranceExpiry,
      roadTaxExpiry: _roadTaxExpiry,
      roadworthyExpiry: _roadworthyExpiry,
      nextServiceDate: _nextServiceDate,
      notes: _notes.text.trim(),
      assignedDriverId: widget.vehicle?.assignedDriverId,
      createdAt: widget.vehicle?.createdAt,
    );
    try {
      await FleetDatabase.instance.saveVehicle(vehicle);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      setState(() {
        _saving = false;
        _error = error.toString().toLowerCase().contains('unique')
            ? 'A vehicle with this registration is already saved on this phone.'
            : error is StateError
            ? error.message
            : 'We couldn’t save this vehicle. Check the details and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.vehicle != null;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .92,
        maxChildSize: .96,
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
                        Eyebrow(editing ? 'Fleet register' : 'New record'),
                        const SizedBox(height: 4),
                        Text(
                          editing ? 'Edit vehicle' : 'Add vehicle',
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
                    const FormSectionTitle('Vehicle details'),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _registration,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Registration number *',
                        hintText: 'e.g. ABC 1234',
                      ),
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Enter the vehicle registration.'
                          : null,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _make,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Make *',
                              hintText: 'Toyota',
                            ),
                            validator: (value) =>
                                value == null || value.trim().isEmpty
                                ? 'Enter the make.'
                                : null,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _model,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Model *',
                              hintText: 'Mark X',
                            ),
                            validator: (value) =>
                                value == null || value.trim().isEmpty
                                ? 'Enter the model.'
                                : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _year,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Year',
                              hintText: '2022',
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return null;
                              }
                              final parsed = int.tryParse(value);
                              if (parsed == null ||
                                  parsed < 1950 ||
                                  parsed > DateTime.now().year + 1) {
                                return 'Enter a valid year.';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _colour,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Colour',
                              hintText: 'Black',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _status,
                      decoration: const InputDecoration(
                        labelText: 'Vehicle status',
                      ),
                      items: vehicleStatuses
                          .map(
                            (status) => DropdownMenuItem(
                              value: status,
                              child: Text(status),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) setState(() => _status = value);
                      },
                    ),
                    const SizedBox(height: 20),
                    const FormSectionTitle('Documents & service'),
                    const SizedBox(height: 4),
                    const Text(
                      'Add dates to see expiry and service alerts on the '
                      'dashboard.',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 10),
                    AppDateField(
                      label: 'Insurance expiry',
                      value: _insuranceExpiry,
                      onChanged: (value) =>
                          setState(() => _insuranceExpiry = value),
                    ),
                    const SizedBox(height: 8),
                    AppDateField(
                      label: 'Road tax expiry',
                      value: _roadTaxExpiry,
                      onChanged: (value) =>
                          setState(() => _roadTaxExpiry = value),
                    ),
                    const SizedBox(height: 8),
                    AppDateField(
                      label: 'Roadworthy expiry',
                      value: _roadworthyExpiry,
                      onChanged: (value) =>
                          setState(() => _roadworthyExpiry = value),
                    ),
                    const SizedBox(height: 8),
                    AppDateField(
                      label: 'Next service date',
                      value: _nextServiceDate,
                      onChanged: (value) =>
                          setState(() => _nextServiceDate = value),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional vehicle notes',
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
                              ? 'Save changes'
                              : 'Save vehicle',
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: FleetColors.ink,
                          foregroundColor: FleetColors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 9),
                    const Text(
                      'Saved on this phone only. Assign a driver from the '
                      'Drivers section.',
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

import 'package:flutter/material.dart';

import '../data/fleet_database.dart';
import '../models/driver.dart';
import '../models/fleet_snapshot.dart';
import '../models/hire.dart';
import '../models/vehicle.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class HiresScreen extends StatefulWidget {
  const HiresScreen({
    super.key,
    required this.snapshot,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final Future<void> Function() onChanged;

  @override
  State<HiresScreen> createState() => _HiresScreenState();
}

class _HiresScreenState extends State<HiresScreen> {
  String _query = '';
  String _filter = 'All';

  Future<void> _openForm([Hire? hire]) async {
    if (widget.snapshot.vehicles.isEmpty) {
      showAppMessage(
        context,
        'Add a vehicle before recording a hire.',
        error: true,
      );
      return;
    }
    if (widget.snapshot.drivers.isEmpty) {
      showAppMessage(
        context,
        'Add a driver record before recording a hire.',
        error: true,
      );
      return;
    }
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: FleetColors.canvas,
      builder: (context) => _HireFormSheet(
        hire: hire,
        vehicles: widget.snapshot.vehicles,
        drivers: widget.snapshot.drivers,
      ),
    );
    if (saved == true && mounted) {
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        hire == null
            ? 'Hire recorded. The vehicle status was updated when needed.'
            : 'Hire details updated. Vehicle status was kept in sync.',
      );
    }
  }

  Future<void> _quickStatus(Hire hire, String status) async {
    if (hire.id == null) return;
    final confirmed = await showConfirmDialog(
      context,
      title: status == 'Completed'
          ? 'Mark this hire completed?'
          : 'Cancel this hire?',
      message: status == 'Completed'
          ? 'The hire will be kept in history as Completed. If the vehicle has '
                'no other active hire, its status will return to Available.'
          : 'The hire will be kept in history as Cancelled. If the vehicle has '
                'no other active hire, its status will return to Available.',
      confirmLabel: status == 'Completed' ? 'Mark completed' : 'Cancel hire',
      destructive: status == 'Cancelled',
    );
    if (!confirmed) return;
    try {
      await FleetDatabase.instance.saveHire(
        hire.copyWith(status: status, endDate: hire.endDate ?? todayIso()),
      );
      await widget.onChanged();
      if (!mounted) return;
      showAppMessage(
        context,
        status == 'Completed'
            ? 'Hire completed and kept in history.'
            : 'Hire cancelled and kept in history.',
      );
    } catch (error) {
      if (!mounted) return;
      showAppMessage(
        context,
        error is StateError
            ? error.message
            : 'We couldn’t update this hire. Try again.',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hires = widget.snapshot.hires.where((hire) {
      final haystack =
          '${hire.vehicleName ?? ''} '
                  '${hire.vehicleRegistration ?? ''} '
                  '${hire.driverName ?? ''} ${hire.status} ${hire.notes ?? ''}'
              .toLowerCase();
      final matchesText = haystack.contains(_query.trim().toLowerCase());
      final matchesFilter = _filter == 'All' || hire.status == _filter;
      return matchesText && matchesFilter;
    }).toList();

    final active = widget.snapshot.hires
        .where((hire) => hire.status == 'Active')
        .length;
    final completed = widget.snapshot.hires
        .where((hire) => hire.status == 'Completed')
        .length;
    final cancelled = widget.snapshot.hires
        .where((hire) => hire.status == 'Cancelled')
        .length;

    return RefreshIndicator(
      color: FleetColors.ink,
      onRefresh: widget.onChanged,
      child: ListView(
        padding: screenPadding(context),
        children: [
          PageHeading(
            title: 'Hires',
            subtitle: widget.snapshot.hires.isEmpty
                ? 'Record a vehicle hire'
                : '$active active · $completed completed'
                      '${cancelled > 0 ? ' · $cancelled cancelled' : ''}',
            actions: [
              FilledButton.icon(
                onPressed: () => _openForm(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Record hire'),
              ),
            ],
          ),
          const SizedBox(height: 14),
          StatBar(
            stats: [
              HeroStat('Hires', '${widget.snapshot.hires.length}'),
              HeroStat('Active', '$active'),
              HeroStat('Completed', '$completed'),
              HeroStat('Cancelled', '$cancelled', alert: cancelled > 0),
            ],
          ),
          const SizedBox(height: 12),
          FleetSearchField(
            hint: 'Search vehicle, driver, or status',
            onChanged: (value) => setState(() => _query = value),
          ),
          const SizedBox(height: 8),
          FilterWrap(
            children: ['All', ...hireStatuses].map((status) {
              final count = status == 'All'
                  ? widget.snapshot.hires.length
                  : widget.snapshot.hires
                        .where((hire) => hire.status == status)
                        .length;
              return DateFilterChip(
                label: '$status ($count)',
                selected: _filter == status,
                onTap: () => setState(() => _filter = status),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          if (hires.isEmpty)
            SectionCard(
              child: EmptyState(
                icon: Icons.key_outlined,
                title: widget.snapshot.hires.isEmpty
                    ? 'No hires yet'
                    : 'No matching hires',
                body: widget.snapshot.hires.isEmpty
                    ? 'Record the vehicle, driver, dates, and status of a hire.'
                    : 'Try another vehicle, driver, or status filter.',
              ),
            )
          else
            ...hires.map(
              (hire) => _HireCard(
                hire: hire,
                onEdit: () => _openForm(hire),
                onComplete: () => _quickStatus(hire, 'Completed'),
                onCancel: () => _quickStatus(hire, 'Cancelled'),
              ),
            ),
        ],
      ),
    );
  }
}

class _HireCard extends StatelessWidget {
  const _HireCard({
    required this.hire,
    required this.onEdit,
    required this.onComplete,
    required this.onCancel,
  });

  final Hire hire;
  final VoidCallback onEdit;
  final VoidCallback onComplete;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final active = hire.isActive;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(15, 14, 8, 8),
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
                    color: active
                        ? FleetColors.ink
                        : FleetColors.mist.withValues(alpha: .62),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    Icons.key_outlined,
                    color: active ? FleetColors.white : FleetColors.ink,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hire.vehicleName ?? 'Vehicle',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${hire.vehicleRegistration ?? ''} · '
                        '${hire.driverName ?? 'No driver'}',
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
                StatusPill(
                  hire.status,
                  overrideColor: active ? FleetColors.ink : null,
                ),
                if (active)
                  PopupMenuButton<String>(
                    tooltip: 'Hire actions',
                    onSelected: (value) {
                      if (value == 'complete') {
                        onComplete();
                      } else if (value == 'cancel') {
                        onCancel();
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(
                        value: 'complete',
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline_rounded, size: 18),
                            SizedBox(width: 8),
                            Text('Mark completed'),
                          ],
                        ),
                      ),
                      PopupMenuDivider(),
                      PopupMenuItem(
                        value: 'cancel',
                        child: Row(
                          children: [
                            Icon(
                              Icons.cancel_outlined,
                              size: 18,
                              color: FleetColors.red,
                            ),
                            SizedBox(width: 8),
                            Text(
                              'Cancel hire',
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
            const SizedBox(height: 11),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: FleetColors.canvas,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _HireDate(
                      label: 'STARTED',
                      value: formatDate(hire.startDate),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HireDate(
                      label: active ? 'EXPECTED END' : 'ENDED',
                      value: hire.endDate == null
                          ? (active ? 'Not set' : 'Not recorded')
                          : formatDate(hire.endDate),
                    ),
                  ),
                ],
              ),
            ),
            if (hire.notes?.isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                hire.notes!,
                style: const TextStyle(
                  fontSize: 11,
                  color: FleetColors.muted,
                  height: 1.4,
                ),
              ),
            ],
            const SizedBox(height: 6),
            Row(
              children: [
                TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined, size: 15),
                  label: const Text('Edit'),
                ),
                const Spacer(),
                Text(
                  'Kept in history',
                  style: TextStyle(
                    fontSize: 9.5,
                    color: FleetColors.muted.withValues(alpha: .9),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HireDate extends StatelessWidget {
  const _HireDate({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
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
        const SizedBox(height: 3),
        Text(
          value,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: FleetColors.ink,
          ),
        ),
      ],
    );
  }
}

class _HireFormSheet extends StatefulWidget {
  const _HireFormSheet({
    this.hire,
    required this.vehicles,
    required this.drivers,
  });

  final Hire? hire;
  final List<Vehicle> vehicles;
  final List<Driver> drivers;

  @override
  State<_HireFormSheet> createState() => _HireFormSheetState();
}

class _HireFormSheetState extends State<_HireFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late int _vehicleId;
  late int _driverId;
  late String _startDate;
  late String? _endDate;
  late String _status;
  late final TextEditingController _notes;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final hire = widget.hire;
    _vehicleId = hire?.vehicleId ?? widget.vehicles.first.id!;
    _driverId = hire?.driverId ?? widget.drivers.first.id!;
    _startDate = hire?.startDate ?? todayIso();
    _endDate = hire?.endDate;
    _status = hire?.status ?? 'Active';
    _notes = TextEditingController(text: hire?.notes ?? '');
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_endDate != null && _endDate!.compareTo(_startDate) < 0) {
      setState(() => _error = 'The end date cannot be before the start date.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final closingDate = _endDate ?? (_status == 'Active' ? null : todayIso());
    final hire = Hire(
      id: widget.hire?.id,
      vehicleId: _vehicleId,
      driverId: _driverId,
      startDate: _startDate,
      endDate: closingDate,
      status: _status,
      notes: _notes.text.trim(),
      createdAt: widget.hire?.createdAt,
    );
    try {
      await FleetDatabase.instance.saveHire(hire);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      setState(() {
        _saving = false;
        _error = error is StateError
            ? error.message
            : 'We couldn’t save this hire. Check the vehicle status and dates.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.hire != null;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .85,
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
                        Eyebrow(editing ? 'Hire record' : 'New hire'),
                        const SizedBox(height: 4),
                        Text(
                          editing ? 'Edit hire' : 'Record a hire',
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
                    const FormSectionTitle('Vehicle and driver'),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      initialValue: _vehicleId,
                      decoration: const InputDecoration(labelText: 'Vehicle *'),
                      items: widget.vehicles.map((vehicle) {
                        return DropdownMenuItem(
                          value: vehicle.id as int,
                          child: Text(
                            '${vehicle.make} ${vehicle.model} · '
                            '${vehicle.registrationNumber} (${vehicle.status})',
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
                    DropdownButtonFormField<int>(
                      initialValue: _driverId,
                      decoration: const InputDecoration(labelText: 'Driver *'),
                      items: widget.drivers.map((driver) {
                        return DropdownMenuItem(
                          value: driver.id as int,
                          child: Text(
                            '${driver.name} · ${driver.availability}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => _driverId = value);
                        }
                      },
                    ),
                    const SizedBox(height: 18),
                    const FormSectionTitle('Hire dates and status'),
                    const SizedBox(height: 10),
                    AppDateField(
                      label: 'Start date',
                      value: _startDate,
                      required: true,
                      onChanged: (value) {
                        if (value != null) setState(() => _startDate = value);
                      },
                    ),
                    const SizedBox(height: 8),
                    AppDateField(
                      label: _status == 'Active'
                          ? 'Expected end date'
                          : 'End date',
                      value: _endDate,
                      onChanged: (value) => setState(() => _endDate = value),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _status,
                      decoration: const InputDecoration(labelText: 'Status'),
                      items: hireStatuses
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
                    const SizedBox(height: 7),
                    const Text(
                      'An Active hire marks the vehicle On hire. It cannot be '
                      'created for a vehicle that is in maintenance or already '
                      'has an active hire.',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: FleetColors.muted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional hire notes',
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
                              ? 'Save hire'
                              : 'Record hire',
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

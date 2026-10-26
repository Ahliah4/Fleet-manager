import 'package:flutter/material.dart';

import '../utils/formatting.dart';
import 'fleet_theme.dart';

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label.toUpperCase(),
    style: const TextStyle(
      fontSize: 10,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.4,
      color: FleetColors.muted,
    ),
  );
}

class PageHeading extends StatelessWidget {
  const PageHeading({
    super.key,
    required this.eyebrow,
    required this.title,
    this.description,
    this.action,
  });

  final String eyebrow;
  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Eyebrow(eyebrow),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: FleetColors.ink,
                  letterSpacing: -.6,
                ),
              ),
            ),
            if (action != null) ...[const SizedBox(width: 10), action!],
          ],
        ),
        if (description != null) ...[
          const SizedBox(height: 5),
          Text(
            description!,
            style: const TextStyle(
              fontSize: 12,
              color: FleetColors.muted,
              height: 1.45,
            ),
          ),
        ],
      ],
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin = EdgeInsets.zero,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: margin,
      child: Padding(padding: padding, child: child),
    );
  }
}

class PanelHeading extends StatelessWidget {
  const PanelHeading({
    super.key,
    required this.title,
    this.trailing,
    this.action,
  });

  final String title;
  final String? trailing;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
            ),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!.toUpperCase(),
            style: const TextStyle(
              fontSize: 9,
              letterSpacing: .9,
              fontWeight: FontWeight.w700,
              color: FleetColors.muted,
            ),
          ),
        ?action,
      ],
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.helper,
    this.dark = false,
    this.alert = false,
    this.success = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final String? helper;
  final bool dark;
  final bool alert;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final background = dark ? FleetColors.ink : FleetColors.white;
    final foreground = dark ? FleetColors.white : FleetColors.ink;
    final valueColor = alert
        ? FleetColors.red
        : success
        ? FleetColors.green
        : foreground;
    return Card(
      child: Container(
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(18),
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(
                  icon,
                  size: 17,
                  color: alert
                      ? FleetColors.red
                      : success
                      ? FleetColors.green
                      : (dark ? FleetColors.white : FleetColors.muted),
                ),
                const Spacer(),
                if (alert)
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: FleetColors.red,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: value.length > 11 ? 18 : 25,
                    height: 1.05,
                    fontWeight: FontWeight.w800,
                    color: valueColor,
                    letterSpacing: -.5,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: .7,
                    fontWeight: FontWeight.w700,
                    color: dark
                        ? FleetColors.white.withValues(alpha: .7)
                        : FleetColors.muted,
                  ),
                ),
                if (helper != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    helper!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 9.5,
                      height: 1.3,
                      color: dark
                          ? FleetColors.white.withValues(alpha: .55)
                          : FleetColors.muted,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, this.overrideColor});

  final String label;
  final Color? overrideColor;

  Color get color {
    if (overrideColor != null) return overrideColor!;
    switch (label) {
      case 'Available':
      case 'Completed':
      case 'Active':
      case 'Compliant':
      case 'Up to date':
        return FleetColors.green;
      case 'Maintenance':
      case 'Cancelled':
      case 'Overdue':
      case 'Expired':
      case 'Voided':
        return FleetColors.red;
      case 'On hire':
      case 'Assigned':
        return FleetColors.ink;
      default:
        return FleetColors.muted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
      child: Column(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: FleetColors.canvas,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: FleetColors.muted, size: 22),
          ),
          const SizedBox(height: 11),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
            ),
          ),
          const SizedBox(height: 5),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                color: FleetColors.muted,
                height: 1.5,
              ),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 15),
            FilledButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(actionLabel!),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.ink,
                foregroundColor: FleetColors.white,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class InlineAlert extends StatelessWidget {
  const InlineAlert({
    super.key,
    required this.message,
    this.onDismiss,
    this.tone = AlertTone.error,
  });

  final String message;
  final VoidCallback? onDismiss;
  final AlertTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      AlertTone.error => FleetColors.red,
      AlertTone.warning => FleetColors.red,
      AlertTone.success => FleetColors.green,
      AlertTone.info => FleetColors.ink,
    };
    final icon = switch (tone) {
      AlertTone.error => Icons.error_outline_rounded,
      AlertTone.warning => Icons.warning_amber_rounded,
      AlertTone.success => Icons.check_circle_outline_rounded,
      AlertTone.info => Icons.info_outline_rounded,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: FleetColors.white,
        border: Border.all(color: color.withValues(alpha: .35)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 11.5,
                color: FleetColors.ink,
                height: 1.42,
              ),
            ),
          ),
          if (onDismiss != null)
            InkWell(
              onTap: onDismiss,
              child: const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.close_rounded, size: 16),
              ),
            ),
        ],
      ),
    );
  }
}

enum AlertTone { error, warning, success, info }

class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.text,
    this.icon = Icons.info_outline_rounded,
    this.tone = AlertTone.info,
  });

  final String text;
  final IconData icon;
  final AlertTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      AlertTone.error || AlertTone.warning => FleetColors.red,
      AlertTone.success => FleetColors.green,
      AlertTone.info => FleetColors.ink,
    };
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: tone == AlertTone.info
            ? FleetColors.warmGrey.withValues(alpha: .42)
            : color.withValues(alpha: .07),
        borderRadius: BorderRadius.circular(13),
        border: tone == AlertTone.info
            ? null
            : Border.all(color: color.withValues(alpha: .25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 10.5,
                height: 1.5,
                color: FleetColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LocalDataNotice extends StatelessWidget {
  const LocalDataNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return const InfoBanner(
      icon: Icons.phone_android_rounded,
      text:
          'Local records are stored only on this device. They are not synced '
          'or shared. Roles are not securely enforced until authentication and '
          'a shared backend exist.',
    );
  }
}

class FormSectionTitle extends StatelessWidget {
  const FormSectionTitle(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) => Text(
    title,
    style: const TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w800,
      color: FleetColors.ink,
    ),
  );
}

class AppDateField extends StatelessWidget {
  const AppDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.required = false,
    this.helper,
  });

  final String label;
  final String? value;
  final ValueChanged<String?> onChanged;
  final bool required;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final picked = await pickIsoDate(
          context,
          initial: value,
          helpText: label,
        );
        if (picked != null) onChanged(picked);
      },
      borderRadius: BorderRadius.circular(14),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: required ? '$label *' : label,
          helperText: helper,
          suffixIcon: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (value != null)
                IconButton(
                  tooltip: 'Clear date',
                  onPressed: () => onChanged(null),
                  icon: const Icon(Icons.close_rounded, size: 16),
                ),
              const Padding(
                padding: EdgeInsets.only(right: 10),
                child: Icon(Icons.calendar_today_outlined, size: 16),
              ),
            ],
          ),
        ),
        child: Text(
          value == null ? 'Not set' : formatDate(value),
          style: TextStyle(
            fontSize: 14,
            color: value == null ? FleetColors.muted : FleetColors.ink,
          ),
        ),
      ),
    );
  }
}

class DetailRow extends StatelessWidget {
  const DetailRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: FleetColors.muted,
                height: 1.4,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 11.5,
                color: valueColor ?? FleetColors.ink,
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class DateFilterChip extends StatelessWidget {
  const DateFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: FleetColors.ink,
      labelStyle: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: selected ? FleetColors.white : FleetColors.ink,
      ),
      side: BorderSide(
        color: selected ? FleetColors.ink : FleetColors.warmGrey,
      ),
      backgroundColor: FleetColors.white,
    );
  }
}

Future<String?> pickIsoDate(
  BuildContext context, {
  String? initial,
  String? helpText,
  DateTime? firstDate,
  DateTime? lastDate,
}) async {
  final now = DateTime.now();
  final parsed = parseIsoDate(initial);
  final selected = await showDatePicker(
    context: context,
    initialDate: parsed ?? now,
    firstDate: firstDate ?? DateTime(1990),
    lastDate: lastDate ?? DateTime(now.year + 20, 12, 31),
    helpText: helpText,
  );
  return selected == null ? null : dateToIso(selected);
}

Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(message, style: const TextStyle(height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          style: FilledButton.styleFrom(
            backgroundColor: destructive ? FleetColors.red : FleetColors.ink,
            foregroundColor: FleetColors.white,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

Future<String?> showReasonDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Void entry',
}) async {
  final controller = TextEditingController();
  final reason = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: const TextStyle(height: 1.5)),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            autofocus: true,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Reason for voiding *',
              hintText: 'e.g. Duplicate entry, wrong amount',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final value = controller.text.trim();
            if (value.isEmpty) return;
            Navigator.pop(dialogContext, value);
          },
          style: FilledButton.styleFrom(
            backgroundColor: FleetColors.red,
            foregroundColor: FleetColors.white,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  controller.dispose();
  return reason;
}

void showAppMessage(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: error ? FleetColors.red : FleetColors.ink,
        content: Row(
          children: [
            Icon(
              error
                  ? Icons.error_outline_rounded
                  : Icons.check_circle_outline_rounded,
              size: 18,
              color: FleetColors.white,
            ),
            const SizedBox(width: 9),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
}

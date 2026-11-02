import 'package:flutter/material.dart';

abstract final class FleetColors {
  /// Soft porcelain workspace. Matches the neutral in the brand palette.
  static const canvas = Color(0xFFF4F4F1);

  /// Cards and panels sit just above the canvas.
  static const surface = Color(0xFFFFFFFF);

  /// Quiet borders and dividers.
  static const warmGrey = Color(0xFFE1DBD7);

  /// Secondary copy with enough contrast on the warm canvas.
  static const muted = Color(0xFF6B6864);

  /// Hints, metadata, and disabled copy.
  static const faint = Color(0xFF9B9994);

  /// The warm near-black in the IP Motors identity.
  static const ink = Color(0xFF221516);

  /// Deep black used for hero surfaces, splash, and brand panels.
  static const obsidian = Color(0xFF0B0B0C);

  /// Brushed-metal accents from the logo.
  static const steel = Color(0xFFA8A6A1);
  static const silver = Color(0xFFC9C7C3);
  static const mist = Color(0xFFECEAE6);

  /// Reserved for urgent, overdue, voided, and destructive states.
  static const red = Color(0xFFD21F2C);

  static const white = Color(0xFFFFFFFF);

  /// Positive states stay in the neutral family.
  static const success = ink;

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [obsidian, Color(0xFF2B2729)],
  );

  static const cardShadow = [
    BoxShadow(color: Color(0x1A221516), blurRadius: 22, offset: Offset(0, 8)),
  ];
}

ThemeData buildFleetTheme() {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
  final scheme =
      ColorScheme.fromSeed(
        seedColor: FleetColors.ink,
        brightness: Brightness.light,
      ).copyWith(
        primary: FleetColors.ink,
        onPrimary: FleetColors.white,
        secondary: FleetColors.ink,
        onSecondary: FleetColors.white,
        tertiary: FleetColors.steel,
        onTertiary: FleetColors.white,
        error: FleetColors.red,
        onError: FleetColors.white,
        surface: FleetColors.surface,
        onSurface: FleetColors.ink,
        outline: FleetColors.warmGrey,
        outlineVariant: FleetColors.warmGrey,
        surfaceContainerLowest: FleetColors.canvas,
        surfaceContainerLow: FleetColors.canvas,
        surfaceContainer: FleetColors.mist,
      );

  final textTheme = base.textTheme
      .apply(fontFamily: 'Manrope')
      .copyWith(
        displaySmall: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 34,
          height: 1.05,
          letterSpacing: -1.3,
          fontWeight: FontWeight.w800,
          color: FleetColors.ink,
        ),
        headlineMedium: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 30,
          height: 1.08,
          letterSpacing: -1.1,
          fontWeight: FontWeight.w800,
          color: FleetColors.ink,
        ),
        headlineSmall: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 22,
          height: 1.15,
          letterSpacing: -.6,
          fontWeight: FontWeight.w800,
          color: FleetColors.ink,
        ),
        titleLarge: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 18,
          height: 1.25,
          letterSpacing: -.3,
          fontWeight: FontWeight.w800,
          color: FleetColors.ink,
        ),
        titleMedium: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 15,
          height: 1.3,
          letterSpacing: -.15,
          fontWeight: FontWeight.w700,
          color: FleetColors.ink,
        ),
        bodyLarge: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 14,
          height: 1.5,
          color: FleetColors.ink,
        ),
        bodyMedium: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 12.5,
          height: 1.5,
          color: FleetColors.ink,
        ),
        bodySmall: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 11,
          height: 1.45,
          color: FleetColors.muted,
        ),
        labelLarge: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          letterSpacing: .1,
        ),
        labelMedium: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          letterSpacing: .4,
          color: FleetColors.muted,
        ),
        labelSmall: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: .8,
          color: FleetColors.muted,
        ),
      );

  final buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(14),
  );

  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Manrope',
    colorScheme: scheme,
    textTheme: textTheme,
    scaffoldBackgroundColor: FleetColors.canvas,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: FleetColors.surface,
      foregroundColor: FleetColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 64,
      backgroundColor: FleetColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: FleetColors.mist,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return IconThemeData(
          size: 21,
          color: states.contains(WidgetState.selected)
              ? FleetColors.ink
              : FleetColors.faint,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontFamily: 'Manrope',
          fontSize: 10,
          letterSpacing: .1,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          color: selected ? FleetColors.ink : FleetColors.faint,
        );
      }),
    ),
    cardTheme: CardThemeData(
      color: FleetColors.surface,
      surfaceTintColor: Colors.transparent,
      shadowColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: FleetColors.warmGrey, width: .7),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FleetColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      hintStyle: const TextStyle(
        fontFamily: 'Manrope',
        fontSize: 12.5,
        color: FleetColors.faint,
        fontWeight: FontWeight.w500,
      ),
      labelStyle: const TextStyle(
        fontFamily: 'Manrope',
        fontSize: 12,
        color: FleetColors.muted,
      ),
      floatingLabelStyle: const TextStyle(
        fontFamily: 'Manrope',
        fontSize: 12,
        color: FleetColors.ink,
        fontWeight: FontWeight.w700,
      ),
      prefixIconColor: FleetColors.muted,
      suffixIconColor: FleetColors.muted,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FleetColors.warmGrey),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FleetColors.warmGrey),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FleetColors.ink, width: 1.4),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FleetColors.red),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: FleetColors.red, width: 1.4),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FleetColors.ink,
        foregroundColor: FleetColors.white,
        disabledBackgroundColor: FleetColors.mist,
        disabledForegroundColor: FleetColors.faint,
        minimumSize: const Size(0, 46),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        elevation: 0,
        shape: buttonShape,
        textStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          letterSpacing: .1,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        backgroundColor: FleetColors.surface,
        foregroundColor: FleetColors.ink,
        minimumSize: const Size(0, 46),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        side: const BorderSide(color: FleetColors.warmGrey),
        shape: buttonShape,
        textStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          letterSpacing: .1,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: FleetColors.ink,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: FleetColors.ink,
        highlightColor: FleetColors.mist,
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: FleetColors.surface,
      selectedColor: FleetColors.ink,
      secondarySelectedColor: FleetColors.ink,
      disabledColor: FleetColors.canvas,
      side: const BorderSide(color: FleetColors.warmGrey),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
      labelStyle: const TextStyle(
        fontFamily: 'Manrope',
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: FleetColors.ink,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: FleetColors.obsidian,
      contentTextStyle: const TextStyle(
        fontFamily: 'Manrope',
        color: FleetColors.white,
        fontSize: 12,
        height: 1.4,
      ),
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    dividerTheme: const DividerThemeData(
      color: FleetColors.warmGrey,
      thickness: .7,
      space: .7,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: FleetColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      titleTextStyle: textTheme.titleLarge,
      contentTextStyle: textTheme.bodyMedium,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: FleetColors.canvas,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: FleetColors.canvas,
      modalBarrierColor: Color(0x73221516),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: FleetColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: FleetColors.warmGrey, width: .7),
      ),
      textStyle: textTheme.bodyMedium,
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: FleetColors.ink,
      textColor: FleetColors.ink,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: const WidgetStatePropertyAll(FleetColors.white),
      trackColor: WidgetStateProperty.resolveWith((states) {
        return states.contains(WidgetState.selected)
            ? FleetColors.ink
            : FleetColors.warmGrey;
      }),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: FleetColors.ink,
      linearTrackColor: FleetColors.mist,
      circularTrackColor: FleetColors.mist,
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        visualDensity: VisualDensity.compact,
        side: const WidgetStatePropertyAll(
          BorderSide(color: FleetColors.warmGrey),
        ),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
        ),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected)
              ? FleetColors.ink
              : FleetColors.surface;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected)
              ? FleetColors.white
              : FleetColors.ink;
        }),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(
            fontFamily: 'Manrope',
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: FleetColors.obsidian,
        borderRadius: BorderRadius.circular(9),
      ),
      textStyle: const TextStyle(
        fontFamily: 'Manrope',
        color: FleetColors.white,
        fontSize: 11,
      ),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: FleetColors.surface,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: FleetColors.ink,
      headerForegroundColor: FleetColors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(
        FleetColors.muted.withValues(alpha: .35),
      ),
      radius: const Radius.circular(10),
    ),
  );
}

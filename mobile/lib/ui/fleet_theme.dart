import 'package:flutter/material.dart';

abstract final class FleetColors {
  static const canvas = Color(0xFFF2F2F2);
  static const warmGrey = Color(0xFFDAD9D4);
  static const muted = Color(0xFF9D9C98);
  static const ink = Color(0xFF131313);
  static const red = Color(0xFFE63D3A);
  static const green = Color(0xFF287A55);
  static const white = Colors.white;
}

ThemeData buildFleetTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: FleetColors.red,
    brightness: Brightness.light,
    primary: FleetColors.red,
    surface: FleetColors.white,
    error: FleetColors.red,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: FleetColors.canvas,
    appBarTheme: const AppBarTheme(
      backgroundColor: FleetColors.white,
      foregroundColor: FleetColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: FleetColors.white,
      indicatorColor: FleetColors.red.withValues(alpha: .10),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 11,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? FleetColors.red : FleetColors.muted,
        );
      }),
    ),
    cardTheme: CardThemeData(
      color: FleetColors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: FleetColors.warmGrey, width: .7),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FleetColors.canvas,
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
        borderSide: const BorderSide(color: FleetColors.ink, width: 1.3),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: FleetColors.ink,
      contentTextStyle: const TextStyle(color: FleetColors.white),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(
      color: FleetColors.warmGrey,
      thickness: .7,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: FleetColors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
  );
}

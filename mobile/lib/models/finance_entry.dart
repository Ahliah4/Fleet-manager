class Income {
  const Income({
    this.id,
    required this.entryDate,
    required this.description,
    required this.amount,
    this.vehicleId,
    this.driverId,
    this.paymentMethod,
    this.reference,
    this.notes,
    this.isVoided = false,
    this.voidReason,
    this.voidedAt,
    this.vehicleRegistration,
    this.vehicleName,
    this.driverName,
    this.createdAt,
  });

  final int? id;
  final String entryDate;
  final String description;
  final double amount;
  final int? vehicleId;
  final int? driverId;
  final String? paymentMethod;
  final String? reference;
  final String? notes;
  final bool isVoided;
  final String? voidReason;
  final String? voidedAt;
  final String? vehicleRegistration;
  final String? vehicleName;
  final String? driverName;
  final String? createdAt;

  Map<String, Object?> toMap() => {
    'id': id,
    'entry_date': entryDate,
    'description': description.trim(),
    'amount': amount,
    'vehicle_id': vehicleId,
    'driver_id': driverId,
    'payment_method': paymentMethod,
    'reference': reference?.trim(),
    'notes': notes?.trim(),
    'is_voided': isVoided ? 1 : 0,
    'void_reason': voidReason,
    'voided_at': voidedAt,
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
  };

  factory Income.fromMap(Map<String, Object?> map) => Income(
    id: map['id'] as int?,
    entryDate: map['entry_date'] as String,
    description: map['description'] as String,
    amount: (map['amount'] as num).toDouble(),
    vehicleId: map['vehicle_id'] as int?,
    driverId: map['driver_id'] as int?,
    paymentMethod: map['payment_method'] as String?,
    reference: map['reference'] as String?,
    notes: map['notes'] as String?,
    isVoided: (map['is_voided'] as int? ?? 0) == 1,
    voidReason: map['void_reason'] as String?,
    voidedAt: map['voided_at'] as String?,
    vehicleRegistration: map['vehicle_registration'] as String?,
    vehicleName: map['vehicle_name'] as String?,
    driverName: map['driver_name'] as String?,
    createdAt: map['created_at'] as String?,
  );
}

class Remittance {
  const Remittance({
    this.id,
    required this.entryDate,
    required this.driverId,
    required this.periodStart,
    required this.periodEnd,
    required this.amount,
    this.vehicleId,
    this.paymentMethod,
    this.reference,
    this.notes,
    this.isVoided = false,
    this.voidReason,
    this.voidedAt,
    this.driverName,
    this.vehicleRegistration,
    this.vehicleName,
    this.createdAt,
  });

  final int? id;
  final String entryDate;
  final int driverId;
  final String periodStart;
  final String periodEnd;
  final double amount;
  final int? vehicleId;
  final String? paymentMethod;
  final String? reference;
  final String? notes;
  final bool isVoided;
  final String? voidReason;
  final String? voidedAt;
  final String? driverName;
  final String? vehicleRegistration;
  final String? vehicleName;
  final String? createdAt;

  Map<String, Object?> toMap() => {
    'id': id,
    'entry_date': entryDate,
    'driver_id': driverId,
    'period_start': periodStart,
    'period_end': periodEnd,
    'amount': amount,
    'vehicle_id': vehicleId,
    'payment_method': paymentMethod,
    'reference': reference?.trim(),
    'notes': notes?.trim(),
    'is_voided': isVoided ? 1 : 0,
    'void_reason': voidReason,
    'voided_at': voidedAt,
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
  };

  factory Remittance.fromMap(Map<String, Object?> map) => Remittance(
    id: map['id'] as int?,
    entryDate: map['entry_date'] as String,
    driverId: map['driver_id'] as int,
    periodStart: map['period_start'] as String,
    periodEnd: map['period_end'] as String,
    amount: (map['amount'] as num).toDouble(),
    vehicleId: map['vehicle_id'] as int?,
    paymentMethod: map['payment_method'] as String?,
    reference: map['reference'] as String?,
    notes: map['notes'] as String?,
    isVoided: (map['is_voided'] as int? ?? 0) == 1,
    voidReason: map['void_reason'] as String?,
    voidedAt: map['voided_at'] as String?,
    driverName: map['driver_name'] as String?,
    vehicleRegistration: map['vehicle_registration'] as String?,
    vehicleName: map['vehicle_name'] as String?,
    createdAt: map['created_at'] as String?,
  );
}

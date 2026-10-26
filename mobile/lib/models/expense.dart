class Expense {
  const Expense({
    this.id,
    required this.vehicleId,
    required this.entryDate,
    required this.category,
    required this.description,
    required this.amount,
    this.supplier,
    this.paymentMethod,
    this.notes,
    this.isVoided = false,
    this.voidReason,
    this.voidedAt,
    this.vehicleRegistration,
    this.vehicleName,
    this.createdAt,
  });

  final int? id;
  final int vehicleId;
  final String entryDate;
  final String category;
  final String description;
  final double amount;
  final String? supplier;
  final String? paymentMethod;
  final String? notes;
  final bool isVoided;
  final String? voidReason;
  final String? voidedAt;
  final String? vehicleRegistration;
  final String? vehicleName;
  final String? createdAt;

  Map<String, Object?> toMap() => {
    'id': id,
    'vehicle_id': vehicleId,
    'entry_date': entryDate,
    'category': category,
    'description': description.trim(),
    'amount': amount,
    'supplier': supplier?.trim(),
    'payment_method': paymentMethod,
    'notes': notes?.trim(),
    'is_voided': isVoided ? 1 : 0,
    'void_reason': voidReason,
    'voided_at': voidedAt,
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
  };

  factory Expense.fromMap(Map<String, Object?> map) => Expense(
    id: map['id'] as int?,
    vehicleId: map['vehicle_id'] as int,
    entryDate: map['entry_date'] as String,
    category: (map['category'] as String?) ?? 'Other',
    description: map['description'] as String,
    amount: (map['amount'] as num).toDouble(),
    supplier: map['supplier'] as String?,
    paymentMethod: map['payment_method'] as String?,
    notes: map['notes'] as String?,
    isVoided: (map['is_voided'] as int? ?? 0) == 1,
    voidReason: map['void_reason'] as String?,
    voidedAt: map['voided_at'] as String?,
    vehicleRegistration: map['vehicle_registration'] as String?,
    vehicleName: map['vehicle_name'] as String?,
    createdAt: map['created_at'] as String?,
  );
}

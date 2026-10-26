class Driver {
  const Driver({
    this.id,
    required this.name,
    this.phone,
    this.licenceNumber,
    this.licenceExpiry,
    this.isAvailable = true,
    this.notes,
    this.assignedVehicleId,
    this.assignedVehicleRegistration,
    this.assignedVehicleName,
    this.createdAt,
    this.updatedAt,
  });

  final int? id;
  final String name;
  final String? phone;
  final String? licenceNumber;
  final String? licenceExpiry;
  final bool isAvailable;
  final String? notes;
  final int? assignedVehicleId;
  final String? assignedVehicleRegistration;
  final String? assignedVehicleName;
  final String? createdAt;
  final String? updatedAt;

  String get availability {
    if (assignedVehicleId != null) return 'Assigned';
    return isAvailable ? 'Available' : 'Unavailable';
  }

  Map<String, Object?> toMap() => {
    'id': id,
    'name': name.trim(),
    'phone': phone?.trim(),
    'licence_number': licenceNumber?.trim(),
    'licence_expiry': licenceExpiry,
    'is_available': isAvailable ? 1 : 0,
    'notes': notes?.trim(),
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
    'updated_at': updatedAt ?? DateTime.now().toIso8601String(),
  };

  factory Driver.fromMap(Map<String, Object?> map) => Driver(
    id: map['id'] as int?,
    name: map['name'] as String,
    phone: map['phone'] as String?,
    licenceNumber: map['licence_number'] as String?,
    licenceExpiry: map['licence_expiry'] as String?,
    isAvailable: (map['is_available'] as int? ?? 1) == 1,
    notes: map['notes'] as String?,
    assignedVehicleId: map['assigned_vehicle_id'] as int?,
    assignedVehicleRegistration:
        map['assigned_vehicle_registration'] as String?,
    assignedVehicleName: map['assigned_vehicle_name'] as String?,
    createdAt: map['created_at'] as String?,
    updatedAt: map['updated_at'] as String?,
  );
}

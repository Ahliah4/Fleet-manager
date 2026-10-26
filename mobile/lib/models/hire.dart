class Hire {
  const Hire({
    this.id,
    required this.vehicleId,
    this.driverId,
    required this.startDate,
    this.endDate,
    this.status = 'Active',
    this.notes,
    this.vehicleRegistration,
    this.vehicleName,
    this.driverName,
    this.createdAt,
    this.updatedAt,
  });

  final int? id;
  final int vehicleId;
  final int? driverId;
  final String startDate;
  final String? endDate;
  final String status;
  final String? notes;
  final String? vehicleRegistration;
  final String? vehicleName;
  final String? driverName;
  final String? createdAt;
  final String? updatedAt;

  bool get isActive => status == 'Active';

  Hire copyWith({
    int? id,
    int? vehicleId,
    int? driverId,
    String? startDate,
    String? endDate,
    String? status,
    String? notes,
    String? createdAt,
    String? updatedAt,
  }) {
    return Hire(
      id: id ?? this.id,
      vehicleId: vehicleId ?? this.vehicleId,
      driverId: driverId ?? this.driverId,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      status: status ?? this.status,
      notes: notes ?? this.notes,
      vehicleRegistration: vehicleRegistration,
      vehicleName: vehicleName,
      driverName: driverName,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, Object?> toMap() => {
    'id': id,
    'vehicle_id': vehicleId,
    'driver_id': driverId,
    'start_date': startDate,
    'end_date': endDate,
    'status': status,
    'notes': notes?.trim(),
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
    'updated_at': updatedAt ?? DateTime.now().toIso8601String(),
  };

  factory Hire.fromMap(Map<String, Object?> map) => Hire(
    id: map['id'] as int?,
    vehicleId: map['vehicle_id'] as int,
    driverId: map['driver_id'] as int?,
    startDate: map['start_date'] as String,
    endDate: map['end_date'] as String?,
    status: (map['status'] as String?) ?? 'Active',
    notes: map['notes'] as String?,
    vehicleRegistration: map['vehicle_registration'] as String?,
    vehicleName: map['vehicle_name'] as String?,
    driverName: map['driver_name'] as String?,
    createdAt: map['created_at'] as String?,
    updatedAt: map['updated_at'] as String?,
  );
}

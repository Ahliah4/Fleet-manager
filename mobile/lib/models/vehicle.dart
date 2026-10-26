class Vehicle {
  const Vehicle({
    this.id,
    required this.registrationNumber,
    required this.make,
    required this.model,
    this.year,
    this.colour,
    this.status = 'Available',
    this.insuranceExpiry,
    this.roadTaxExpiry,
    this.roadworthyExpiry,
    this.nextServiceDate,
    this.notes,
    this.assignedDriverId,
    this.assignedDriverName,
    this.createdAt,
    this.updatedAt,
  });

  final int? id;
  final String registrationNumber;
  final String make;
  final String model;
  final int? year;
  final String? colour;
  final String status;
  final String? insuranceExpiry;
  final String? roadTaxExpiry;
  final String? roadworthyExpiry;
  final String? nextServiceDate;
  final String? notes;
  final int? assignedDriverId;
  final String? assignedDriverName;
  final String? createdAt;
  final String? updatedAt;

  String get registrationKey =>
      registrationNumber.toUpperCase().replaceAll(RegExp(r'\s+'), '');

  String get displayName => '$make $model';

  Vehicle copyWith({
    int? id,
    String? registrationNumber,
    String? make,
    String? model,
    int? year,
    String? colour,
    String? status,
    String? insuranceExpiry,
    String? roadTaxExpiry,
    String? roadworthyExpiry,
    String? nextServiceDate,
    String? notes,
    int? assignedDriverId,
    String? assignedDriverName,
    String? createdAt,
    String? updatedAt,
  }) {
    return Vehicle(
      id: id ?? this.id,
      registrationNumber: registrationNumber ?? this.registrationNumber,
      make: make ?? this.make,
      model: model ?? this.model,
      year: year ?? this.year,
      colour: colour ?? this.colour,
      status: status ?? this.status,
      insuranceExpiry: insuranceExpiry ?? this.insuranceExpiry,
      roadTaxExpiry: roadTaxExpiry ?? this.roadTaxExpiry,
      roadworthyExpiry: roadworthyExpiry ?? this.roadworthyExpiry,
      nextServiceDate: nextServiceDate ?? this.nextServiceDate,
      notes: notes ?? this.notes,
      assignedDriverId: assignedDriverId ?? this.assignedDriverId,
      assignedDriverName: assignedDriverName ?? this.assignedDriverName,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, Object?> toMap() => {
    'id': id,
    'registration_number': registrationNumber.trim().toUpperCase(),
    'registration_key': registrationKey,
    'make': make.trim(),
    'model': model.trim(),
    'year': year,
    'colour': colour?.trim(),
    'status': status,
    'insurance_expiry': insuranceExpiry,
    'road_tax_expiry': roadTaxExpiry,
    'roadworthy_expiry': roadworthyExpiry,
    'next_service_date': nextServiceDate,
    'notes': notes?.trim(),
    'assigned_driver_id': assignedDriverId,
    'created_at': createdAt ?? DateTime.now().toIso8601String(),
    'updated_at': updatedAt ?? DateTime.now().toIso8601String(),
  };

  factory Vehicle.fromMap(Map<String, Object?> map) => Vehicle(
    id: map['id'] as int?,
    registrationNumber: map['registration_number'] as String,
    make: map['make'] as String,
    model: map['model'] as String,
    year: map['year'] as int?,
    colour: map['colour'] as String?,
    status: (map['status'] as String?) ?? 'Available',
    insuranceExpiry: map['insurance_expiry'] as String?,
    roadTaxExpiry: map['road_tax_expiry'] as String?,
    roadworthyExpiry: map['roadworthy_expiry'] as String?,
    nextServiceDate: map['next_service_date'] as String?,
    notes: map['notes'] as String?,
    assignedDriverId: map['assigned_driver_id'] as int?,
    assignedDriverName: map['assigned_driver_name'] as String?,
    createdAt: map['created_at'] as String?,
    updatedAt: map['updated_at'] as String?,
  );
}

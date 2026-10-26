import { z } from "zod";
import {
  currencySchema,
  dateSchema,
  moneySchema,
  optionalText,
  paginationSchema,
  requiredText,
  searchSchema,
  timestampSchema,
  uuidSchema,
  yearSchema,
} from "../domain/validation.js";

const registrationNumberSchema = requiredText(24).transform((value) =>
  value.toUpperCase(),
);

export const vehicleBodySchema = z
  .object({
    registrationNumber: registrationNumberSchema,
    make: requiredText(60),
    model: requiredText(60),
    year: yearSchema,
    colour: optionalText(40),
    notes: optionalText(2_000),
    insuranceExpiry: dateSchema.nullable().optional(),
    roadTaxExpiry: dateSchema.nullable().optional(),
    roadworthyExpiry: dateSchema.nullable().optional(),
    nextServiceDate: dateSchema.nullable().optional(),
  })
  .strict();

export const vehicleUpdateSchema = vehicleBodySchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
    path: ["_request"],
  });

export const vehicleQuerySchema = paginationSchema.extend({
  search: searchSchema,
});

export const vehicleIdParamsSchema = z
  .object({
    vehicleId: uuidSchema,
  })
  .strict();

export const driverBodySchema = z
  .object({
    fullName: requiredText(120),
    phone: optionalText(32),
    licenceNumber: optionalText(40),
    licenceExpiry: dateSchema.nullable().optional(),
    status: z.enum(["active", "inactive"]).default("active"),
    notes: optionalText(2_000),
  })
  .strict();

export const driverUpdateSchema = z
  .object({
    fullName: requiredText(120).optional(),
    phone: optionalText(32),
    licenceNumber: optionalText(40),
    licenceExpiry: dateSchema.nullable().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    notes: optionalText(2_000),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
    path: ["_request"],
  });

export const driverQuerySchema = paginationSchema.extend({
  search: searchSchema,
  status: z.enum(["active", "inactive"]).optional(),
});

export const driverIdParamsSchema = z
  .object({
    driverId: uuidSchema,
  })
  .strict();

export const hireBodySchema = z
  .object({
    vehicleId: uuidSchema,
    driverId: uuidSchema,
    status: z.enum(["planned", "active", "completed", "cancelled"]).default("planned"),
    startsAt: timestampSchema,
    expectedEndAt: timestampSchema.nullable().optional(),
    actualEndAt: timestampSchema.nullable().optional(),
    notes: optionalText(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.expectedEndAt && value.expectedEndAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        message: "The expected end must be after the start.",
        path: ["expectedEndAt"],
      });
    }
    if (value.actualEndAt && value.actualEndAt < value.startsAt) {
      context.addIssue({
        code: "custom",
        message: "The actual end must be at or after the start.",
        path: ["actualEndAt"],
      });
    }
  });

export const hireUpdateSchema = z
  .object({
    vehicleId: uuidSchema.optional(),
    driverId: uuidSchema.optional(),
    status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
    startsAt: timestampSchema.optional(),
    expectedEndAt: timestampSchema.nullable().optional(),
    actualEndAt: timestampSchema.nullable().optional(),
    notes: optionalText(2_000),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
    path: ["_request"],
  });

export const hireQuerySchema = paginationSchema.extend({
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
  vehicleId: uuidSchema.optional(),
  driverId: uuidSchema.optional(),
});

export const hireIdParamsSchema = z
  .object({
    hireId: uuidSchema,
  })
  .strict();

export const expenseBodySchema = z
  .object({
    vehicleId: uuidSchema,
    entryDate: dateSchema,
    category: requiredText(80),
    description: requiredText(500),
    amount: moneySchema,
    currency: currencySchema,
    supplier: optionalText(120),
    paymentMethod: optionalText(40),
    notes: optionalText(1_000),
  })
  .strict();

export const incomeBodySchema = z
  .object({
    entryDate: dateSchema,
    description: requiredText(500),
    amount: moneySchema,
    currency: currencySchema,
    vehicleId: uuidSchema.nullable().optional(),
    driverId: uuidSchema.nullable().optional(),
    paymentMethod: optionalText(40),
    reference: optionalText(80),
    notes: optionalText(1_000),
  })
  .strict();

export const remittanceBodySchema = z
  .object({
    entryDate: dateSchema,
    driverId: uuidSchema,
    periodStart: dateSchema,
    periodEnd: dateSchema,
    amount: moneySchema,
    currency: currencySchema,
    vehicleId: uuidSchema.nullable().optional(),
    paymentMethod: optionalText(40),
    reference: optionalText(80),
    notes: optionalText(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.periodEnd < value.periodStart) {
      context.addIssue({
        code: "custom",
        message: "The period end must be on or after the period start.",
        path: ["periodEnd"],
      });
    }
  });

export const financeQuerySchema = paginationSchema
  .extend({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    vehicleId: uuidSchema.optional(),
    driverId: uuidSchema.optional(),
    status: z.enum(["posted", "voided"]).optional(),
    search: searchSchema,
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.to < value.from) {
      context.addIssue({
        code: "custom",
        message: "The end date must be on or after the start date.",
        path: ["to"],
      });
    }
  });

export const financeIdParamsSchema = z
  .object({
    recordId: uuidSchema,
  })
  .strict();

export const voidBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, "Give a short reason for voiding this record.")
      .max(500, "Use 500 characters or fewer."),
  })
  .strict();

export const platformFleetParamsSchema = z
  .object({
    fleetId: uuidSchema,
  })
  .strict();

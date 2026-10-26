import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const dateSchema = z
  .string()
  .regex(DATE_PATTERN, "Use the date format YYYY-MM-DD.")
  .refine(isValidCalendarDate, "Enter a real calendar date.");

export const timestampSchema = z
  .string()
  .datetime({ offset: true, message: "Use an ISO 8601 date and time." })
  .transform((value) => new Date(value));

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CURRENCY_PATTERN, "Use a three-letter ISO currency code, such as ZMW.")
  .default("ZMW");

export const moneySchema = z
  .union([
    z.number().finite().positive().max(999_999_999_999.99),
    z.string().regex(DECIMAL_PATTERN, "Enter an amount with up to two decimals."),
  ])
  .transform((value) => {
    const numberValue = typeof value === "number" ? value : Number(value);
    return numberValue.toFixed(2);
  })
  .refine((value) => Number(value) > 0, "Enter an amount greater than zero.");

export const yearSchema = z.number().int().min(1900).max(2100);

export const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(max, `Use ${max} characters or fewer.`).nullable().optional(),
  );

export const requiredText = (max: number) =>
  z.string().trim().min(1, "This field is required.").max(max, `Use ${max} characters or fewer.`);

export const uuidSchema = z.string().uuid("Enter a valid record ID.");

export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const searchSchema = z
  .string()
  .trim()
  .max(100, "Use 100 characters or fewer.")
  .optional();

export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

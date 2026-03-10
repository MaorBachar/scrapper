import { createHash } from "crypto";

/**
 * Deterministic hash of property_key for indexing and FK use.
 * Avoids comma/special-char issues in PostgREST .in() queries.
 */
export function getPropertyKeyHash(propertyKey: string): string {
  return createHash("sha256").update(propertyKey).digest("hex");
}

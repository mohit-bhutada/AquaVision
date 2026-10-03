/**
 * PostgREST returns an embedded relation as a single OBJECT when it is one-to-one (e.g.
 * subscriptions.user_id is UNIQUE, credit_balances.user_id is the primary key) and as an ARRAY
 * when it is one-to-many. Reading `rel[0]` on the object form gives undefined, which made every
 * user look like they were on the Free plan with default balances. This accepts either shape.
 */
export function firstRow<T>(rel: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(rel)) return rel[0];
  return rel ?? undefined;
}
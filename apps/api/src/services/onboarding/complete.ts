import { and, eq, isNull, schema, type Db } from '@diguro/db';

/** Marks first-run onboarding as finished. Idempotent: the first completion
 *  time is kept. */
export async function completeOnboarding(
  deps: { db: Db },
  input: { userId: string },
): Promise<void> {
  await deps.db
    .update(schema.users)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.users.id, input.userId), isNull(schema.users.onboardingCompletedAt)));
}

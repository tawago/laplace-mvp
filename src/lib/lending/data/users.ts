import { eq } from 'drizzle-orm';

import { db, users } from '@/lib/db';

export async function getOrCreateUser(xrplAddress: string): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.xrplAddress, xrplAddress),
  });

  if (existing) {
    return existing.id;
  }

  const [newUser] = await db
    .insert(users)
    .values({ xrplAddress })
    .returning();

  return newUser.id;
}

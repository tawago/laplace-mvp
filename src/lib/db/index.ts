/**
 * Database Connection for Neon Postgres + Drizzle ORM
 *
 * Requires DATABASE_URL environment variable.
 * Fails fast with clear error if missing.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { getDatabaseUrl } from '@/lib/config/runtime';

// Create the Neon SQL client
const sql = neon(getDatabaseUrl());

// Create and export the typed Drizzle client
export const db = drizzle(sql, { schema });

// Re-export schema types for convenience
export * from './schema';

// Export type for the db instance
export type Database = typeof db;

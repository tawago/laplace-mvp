/**
 * Database Connection for Neon Postgres + Drizzle ORM
 *
 * Requires DATABASE_URL environment variable.
 * Fails fast with clear error if missing.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Validate DATABASE_URL at module load time
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is required.\n' +
        'Please configure your Neon database connection string in .env.local:\n' +
        'DATABASE_URL=postgres://user:pass@host/database?sslmode=require'
    );
  }
  return url;
}

// Create the Neon SQL client
const sql = neon(getDatabaseUrl());

// Create and export the typed Drizzle client
export const db = drizzle(sql, { schema });

// Re-export schema types for convenience
export * from './schema';

// Export type for the db instance
export type Database = typeof db;

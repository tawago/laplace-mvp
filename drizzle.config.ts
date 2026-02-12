import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

function getNonEmptyEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

const databaseUrl = getNonEmptyEnv('DATABASE_URL');

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it in .env.local');
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});

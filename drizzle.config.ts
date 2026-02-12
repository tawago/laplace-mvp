import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
if (process.env.NEXT_PUBLIC_XRPL_NETWORK === 'devnet') {
  dotenv.config({ path: '.env.devnet', override: true });
}

function getNonEmptyEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

const network = process.env.NEXT_PUBLIC_XRPL_NETWORK;

const databaseUrl = getNonEmptyEnv('DATABASE_URL');

if (!databaseUrl) {
  throw new Error(
    network === 'devnet'
      ? 'DATABASE_URL is required for devnet. Set it in .env.devnet'
      : 'DATABASE_URL is required. Set it in .env.local'
  );
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

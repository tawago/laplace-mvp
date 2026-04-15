import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

const envFilePath = process.env.ENV_FILE ?? '.env.local';

// Load environment variables
dotenv.config({ path: envFilePath });

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is required. Set it in ${envFilePath}`);
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});

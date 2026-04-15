import * as dotenv from 'dotenv';
import * as path from 'path';
import { neon } from '@neondatabase/serverless';

const envFilePath = process.env.ENV_FILE ?? '.env.local';

dotenv.config({ path: path.join(process.cwd(), envFilePath) });

function hasYesFlag(argv: string[]): boolean {
  return argv.includes('--yes');
}

async function main() {
  if (!hasYesFlag(process.argv.slice(2))) {
    console.error('Refusing to run without --yes. This operation drops the entire public schema.');
    console.error('Run: pnpm wipe:db:full -- --yes');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`DATABASE_URL is not set. Configure it in ${envFilePath} first.`);
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log('='.repeat(60));
  console.log('Full Database Wipe (Schema + Data)');
  console.log('='.repeat(60));
  console.log('Dropping schema public...');

  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO CURRENT_USER`;
  await sql`GRANT ALL ON SCHEMA public TO PUBLIC`;

  const remaining = (await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `) as Array<{ count: number }>;

  console.log(`Remaining public tables: ${remaining[0]?.count ?? 0}`);
  console.log();
  console.log('Wipe complete. Next steps:');
  console.log('  1) pnpm db:push');
  console.log('  2) pnpm setup:db');
}

main().catch((error) => {
  console.error('Failed to wipe database:', error);
  process.exit(1);
});

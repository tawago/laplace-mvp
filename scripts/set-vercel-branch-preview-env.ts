import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

type CliOptions = {
  branch?: string;
  envFilePath: string;
  databaseUrlPlaceholder?: string;
  token?: string;
  scope?: string;
};

const PREVIEW_TARGET = 'preview';
const REQUIRED_ENV_KEYS = [
  'ISSUER_WALLET_SEED',
  'BACKEND_WALLET_SEED',
  'ISSUER_ADDRESS',
  'BACKEND_ADDRESS',
] as const;

const OPTIONAL_ENV_KEYS = [
  'TOKEN_SAIL_CODE',
  'TOKEN_NYRA_CODE',
  'TOKEN_RLUSD_CODE',
  'NEXT_PUBLIC_TESTNET_URL',
  'NEXT_PUBLIC_TESTNET_EXPLORER',
] as const;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    envFilePath: path.join(process.cwd(), '.env.local'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--branch') {
      options.branch = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--env-file') {
      const raw = argv[i + 1];
      options.envFilePath = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
      i += 1;
      continue;
    }

    if (arg === '--database-url-placeholder') {
      options.databaseUrlPlaceholder = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--token') {
      options.token = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--scope') {
      options.scope = argv[i + 1];
      i += 1;
    }
  }

  return options;
}

function parseEnvFile(envFilePath: string): Record<string, string> {
  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Env file not found: ${envFilePath}`);
  }

  const content = fs.readFileSync(envFilePath, 'utf-8');
  return dotenv.parse(content);
}

function getCurrentGitBranch(): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  }).trim();
}

function buildVercelArgs(options: CliOptions, key: string, branch: string): string[] {
  const args = ['env', 'add', key, PREVIEW_TARGET, branch, '--force'];

  if (options.token) {
    args.push('--token', options.token);
  }

  if (options.scope) {
    args.push('--scope', options.scope);
  }

  return args;
}

function upsertEnvVar(options: CliOptions, key: string, value: string, branch: string): void {
  execFileSync('vercel', buildVercelArgs(options, key, branch), {
    cwd: process.cwd(),
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const branch = options.branch ?? getCurrentGitBranch();
  const envVars = parseEnvFile(options.envFilePath);

  for (const key of REQUIRED_ENV_KEYS) {
    if (!envVars[key]) {
      throw new Error(`Missing ${key} in ${options.envFilePath}`);
    }
  }

  const branchEnvVars: Record<string, string> = {
    DATABASE_URL:
      options.databaseUrlPlaceholder ?? `SET_ME_NEON_DATABASE_URL_FOR_${branch}`,
    ISSUER_WALLET_SEED: envVars.ISSUER_WALLET_SEED,
    BACKEND_WALLET_SEED: envVars.BACKEND_WALLET_SEED,
    ISSUER_ADDRESS: envVars.ISSUER_ADDRESS,
    BACKEND_ADDRESS: envVars.BACKEND_ADDRESS,
  };

  for (const key of OPTIONAL_ENV_KEYS) {
    const value = envVars[key];
    if (value) {
      branchEnvVars[key] = value;
    }
  }

  console.log('='.repeat(60));
  console.log('Vercel Branch Preview Env Setup');
  console.log('='.repeat(60));
  console.log(`Branch: ${branch}`);
  console.log(`Env file: ${options.envFilePath}`);
  console.log(`Target: ${PREVIEW_TARGET}`);
  console.log();

  for (const [key, value] of Object.entries(branchEnvVars)) {
    upsertEnvVar(options, key, value, branch);
    console.log(
      key === 'DATABASE_URL'
        ? `- Upserted ${key} with placeholder value for branch ${branch}`
        : `- Upserted ${key} for branch ${branch}`
    );
  }

  console.log();
  console.log('Done.');
  console.log(`These env vars now apply only to preview deployments for git branch ${branch}.`);
}

main();

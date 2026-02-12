import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const NETWORKS = {
  testnet: {
    wsUrl: 'wss://s.altnet.rippletest.net:51233',
    explorerUrl: 'https://testnet.xrpl.org',
    envFile: '.env.local',
  },
  devnet: {
    wsUrl: 'wss://s.devnet.rippletest.net:51233',
    explorerUrl: 'https://devnet.xrpl.org',
    envFile: '.env.devnet',
  },
};

function parseNetwork(argv) {
  if (argv.includes('--devnet')) return 'devnet';
  return 'testnet';
}

function ensureDatabaseUrl(selectedNetwork) {
  if (process.env.DATABASE_URL) {
    return;
  }

  throw new Error(
    selectedNetwork === 'devnet'
      ? 'Missing DATABASE_URL for devnet. Set DATABASE_URL in .env.devnet.'
      : 'Missing DATABASE_URL for testnet. Set DATABASE_URL in .env.local.'
  );
}

function loadEnvFiles(selectedNetwork) {
  const cwd = process.cwd();
  const rootEnvPath = path.join(cwd, '.env.local');

  dotenv.config({ path: rootEnvPath, override: false });

  const networkEnvFile = NETWORKS[selectedNetwork].envFile;
  const networkEnvPath = path.join(cwd, networkEnvFile);
  if (networkEnvFile !== '.env.local') {
    dotenv.config({ path: networkEnvPath, override: true });
  }
}

function applyRuntimeNetworkConfig(selectedNetwork) {
  const { wsUrl, explorerUrl } = NETWORKS[selectedNetwork];
  process.env.NEXT_PUBLIC_XRPL_NETWORK = selectedNetwork;
  process.env.NEXT_PUBLIC_TESTNET_URL = wsUrl;
  process.env.NEXT_PUBLIC_TESTNET_EXPLORER = explorerUrl;

  ensureDatabaseUrl(selectedNetwork);
}

function runNextDev() {
  const child = spawn('next', ['dev', '--experimental-https', '--port', '3001'], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function main() {
  const selectedNetwork = parseNetwork(process.argv.slice(2));
  loadEnvFiles(selectedNetwork);
  applyRuntimeNetworkConfig(selectedNetwork);

  console.log(`Starting Next.js with XRPL network: ${selectedNetwork}`);
  console.log(`XRPL WebSocket URL: ${process.env.NEXT_PUBLIC_TESTNET_URL}`);

  runNextDev();
}

main();

import { Client } from 'xrpl';

const TESTNET_URL = process.env.NEXT_PUBLIC_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233';

let clientInstance: Client | null = null;

/**
 * Get or create a singleton XRPL client for API routes
 */
export async function getClient(): Promise<Client> {
  if (!clientInstance) {
    clientInstance = new Client(TESTNET_URL);
  }

  if (!clientInstance.isConnected()) {
    await clientInstance.connect();
  }

  return clientInstance;
}

/**
 * Disconnect the XRPL client
 */
export async function disconnectClient(): Promise<void> {
  if (clientInstance && clientInstance.isConnected()) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}

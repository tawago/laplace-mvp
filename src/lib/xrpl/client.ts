import { Client } from 'xrpl';
import { getXrplWsUrl } from '@/lib/config/runtime';

let clientInstance: Client | null = null;

/**
 * Get or create a singleton XRPL client for API routes
 */
export async function getClient(): Promise<Client> {
  if (!clientInstance) {
    clientInstance = new Client(getXrplWsUrl());
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

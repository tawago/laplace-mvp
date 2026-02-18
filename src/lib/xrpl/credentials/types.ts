export const CREDENTIAL_TYPES = {
  KYC_VERIFIED: '4B59435F5645524946494544',
} as const;

export type CredentialTypeName = keyof typeof CREDENTIAL_TYPES;
export type VerificationLevel = 'none' | 'verified';

export interface Credential {
  issuer: string;
  subject: string;
  credentialTypeHex: string;
  accepted: boolean;
  expired: boolean;
  expiration?: number;
  uri?: string;
}

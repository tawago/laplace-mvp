import { Badge } from '@/components/ui/badge';
import type { Credential, VerificationLevel } from '@/lib/xrpl/credentials/types';
import { rippleToUnixTime } from '@/lib/xrpl/credentials/operations';
import { BadgeCheck, Shield } from 'lucide-react';

interface VerifiedBadgeProps {
  verificationLevel: VerificationLevel;
  isLoading?: boolean;
  verifiedCredential?: Credential;
  className?: string;
}

function toExpirationLabel(expiration?: number): string {
  if (typeof expiration !== 'number') {
    return 'No expiration';
  }

  const unixSeconds = rippleToUnixTime(expiration);
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function VerifiedBadge({ verificationLevel, isLoading, verifiedCredential, className }: VerifiedBadgeProps) {
  const issuer = verifiedCredential?.issuer ?? 'Unknown issuer';
  const credentialType = verifiedCredential?.credentialTypeHex ?? 'N/A';
  const expiration = toExpirationLabel(verifiedCredential?.expiration);

  const title = `Credential: ${credentialType}\nIssuer: ${issuer}\nExpiration: ${expiration}`;

  if (isLoading) {
    return (
      <Badge variant="secondary" className={className}>
        <Shield className="mr-1 h-3 w-3" />
        Checking
      </Badge>
    );
  }

  if (verificationLevel === 'verified') {
    return (
      <Badge
        className={`bg-blue-600 text-white hover:bg-blue-600 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-500 ${className ?? ''}`}
        title={title}
      >
        <BadgeCheck className="mr-1 h-3 w-3" />
        Verified
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className} title="No accepted KYC credential found">
      <Shield className="mr-1 h-3 w-3" />
      Unverified
    </Badge>
  );
}

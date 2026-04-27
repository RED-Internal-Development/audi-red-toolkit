const REFERRAL_ID_RE = /"referralId"\s*:\s*"([^"]+)"/;

interface PublishFailure {
  operation: string;
  title: string;
  statusCode: string;
  referralId?: string;
}

export class PublishStats {
  private readonly failures: PublishFailure[] = [];

  recordFailure(
    operation: string,
    title: string,
    statusCode: string,
    referralId?: string,
  ): void {
    this.failures.push({ operation, title, statusCode, referralId });
  }

  hasFailures(): boolean {
    return this.failures.length > 0;
  }

  renderSummary(): string {
    return [
      `MSI_PARTIAL_PUBLISH_FAILURE | publish | Found ${this.failures.length} page publish failure(s).`,
      ...this.failures.map((failure) =>
        [
          failure.operation,
          failure.title,
          failure.statusCode,
          failure.referralId,
        ]
          .filter(Boolean)
          .join(" | "),
      ),
    ].join("\n");
  }
}

export function extractReferralId(responseText: string): string | undefined {
  return REFERRAL_ID_RE.exec(responseText)?.[1];
}

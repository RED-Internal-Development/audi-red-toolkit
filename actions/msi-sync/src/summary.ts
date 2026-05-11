const REFERRAL_ID_RE = /"referralId"\s*:\s*"([^"]+)"/;
const MAX_RESPONSE_SNIPPET_LENGTH = 180;

type PublishTargetType = "page" | "attachment";

interface PublishFailureContext {
  targetType?: PublishTargetType;
  parentTitle?: string;
  responseBody?: string;
}

interface PublishFailure {
  operation: string;
  title: string;
  statusCode: string;
  referralId?: string;
  responseSnippet?: string;
  targetType: PublishTargetType;
  parentTitle?: string;
}

export class PublishStats {
  private readonly failures: PublishFailure[] = [];

  recordFailure(
    operation: string,
    title: string,
    statusCode: string,
    referralId?: string,
    context?: PublishFailureContext,
  ): void {
    this.failures.push({
      operation,
      title,
      statusCode,
      referralId,
      responseSnippet: summarizeResponseBody(context?.responseBody),
      targetType: context?.targetType ?? "page",
      parentTitle: context?.parentTitle,
    });
  }

  hasFailures(): boolean {
    return this.failures.length > 0;
  }

  renderSummary(): string {
    const byStep = new Map<string, number>();

    for (const failure of this.failures) {
      const key = `${failure.targetType}:${failure.operation}`;
      byStep.set(key, (byStep.get(key) ?? 0) + 1);
    }

    return [
      `MSI_PARTIAL_PUBLISH_FAILURE | publish | Found ${this.failures.length} publish failure(s).`,
      `steps | ${[...byStep.entries()]
        .map(([key, count]) => `${key}=${count}`)
        .join(" | ")}`,
      ...this.failures.map((failure) =>
        [
          failure.targetType,
          failure.operation,
          failure.title,
          failure.statusCode,
          failure.referralId,
          failure.responseSnippet
            ? `body=${failure.responseSnippet}`
            : undefined,
          failure.parentTitle ? `page=${failure.parentTitle}` : undefined,
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

export function summarizeResponseBody(
  responseText: string | undefined,
): string | undefined {
  if (!responseText) {
    return undefined;
  }

  const normalized = responseText.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length <= MAX_RESPONSE_SNIPPET_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_RESPONSE_SNIPPET_LENGTH - 3)}...`;
}

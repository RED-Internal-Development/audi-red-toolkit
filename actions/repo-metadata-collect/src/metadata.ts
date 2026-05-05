export interface ReleaseHistoryEntry {
  tag: string | null;
  name: string | null;
  date: string | null;
  notes: string | null;
}

export interface PackageMetadata {
  repoName: string;
  repoVersion: string;
  dependencies: Record<string, unknown>;
  devDependencies: Record<string, unknown>;
  appstoreData: unknown;
  browserlistData: unknown;
  repository: unknown;
  awsDomain: string;
}

export interface MetadataReportEntry {
  repo_version: string;
  awsDomain: string;
  published_version: string | null;
  release_history: ReleaseHistoryEntry[];
  dependabot_prs: string[];
  npm_audit: unknown;
  repository: unknown;
  dependencies: Record<string, unknown>;
  devDependencies: Record<string, unknown>;
  appstoreData: unknown;
  browserlistData: unknown;
}

export type MetadataReport = Record<string, MetadataReportEntry>;

interface BuildMetadataReportInput {
  packageMetadata: PackageMetadata;
  publishedVersion: string | null;
  releaseHistory: ReleaseHistoryEntry[];
  dependabotPrs: string[];
  npmAudit: unknown;
}

export function parsePackageMetadata(
  packageJsonText: string,
  repositorySlug: string,
  oneAudiCliText?: string,
): PackageMetadata {
  const packageJson = parseJsonRecord(packageJsonText);
  const oneAudiCli = oneAudiCliText
    ? parseJsonRecord(oneAudiCliText)
    : undefined;

  const fallbackRepoName = repositorySlug.split("/").pop() ?? repositorySlug;
  const repoName = readString(packageJson.name) ?? fallbackRepoName;

  return {
    repoName,
    repoVersion: readString(packageJson.version) ?? "",
    dependencies: readObject(packageJson.dependencies),
    devDependencies: readObject(packageJson.devDependencies),
    appstoreData: packageJson.appStore ?? {},
    browserlistData: packageJson.browserslist ?? {},
    repository: packageJson.repository ?? {},
    awsDomain: readNestedString(oneAudiCli, ["project", "awsDomain"]) ?? "",
  };
}

export function buildMetadataReport(
  input: BuildMetadataReportInput,
): MetadataReport {
  const { packageMetadata } = input;

  return {
    [packageMetadata.repoName]: {
      repo_version: packageMetadata.repoVersion,
      awsDomain: packageMetadata.awsDomain,
      published_version: input.publishedVersion,
      release_history: input.releaseHistory,
      dependabot_prs: input.dependabotPrs,
      npm_audit: input.npmAudit,
      repository: packageMetadata.repository,
      dependencies: packageMetadata.dependencies,
      devDependencies: packageMetadata.devDependencies,
      appstoreData: packageMetadata.appstoreData,
      browserlistData: packageMetadata.browserlistData,
    },
  };
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  return readObject(parsed);
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return readString(current);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

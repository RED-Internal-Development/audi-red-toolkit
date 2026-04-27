export interface ExistingPage {
  id: string;
  title?: string;
  ancestors?: Array<{ id: string }>;
}

export function chooseExistingPage(
  pages: ExistingPage[],
  title: string,
  parentId: string | undefined,
): ExistingPage | undefined {
  const matching = pages.filter(
    (page) => page.title?.toLowerCase() === title.toLowerCase(),
  );

  if (!parentId) {
    return matching[0];
  }

  return matching.find((page) =>
    (page.ancestors ?? []).some((ancestor) => ancestor.id === parentId),
  );
}

export function isDirectoryFileCollision(directoryName: string, filename: string): boolean {
  return directoryName.toLowerCase() === filename.replace(/\.(md|mdx)$/i, "").toLowerCase();
}

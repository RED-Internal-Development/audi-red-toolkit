export interface ConfluencePage {
  id: string;
  title: string;
  ancestors?: Array<{ id: string }>;
}

export interface ConfluenceMutationSuccess {
  ok: true;
  id: string;
}

export interface ConfluenceMutationFailure {
  ok: false;
  statusCode: string;
  body: string;
}

export type ConfluenceMutationResult =
  | ConfluenceMutationSuccess
  | ConfluenceMutationFailure;

export interface ConfluenceClient {
  getPagesByTitle(title: string): Promise<ConfluencePage[]>;
  createPage(input: {
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult>;
  updatePage(input: {
    id: string;
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult>;
}

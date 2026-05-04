export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  hint: string;
  defaultPayments: string[];
  defaultAuthProviders: string[];
  /**
   * Returns a map of file paths (relative to project root) → file content.
   * Called after the base template is cloned and the scope has been resolved.
   * Use `scope` to build correct import paths (e.g. `@${scope}/db/schema`).
   */
  generate: (scope: string) => Record<string, string>;
}

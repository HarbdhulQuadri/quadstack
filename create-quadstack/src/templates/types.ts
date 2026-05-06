import type { ProjectConfig } from "../prompts";

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
   * Use `config` to conditionally generate payment providers, auth, etc.
   */
  generate: (scope: string, config: ProjectConfig) => Record<string, string>;
}

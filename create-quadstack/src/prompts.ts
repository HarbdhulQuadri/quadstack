import * as p from "@clack/prompts";
import pc from "picocolors";

import { templates } from "./templates";

export interface ProjectConfig {
  name: string;
  packageScope: string;
  appType: string;
  apps: string[];
  authProviders: string[];
  payments: string[];
  database: string;
  git: boolean;
  installDeps: boolean;
}

export async function runPrompts(defaultName: string): Promise<ProjectConfig> {
  console.log();
  p.intro(pc.bold(pc.bgCyan(pc.black("  create-quadstack  "))));

  // ─── Step 1: pick app type ────────────────────────────────────────────────
  // This drives the default selections in the prompts that follow.
  const appType = await p.select({
    message: "What type of app are you building?",
    options: templates.map((t) => ({
      value: t.id,
      label: t.name,
      hint:  t.hint,
    })),
  });

  if (p.isCancel(appType)) { p.cancel("Cancelled."); process.exit(0); }

  const template = templates.find((t) => t.id === appType)!;

  // ─── Step 2: rest of config ───────────────────────────────────────────────
  const group = await p.group(
    {
      name: () =>
        p.text({
          message:      "Project name",
          placeholder:  defaultName,
          defaultValue: defaultName,
          validate: (v) => {
            if (!v) return "Name is required";
            if (!/^[a-z0-9-]+$/.test(v)) return "Lowercase letters, numbers and hyphens only";
          },
        }),

      packageScope: ({ results }) =>
        p.text({
          message:      "Package scope (used in workspace package names)",
          placeholder:  results.name ?? defaultName,
          defaultValue: results.name ?? defaultName,
          validate: (v) => {
            if (!v) return "Scope is required";
            if (!/^[a-z0-9-]+$/.test(v)) return "Lowercase letters, numbers and hyphens only";
          },
        }),

      apps: () =>
        p.multiselect<{ value: string; label: string; hint?: string }[], string>({
          message:       "Which apps do you want?",
          options: [
            { value: "web",   label: "Web",   hint: "Public-facing Next.js app (port 3000)" },
            { value: "admin", label: "Admin", hint: "Internal admin Next.js app (port 3001)" },
          ],
          initialValues: ["web", "admin"],
          required:      true,
        }),

      authProviders: () =>
        p.multiselect<{ value: string; label: string; hint?: string }[], string>({
          message:       "OAuth providers",
          options: [
            { value: "email",    label: "Email + Password", hint: "Always included" },
            { value: "google",   label: "Google" },
            { value: "facebook", label: "Facebook" },
            { value: "github",   label: "GitHub" },
          ],
          // Pre-select based on chosen app type — user can change
          initialValues: template.defaultAuthProviders,
          required:      true,
        }),

      payments: () =>
        p.multiselect<{ value: string; label: string; hint?: string }[], string>({
          message: "Payment providers (optional)",
          options: [
            { value: "stripe",   label: "Stripe",   hint: "Global cards" },
            { value: "paystack", label: "Paystack", hint: "Africa / NGN" },
            { value: "paypal",   label: "PayPal",   hint: "International" },
          ],
          // Pre-select based on chosen app type — user can change
          initialValues: template.defaultPayments,
        }),

      database: () =>
        p.select({
          message: "Database host",
          options: [
            { value: "supabase", label: "Supabase", hint: "Recommended — managed Postgres" },
            { value: "neon",     label: "Neon",     hint: "Serverless Postgres" },
            { value: "local",    label: "Local",    hint: "Self-hosted Postgres" },
          ],
        }),

      git: () =>
        p.confirm({ message: "Initialise a git repository?", initialValue: true }),

      installDeps: () =>
        p.confirm({ message: "Install dependencies now?", initialValue: true }),
    },
    {
      onCancel: () => { p.cancel("Cancelled."); process.exit(0); },
    },
  );

  return { ...group, appType: String(appType) } as ProjectConfig;
}

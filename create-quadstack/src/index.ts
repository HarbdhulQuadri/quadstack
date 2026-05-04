#!/usr/bin/env node
import * as p from "@clack/prompts";
import path from "path";
import pc from "picocolors";

import { runPrompts } from "./prompts";
import { scaffold } from "./scaffold";
import { getTemplate } from "./templates";
import { logger } from "./utils/logger";

async function main() {
  const rawName = process.argv[2] ?? "my-app";
  const projectDir = path.resolve(process.cwd(), rawName);

  const config = await runPrompts(rawName);
  config.name = rawName;

  const template = getTemplate(config.appType);

  await scaffold(projectDir, config);

  p.outro(pc.bold(pc.green("Done!")));

  console.log(`
  ${pc.bold("Your")} ${pc.cyan(template.name)} ${pc.bold("app is ready.")}

  ${pc.bold("Next steps:")}

    ${pc.cyan("cd")} ${rawName}
    ${pc.cyan("cp")} .env.example .env         ${pc.dim("# fill in your secrets")}
    ${pc.cyan("pnpm")} db:push                  ${pc.dim("# create database tables")}
    ${pc.cyan("pnpm")} dev                      ${pc.dim("# start all apps")}

  ${pc.bold("Generated files (edit freely):")}
    ${pc.dim("packages/db/src/schema.ts")}        ${pc.dim("← your database tables")}
    ${pc.dim("packages/validators/src/index.ts")} ${pc.dim("← your Zod schemas")}
    ${pc.dim("packages/api/src/orpc-routers/")}   ${pc.dim("← your API endpoints")}

  ${pc.dim("Docs:")} ${pc.underline("docs/getting-started.md")}
  `);
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

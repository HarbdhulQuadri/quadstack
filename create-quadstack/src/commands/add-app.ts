import * as p from "@clack/prompts";
import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import pc from "picocolors";

import { writeGeneratedFiles } from "../generators/files";
import { logger } from "../utils/logger";

async function detectScope(cwd: string): Promise<string> {
  try {
    const raw = await readFile(path.join(cwd, "package.json"), "utf-8");
    return (JSON.parse(raw) as { name?: string }).name ?? "quadstack";
  } catch {
    return "quadstack";
  }
}

async function detectPlatform(cwd: string): Promise<string> {
  try {
    await readFile(path.join(cwd, "apps", "web", "vercel.json"), "utf-8");
    return "vercel";
  } catch {
    return "none";
  }
}

/** Count existing apps to assign a unique port starting at 3002 */
async function nextPort(cwd: string): Promise<number> {
  try {
    const entries = await readdir(path.join(cwd, "apps"));
    // web=3000, admin=3001, each extra app gets the next slot
    return 3000 + entries.length;
  } catch {
    return 3002;
  }
}

/** Patch root package.json to add dev:<name> and deploy:<name> scripts */
async function patchRootPackageJson(
  cwd: string,
  name: string,
  scope: string,
  platform: string,
): Promise<void> {
  const pkgPath = path.join(cwd, "package.json");
  const raw = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };

  pkg.scripts ??= {};
  pkg.scripts[`dev:${name}`] = `turbo dev --filter=@${scope}/${name}`;

  if (platform === "vercel") {
    pkg.scripts[`deploy:${name}`] = `vercel deploy --prod --cwd apps/${name}`;
  }

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

export async function addApp(cwd: string, nameArg?: string): Promise<void> {
  console.log();
  p.intro(pc.bold(pc.bgBlue(pc.white("  add app  "))));

  const scope    = await detectScope(cwd);
  const platform = await detectPlatform(cwd);
  const port     = await nextPort(cwd);

  // ─── Prompts ───────────────────────────────────────────────────────────────
  const name = nameArg
    ? nameArg
    : await p.text({
        message:  "App name (folder under apps/)",
        validate: (v) => {
          if (!v) return "Name is required";
          if (!/^[a-z0-9-]+$/.test(v)) return "Lowercase letters, numbers and hyphens only";
        },
      });

  if (p.isCancel(name)) { p.cancel("Cancelled."); process.exit(0); }

  const appType = await p.select({
    message: "App type",
    options: [
      { value: "nextjs",   label: "Next.js app",    hint: "Full app with UI, auth, API client" },
      { value: "api-only", label: "API-only",        hint: "Route handlers only, no pages" },
      { value: "docs",     label: "Docs / static",  hint: "MDX or static pages, no auth" },
    ],
  });

  if (p.isCancel(appType)) { p.cancel("Cancelled."); process.exit(0); }

  const appPort = await p.text({
    message:      "Dev port",
    placeholder:  String(port),
    defaultValue: String(port),
    validate: (v) => {
      if (isNaN(Number(v))) return "Must be a number";
    },
  });

  if (p.isCancel(appPort)) { p.cancel("Cancelled."); process.exit(0); }

  // ─── Generate ──────────────────────────────────────────────────────────────
  logger.step(`Scaffolding apps/${String(name)}...`);

  const files = generateAppFiles(
    String(name),
    scope,
    String(appType),
    Number(appPort),
    platform,
  );

  await writeGeneratedFiles(cwd, files);
  await patchRootPackageJson(cwd, String(name), scope, platform);

  logger.success(`apps/${String(name)} created`);
  logger.info(`Root package.json updated — dev:${String(name)} script added`);

  p.outro(pc.bold(pc.green("Done!")));

  console.log(`
  ${pc.bold("Start your new app:")}

    ${pc.cyan(`pnpm dev:${String(name)}`)}    ${pc.dim(`→ http://localhost:${String(appPort)}`)}

  ${pc.bold("Or start everything:")}

    ${pc.cyan("pnpm dev")}
  `);
}

// ─── File generator ───────────────────────────────────────────────────────────

function generateAppFiles(
  name: string,
  scope: string,
  appType: string,
  port: number,
  platform: string,
): Record<string, string> {
  const dir = `apps/${name}`;
  const pkgName = `@${scope}/${name}`;
  const isNextjs  = appType === "nextjs";
  const isApiOnly = appType === "api-only";

  const files: Record<string, string> = {};

  // ── package.json ───────────────────────────────────────────────────────────
  const deps: Record<string, string> = {
    "next":      "^15.3.2",
    "react":     "^19.0.0",
    "react-dom": "^19.0.0",
  };

  if (isNextjs || isApiOnly) {
    deps[`@${scope}/api`]  = "workspace:*";
    deps[`@${scope}/auth`] = "workspace:*";
    deps["@t3-oss/env-nextjs"] = "^0.12.0";
    deps["zod"] = "^3.24.2";
  }

  if (isNextjs) {
    deps[`@${scope}/ui`]        = "workspace:*";
    deps["@orpc/client"]        = "^1.14.1";
    deps["@orpc/react"]         = "^1.14.1";
    deps["@tanstack/react-query"] = "^5.75.0";
    deps["better-auth"]         = "^1.2.7";
  }

  files[`${dir}/package.json`] = JSON.stringify({
    name: pkgName,
    version: "0.0.0",
    private: true,
    scripts: {
      dev:       `next dev --port ${port}`,
      build:     "next build",
      start:     `next start --port ${port}`,
      lint:      "next lint",
      typecheck: "tsc --noEmit",
      format:    "prettier --check .",
      "format:fix": "prettier --write .",
    },
    dependencies: deps,
    devDependencies: {
      [`@${scope}/eslint-config`]:  "workspace:*",
      [`@${scope}/prettier`]:       "workspace:*",
      [`@${scope}/tsconfig`]:       "workspace:*",
      "@types/node":                "^22.0.0",
      "@types/react":               "^19.0.0",
      "@types/react-dom":           "^19.0.0",
      "eslint":                     "^9.0.0",
      "prettier":                   "^3.5.0",
      "typescript":                 "^5.8.3",
    },
  }, null, 2),

  // ── tsconfig.json ──────────────────────────────────────────────────────────
  files[`${dir}/tsconfig.json`] = JSON.stringify({
    extends: `@${scope}/tsconfig/nextjs.json`,
    compilerOptions: { plugins: [{ name: "next" }] },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.d.ts"],
    exclude: ["node_modules"],
  }, null, 2);

  // ── next.config.ts ─────────────────────────────────────────────────────────
  const transpile = [`@${scope}/ui`, `@${scope}/api`, `@${scope}/auth`, `@${scope}/db`, `@${scope}/validators`];

  files[`${dir}/next.config.ts`] =
`import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ${JSON.stringify(transpile)},
};

export default config;
`;

  // ── src/env.ts ─────────────────────────────────────────────────────────────
  if (isNextjs || isApiOnly) {
    const publicVar = `NEXT_PUBLIC_${name.toUpperCase().replace(/-/g, "_")}_URL`;

    files[`${dir}/src/env.ts`] =
`import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_WEB_URL: z.string().url(),
    ${publicVar}: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV:             process.env.NODE_ENV,
    DATABASE_URL:         process.env.DATABASE_URL,
    NEXT_PUBLIC_WEB_URL:  process.env.NEXT_PUBLIC_WEB_URL,
    ${publicVar}: process.env.${publicVar},
  },
});
`;
  }

  // ── Full Next.js app files ─────────────────────────────────────────────────
  if (isNextjs) {
    files[`${dir}/src/components/providers.tsx`] =
`"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
`;

    files[`${dir}/src/app/layout.tsx`] =
`import "@${scope}/ui/globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "${name}",
  description: "Built with QuadStack",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;

    files[`${dir}/src/app/page.tsx`] =
`export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">${name}</h1>
    </main>
  );
}
`;

    files[`${dir}/src/app/api/rpc/[...rest]/route.ts`] =
`import { RPCHandler } from "@orpc/next";

import { appRouter } from "@${scope}/api";

const handler = new RPCHandler(appRouter);

async function handleRequest(req: Request) {
  const { response } = await handler.handle(req, {
    prefix: "/api/rpc",
    context: { headers: req.headers },
  });
  return response;
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
`;

    files[`${dir}/src/middleware.ts`] =
`import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Add auth guards, redirects, or headers here.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
  }

  // ── API-only: just the route handler ──────────────────────────────────────
  if (isApiOnly) {
    files[`${dir}/src/app/api/rpc/[...rest]/route.ts`] =
`import { RPCHandler } from "@orpc/next";

import { appRouter } from "@${scope}/api";

const handler = new RPCHandler(appRouter);

async function handleRequest(req: Request) {
  const { response } = await handler.handle(req, {
    prefix: "/api/rpc",
    context: { headers: req.headers },
  });
  return response;
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
`;

    files[`${dir}/src/app/page.tsx`] =
`export default function Page() {
  return <p>API-only app. Endpoints at <code>/api/rpc/...</code></p>;
}
`;
  }

  // ── Docs / static ─────────────────────────────────────────────────────────
  if (appType === "docs") {
    files[`${dir}/src/app/layout.tsx`] =
`import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "${name} docs" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;

    files[`${dir}/src/app/page.tsx`] =
`export default function Page() {
  return <main className="prose mx-auto p-8"><h1>${name}</h1><p>Docs coming soon.</p></main>;
}
`;
  }

  // ── Vercel deploy config ───────────────────────────────────────────────────
  if (platform === "vercel") {
    files[`${dir}/vercel.json`] = JSON.stringify({
      framework: "nextjs",
      installCommand: "cd ../.. && pnpm install --frozen-lockfile",
      buildCommand:   `cd ../.. && pnpm build --filter=${pkgName}...`,
      outputDirectory: ".next",
    }, null, 2);
  }

  return files;
}

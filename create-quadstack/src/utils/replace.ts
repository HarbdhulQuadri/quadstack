import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

import fg from "fast-glob";

/** Replace all occurrences of `from` with `to` in every text file under `dir`. */
export async function replaceInDir(
  dir: string,
  replacements: Array<{ from: string; to: string }>,
) {
  const files = await fg("**/*", {
    cwd: dir,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  await Promise.all(
    files.map(async (file) => {
      const full = resolve(dir, file);
      try {
        const content = await readFile(full, "utf-8");
        let updated = content;
        for (const { from, to } of replacements) {
          updated = updated.replaceAll(from, to);
        }
        if (updated !== content) {
          await writeFile(full, updated, "utf-8");
        }
      } catch {
        // skip binary files — readFile throws on invalid UTF-8
      }
    }),
  );
}

import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Write a map of { relativePath → content } into `projectDir`.
 * Creates parent directories automatically.
 * Existing files are overwritten — template output always wins.
 */
export async function writeGeneratedFiles(
  projectDir: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relPath, content]) => {
      const full = path.join(projectDir, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, "utf-8");
    }),
  );
}

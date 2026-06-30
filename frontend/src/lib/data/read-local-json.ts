import { readFile } from "fs/promises";
import path from "path";
import { allowLocalDataFallback } from "@/lib/deploy/deployment";

/** Resolve Phase 3 JSON paths — bundled copy under frontend/data/outputs, or monorepo root in dev. */
function outputJsonPaths(filename: string): string[] {
  const paths = [path.join(process.cwd(), "data", "outputs", filename)];
  if (allowLocalDataFallback()) {
    paths.push(path.join(process.cwd(), "..", "data", "outputs", filename));
  }
  return paths;
}

/** Read Phase 3 JSON from disk (dev / optional refresh from pipeline outputs). */
export async function readLocalOutputJson<T>(
  filename: string
): Promise<T | null> {
  for (const filePath of outputJsonPaths(filename)) {
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      /* try next path */
    }
  }
  return null;
}

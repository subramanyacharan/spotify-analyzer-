import { readFile } from "fs/promises";
import path from "path";
import { allowLocalDataFallback } from "@/lib/env/deployment";

/** Read Phase 3 JSON from ../data/outputs (local dev only). */
export async function readLocalOutputJson<T>(
  filename: string
): Promise<T | null> {
  if (!allowLocalDataFallback()) return null;

  try {
    const filePath = path.join(
      process.cwd(),
      "..",
      "data",
      "outputs",
      filename
    );
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

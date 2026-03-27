// Exports TOOL_SCHEMAS to tools.json for Promptfoo.
// Run: npx tsx export-schemas.ts
//
// Direct import works because tool-schemas.ts is pure data
// with no Deno-specific imports. tsx handles .ts natively.

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { TOOL_SCHEMAS } from "../supabase/functions/_shared/tool-schemas.ts";

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "tools.json");
writeFileSync(outputPath, JSON.stringify(TOOL_SCHEMAS, null, 2));
console.log(`Exported ${TOOL_SCHEMAS.length} tool schemas to ${outputPath}`);

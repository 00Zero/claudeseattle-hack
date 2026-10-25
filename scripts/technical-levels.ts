// AI-suggested technical levels in bulk (lib/technical-rating.ts). The admin pages
// (/admin/test-accounts, /admin/people) run the same suggestion in 40-second batches.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/technical-levels.ts suggest test
//   npx tsx --conditions=react-server --env-file=.env.local scripts/technical-levels.ts suggest real   (ask Adam first)
//   npx tsx --conditions=react-server --env-file=.env.local scripts/technical-levels.ts preview test 5  (stores nothing; prints reasons, admin-only)
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_GATEWAY_API_KEY.
// --conditions=react-server lets lib/ files that import "server-only" load outside Next.
import { previewTechnicalLevels, suggestTechnicalLevels } from "../lib/technical-rating";

const [command, worldArg, limitArg] = process.argv.slice(2);
const world = worldArg === "real" ? "real" : worldArg === "test" ? "test" : null;

async function main() {
  if (!world || (command !== "suggest" && command !== "preview")) {
    console.log("Usage: technical-levels.ts suggest <test|real> | preview <test|real> [count]");
    process.exit(1);
  }
  if (command === "preview") {
    for (const row of await previewTechnicalLevels(world, Number(limitArg) || 5)) console.log(row);
    return;
  }
  for (;;) {
    const result = await suggestTechnicalLevels(world, 10 * 60_000);
    console.log(result);
    if (!result.left) break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

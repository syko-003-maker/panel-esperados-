import { lygFetchMembers } from "../src/lib/lyg-client.js";

const FAMILY_ID = process.env.FAMILY_ID || "esperados";

async function testLyg() {
  console.log(`\n=== TESTING LYG API DIRECTLY ===\n`);
  console.log(`Family: ${FAMILY_ID}`);
  console.log(`URL Pattern: /familles/{familyId}/members\n`);

  const response = await lygFetchMembers(FAMILY_ID, { timeoutMs: 15_000 });

  console.log(`Response OK: ${response.ok}`);
  console.log(`HTTP Status: ${response.status}`);
  console.log(`Error: ${response.error || "none"}`);
  console.log(`\nMeta:`, response.meta);

  if (response.data && response.data.length > 0) {
    console.log(`\n✓ Fetched ${response.data.length} items`);
    console.log(`\n--- First Item (Complete) ---`);
    const first = response.data[0];
    console.log(JSON.stringify(first, null, 2));

    console.log(`\n--- Second Item (Complete) ---`);
    const second = response.data[1];
    console.log(JSON.stringify(second, null, 2));

    console.log(`\n--- Keys in all items ---`);
    const allKeys = new Set<string>();
    response.data.forEach(item => {
      Object.keys(item).forEach(k => allKeys.add(k));
    });
    console.log("Keys:", Array.from(allKeys).sort());

    console.log(`\n--- Testing data availability ---`);
    let hasRpName = 0, hasDiscordId = 0, hasSteamId = 0, hasGrade = 0;
    response.data.forEach(item => {
      if (item.rpName || item.name || item.nomRP || item.username) hasRpName++;
      if (item.discordId || item.discord_id) hasDiscordId++;
      if (item.steamid || item.steamId || item.steam_id) hasSteamId++;
      if (item.grade || item.rank) hasGrade++;
    });
    console.log(`Items with rpName (various field names): ${hasRpName}/${response.data.length}`);
    console.log(`Items with discordId: ${hasDiscordId}/${response.data.length}`);
    console.log(`Items with steamId: ${hasSteamId}/${response.data.length}`);
    console.log(`Items with grade: ${hasGrade}/${response.data.length}`);
  } else {
    console.log(`\n❌ No data returned!`);
  }

  console.log(`\n=== END TEST ===\n`);
}

testLyg().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

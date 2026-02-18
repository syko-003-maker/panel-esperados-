type GuildMemberResponse = {
  user?: { id: string };
  roles: string[];
};

export async function fetchGuildMember(discordId: string) {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  if (!guildId || !botToken) {
    throw new Error("Missing DISCORD_GUILD_ID or DISCORD_BOT_TOKEN in env");
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      cache: "no-store",
    }
  );

  if (res.status === 404) return null; // pas dans la guilde
  if (!res.ok) throw new Error(`Discord API error ${res.status}`);

  return (await res.json()) as GuildMemberResponse;
}

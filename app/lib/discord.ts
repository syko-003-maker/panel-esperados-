export async function getUserRoles(discordId: string, accessToken: string) {
  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) return null;
  return res.json();
}

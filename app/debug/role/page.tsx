import { auth } from "@/auth";
import { getUserRole } from "@/server/auth/rbac";
import { getDiscordIdForSession, parseDiscordIds } from "@/server/auth/discord";
import { notFound, redirect } from "next/navigation";

export default async function DebugRolePage() {
  const session = await auth();

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <h1 className="text-3xl font-bold mb-6">Debug Role - Not Authenticated</h1>
        <a href="/login" className="text-blue-400 underline">Go to login</a>
      </div>
    );
  }

  const role = await getUserRole(session);

  if (process.env.NODE_ENV === "production") {
    if (process.env.DEBUG_ROLE_PAGE !== "true") {
      notFound();
    }
    if (role !== "chef") {
      redirect("/access-denied");
    }
  }

  const discordId = await getDiscordIdForSession(session);
  const staffIds = parseDiscordIds(process.env.STAFF_DISCORD_IDS);
  const chefIds = parseDiscordIds(process.env.CHEF_DISCORD_IDS);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Debug Role & RBAC</h1>
          <span className="text-xs text-slate-500">v2.0 - Unified Logic</span>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Current Role</h2>
          <p className="text-3xl font-bold text-blue-400">{role.toUpperCase()}</p>
          <p className="text-sm text-slate-400 mt-2">
            Discord ID: <span className="text-green-400">{discordId || "Not found"}</span>
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg">
          <h3 className="font-bold mb-2">CHEF_DISCORD_IDS ({chefIds.length} IDs)</h3>
          {chefIds.length > 0 ? (
            <ul className="text-sm font-mono space-y-1">
              {chefIds.map((id) => (
                <li key={id} className="text-yellow-400">
                  {id} {id === discordId && <span className="text-green-400 font-bold">← YOU</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-red-400 text-sm">Not configured</p>
          )}
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg">
          <h3 className="font-bold mb-2">STAFF_DISCORD_IDS ({staffIds.length} IDs)</h3>
          {staffIds.length > 0 ? (
            <ul className="text-sm font-mono space-y-1">
              {staffIds.map((id) => (
                <li key={id} className="text-blue-400">
                  {id} {id === discordId && <span className="text-green-400 font-bold">← YOU</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-red-400 text-sm">Not configured</p>
          )}
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg">
          <h3 className="font-bold mb-4">Test Navigation</h3>
          <div className="space-y-2">
            <a href="/dashboard" className="block p-3 bg-blue-600 hover:bg-blue-700 rounded text-center">
              Member Dashboard
            </a>
            <a href="/staff/dashboard" className="block p-3 bg-purple-600 hover:bg-purple-700 rounded text-center">
              Staff Dashboard
            </a>
            <a href="/me" className="block p-3 bg-green-600 hover:bg-green-700 rounded text-center">
              /me (auto-dispatch)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

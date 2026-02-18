/**
 * Example: Members Dashboard with Auto-Refresh
 * 
 * Demonstrates:
 * - Using useLyg hooks
 * - Auto-refresh with configurable interval
 * - Manual refresh button
 * - Cache status display
 * - Loading/error states
 */

"use client";

import { useMembers, useBanklogs } from "@/lib/hooks/useLyg";
import { formatDistanceToNow } from "date-fns";

export function MembersDashboardExample() {
  // Auto-refresh every 30 minutes
  const {
    members,
    loading: membersLoading,
    error: membersError,
    cached: membersCached,
    fetchedAt: membersFetchedAt,
    refresh: refreshMembers,
  } = useMembers({
    familyId: "esperados",
    refreshInterval: 30 * 60 * 1000, // 30 min
    enabled: true,
  });

  // Auto-refresh every 60 seconds
  const {
    banklogs,
    loading: banklogsLoading,
    error: banklogsError,
    cached: banklogsCached,
    fetchedAt: banklogsFetchedAt,
    refresh: refreshBanklogs,
  } = useBanklogs({
    familyId: "esperados",
    refreshInterval: 60 * 1000, // 60s
    enabled: true,
  });

  return (
    <div className="space-y-6 p-6">
      {/* Members Section */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Members</h2>
          <div className="flex items-center gap-4">
            {membersFetchedAt && (
              <span className="text-sm text-gray-500">
                {membersCached ? "Cached" : "Fresh"} •{" "}
                {formatDistanceToNow(membersFetchedAt, { addSuffix: true })}
              </span>
            )}
            <button
              onClick={refreshMembers}
              disabled={membersLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {membersLoading ? "Refreshing..." : "Refresh Now"}
            </button>
          </div>
        </div>

        {membersError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4">
            Error: {membersError}
          </div>
        )}

        {membersLoading && !members.length ? (
          <div className="text-center py-8 text-gray-500">
            Loading members...
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Total: {members.length} members
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.slice(0, 12).map((member) => (
                <div
                  key={member.steamId64}
                  className="border rounded p-3 hover:bg-gray-50"
                >
                  <p className="font-semibold">{member.rpName || "Unknown"}</p>
                  <p className="text-sm text-gray-600">{member.grade || "Member"}</p>
                  <p className="text-xs text-gray-400">{member.steamId64}</p>
                </div>
              ))}
            </div>
            {members.length > 12 && (
              <p className="text-sm text-gray-500 mt-2">
                ...and {members.length - 12} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* Banklogs Section */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Banklogs</h2>
          <div className="flex items-center gap-4">
            {banklogsFetchedAt && (
              <span className="text-sm text-gray-500">
                {banklogsCached ? "Cached" : "Fresh"} •{" "}
                {formatDistanceToNow(banklogsFetchedAt, { addSuffix: true })}
              </span>
            )}
            <button
              onClick={refreshBanklogs}
              disabled={banklogsLoading}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {banklogsLoading ? "Refreshing..." : "Refresh Now"}
            </button>
          </div>
        </div>

        {banklogsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4">
            Error: {banklogsError}
          </div>
        )}

        {banklogsLoading && !banklogs ? (
          <div className="text-center py-8 text-gray-500">
            Loading banklogs...
          </div>
        ) : (
          <div className="space-y-2">
            {Array.isArray(banklogs) ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {banklogs.slice(0, 10).map((log: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">{log.type || "N/A"}</td>
                        <td className="px-4 py-2 text-sm">{log.amount || "N/A"}</td>
                        <td className="px-4 py-2 text-sm">{log.date || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {banklogs.length > 10 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ...and {banklogs.length - 10} more transactions
                  </p>
                )}
              </div>
            ) : (
              <pre className="bg-gray-50 p-4 rounded overflow-x-auto text-sm">
                {JSON.stringify(banklogs, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">
          Rate Limit Protection Active ✅
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Members: Auto-refresh every 30 minutes</li>
          <li>• Banklogs: Auto-refresh every 60 seconds</li>
          <li>• Multiple tabs share the same cache</li>
          <li>• Server-side distributed locks prevent duplicate API calls</li>
          <li>• LYG API rate limit (150 req/15min) is protected</li>
        </ul>
      </div>
    </div>
  );
}

#!/usr/bin/env python3
"""
Diagnostic script to identify invalid steamIds in database.
steamId64 must be exactly 17 digits (76561198xxxxxxxxx).

Usage:
  python scripts/diagnose-steamids.py
"""

import subprocess
import json
import re
import sys

def run_prisma_query():
    """Run Prisma to get all members with steamIds."""
    try:
        # Using prisma queryRaw to get member data
        result = subprocess.run(
            [
                "npx",
                "prisma",
                "db",
                "execute",
                "--stdin",
            ],
            input="""
SELECT 
  id,
  "familyId",
  "rpName",
  "steamId",
  "discordId",
  "isActive",
  "missingSince",
  "lastSeenAt"
FROM "Member"
WHERE "steamId" IS NOT NULL
ORDER BY "rpName" ASC;
            """,
            capture_output=True,
            text=True,
            cwd=".",
        )

        if result.returncode != 0:
            print(f"ERROR: Prisma query failed: {result.stderr}")
            return []

        # Parse CSV output
        lines = result.stdout.strip().split("\n")
        if len(lines) < 2:
            print("No members found")
            return []

        header = lines[0].split(",")
        members = []
        for line in lines[1:]:
            cells = line.split(",")
            if len(cells) >= len(header):
                member = {header[i].strip(): cells[i].strip() for i in range(len(header))}
                members.append(member)

        return members

    except Exception as e:
        print(f"ERROR running query: {e}")
        return []


def validate_steamid64(steamid):
    """Check if steamId is valid (17 digits, matches pattern 7656119X{10})."""
    if not steamid:
        return False, "empty"
    
    steamid = str(steamid).strip()
    
    # Check length
    if len(steamid) != 17:
        return False, f"wrong_length_{len(steamid)}"
    
    # Check all digits
    if not steamid.isdigit():
        return False, "non_numeric"
    
    # Check pattern: starts with 7656119
    if not stemid.startswith("7656119"):
        return False, "invalid_prefix"
    
    return True, "valid"


def main():
    print("[DIAG] Scanning members for invalid steamIds...")
    
    members = run_prisma_query()
    
    if not members:
        print("No members found or query failed")
        return
    
    print(f"\nFound {len(members)} members with steamIds")
    print("-" * 80)
    
    invalid = []
    valid = []
    
    for member in members:
        steamid = member.get("steamId", "").strip()
        name = member.get("rpName", "?")
        is_active = member.get("isActive", "?")
        
        is_valid, reason = validate_steamid64(steamid)
        
        if is_valid:
            valid.append(member)
        else:
            invalid.append((member, reason))
            print(f"❌ {name:30} | steamId: {steamid:20} | reason: {reason:20} | active: {is_active}")
    
    print("-" * 80)
    print(f"\n✅ Valid: {len(valid)}")
    print(f"❌ Invalid: {len(invalid)}")
    
    if invalid:
        print("\n⚠️  Action required:")
        print("- Check LYG API response for these members")
        print("- Verify steamIds in LYG response are valid")
        print("- Re-sync to update invalid steamIds")
        print("\nInvalid members details:")
        for member, reason in invalid:
            print(f"  - {member.get('rpName', '?')}: {member.get('steamId', '')} ({reason})")
            if "brouillard" in (member.get("rpName", "") or "").lower():
                print(f"    ^-- THIS IS DENIS! Check discord={member.get('discordId')}")


if __name__ == "__main__":
    main()

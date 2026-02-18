#!/usr/bin/env pwsh
# verify-rbac-setup.ps1
# Comprehensive RBAC verification and setup script

param(
    [string]$OwnerDiscordId = "",
    [switch]$Fix
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RBAC Setup Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check environment variables
Write-Host "1. Checking Environment Variables..." -ForegroundColor Yellow
$nextauthUrl = $env:NEXTAUTH_URL
$nodeEnv = $env:NODE_ENV

if ($nextauthUrl) {
    Write-Host "   ✅ NEXTAUTH_URL: $nextauthUrl" -ForegroundColor Green
} else {
    Write-Host "   ❌ NEXTAUTH_URL not set!" -ForegroundColor Red
}

if ($nodeEnv) {
    Write-Host "   ✅ NODE_ENV: $nodeEnv" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  NODE_ENV not set (defaulting to development)" -ForegroundColor Yellow
}

Write-Host ""

# 2. Check if RBAC tables are seeded
Write-Host "2. Checking RBAC Database..." -ForegroundColor Yellow
Write-Host "   Running verification query..." -ForegroundColor Gray

# Run the verification SQL script
$result = & node -e @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Check roles
    const roles = await prisma.staffRole.findMany({
      orderBy: { priority: 'desc' },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });
    
    console.log(JSON.stringify({ ok: true, roles: roles.length, data: roles }));
    await prisma.`$disconnect`();
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
    await prisma.`$disconnect`();
    process.exit(1);
  }
})();
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Failed to connect to database" -ForegroundColor Red
    Write-Host "   Make sure DATABASE_URL is set and database is accessible" -ForegroundColor Red
    exit 1
}

$dbCheck = $result | ConvertFrom-Json

if ($dbCheck.ok -and $dbCheck.roles -gt 0) {
    Write-Host "   ✅ Found $($dbCheck.roles) roles in database" -ForegroundColor Green
    
    foreach ($role in $dbCheck.data) {
        $permCount = $role.permissions.Count
        Write-Host "      - $($role.code) ($($role.name)): $permCount permissions" -ForegroundColor Gray
    }
} else {
    Write-Host "   ❌ No roles found! RBAC not seeded." -ForegroundColor Red
    Write-Host "   Run: npx tsx prisma/seed-rbac.ts" -ForegroundColor Yellow
    
    if ($Fix) {
        Write-Host ""
        Write-Host "   Seeding RBAC data..." -ForegroundColor Yellow
        & npx tsx prisma/seed-rbac.ts
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ RBAC seeding complete" -ForegroundColor Green
        } else {
            Write-Host "   ❌ RBAC seeding failed" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ""

# 3. Check if owner has StaffUser record
if ($OwnerDiscordId) {
    Write-Host "3. Checking Owner StaffUser Record..." -ForegroundColor Yellow
    Write-Host "   Owner Discord ID: $OwnerDiscordId" -ForegroundColor Gray
    
    $ownerCheck = & node -e @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const staffUser = await prisma.staffUser.findUnique({
      where: { discordId: '$OwnerDiscordId' },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });
    
    console.log(JSON.stringify({ ok: true, found: !!staffUser, staffUser }));
    await prisma.`$disconnect`();
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
    await prisma.`$disconnect`();
  }
})();
"@
    
    $ownerData = $ownerCheck | ConvertFrom-Json
    
    if ($ownerData.found) {
        Write-Host "   ✅ Owner has StaffUser record" -ForegroundColor Green
        Write-Host "      Role: $($ownerData.staffUser.roleCode) ($($ownerData.staffUser.roleName))" -ForegroundColor Gray
        Write-Host "      Active: $($ownerData.staffUser.isActive)" -ForegroundColor Gray
        
        if (-not $ownerData.staffUser.isActive) {
            Write-Host "   ⚠️  Owner StaffUser is INACTIVE!" -ForegroundColor Yellow
            
            if ($Fix) {
                Write-Host "   Activating owner..." -ForegroundColor Yellow
                & node -e @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  await prisma.staffUser.update({
    where: { discordId: '$OwnerDiscordId' },
    data: { isActive: true }
  });
  console.log('Owner activated');
  await prisma.`$disconnect`();
})();
"@
                Write-Host "   ✅ Owner activated" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "   ❌ Owner does NOT have StaffUser record" -ForegroundColor Red
        
        if ($Fix) {
            Write-Host "   Creating StaffUser record for owner as CHEF..." -ForegroundColor Yellow
            & node -e @"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const chefRole = await prisma.staffRole.findUnique({
    where: { code: 'CHEF' }
  });
  
  if (!chefRole) {
    console.error('CHEF role not found! Seed RBAC first.');
    process.exit(1);
  }
  
  await prisma.staffUser.create({
    data: {
      discordId: '$OwnerDiscordId',
      roleCode: 'CHEF',
      roleName: chefRole.name,
      rolePriority: chefRole.priority,
      isActive: true
    }
  });
  
  console.log('Owner StaffUser created');
  await prisma.`$disconnect`();
})();
"@
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ Owner StaffUser created" -ForegroundColor Green
            } else {
                Write-Host "   ❌ Failed to create owner StaffUser" -ForegroundColor Red
            }
        } else {
            Write-Host "   Run with -Fix flag to create owner StaffUser" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "3. Owner Check Skipped" -ForegroundColor Yellow
    Write-Host "   Provide -OwnerDiscordId parameter to verify owner setup" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Login to panel as owner" -ForegroundColor Gray
Write-Host "2. Visit: https://losesperados.xyz/api/debug/session" -ForegroundColor Gray
Write-Host "3. Check 'rbacDecision.accessSource' should be 'DB_RBAC'" -ForegroundColor Gray
Write-Host ""

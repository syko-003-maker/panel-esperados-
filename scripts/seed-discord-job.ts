import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '@/lib/db';

// Load env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function seedJob() {
  const CHANNEL_ID = process.env.DISCORD_LOGS_CHANNEL_ID || process.env.DISCORD_TICKET_PARENT_CHANNEL_ID;
  
  if (!CHANNEL_ID) {
    console.error('❌ Missing DISCORD_LOGS_CHANNEL_ID or DISCORD_TICKET_PARENT_CHANNEL_ID');
    process.exit(1);
  }

  console.log('[seed-discord-job] Creating test outbox job...');
  console.log('  Channel ID:', CHANNEL_ID);

  try {
    const job = await prisma.discordOutbox.create({
      data: {
        familyId: 'esperados',
        type: 'SANCTION_NOTIFY',
        status: 'PENDING',
        attempt: 0,
        maxAttempts: 3,
        channelId: CHANNEL_ID,
        entityId: 'test-job-' + Date.now(),
        nextAttemptAt: new Date(0), // Immediate
        meta: {
          kind: 'PLAINT_CREATED',
          authorDiscordId: '408937062838829056',
          targetDiscordId: null,
          reason: '🤖 TEST WORKER - Seed job',
          createdAt: new Date().toISOString(),
        },
      },
    });

    console.log('✅ Job created successfully:');
    console.log('  ID:', job.id);
    console.log('  Type:', job.type);
    console.log('  Status:', job.status);
    console.log('  Channel:', job.channelId);
    console.log('  Meta:', JSON.stringify(job.meta, null, 2));
    console.log('\n[seed-discord-job] Worker should process this job within 3 seconds.');
    console.log('[seed-discord-job] Check your Discord channel for the message.');

    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error creating job:', err);
    process.exit(1);
  }
}

seedJob();

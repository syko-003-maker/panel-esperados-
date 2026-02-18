import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  console.log('Testing LinkRequest ACCEPTED status...');
  
  // Test creating with ACCEPTED status
  try {
    const testRequest = await prisma.linkRequest.create({
      data: {
        familyId: 'esperados',
        requesterDiscordId: 'test123',
        requesterName: 'Test User',
        status: 'ACCEPTED',
      },
    });
    console.log('✅ Created LinkRequest with ACCEPTED status:', testRequest.id);
    
    // Clean up
    await prisma.linkRequest.delete({ where: { id: testRequest.id } });
    console.log('✅ Cleaned up test data');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

test();

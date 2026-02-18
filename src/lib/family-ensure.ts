import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_NAME } from "@/lib/family";

const FAMILY_KEY = "esperados";

export type EnsureFamilyResult = {
  familyId: string;
};

export async function ensureFamilyExists(): Promise<EnsureFamilyResult> {
  try {
    const family = await prisma.family.upsert({
      where: { slug: FAMILY_KEY },
      update: {},
      create: {
        slug: FAMILY_KEY,
        name: DEFAULT_FAMILY_NAME,
      },
      select: { id: true },
    });

    return { familyId: family.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = "Expected Family.slug (String) with key 'esperados'";
    throw new Error(`[ensureFamilyExists] ${detail}. ${message}`);
  }
}

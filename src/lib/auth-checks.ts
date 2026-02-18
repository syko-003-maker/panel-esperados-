import { getSession } from "@/auth";
import { getCurrentMemberOrThrowish } from "@/lib/me";
import { redirect } from "next/navigation";

/**
 * Vérifier si le user est authentifié et lié
 * Retourne les données member ou false
 */
export async function checkMemberLinked() {
  const current = await getCurrentMemberOrThrowish();
  if (!current.ok) {
    return false;
  }
  return current;
}

/**
 * Vérifier si le user est authentifié mais pas lié
 * Utilisé pour /me layout
 */
export async function checkAuthenticated() {
  const session = await getSession();
  if (!session?.user) {
    return false;
  }
  return session;
}

/**
 * Vérifier si user est STAFF (Chef ou État-Major)
 * Utilisé pour /staff/* routes
 * @returns {session, member} ou false
 */
export async function checkStaffAuthorized() {
  const session = await getSession();
  
  // Pas de session = pas autorisé
  if (!session?.user) {
    return false;
  }

  // Vérifier si staff/chef
  const isStaff = (session as any).isStaff || (session?.user as any).isStaff;
  const isChef = (session as any).isChef || (session?.user as any).isChef;
  
  if (!isStaff && !isChef) {
    return false;
  }

  // Aussi vérifier que c'est un member lié
  const member = await getCurrentMemberOrThrowish();
  if (!member.ok) {
    return false;
  }

  return {
    session,
    member: member.member,
    isChef,
  };
}

/**
 * Vérifier si user est un MEMBRE SIMPLE (lié mais pas staff)
 * @returns {session, member} ou false
 */
export async function checkMemberSimple() {
  const session = await getSession();
  
  if (!session?.user) {
    return false;
  }

  // S'assurer qu'il n'est PAS staff
  const isStaff = (session as any).isStaff || (session?.user as any).isStaff;
  const isChef = (session as any).isChef || (session?.user as any).isChef;
  
  if (isStaff || isChef) {
    return false;
  }

  // Vérifier qu'il est lié
  const member = await getCurrentMemberOrThrowish();
  if (!member.ok) {
    return false;
  }

  return {
    session,
    member: member.member,
  };
}

/**
 * Assert staff ou redirect
 * Utilisé dans les layouts et pages staff
 */
export async function assertStaffOrRedirect() {
  const result = await checkStaffAuthorized();
  if (!result) {
    // Redirect non-staff vers dashboard
    redirect("/dashboard");
  }
  return result;
}

/**
 * Assert member linked ou redirect
 * Utilisé pour les pages member
 */
export async function assertMemberLinkedOrRedirect() {
  const result = await checkMemberLinked();
  if (!result) {
    // Redirect non-linked vers /api/auth/signin
    redirect("/api/auth/signin");
  }
  return result;
}

/**
 * Assert authenticated (peut ne pas être lié)
 * Utilisé pour /me layout
 */
export async function assertAuthenticatedOrRedirect() {
  const result = await checkAuthenticated();
  if (!result) {
    redirect("/api/auth/signin");
  }
  return result;
}

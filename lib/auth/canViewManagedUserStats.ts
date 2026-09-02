import type { createServiceClient } from "@/lib/supabaseServer";

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function canViewManagedUserStats(
  supabase: ServiceClient,
  actorId: string,
  actorRole: string,
  targetUserId: string
): Promise<boolean> {
  if (actorRole === "admin") return true;
  if (actorRole !== "agent" && actorRole !== "super") return false;

  const { data: target } = await supabase
    .from("users")
    .select("id, role, parent_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!target) return false;
  if (target.parent_id === actorId) return true;

  const { data: affiliation } = await supabase
    .from("player_affiliation")
    .select("agent_id, super_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (actorRole === "agent") {
    if (target.role === "player" && affiliation?.agent_id === actorId) return true;
    if (target.role === "agent" && target.parent_id === actorId) return true;
    return false;
  }

  if (affiliation?.super_id === actorId) return true;
  if (affiliation?.agent_id) {
    const { data: agentUser } = await supabase
      .from("users")
      .select("parent_id")
      .eq("id", affiliation.agent_id)
      .maybeSingle();
    if (agentUser?.parent_id === actorId) return true;
  }

  if (target.parent_id) {
    const { data: parentUser } = await supabase
      .from("users")
      .select("id, role, parent_id")
      .eq("id", target.parent_id)
      .maybeSingle();
    if (parentUser?.role === "agent" && parentUser.parent_id === actorId) return true;
    if (parentUser?.role === "super" && parentUser.id === actorId) return true;
  }

  if (target.role === "agent" && target.parent_id === actorId) return true;

  return false;
}

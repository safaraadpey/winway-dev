const LOG_PREFIX = "[DevPlayer]";

export async function syncDevPlayerConfigFlags(
  supabase: any,
  actorUserId: string
): Promise<void> {
  const { data: memberRows, error: membersError } = await supabase
    .from("dev_player_profile_members")
    .select("user_id");

  if (membersError) throw membersError;

  const enabledUserIds = new Set<string>(
    (memberRows ?? []).map((row: { user_id: string }) => String(row.user_id))
  );

  for (const userId of enabledUserIds) {
    const { data: existing } = await supabase
      .from("dev_player_configs")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      user_id: userId,
      is_enabled: true,
      updated_by: actorUserId,
    };

    if (!existing) {
      payload.created_by = actorUserId;
    }

    const { error: upsertError } = await supabase
      .from("dev_player_configs")
      .upsert(payload, { onConflict: "user_id" });

    if (upsertError) throw upsertError;
  }

  const { data: enabledRows, error: enabledError } = await supabase
    .from("dev_player_configs")
    .select("user_id")
    .eq("is_enabled", true);

  if (enabledError) throw enabledError;

  const orphanIds = (enabledRows ?? [])
    .map((row: { user_id: string }) => String(row.user_id))
    .filter((userId: string) => !enabledUserIds.has(userId));

  if (orphanIds.length > 0) {
    const { error: disableError } = await supabase
      .from("dev_player_configs")
      .update({ is_enabled: false, updated_by: actorUserId })
      .in("user_id", orphanIds);

    if (disableError) throw disableError;
  }

  console.log(`${LOG_PREFIX} Synced dev_player_configs flags`, {
    enabledCount: enabledUserIds.size,
    disabledCount: orphanIds.length,
  });
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunContext } from "./types.js";
import { bumpInserted, bumpRead, bumpSkipped } from "./runControl.js";

export type StorageEnv = {
  prodUrl: string;
  prodServiceKey: string;
  backupUrl: string;
  backupServiceKey: string;
};

function createProdStorage(env: StorageEnv): SupabaseClient {
  return createClient(env.prodUrl, env.prodServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createBackupStorage(env: StorageEnv): SupabaseClient {
  return createClient(env.backupUrl, env.backupServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function copyStorageArchive(
  ctx: RunContext,
  env: StorageEnv
): Promise<void> {
  const sourceKey = "storage.objects";
  const prod = createProdStorage(env);
  const backup = createBackupStorage(env);
  const backupPool = ctx.backupPool;

  const { rows: bucketRows } = await ctx.prodPool.query<{ id: string }>(
    `SELECT id FROM storage.buckets`
  );
  const bucketIds = bucketRows.map((b) => b.id);

  for (const bucketId of bucketIds) {
    const { rows: objects } = await ctx.prodPool.query<{
      id: string;
      name: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, name, metadata FROM storage.objects WHERE bucket_id = $1`,
      [bucketId]
    );

    bumpRead(ctx, sourceKey, objects.length);

    for (const obj of objects) {
      const objectPath = obj.name;
      const backupPath = `archive/${ctx.snapshotDate}/${bucketId}/${objectPath}`;
      const mime = (obj.metadata?.mimetype as string | undefined) ?? null;
      const sizeBytes = obj.metadata?.size
        ? Number(obj.metadata.size)
        : null;
      const contentMd5 =
        (obj.metadata?.eTag as string | undefined)?.replace(/"/g, "") ?? null;

      const manifestIns = await backupPool.query(
        `INSERT INTO archive.storage_manifest (
           snapshot_date, bucket_id, object_path, object_id, content_md5,
           size_bytes, mime, backup_path, copied, first_run_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)
         ON CONFLICT (snapshot_date, bucket_id, object_path) DO NOTHING
         RETURNING copied`,
        [
          ctx.snapshotDate,
          bucketId,
          objectPath,
          obj.id,
          contentMd5,
          sizeBytes,
          mime,
          backupPath,
          ctx.runId,
        ]
      );

      if ((manifestIns.rowCount ?? 0) === 0) {
        bumpSkipped(ctx, sourceKey, 1);
        continue;
      }

      const { data: fileData, error: downloadErr } = await prod.storage
        .from(bucketId)
        .download(objectPath);

      if (downloadErr || !fileData) {
        console.error("[Backup] storage download failed", {
          bucketId,
          objectPath,
          error: downloadErr?.message,
        });
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      const { error: uploadErr } = await backup.storage
        .from(bucketId)
        .upload(backupPath, buffer, {
          contentType: mime ?? undefined,
          upsert: false,
        });

      if (uploadErr) {
        console.error("[Backup] storage upload failed", {
          backupPath,
          error: uploadErr.message,
        });
        continue;
      }

      await backupPool.query(
        `UPDATE archive.storage_manifest SET copied = true
         WHERE snapshot_date = $1 AND bucket_id = $2 AND object_path = $3`,
        [ctx.snapshotDate, bucketId, objectPath]
      );
      bumpInserted(ctx, sourceKey, 1);
    }
  }
}

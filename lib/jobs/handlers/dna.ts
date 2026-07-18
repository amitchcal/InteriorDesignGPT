import { runDnaEngine, type DnaImage } from "@/lib/engines/dna";
import type { JobHandler } from "../types";

/**
 * DNA job — vision pass over a designer's uploaded assets, then fill the
 * profile's `dna` column. The profile row and its dna_training_assets already
 * exist (created by POST /api/dna); this reads the images and analyses them.
 */
export const dnaHandler: JobHandler = async (svc, job) => {
  const dnaId = job.payload.dna_id as string | undefined;
  if (!dnaId) throw new Error("dna job: missing dna_id");

  const { data: profile } = await svc
    .from("designer_dna_profiles")
    .select("id, owner_id")
    .eq("id", dnaId)
    .maybeSingle();
  if (!profile) throw new Error(`dna job: profile ${dnaId} gone`);

  const { data: assets } = await svc
    .from("dna_training_assets")
    .select("asset_url")
    .eq("dna_id", dnaId);
  if (!assets || assets.length === 0) throw new Error("dna job: no assets");

  // Download each asset from the private bucket and base64 it for the vision
  // call. Service role reads it; the path is the storage object key.
  const images: DnaImage[] = [];
  for (const asset of assets) {
    const { data: file, error } = await svc.storage
      .from("dna-assets")
      .download(asset.asset_url);
    if (error || !file) continue; // skip an unreadable asset rather than fail all
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    images.push({ base64, mediaType: file.type });
  }
  if (images.length === 0) throw new Error("dna job: no readable assets");

  const dna = await runDnaEngine(images);

  const { error: updateError } = await svc
    .from("designer_dna_profiles")
    .update({ dna, source_count: images.length })
    .eq("id", dnaId);
  if (updateError) throw new Error(`dna job: persist: ${updateError.message}`);

  return { dna_id: dnaId, source_count: images.length, style: dna.style_name };
};

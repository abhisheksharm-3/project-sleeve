"use server";
/** Creating and revoking API tokens. A new token is returned once and never stored. */
import { revalidatePath } from "next/cache";
import { newToken } from "@/lib/api-token";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TOKENS = 10;

export type CreateState = { token?: string; error?: string };

export async function createApiToken(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const { user } = await requireUser();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!name) return { error: "Name the token after where it will live, like GitHub Actions." };
  const admin = createAdminClient();
  const { count } = await admin
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_TOKENS)
    return { error: `You can have ${MAX_TOKENS} tokens. Revoke one you no longer use.` };
  const { token, hash, prefix } = newToken();
  const { error } = await admin
    .from("api_tokens")
    .insert({ user_id: user.id, name, token_hash: hash, prefix });
  if (error) return { error: "Could not create the token." };
  revalidatePath("/api-tokens");
  return { token };
}

export async function revokeApiToken(formData: FormData) {
  const { user } = await requireUser();
  await createAdminClient()
    .from("api_tokens")
    .delete()
    .eq("id", String(formData.get("token_id") ?? ""))
    .eq("user_id", user.id);
  revalidatePath("/api-tokens");
}

"use server";
/** Status page mutations. Each reads the page through RLS to prove ownership, then writes. */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isSlug, slugify } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";
const NOTICE_KINDS = ["incident", "maintenance", "notice"];

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function text(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, max);
}

async function ownedPage(formData: FormData, field = "page_id") {
  const { supabase, user } = await requireUser();
  const id = String(formData.get(field) ?? "");
  const { data: page } = await supabase
    .from("status_pages")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (!page) fail("/status-pages", "That status page is not yours.");
  return { page, user, supabase, editor: `/status-pages/${page.id}` };
}

function refresh(editor: string, slug: string) {
  revalidatePath(editor);
  revalidatePath(`/s/${slug}`);
}

export async function createStatusPage(formData: FormData) {
  const { user } = await requireUser();
  const title = text(formData, "title", 80);
  if (!title) fail("/status-pages", "Give the page a title.");
  const base = slugify(title) || "status";
  const admin = createAdminClient();
  for (const slug of [base, `${base.slice(0, 33)}-${randomBytes(3).toString("hex")}`]) {
    const { data, error } = await admin
      .from("status_pages")
      .insert({ user_id: user.id, title, slug })
      .select("id")
      .single();
    if (data) redirect(`/status-pages/${data.id}`);
    if (error?.code !== UNIQUE_VIOLATION) break;
  }
  fail("/status-pages", "Could not create the page. Try another title.");
}

/**
 * Saves settings and the backend list in one go. Backends come back as `target` values in
 * the order the form lists them, and only ones the user can read through RLS are kept.
 */
export async function saveStatusPage(formData: FormData) {
  const { page, supabase, editor } = await ownedPage(formData);
  const title = text(formData, "title", 80);
  const slug = text(formData, "slug", 40).toLowerCase();
  if (!title) fail(editor, "Give the page a title.");
  if (!isSlug(slug))
    fail(
      editor,
      "Addresses use 3 to 40 lowercase letters, digits and hyphens, no hyphen at either end.",
    );

  const chosen = [...new Set(formData.getAll("target").map(String))];
  const { data: owned } = chosen.length
    ? await supabase.from("targets").select("id").in("id", chosen)
    : { data: [] };
  const ownedIds = new Set((owned ?? []).map((t) => t.id));
  const items = chosen
    .filter((id) => ownedIds.has(id))
    .map((target_id, position) => ({
      page_id: page.id,
      target_id,
      position,
      label: text(formData, `label_${target_id}`, 60) || null,
    }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("status_pages")
    .update({
      title,
      slug,
      description: text(formData, "description", 280) || null,
      show_uptime: formData.get("show_uptime") === "on",
      show_response_time: formData.get("show_response_time") === "on",
      show_outages: formData.get("show_outages") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", page.id);
  if (error?.code === UNIQUE_VIOLATION) fail(editor, `The address /s/${slug} is taken.`);
  if (error) fail(editor, "Could not save the page.");

  await admin.from("status_page_items").delete().eq("page_id", page.id);
  if (items.length) await admin.from("status_page_items").insert(items);

  refresh(editor, page.slug);
  if (slug !== page.slug) revalidatePath(`/s/${slug}`);
  redirect(`${editor}?saved=1`);
}

export async function setPublished(formData: FormData) {
  const { page, editor } = await ownedPage(formData);
  await createAdminClient()
    .from("status_pages")
    .update({ published: formData.get("published") === "true" })
    .eq("id", page.id);
  refresh(editor, page.slug);
  redirect(editor);
}

export async function deleteStatusPage(formData: FormData) {
  const { page, editor } = await ownedPage(formData);
  if (formData.get("confirm") !== "on") fail(editor, "Tick the box to confirm the delete.");
  await createAdminClient().from("status_pages").delete().eq("id", page.id);
  revalidatePath(`/s/${page.slug}`);
  redirect("/status-pages");
}

export async function postNotice(formData: FormData) {
  const { page, editor } = await ownedPage(formData);
  const kind = String(formData.get("kind") ?? "");
  const title = text(formData, "title", 120);
  if (!NOTICE_KINDS.includes(kind)) fail(editor, "Pick what kind of notice this is.");
  if (!title) fail(editor, "Give the notice a title.");
  await createAdminClient()
    .from("status_page_notices")
    .insert({ page_id: page.id, kind, title, body: text(formData, "body", 2000) || null });
  refresh(editor, page.slug);
  redirect(`${editor}#notices`);
}

/** `resolve` marks a notice over and keeps it in the history; otherwise it is deleted. */
export async function closeNotice(formData: FormData) {
  const { page, editor, supabase } = await ownedPage(formData);
  const id = Number(formData.get("notice_id"));
  const { data: notice } = await supabase
    .from("status_page_notices")
    .select("id")
    .eq("id", id)
    .eq("page_id", page.id)
    .maybeSingle();
  if (!notice) fail(editor, "That notice is not on this page.");
  const notices = createAdminClient().from("status_page_notices");
  if (formData.get("action") === "resolve")
    await notices.update({ resolved_at: new Date().toISOString() }).eq("id", id);
  else await notices.delete().eq("id", id);
  refresh(editor, page.slug);
  redirect(`${editor}#notices`);
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the caller's session, for server components and server actions.
 *
 * Every read through this client is filtered by RLS, so a query cannot return another
 * user's rows even if the code forgets to filter. `cookies()` is async in Next 16.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only. The proxy
            // refreshes the session on every request, so nothing is lost here.
          }
        },
      },
    },
  );
}

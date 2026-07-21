// Client helper: fetch with Supabase bearer token attached automatically.
import { supabase } from "@/integrations/supabase/client";

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function authJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await bearer();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function authUpload<T>(url: string, form: FormData): Promise<T> {
  const token = await bearer();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

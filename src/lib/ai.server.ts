// Server-only AI helpers backed by the AI Gateway.
// Embeddings via `openai/text-embedding-3-small` (1536 dims — matches the pgvector column).
// Chat via `google/gemini-2.5-flash`. No user API keys required.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "google/gemini-2.5-flash";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function embedText(text: string): Promise<number[]> {
  const key = requireEnv("LOVABLE_API_KEY");
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 20000) }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${t}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function llmChat(
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number } = {},
): Promise<string> {
  const key = requireEnv("LOVABLE_API_KEY");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 900,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to your workspace.");
    throw new Error(`LLM failed (${res.status}): ${t}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

/** Split text into ~`target`-char chunks; hard-splits any paragraph longer
 *  than `hardMax` so we never exceed the embedding model's context window
 *  (text-embedding-3-small: 8192 tokens ≈ ~24k chars). */
export function chunkText(text: string, target = 1200, hardMax = 4000): string[] {
  // 1) hard-split any paragraph longer than hardMax into fixed-size pieces.
  const rawParas = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paras: string[] = [];
  for (const p of rawParas) {
    if (p.length <= hardMax) { paras.push(p); continue; }
    for (let i = 0; i < p.length; i += hardMax) paras.push(p.slice(i, i + hardMax));
  }
  // 2) pack paragraphs greedily up to `target` chars.
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > target && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  // 3) final safety: any lingering chunk over hardMax gets split.
  const safe: string[] = [];
  for (const c of chunks) {
    if (c.length <= hardMax) safe.push(c);
    else for (let i = 0; i < c.length; i += hardMax) safe.push(c.slice(i, i + hardMax));
  }
  return safe.length ? safe : [text.slice(0, hardMax)];
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ─── SSRF Protection ───────────────────────────────────────────────────────────

function isPrivateOrReservedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname === "::1"
    ) {
      return true;
    }

    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname === "metadata.google.com"
    ) {
      return true;
    }

    // Block private IP ranges
    const parts = hostname.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const octets = parts.map(Number);
      // 10.x.x.x
      if (octets[0] === 10) return true;
      // 172.16.x.x - 172.31.x.x
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      // 192.168.x.x
      if (octets[0] === 192 && octets[1] === 168) return true;
      // 0.x.x.x
      if (octets[0] === 0) return true;
    }

    // Block non-http(s) schemes
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return true;
    }

    return false;
  } catch {
    return true; // Invalid URL = blocked
  }
}

// ─── Persona Sanitization ──────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions/i,
  /disregard\s+(previous|above|all)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /\{\{.*?\}\}/,
  /<%.*?%>/,
  /<script/i,
];

function sanitizePersonaField(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;

  // Strip control characters (keep newlines and tabs)
  let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Collapse excessive whitespace (but preserve single newlines)
  sanitized = sanitized.replace(/[ \t]+/g, " ");
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");
  sanitized = sanitized.trim();

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new Error(
        `Persona field contains disallowed pattern: ${pattern.source}`
      );
    }
  }

  return sanitized || null;
}

// ─── AES-256-GCM Encryption ────────────────────────────────────────────────────

async function encryptApiKey(plaintext: string): Promise<string> {
  const keySource =
    Deno.env.get("API_KEY_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!keySource) {
    throw new Error("No encryption key available");
  }

  // SHA-256 hash to get 32-byte key (matches Node.js: crypto.createHash('sha256').update(keySource).digest())
  const keyData = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keySource)
  );

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    encoded
  );

  // Web Crypto appends the 16-byte auth tag to the ciphertext
  const ciphertextBytes = new Uint8Array(ciphertext);
  const encrypted = ciphertextBytes.slice(0, ciphertextBytes.length - 16);
  const authTag = ciphertextBytes.slice(ciphertextBytes.length - 16);

  // Format: iv_hex:authTag_hex:ciphertext_hex (compatible with Node.js implementation)
  return `${toHex(iv)}:${toHex(authTag)}:${toHex(encrypted)}`;
}

// ─── Validation ────────────────────────────────────────────────────────────────

const VALID_PERSONA_STYLES = ["formal", "casual", "technical", "dramatic", "minimal"];
const VALID_STRATEGIES = ["aggressive", "cautious", "balanced", "creative", "analytical"];

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "slug",
  "description",
  "color",
  "agent_type",
  "webhook_url",
  "provider",
  "model",
  "api_key",
  "system_prompt",
  "is_public",
  "persona_name",
  "persona_description",
  "persona_style",
  "strategy",
];

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whs_${toHex(bytes)}`;
}

function stripSensitiveFields(agent: Record<string, unknown>): Record<string, unknown> {
  const result = { ...agent };
  delete result.api_key_encrypted;
  delete result.webhook_secret;
  return result;
}

// ─── Get authenticated user from JWT ───────────────────────────────────────────

async function getUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;

  return { id: user.id, email: user.email };
}

// ─── Service-role Supabase client ──────────────────────────────────────────────

function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── POST: Create Agent ────────────────────────────────────────────────────────

async function handleCreate(req: Request, userId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const {
    name,
    slug,
    description,
    color,
    agent_type,
    webhook_url,
    provider,
    model,
    api_key,
    system_prompt,
    is_public,
    persona_name,
    persona_description,
    persona_style,
    strategy,
  } = body as Record<string, string | boolean | undefined>;

  // ── Required field validation ──
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return errorResponse("name is required");
  }

  // ── Abuse protection: max 5 agents per user ──
  const supabase = getServiceClient();

  const { count, error: countError } = await supabase
    .from("aio_agents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  if (countError) {
    return errorResponse("Failed to check agent count", 500);
  }

  if ((count ?? 0) >= 5) {
    return errorResponse("Maximum of 5 agents per user reached", 403);
  }

  // ── SSRF protection for webhook_url ──
  if (webhook_url && typeof webhook_url === "string" && webhook_url.trim().length > 0) {
    if (isPrivateOrReservedUrl(webhook_url as string)) {
      return errorResponse("webhook_url points to a disallowed address");
    }
  }

  // ── Persona sanitization ──
  let sanitizedPersonaName: string | null = null;
  let sanitizedPersonaDescription: string | null = null;
  let sanitizedSystemPrompt: string | null = null;

  try {
    sanitizedPersonaName = sanitizePersonaField(persona_name as string);
    sanitizedPersonaDescription = sanitizePersonaField(persona_description as string);
    sanitizedSystemPrompt = sanitizePersonaField(system_prompt as string);
  } catch (err) {
    return errorResponse((err as Error).message);
  }

  // ── Validate persona_style ──
  if (persona_style && !VALID_PERSONA_STYLES.includes(persona_style as string)) {
    return errorResponse(
      `Invalid persona_style. Must be one of: ${VALID_PERSONA_STYLES.join(", ")}`
    );
  }

  // ── Validate strategy ──
  if (strategy && !VALID_STRATEGIES.includes(strategy as string)) {
    return errorResponse(
      `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}`
    );
  }

  // ── Encrypt API key ──
  let apiKeyEncrypted: string | null = null;
  if (api_key && typeof api_key === "string" && api_key.trim().length > 0) {
    try {
      apiKeyEncrypted = await encryptApiKey(api_key as string);
    } catch (err) {
      return errorResponse("Failed to encrypt API key", 500);
    }
  }

  // ── Generate webhook_secret for webhook agents ──
  let webhookSecret: string | null = null;
  if (agent_type === "webhook" || (webhook_url && typeof webhook_url === "string" && webhook_url.trim().length > 0)) {
    webhookSecret = generateWebhookSecret();
  }

  // ── Build insert record ──
  const record: Record<string, unknown> = {
    owner_id: userId,
    name: (name as string).trim(),
    slug: slug ? (slug as string).trim() : null,
    description: description ? (description as string).trim() : null,
    color: color || null,
    agent_type: agent_type || "llm",
    webhook_url: webhook_url ? (webhook_url as string).trim() : null,
    provider: provider || null,
    model: model || null,
    api_key_encrypted: apiKeyEncrypted,
    system_prompt: sanitizedSystemPrompt,
    is_public: typeof is_public === "boolean" ? is_public : false,
    persona_name: sanitizedPersonaName,
    persona_description: sanitizedPersonaDescription,
    persona_style: persona_style || null,
    strategy: strategy || null,
    webhook_secret: webhookSecret,
  };

  // ── Insert ──
  const { data, error: insertError } = await supabase
    .from("aio_agents")
    .insert(record)
    .select()
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return errorResponse(
      insertError.message || "Failed to create agent",
      insertError.code === "23505" ? 409 : 500
    );
  }

  return jsonResponse(stripSensitiveFields(data), 201);
}

// ─── PUT: Update Agent ─────────────────────────────────────────────────────────

async function handleUpdate(
  req: Request,
  userId: string,
  agentId: string
): Promise<Response> {
  const supabase = getServiceClient();

  // ── Verify ownership ──
  const { data: existing, error: fetchError } = await supabase
    .from("aio_agents")
    .select("id, owner_id")
    .eq("id", agentId)
    .single();

  if (fetchError || !existing) {
    return errorResponse("Agent not found", 404);
  }

  if (existing.owner_id !== userId) {
    return errorResponse("Not authorized to update this agent", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  // ── Filter to allowed fields only ──
  const updates: Record<string, unknown> = {};

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("No valid fields to update");
  }

  // ── SSRF protection for webhook_url ──
  if ("webhook_url" in updates && updates.webhook_url) {
    if (isPrivateOrReservedUrl(updates.webhook_url as string)) {
      return errorResponse("webhook_url points to a disallowed address");
    }
  }

  // ── Persona sanitization ──
  try {
    if ("persona_name" in updates) {
      updates.persona_name = sanitizePersonaField(updates.persona_name as string);
    }
    if ("persona_description" in updates) {
      updates.persona_description = sanitizePersonaField(
        updates.persona_description as string
      );
    }
    if ("system_prompt" in updates) {
      updates.system_prompt = sanitizePersonaField(updates.system_prompt as string);
    }
  } catch (err) {
    return errorResponse((err as Error).message);
  }

  // ── Validate persona_style ──
  if ("persona_style" in updates && updates.persona_style) {
    if (!VALID_PERSONA_STYLES.includes(updates.persona_style as string)) {
      return errorResponse(
        `Invalid persona_style. Must be one of: ${VALID_PERSONA_STYLES.join(", ")}`
      );
    }
  }

  // ── Validate strategy ──
  if ("strategy" in updates && updates.strategy) {
    if (!VALID_STRATEGIES.includes(updates.strategy as string)) {
      return errorResponse(
        `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}`
      );
    }
  }

  // ── Encrypt API key if provided ──
  if ("api_key" in updates) {
    const apiKey = updates.api_key as string;
    delete updates.api_key;
    if (apiKey && typeof apiKey === "string" && apiKey.trim().length > 0) {
      try {
        updates.api_key_encrypted = await encryptApiKey(apiKey);
      } catch {
        return errorResponse("Failed to encrypt API key", 500);
      }
    } else {
      updates.api_key_encrypted = null;
    }
  }

  // ── Generate webhook_secret if switching to webhook type ──
  if (
    updates.agent_type === "webhook" ||
    ("webhook_url" in updates && updates.webhook_url)
  ) {
    // Check if agent already has a webhook_secret
    const { data: fullAgent } = await supabase
      .from("aio_agents")
      .select("webhook_secret")
      .eq("id", agentId)
      .single();

    if (!fullAgent?.webhook_secret) {
      updates.webhook_secret = generateWebhookSecret();
    }
  }

  // ── Update ──
  const { data, error: updateError } = await supabase
    .from("aio_agents")
    .update(updates)
    .eq("id", agentId)
    .eq("owner_id", userId)
    .select()
    .single();

  if (updateError) {
    console.error("Update error:", updateError);
    return errorResponse(
      updateError.message || "Failed to update agent",
      500
    );
  }

  return jsonResponse(stripSensitiveFields(data));
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // ── Authenticate ──
  const user = await getUser(req);
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const url = new URL(req.url);

  // ── Route ──
  if (req.method === "POST") {
    return handleCreate(req, user.id);
  }

  if (req.method === "PUT") {
    const agentId = url.searchParams.get("id");
    if (!agentId) {
      return errorResponse("Missing agent id query parameter");
    }
    // Basic UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agentId)) {
      return errorResponse("Invalid agent id format");
    }
    return handleUpdate(req, user.id, agentId);
  }

  return errorResponse("Method not allowed", 405);
});

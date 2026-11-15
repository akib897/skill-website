// Skill Graphics website chatbot ("Ask Skill").
// Runs on Cloudflare Workers. The website sends the chat so far; this asks
// Claude Haiku 5.5 for the next reply and sends back { reply }.
// The API key lives in Cloudflare as the secret ANTHROPIC_API_KEY, never in code.

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./knowledge.js";

const MODEL = "claude-haiku-5-5";
const MAX_HISTORY = 12; // only the last few messages are sent, to keep cost down
const MAX_CHARS = 1000; // longest visitor message accepted
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_B64 = 1_500_000; // about 1 MB picture; the website shrinks pictures before sending

const CONTACT_FALLBACK =
  "Sorry, I can't answer right now. Please message us on WhatsApp at +880 1723 099983 or email support@skill.ventures, and the team will get back to you.";

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// Keep only well-formed { role, content } text messages, starting with the visitor.
function cleanHistory(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_HISTORY);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, cors);
    if (!cors["Access-Control-Allow-Origin"]) return json({ error: "Origin not allowed" }, 403, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.CHAT_LIMITER) {
      const { success } = await env.CHAT_LIMITER.limit({ key: ip });
      if (!success) {
        return json(
          { reply: "You're sending messages quite fast. Please wait a minute and try again." },
          429,
          cors,
        );
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const messages = cleanHistory(body && body.messages);
    if (!messages) return json({ error: "No visitor message" }, 400, cors);

    // Optional picture (a frame or screenshot) sent with the visitor's latest message.
    const img = body && body.image;
    if (
      img &&
      IMAGE_TYPES.includes(img.media_type) &&
      typeof img.data === "string" &&
      img.data.length > 0 &&
      img.data.length <= MAX_IMAGE_B64 &&
      /^[A-Za-z0-9+/=]+$/.test(img.data)
    ) {
      const last = messages[messages.length - 1];
      last.content = [
        { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
        { type: "text", text: last.content },
      ];
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        cache_control: { type: "ephemeral" }, // reuse the long fact sheet cheaply between messages
        system: SYSTEM_PROMPT,
        output_config: { effort: "low" }, // quick, short chat answers
        messages,
      });

      if (response.stop_reason === "refusal") {
        return json({ reply: CONTACT_FALLBACK }, 200, cors);
      }

      const reply = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return json({ reply: reply || CONTACT_FALLBACK }, 200, cors);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        console.error("Anthropic API key missing or invalid");
      } else if (error instanceof Anthropic.RateLimitError) {
        console.error("Anthropic rate limit hit");
      } else if (error instanceof Anthropic.APIError) {
        console.error(`Anthropic API error ${error.status}: ${error.message}`);
      } else {
        console.error("Unexpected error:", error);
      }
      return json({ reply: CONTACT_FALLBACK }, 502, cors);
    }
  },
};

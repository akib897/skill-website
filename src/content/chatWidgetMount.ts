// Behaviour for the "Ask Skill" widget.
//
// Talks to our own chatbot (a Cloudflare Worker in /chatbot that answers with
// Claude Haiku), so no API key ever reaches the browser. If the bot can't be
// reached it degrades to the scripted answers below, so the widget is never
// broken in production.

import { chatWidgetHtml, CHAT_CSS } from "./chatWidget";
import { CHAT_API_URL } from "@/lib/site";

// `img` is a small preview of a picture the visitor attached (display only).
type Msg = { role: "user" | "assistant"; content: string; img?: string };

const GREETING =
  "Hi 👋 I'm Skill AI, the Skill Graphics assistant. Ask me about retouching, AI on-model images, video editing, quotes or file specs — or attach a product photo and I'll suggest what it needs. What are you working on?";

const EMOJIS = ["\u{1F44B}", "\u{1F642}", "\u{1F60A}", "\u{1F604}", "\u{1F64F}", "\u{1F44D}", "\u{1F44C}", "\u{1F525}", "\u2728", "\u{1F4F8}", "\u{1F3AC}", "\u{1F5BC}\ufe0f", "\u{1F45F}", "\u{1F457}", "\u{1F45C}", "\u23f1\ufe0f", "\u{1F4B0}", "\u{1F4E6}", "\u2705", "\u2753", "\u{1F680}", "\u{1F91D}", "\u2764\ufe0f", "\u{1F4AC}"];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Shrink a picture in the browser before sending: the bot gets a JPEG up to
// 1280px (well under its ~1 MB limit) and the chat shows a small thumbnail.
async function shrinkImage(file: File): Promise<{ data: string; thumb: string } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const draw = (max: number, quality: number) => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", quality);
    };
    let full = draw(1280, 0.85);
    if (full.length > 1_400_000) full = draw(960, 0.75);
    const thumb = draw(240, 0.7);
    if (!full || !thumb) return null;
    return { data: full.split(",")[1], thumb };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Quick questions. Tapping one shows the team's approved answer instantly
// (from the Skill Graphics Featurebase training Q&A); typed questions go to
// the bot. The same answers are the fallback if the bot can't be reached.
const CHIPS: Array<{ label: string; key: string }> = [
  { label: "What do you do?", key: "about" },
  { label: "What can you do with AI?", key: "ai" },
  { label: "AI models for our clothes?", key: "tryon" },
  { label: "E-commerce image editing", key: "ecom" },
  { label: "How can I get a quote?", key: "price" },
  { label: "How fast can you deliver?", key: "turn" },
  { label: "Can we do a test first?", key: "test" },
  { label: "File formats", key: "spec" },
  { label: "Team size", key: "cap" },
  { label: "Payment terms", key: "pay" },
  { label: "Talk to a person", key: "human" },
  { label: "Careers", key: "job" },
];

const CANNED: Record<string, string> = {
  about:
    "I'm Skill AI, the assistant for Skill Graphics, a Skill Ventures company (skill.ventures). We do image and video post-production: classic retouching such as ghost mannequin, on-model, flat lay and packshots, AI-generated content like AI on-model images and product scenes, or a mix of the two. What are you working on?",
  ai:
    "At Skill, we turn one production into many more variations and assets, without you having to shoot everything. From a single input, we create ready-to-upload packshots, virtual try-on with on-model imagery, and videos for e-commerce, websites and social media. Every AI output is reviewed and finished by a human. What are you starting from: product photos, an existing shoot, or something else?",
  tryon:
    "Yes, virtual try-on with AI on-model imagery is one of our core services. Could you share a few product photos and an example of the look you want? It also helps to know where the images will be used and roughly how many styles you have. We usually suggest a small test first so you can see the quality before a full batch.",
  ecom:
    "Yes. E-commerce image post-production is one of our core areas. We can support product cleanup, clipping and masking, background preparation, colour correction, ghost mannequin, shadows, resizing, cropping, file formatting, and other brand-specific requirements, and build consistent workflows for recurring or high-volume production. Roughly how many images do you have, and is it one-off or ongoing?",
  svc:
    "We cover classic, human-led image retouching (product and fashion retouching, ghost mannequin, clipping path, masking, background removal, colour correction, colourways, compositing, shadows and resizing), video editing (product, brand and social videos, motion graphics, colour grading and versioning), and AI generation and AI-assisted editing such as AI on-model images and product scenes. Which of those is closest to what you need?",
  price:
    "Pricing depends on the type of work, whether it's AI or manual, the complexity, volume and turnaround. For images, please share the approximate quantity, sample images, editing requirements, a reference of the expected result, deadline, output format and dimensions. For video, also include the raw footage duration and expected final runtime. If it's recurring, add your weekly or monthly volume, and the team will send an accurate quote.",
  turn:
    "We handle high volumes, but turnaround depends on the volume, complexity, editing level and source material, so the team confirms it for each project. Share a few samples, your instructions and your deadline, and they'll come back with the best turnaround they can commit to.",
  test:
    "Tests can definitely be discussed, including for AI work. Tell me what editing or AI work you need and how many test files you'd like to send, and share your instructions and references. The team will review it and confirm the details with you.",
  spec:
    "We work with common professional image formats and prepare outputs to your requirements, such as PSD, TIFF, JPEG or PNG. Tell us what source files you have and what final format you need, plus any layers, colour profiles, naming conventions or technical specs. We can also follow your own guidelines and PSD templates.",
  cap:
    "We have 350 in-house retouchers across two dedicated image studios, plus a team of 50 in-house video editors. That lets us assign a dedicated team to your work and keep quality consistent, even at high volume. What kind of images are you looking to have edited?",
  pay:
    "We offer flexible payment terms ranging from 7 to 60 days, depending on the project scope and commercial agreement. We support several payment methods, including IBAN, PayPal, Payoneer and direct bank transfer. If your company has a preferred method or procedure, let us know and the team will find a suitable arrangement.",
  human:
    "Of course. A Skill Graphics team member can help with quotations, complex requirements, urgent production, ongoing projects or billing. Share a brief summary of your requirement here, or reach the team directly on WhatsApp (+880 1723 099983), at support@skill.ventures, or with the Book a call button below.",
  book:
    "Happy to set that up: use the Book a call button below to pick a time with the team. If you'd rather not book a slot, WhatsApp (+880 1723 099983) or support@skill.ventures work just as well.",
  clients:
    "We respect our clients' confidentiality, so we don't confirm or share client names, volumes or project details. Happy to show what we can do on your own images instead. What are you working on?",
  nda:
    "We understand projects may involve confidential or unreleased material. NDA, confidentiality, data-security and project-specific handling requirements can be discussed directly with our team so they're reviewed and confirmed before production begins.",
  project:
    "I don't have access to production or account details here, so the team needs to check that for you. Please send your project or batch reference to support@skill.ventures or on WhatsApp (+880 1723 099983) and they'll follow up.",
  issue:
    "I'm sorry about that. Please share the affected filenames or batch/project information and describe the issue; a screenshot or reference showing the expected result helps too. Send it to support@skill.ventures or on WhatsApp (+880 1723 099983) and the team will review the files and follow up with you.",
  contact:
    "WhatsApp on +880 1723 099983 is the fastest route, and support@skill.ventures reaches the team for anything more detailed. Career and internship enquiries go to hr@skill.ventures.",
  job:
    "Job and internship enquiries go to hr@skill.ventures. Send your CV or portfolio and the HR team will take a look.",
};

const FALLBACK =
  "That one's better answered by a person, so I don't guess. WhatsApp on +880 1723 099983 is the fastest route, or email support@skill.ventures and the team will get back to you.";

function classify(text: string): keyof typeof CANNED | null {
  const t = text.toLowerCase();
  if (/payment|pay |invoice terms|paypal|payoneer|iban|bank transfer/.test(t)) return "pay";
  if (/price|pricing|cost|quote|rate|budget|how much/.test(t)) return "price";
  if (/turnaround|how (long|fast)|deadline|delivery time|speed|rush|urgent|tomorrow/.test(t)) return "turn";
  if (/on.?model|try.?on|ai model|virtual/.test(t)) return "tryon";
  if (/\bai\b|artificial|generat/.test(t)) return "ai";
  if (/\bnda\b|confidential|unreleased/.test(t)) return "nda";
  if (/spec|format|file|raw|tiff|psd|resolution/.test(t)) return "spec";
  if (/job|career|hire|hiring|intern|apply|position|vacanc|\bcv\b/.test(t)) return "job";
  if (/your clients|who.*(clients|brands)|client list|work with (brand|any brand)|reference client/.test(t))
    return "clients";
  if (/complain|unhappy|not happy|poor quality|issue|problem|wrong|not correct|revision|correction/.test(t))
    return "issue";
  if (/my (project|order|delivery)|existing project|ongoing project|current project|order status|project status/.test(t))
    return "project";
  if (/person|human|someone|team member|speak to|talk to/.test(t)) return "human";
  if (/whatsapp|contact|email|phone|reach you|get in touch|support/.test(t)) return "contact";
  if (/book|call|meeting|calendly|schedule|demo/.test(t)) return "book";
  if (/test|sample|trial/.test(t)) return "test";
  if (/how many (people|retouchers|editors)|team size|capacity|volume/.test(t)) return "cap";
  if (/e-?commerce|online store|shopify|amazon|marketplace/.test(t)) return "ecom";
  if (/who are you|what do you do|about you|about skill/.test(t)) return "about";
  if (/service|offer|do you do|can you do|retouch|ghost mannequin|background|clipping|mask|video/.test(t))
    return "svc";
  return null;
}

// Turn web addresses, emails and the WhatsApp number in a message into links.
// Builds DOM nodes (never innerHTML) so visitor or bot text can't inject markup.
const LINK_RE =
  /(https?:\/\/[^\s)]+|www\.[^\s)]+|\b(?:skill\.ventures|skillgraphics\.(?:biz|com)|mvrk\.tv|wa\.me\/\d+|calendly\.com\/[^\s)]+)|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+880[ \d-]{9,14}\d)/g;

function appendLinked(parent: HTMLElement, text: string) {
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    let raw = m[0];
    const trail = raw.match(/[.,;:!?]+$/);
    if (trail) raw = raw.slice(0, -trail[0].length);
    const at = m.index ?? 0;
    if (at > last) parent.appendChild(document.createTextNode(text.slice(last, at)));
    let href: string;
    if (raw.includes("@") && !raw.startsWith("http")) href = "mailto:" + raw;
    else if (raw.startsWith("+880")) href = "https://wa.me/" + raw.replace(/\D/g, "");
    else href = /^https?:/.test(raw) ? raw : "https://" + raw;
    const a = document.createElement("a");
    a.href = href;
    a.textContent = raw;
    if (!href.startsWith("mailto:")) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    parent.appendChild(a);
    last = at + raw.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

const STORE = "sgc-thread-v2";

export function mountChatWidget(): () => void {
  // Injected straight into <body> rather than emitted by headerHtml(): this
  // site keeps parallel desktop and mobile trees, and headerHtml() lives
  // inside .desktop-layout, which is display:none below 640px. Mounting to
  // the body keeps one code path and one widget on every breakpoint.
  if (!document.getElementById("sgc-bubble")) {
    const host = document.createElement("div");
    host.id = "sgc-host";
    host.innerHTML = `<style>${CHAT_CSS}</style>` + chatWidgetHtml();
    document.body.appendChild(host);
  }

  const bubble = document.getElementById("sgc-bubble");
  const panel = document.getElementById("sgc-panel");
  const scroll = document.getElementById("sgc-scroll");
  const input = document.getElementById("sgc-input") as HTMLTextAreaElement | null;
  const send = document.getElementById("sgc-send");
  const close = document.getElementById("sgc-close");
  if (!bubble || !panel || !scroll || !input || !send || !close) return () => {};

  let thread: Msg[] = [];
  let busy = false;
  let leadShown = false;
  let leadDone = false;

  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.thread)) thread = parsed.thread;
      leadDone = Boolean(parsed.leadDone);
      leadShown = Boolean(parsed.leadShown);
    }
  } catch {
    /* private mode / quota — start fresh */
  }

  const persist = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ thread, leadDone, leadShown }));
    } catch {
      /* ignore */
    }
  };

  const toBottom = () => {
    // render() wipes and re-appends every message, so a single rAF can fire
     // before the new children have contributed their height. Assign now, on
    // the next two frames, and once more on a short timer.
    const pin = () => {
      scroll.scrollTop = scroll.scrollHeight;
    };
    pin();
    requestAnimationFrame(() => {
      pin();
      requestAnimationFrame(pin);
    });
    window.setTimeout(pin, 60);
  };

  const bubbleEl = (role: Msg["role"], text: string, img?: string) => {
    const div = document.createElement("div");
    div.className = "sgc-msg " + (role === "user" ? "sgc-user" : "sgc-bot");
    if (img && img.startsWith("data:image/")) {
      const pic = document.createElement("img");
      pic.src = img;
      pic.alt = "Attached picture";
      div.appendChild(pic);
    }
    if (role === "user") div.appendChild(document.createTextNode(text));
    else appendLinked(div, text);
    return div;
  };

  // Picture waiting to be sent with the next message.
  let pending: { data: string; thumb: string } | null = null;
  const fileInput = document.getElementById("sgc-file") as HTMLInputElement | null;
  const preview = document.getElementById("sgc-attach-preview");
  const previewImg = document.getElementById("sgc-attach-img") as HTMLImageElement | null;
  const setPending = (p: typeof pending) => {
    pending = p;
    if (preview) preview.setAttribute("data-open", p ? "1" : "0");
    if (previewImg) previewImg.src = p ? p.thumb : "";
  };

  const renderChips = () => {
    document.getElementById("sgc-chips")?.remove();
    const asked = new Set(
      thread.filter((m) => m.role === "user").map((m) => m.content.trim().toLowerCase())
    );
    const left = CHIPS.filter((c) => !asked.has(c.label.toLowerCase()));
    if (!left.length) return;

    const wrap = document.createElement("div");
    wrap.id = "sgc-chips";
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:2px 0 4px;";

    const label = document.createElement("p");
    label.style.cssText =
      "margin:0;font:600 10.5px 'Space Grotesk';letter-spacing:.15em;text-transform:uppercase;color:#7b7b83;";
    label.textContent = asked.size ? "Or ask about" : "Common questions";
    wrap.appendChild(label);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;";
    left.forEach((c) => {
      const b = document.createElement("button");
      b.className = "sgc-chip";
      b.type = "button";
      b.textContent = c.label;
      b.addEventListener("click", () => ask(c.label, c.key));
      row.appendChild(b);
    });
    wrap.appendChild(row);
    scroll.appendChild(wrap);
  };

  const renderLead = () => {
    if (leadDone || document.getElementById("sgc-lead")) return;
    const card = document.createElement("div");
    card.id = "sgc-lead";
    card.className = "sgc-msg";
    card.style.cssText =
      "align-self:stretch;background:#15151b;border:1px solid #2b2b32;border-radius:16px;padding:16px;";
    card.innerHTML = `
      <p style="font:600 11px 'Space Grotesk';letter-spacing:.14em;text-transform:uppercase;color:#b98cd0;margin:0 0 8px;">So we can follow up</p>
      <p style="font:400 13px/1.6 'Space Grotesk';color:#9a9aa2;margin:0 0 13px;">Leave your name and email and a producer picks this up even if you close the tab.</p>
      <div style="display:grid;gap:8px;">
        <input id="sgc-lead-name" class="sgc-field" placeholder="Name" autocomplete="name">
        <input id="sgc-lead-mail" class="sgc-field" type="email" placeholder="Work email" autocomplete="email">
      </div>
      <div style="display:flex;gap:8px;margin-top:11px;">
        <button id="sgc-lead-send" type="button" style="font:600 13px 'Space Grotesk';background:#fff;color:#141414;border:0;border-radius:100px;padding:10px 20px;cursor:pointer;">Send</button>
        <button id="sgc-lead-skip" type="button" style="font:500 13px 'Space Grotesk';background:transparent;color:#8f8f96;border:0;padding:10px 6px;cursor:pointer;">Not now</button>
      </div>`;
    scroll.appendChild(card);

    card.querySelector("#sgc-lead-skip")?.addEventListener("click", () => {
      leadDone = true;
      persist();
      card.remove();
    });
    card.querySelector("#sgc-lead-send")?.addEventListener("click", () => {
      const name = (card.querySelector("#sgc-lead-name") as HTMLInputElement)?.value.trim();
      const email = (card.querySelector("#sgc-lead-mail") as HTMLInputElement)?.value.trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        const f = card.querySelector("#sgc-lead-mail") as HTMLInputElement;
        f.style.borderColor = "#d9534a";
        f.focus();
        return;
      }
      leadDone = true;
      persist();
      card.remove();
      void fetch("/api/chat-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, page: location.pathname, thread }),
      }).catch(() => {});
      thread.push({
        role: "assistant",
        content:
          "Thanks " +
          (name || "\u2014 noted") +
          ". A producer will follow up with this conversation attached, so you won't have to repeat any of it.",
      });
      persist();
      render();
    });
  };

  const render = () => {
    scroll.innerHTML = "";
    scroll.appendChild(bubbleEl("assistant", GREETING));
    thread.forEach((m) => scroll.appendChild(bubbleEl(m.role, m.content, m.img)));
    if (busy) {
      const t = document.createElement("div");
      t.style.cssText =
        "align-self:flex-start;background:#191920;border:1px solid #23232b;border-radius:16px;padding:13px 16px;display:flex;gap:5px;align-items:center;";
      t.innerHTML = '<span class="sgc-dot"></span><span class="sgc-dot"></span><span class="sgc-dot"></span>';
      scroll.appendChild(t);
    } else {
      if (leadShown) renderLead();
      renderChips();
    }
    const pad = document.createElement("div");
    pad.style.cssText = "height:4px;flex:none;";
    scroll.appendChild(pad);
    toBottom();
  };

  async function ask(text: string, instantKey?: string) {
    // `input` is already non-null past the guard above, but this is a hoisted
    // function declaration, so TS won't carry that narrowing in here.
    if (!input) return;
    const pic = instantKey ? null : pending;
    const q = text.trim() || (pic ? "Here's a picture of what I'm working on." : "");
    if (!q || busy) return;
    thread.push(pic ? { role: "user", content: q, img: pic.thumb } : { role: "user", content: q });
    input.value = "";
    input.style.height = "auto";
    if (pic) setPending(null);
    busy = true;
    render();

    // Chip taps answer from the approved copy immediately — no network wait.
    if (instantKey && CANNED[instantKey]) {
      thread.push({ role: "assistant", content: CANNED[instantKey] });
      busy = false;
      if (!leadDone) leadShown = true;
      persist();
      render();
      return;
    }

    let answer = "";
    try {
      const res = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: thread.map((m) => ({ role: m.role, content: m.content })),
          image: pic ? { media_type: "image/jpeg", data: pic.data } : undefined,
          page: location.pathname,
        }),
      });
      // The bot also returns a friendly { reply } on rate limits and errors.
      const data = await res.json().catch(() => null);
      if (data && typeof data.reply === "string" && data.reply.trim()) answer = data.reply.trim();
    } catch {
      /* offline or route absent — fall through to canned */
    }
    if (!answer) {
      const key = classify(q);
      answer = key ? CANNED[key] : FALLBACK;
    }

    thread.push({ role: "assistant", content: answer });
    busy = false;
    if (!leadDone) leadShown = true;
    persist();
    render();
  }

  const setOpen = (open: boolean) => {
    panel.setAttribute("data-open", open ? "1" : "0");
    bubble.setAttribute("data-hidden", open ? "1" : "0");
    bubble.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      render();
      window.setTimeout(() => input.focus(), 320);
    } else {
      (bubble as HTMLElement).focus();
    }
  };

  const onBubble = () => setOpen(true);
  const onClose = () => setOpen(false);
  const onSend = () => void ask(input.value);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input.value);
    }
  };
  const onGrow = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 88) + "px";
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && panel.getAttribute("data-open") === "1") setOpen(false);
  };

  // Emoji picker
  const emojiBtn = document.getElementById("sgc-emoji");
  const emojiBox = document.getElementById("sgc-emojis");
  if (emojiBox && !emojiBox.childElementCount) {
    EMOJIS.forEach((em) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = em;
      b.setAttribute("aria-label", em);
      emojiBox.appendChild(b);
    });
  }
  const setEmojiOpen = (open: boolean) => {
    emojiBox?.setAttribute("data-open", open ? "1" : "0");
    emojiBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const onEmojiBtn = () => setEmojiOpen(emojiBox?.getAttribute("data-open") !== "1");
  const onEmojiPick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    const em = b.textContent || "";
    const at = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, at) + em + input.value.slice(input.selectionEnd ?? at);
    setEmojiOpen(false);
    input.focus();
    input.selectionStart = input.selectionEnd = at + em.length;
    onGrow();
  };

  // Picture attachments
  const attachBtn = document.getElementById("sgc-attach");
  const removeBtn = document.getElementById("sgc-attach-remove");
  const onAttach = () => fileInput?.click();
  const onFile = async () => {
    const f = fileInput?.files?.[0];
    if (fileInput) fileInput.value = "";
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      thread.push({
        role: "assistant",
        content:
          "I can only look at pictures (JPEG, PNG, WebP or GIF) here. For other files, email them to support@skill.ventures or share a cloud link and the team will review them.",
      });
      persist();
      render();
      return;
    }
    const shrunk = await shrinkImage(f);
    if (shrunk) {
      setPending(shrunk);
      input.focus();
    }
  };
  const onRemove = () => setPending(null);

  // Book a call opens the site's Calendly popup when it's available.
  const bookLink = document.getElementById("sgc-book");
  const onBook = (e: MouseEvent) => {
    if (typeof window.__openCalendly === "function") {
      e.preventDefault();
      window.__openCalendly();
    }
  };

  emojiBtn?.addEventListener("click", onEmojiBtn);
  emojiBox?.addEventListener("click", onEmojiPick);
  attachBtn?.addEventListener("click", onAttach);
  fileInput?.addEventListener("change", onFile);
  removeBtn?.addEventListener("click", onRemove);
  bookLink?.addEventListener("click", onBook);

  bubble.addEventListener("click", onBubble);
  close.addEventListener("click", onClose);
  send.addEventListener("click", onSend);
  input.addEventListener("keydown", onKey);
  input.addEventListener("input", onGrow);
  document.addEventListener("keydown", onEsc);

  // Let any element on the page open the chat: <a href="#chat"> or
  // [data-open-chat]. Gives copy blocks a "talk to us" affordance for free.
  const onOpenLink = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('a[href="#chat"], a[href="/#chat"], [data-open-chat]')) return;
    e.preventDefault();
    setOpen(true);
  };
  document.addEventListener("click", onOpenLink);

  render();

  return () => {
    emojiBtn?.removeEventListener("click", onEmojiBtn);
    emojiBox?.removeEventListener("click", onEmojiPick);
    attachBtn?.removeEventListener("click", onAttach);
    fileInput?.removeEventListener("change", onFile);
    removeBtn?.removeEventListener("click", onRemove);
    bookLink?.removeEventListener("click", onBook);
    bubble.removeEventListener("click", onBubble);
    close.removeEventListener("click", onClose);
    send.removeEventListener("click", onSend);
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("input", onGrow);
    document.removeEventListener("keydown", onEsc);
    document.removeEventListener("click", onOpenLink);
    document.getElementById("sgc-host")?.remove();
  };
}

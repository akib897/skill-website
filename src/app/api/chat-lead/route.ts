// POST /api/chat-lead — a visitor left their name and email in the "Ask Skill" chat.
//
// Emails the lead plus the chat transcript to the same inbox as the contact
// form (CONTACT_TO_EMAIL, default support@skill.ventures), using the site's
// existing SMTP settings. If email isn't configured it still logs the lead.

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

type Msg = { role: string; content: string };

export async function POST(req: Request) {
  let body: { name?: string; email?: string; page?: string; thread?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = String(body.name || "").slice(0, 120).trim();
  const email = String(body.email || "").slice(0, 200).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "bad_email" }, { status: 400 });
  }

  const transcript = (Array.isArray(body.thread) ? body.thread : [])
    .slice(-30)
    .map((m) => (m.role === "user" ? "Visitor: " : "Ask Skill: ") + String(m.content).slice(0, 2000))
    .join("\n\n");

  const summary = [
    "New lead from the Ask Skill chat on the Skill Graphics website",
    "",
    "Name:  " + (name || "(not given)"),
    "Email: " + email,
    "Page:  " + String(body.page || "/").slice(0, 200),
    "Time:  " + new Date().toISOString(),
    "",
    "--- chat transcript ---",
    "",
    transcript || "(no messages)",
  ].join("\n");

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } =
    process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.log("[chat-lead] SMTP not configured; lead:\n" + summary);
    return NextResponse.json({ ok: true });
  }

  const port = Number(SMTP_PORT);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"Skill Graphics Website" <${CONTACT_FROM_EMAIL || SMTP_USER}>`,
      to: CONTACT_TO_EMAIL || "support@skill.ventures",
      replyTo: email,
      subject: `Chat lead — ${name || email}`,
      text: summary,
    });
  } catch (err) {
    console.error("[chat-lead] send failed", err, "\n" + summary);
  }

  return NextResponse.json({ ok: true });
}

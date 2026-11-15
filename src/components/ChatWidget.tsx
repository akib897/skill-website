"use client";

import { useEffect } from "react";
import { mountChatWidget } from "@/content/chatWidgetMount";

// "Ask Skill" chat. Mounted once in app/layout.tsx so it stays open (and keeps
// the conversation) while the visitor moves between pages.
export default function ChatWidget() {
  useEffect(() => mountChatWidget(), []);
  return null;
}

"use client";

import { FeaturebaseProvider as Provider } from "featurebase-js/react";

// Workspace app id (public identifier — safe to ship to the browser).
// The SDK resolves it to the workspace slug + enabled modules server-side,
// so which surfaces boot is controlled from General → Manage modules in the
// Featurebase dashboard rather than from here.
const FEATUREBASE_APP_ID = "6aa27ece47ef093462455852";

// Mounted once in app/layout.tsx, never per-route — the messenger boots on
// mount and would otherwise re-boot on every navigation.
export default function FeaturebaseProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <Provider appId={FEATUREBASE_APP_ID}>{children}</Provider>;
}

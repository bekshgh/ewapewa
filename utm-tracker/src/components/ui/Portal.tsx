"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into <body>. Dialogs need it: the page content animates in
 * with a transform, and a transformed ancestor turns `position: fixed` into
 * "fixed to that box" — a dialog would sit in the middle of a long page
 * instead of the middle of the screen.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}

"use client";
import { useEffect } from "react";
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const field = document.activeElement,
        editing = field instanceof HTMLElement && field.matches("input,textarea,[contenteditable=true]"),
        // Pinch zoom shrinks the visual viewport without changing the layout.
        // Convert back to layout pixels before deciding whether a keyboard is open.
        visibleHeight = viewport.height * viewport.scale,
        layoutHeight = document.documentElement.clientHeight || window.innerHeight,
        keyboard = editing && Number.isFinite(visibleHeight) && visibleHeight > 0 && layoutHeight - visibleHeight > 140;
      document.documentElement.dataset.keyboard = keyboard ? "open" : "closed";
      if (keyboard)
        document.documentElement.style.setProperty("--scene-visible-height", `${Math.round(visibleHeight)}px`);
      else document.documentElement.style.removeProperty("--scene-visible-height");
    };
    const afterFocus = () => requestAnimationFrame(update);
    update();
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterFocus);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterFocus);
      delete document.documentElement.dataset.keyboard;
      document.documentElement.style.removeProperty("--scene-visible-height");
    };
  }, []);
}

"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
// Worker SSR must not start GSAP's ticker during module initialization.
if (typeof window !== "undefined") gsap.registerPlugin(useGSAP);

/** Scoped, optional decoration: never gates content, state or network requests. */
export default function SceneMotion({ entrance = false }: { entrance?: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  useGSAP((_context, contextSafe) => {
    const root = marker.current?.parentElement;
    if (!root || !contextSafe) return;
    const media = gsap.matchMedia();
    let remove = () => {};
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const badges = new Set<HTMLElement>();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (entrance && root.classList.contains("screening-login")) {
        gsap.from(root.querySelectorAll(".account-brand, .account-card > h1, .account-intro, .account-form"), {
          y: 24, opacity: 0, duration: .85, stagger: .16, ease: "power2.out", clearProps: "transform,opacity",
        });
      }
      const respond = contextSafe((event: MouseEvent) => {
        const button = (event.target as Element)?.closest<HTMLButtonElement>(".save-button, .feedback-actions button, .detail-actions button[aria-pressed]");
        if (!button || button.disabled || !root.contains(button)) return;
        gsap.killTweensOf(button);
        gsap.timeline().to(button, { scale: 1.12, duration: .19, ease: "power2.out" })
          .to(button, { scale: 1, duration: .29, ease: "power2.out", clearProps: "transform" });
        if (!button.classList.contains("save-button")) return;
        const frame = requestAnimationFrame(contextSafe(() => {
          frames.delete(frame);
          if (!button.isConnected || button.getAttribute("aria-pressed") !== "true") return;
          const host = button.closest<HTMLElement>(".poster-wrap, .featured-pick");
          if (!host) return;
          host.querySelector(".scene-save-confirmation")?.remove();
          const badge = document.createElement("span");
          badge.className = "scene-save-confirmation";
          badge.textContent = "✓ Saved to watchlist";
          badge.setAttribute("aria-hidden", "true");
          host.appendChild(badge);
          badges.add(badge);
          gsap.from(badge, { y: 10, opacity: 0, duration: .38, clearProps: "transform,opacity" });
          const timer = setTimeout(() => { badge.remove(); badges.delete(badge); timers.delete(timer); }, 1800);
          timers.add(timer);
        }));
        frames.add(frame);
      });
      root.addEventListener("click", respond, true);
      remove = () => root.removeEventListener("click", respond, true);
      return () => remove();
    });
    return () => { remove(); frames.forEach(cancelAnimationFrame); timers.forEach(clearTimeout); badges.forEach(b => b.remove()); media.revert(); };
  }, { scope: marker, dependencies: [entrance] });
  return <span ref={marker} hidden aria-hidden="true" />;
}

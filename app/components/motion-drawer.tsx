"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";

export default function MotionDrawer({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !visible) { setVisible(true); return; }
    if (!visible) return;
    const media = gsap.matchMedia();
    media.add({ animate: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, context => {
      if (!context.conditions?.animate) {
        gsap.set(el, { clearProps: "height,opacity,overflow" });
        if (!open) setVisible(false);
        return;
      }
      gsap.set(el, { overflow: "hidden" });
      const tween = open
        ? gsap.fromTo(el, { height: 0, opacity: .2 }, { height: "auto", opacity: 1, duration: .48, ease: "power2.out", onComplete: () => { gsap.set(el, { clearProps: "height,opacity,overflow" }); } })
        : gsap.to(el, { height: 0, opacity: 0, duration: .48, ease: "power2.inOut", onComplete: () => setVisible(false) });
      return () => { tween.kill(); };
    });
    return () => media.revert();
  }, [open, visible]);
  return <div ref={ref} className="catalogue-filter-drawer" hidden={!visible} inert={!open}>{children}</div>;
}

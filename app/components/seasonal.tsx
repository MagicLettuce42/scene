"use client";
// The Halloween campaign is retired; evergreen UI is active on the first render.
export function useHalloween() {
  return false;
}

export function Pumpkin({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6c-5-3-9 0-9 6s4 10 9 8c5 2 9-2 9-8s-4-9-9-6Z" />
      <path d="M12 6c-1-3 1-4 3-4M7 11l2-2 1 3-3-1ZM17 11l-2-2-1 3 3-1ZM7 15l3 2 2-1 2 1 3-2" />
    </svg>
  );
}

export function HalloweenBadge() {
  return (
    <span className="halloween-badge">
      <Pumpkin /> Halloween on Scene
    </span>
  );
}

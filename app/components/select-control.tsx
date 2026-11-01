import type { ComponentPropsWithRef } from "react";
import { ChevronDown } from "lucide-react";

/** Keep the native picker, labels and keyboard behaviour with a shared visual indicator. */
export default function SelectControl(props: ComponentPropsWithRef<"select">) {
  if (props.multiple || props.size) return <select {...props} />;
  return (
    <span className={`select-control${props.disabled ? " is-disabled" : ""}`}>
      <select {...props} />
      <span className="select-indicator" aria-hidden="true">
        <ChevronDown size={24} strokeWidth={2} />
      </span>
    </span>
  );
}

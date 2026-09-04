import { useState } from "react";

export default function Toggle({ defaultChecked = false, onChange }) {
  const [on, setOn] = useState(defaultChecked);

  const toggle = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.4)] focus:outline-none ${
        on ? "bg-purple-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

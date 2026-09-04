import { ArrowUp, ArrowDown } from "lucide-react";

export default function TrendIndicator({ current = 0, previous = 0 }) {
  const delta = Number(current) - Number(previous);
  if (!Number.isFinite(delta) || delta === 0) {
    return <p className="text-[11px] text-gray-400 mt-1">No change</p>;
  }
  const isUp = delta > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <p
      className={`text-[11px] font-medium mt-1 inline-flex items-center gap-1 ${
        isUp ? "text-green-500" : "text-red-500"
      }`}
    >
      <Icon className="w-3 h-3" />
      {isUp ? `+${delta}` : `${delta}`} from yesterday
    </p>
  );
}
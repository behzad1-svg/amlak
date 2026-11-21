// فیلتر مشاور برای نمای «امروز» (فقط مدیر) — با عوض شدن، صفحه با همان فیلتر لود می‌شود.
"use client";
import { Select } from "@/components/ui/Input";

export function TodayAgentFilter({
  agents,
  value,
}: {
  agents: { id: string; name: string }[];
  value: string | null;
}) {
  return (
    <Select
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        window.location.href = v ? `/today?agentId=${encodeURIComponent(v)}` : "/today";
      }}
      aria-label="مشاور"
      className="w-48"
    >
      <option value="">همه مشاورها</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

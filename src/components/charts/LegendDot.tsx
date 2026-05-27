export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        style={{ width: 9, height: 9, background: color, borderRadius: 999 }}
      />
      <span style={{ color: "var(--fg-2)" }}>{label}</span>
    </span>
  );
}

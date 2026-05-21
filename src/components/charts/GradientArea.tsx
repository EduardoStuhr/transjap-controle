export function gradientAreaProps(id: string, color: string) {
  return {
    defs: (
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
    ),
    fillId: `url(#${id})`,
  };
}

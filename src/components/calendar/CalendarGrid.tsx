import { useMemo } from "react";
import { Icon } from "@/components/AppLayout";
import {
  CALENDAR_TYPE_META,
  type CalendarItem,
  type CalendarViewMode,
} from "@/components/calendar/calendar-types";

type Props = {
  anchorDate: Date;
  viewMode: CalendarViewMode;
  items: CalendarItem[];
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  onSelectItem: (item: CalendarItem) => void;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function makeDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12));
}

function dayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function dateTitle(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function daysForView(anchorDate: Date, viewMode: CalendarViewMode) {
  if (viewMode === "day")
    return [makeDate(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())];

  if (viewMode === "week") {
    const start = makeDate(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + i);
      return date;
    });
  }

  const firstDay = makeDate(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const daysInMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate();
  const startPadding = firstDay.getUTCDay();
  const totalCells = Math.ceil((startPadding + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startPadding + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return makeDate(anchorDate.getFullYear(), anchorDate.getMonth(), dayNum);
  });
}

function ItemCard({ item, onClick }: { item: CalendarItem; onClick: () => void }) {
  const meta = CALENDAR_TYPE_META[item.type];
  const time = item.time ? `${item.time}${item.endTime ? `-${item.endTime}` : ""}` : "";
  const tooltip = [
    meta.label,
    item.title,
    time,
    item.priority ? `Prioridade: ${item.priority}` : "",
    item.status ? `Status: ${item.status}` : "",
    item.createdBy ? `Criado por: ${item.createdBy}` : "",
    item.assignedTo.length ? `Responsável: ${item.assignedTo.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      title={tooltip}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`group flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[10px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-md ${meta.bg} ${meta.border} ${meta.text}`}
    >
      <Icon name={meta.icon} className="text-[13px]" />
      <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[8px] uppercase tracking-wider">
        {meta.label}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}

export function CalendarGrid({
  anchorDate,
  viewMode,
  items,
  selectedDate,
  onSelectDay,
  onSelectItem,
}: Props) {
  const today = isoDate(new Date());
  const days = useMemo(() => daysForView(anchorDate, viewMode), [anchorDate, viewMode]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    }
    for (const dayItems of map.values()) {
      dayItems.sort(
        (a, b) =>
          (a.time || "99:99").localeCompare(b.time || "99:99") ||
          CALENDAR_TYPE_META[a.type].label.localeCompare(CALENDAR_TYPE_META[b.type].label),
      );
    }
    return map;
  }, [items]);

  const columns = viewMode === "day" ? "grid-cols-1" : "grid-cols-7";

  return (
    <div className="rounded-2xl border border-border-low bg-surface-container/95 p-4 shadow-industrial sm:p-5">
      {viewMode !== "day" && (
        <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
      )}

      <div className={`grid ${columns} gap-2`}>
        {days.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-32 rounded-xl border border-border-low/30 bg-surface-low/20"
              />
            );
          }

          const dateStr = isoDate(date);
          const dayItems = itemsByDay.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const visibleItems = dayItems.slice(0, 3);
          const hiddenCount = Math.max(0, dayItems.length - visibleItems.length);

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDay(dateStr)}
              className={`group min-h-32 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-bright/65 hover:shadow-industrial sm:min-h-36 ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.55)]"
                  : isToday
                    ? "border-primary/70 bg-surface-bright/50"
                    : dayItems.length
                      ? "border-border-low bg-surface-highest/60"
                      : "border-border-low/60 bg-surface-highest/30"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  {viewMode === "day" && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      {dateTitle(date)}
                    </p>
                  )}
                  {viewMode === "week" && (
                    <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
                      {dayLabel(date)}
                    </p>
                  )}
                  <span
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-sm font-black ${
                      isToday ? "bg-primary text-on-primary" : "text-on-surface"
                    }`}
                  >
                    {date.getUTCDate()}
                  </span>
                </div>
                {dayItems.length > 0 && (
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black text-on-surface-variant">
                    {dayItems.length}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {visibleItems.map((item) => (
                  <ItemCard key={item.id} item={item} onClick={() => onSelectItem(item)} />
                ))}
                {hiddenCount > 0 && (
                  <span className="block rounded-md border border-dashed border-border-low px-2 py-1 text-[10px] font-bold text-on-surface-variant">
                    + {hiddenCount} itens
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

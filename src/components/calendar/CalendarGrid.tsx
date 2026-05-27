import { useMemo } from "react";
import { Icon } from "@/components/AppLayout";
import {
  CALENDAR_TYPE_META,
  calendarItemAccent,
  type CalendarItem,
  type CalendarViewMode,
} from "@/components/calendar/calendar-types";

type Props = {
  anchorDate: Date;
  viewMode: CalendarViewMode;
  items: CalendarItem[];
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  onSelectItem: (item: CalendarItem, date: string) => void;
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

function fmtDateIso(iso?: string) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
  const displayMeta = item.completed && item.originalType === "reminder" ? CALENDAR_TYPE_META["completed_task"] : meta;
  const accent = calendarItemAccent(item);
  const usesReminderColor = item.originalType === "reminder" && Boolean(item.color);
  const time = item.time ? `${item.time}${item.endTime ? `-${item.endTime}` : ""}` : "";
  const tooltip = [
    meta.label,
    item.title,
    item.completed && item.completionLabel ? item.completionLabel : time,
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
      style={
        usesReminderColor
          ? {
              backgroundColor: `${accent.color}24`,
              borderColor: `${accent.color}55`,
              color: accent.color,
            }
          : undefined
      }
      className={`group flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[10px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-md ${
        usesReminderColor ? "" : `${displayMeta.bg} ${displayMeta.border} ${displayMeta.text}`
      }`}
    >
      <Icon name={item.completed && item.originalType === "reminder" ? "check_circle" : meta.icon} className="text-[13px]" />
      <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[8px] uppercase tracking-wider">
        {item.completed && item.originalType === "reminder" ? "Concluído" : meta.label}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}

function isPeriodReminder(item: CalendarItem) {
  // Only consider as a period when it's a reminder, has an endDate and is not completed
  return (
    item.originalType === "reminder" && !item.completed && Boolean(item.endDate && item.endDate > item.date)
  );
}

function PeriodBand({
  item,
  date,
  onClick,
}: {
  item: CalendarItem;
  date: string;
  onClick: () => void;
}) {
  const accent = calendarItemAccent(item);
  const atStart = date === item.date;
  const atEnd = date === item.endDate;
  const showTitle = atStart || atEnd;
  const label = atStart ? `INÍCIO · ${item.title}` : atEnd ? `FIM · ${item.title}` : `Continuação: ${item.title}`;
  const tooltip = `${item.title}\n${fmtDateIso(item.date)} até ${fmtDateIso(item.endDate)}\nStatus: ${item.status}`;

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        backgroundColor: `${accent.color}30`,
        borderColor: `${accent.color}70`,
        color: accent.color,
      }}
      className={`flex h-6 w-full items-center border-y text-left text-[10px] font-bold transition-opacity hover:opacity-80 ${
        atStart ? "rounded-l-md border-l pl-2" : "pl-1"
      } ${atEnd ? "rounded-r-md border-r pr-2" : "pr-1"}`}
    >
      {atStart && <Icon name="notifications" className="mr-1 text-[12px]" />}
      {showTitle ? (
        <span className="truncate">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
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
    const displayedDays = days.flatMap((date) => (date ? [isoDate(date)] : []));
    for (const item of items) {
      // If the item is a completed reminder and has a completedDate, show only on that date
      let itemDays: string[];
      if (item.originalType === "reminder" && item.completed && item.completedDate) {
        itemDays = [item.completedDate];
      } else if (isPeriodReminder(item)) {
        itemDays = displayedDays.filter((date) => item.date <= date && date <= (item.endDate as string));
      } else {
        itemDays = [item.date];
      }
      for (const itemDate of itemDays) {
        map.set(itemDate, [...(map.get(itemDate) ?? []), item]);
      }
    }
    for (const dayItems of map.values()) {
      dayItems.sort(
        (a, b) =>
          (a.time || "99:99").localeCompare(b.time || "99:99") ||
          CALENDAR_TYPE_META[a.type].label.localeCompare(CALENDAR_TYPE_META[b.type].label),
      );
    }
    return map;
  }, [days, items]);

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
              className={`group relative min-h-32 overflow-hidden rounded-xl border p-2 pt-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-bright/65 hover:shadow-industrial sm:min-h-36 ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.55)]"
                  : isToday
                    ? "border-primary/70 bg-surface-bright/50"
                    : dayItems.length
                      ? "border-border-low bg-surface-highest/60"
                      : "border-border-low/60 bg-surface-highest/30"
              }`}
            >
              {dayItems.length > 0 && (
                <span className="absolute left-3 right-3 top-0 h-1 rounded-b-full bg-primary/80 shadow-[0_0_12px_rgba(255,215,0,0.45)]" />
              )}

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
                {visibleItems.map((item) =>
                  isPeriodReminder(item) ? (
                    <PeriodBand
                      key={item.id}
                      item={item}
                      date={dateStr}
                      onClick={() => onSelectItem(item, dateStr)}
                    />
                  ) : (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onClick={() => onSelectItem(item, dateStr)}
                    />
                  ),
                )}
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

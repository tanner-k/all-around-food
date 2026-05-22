// Week / date helpers for the meal planner. All dates are handled in local
// time and formatted as YYYY-MM-DD strings.

export const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local-time Date. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** YYYY-MM-DD of the Monday of the week containing today. */
export function currentMonday(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0 .. Sun = 6
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

/** Human-readable month + day for a YYYY-MM-DD string, e.g. "May 18". */
export function formatMonthDay(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export interface DayInfo {
  index: number;
  weekday: string;
  dayNum: number;
  isToday: boolean;
}

/** The seven days of the week starting at `weekOf` (a Monday). */
export function weekDays(weekOf: string): DayInfo[] {
  const today = toISODate(new Date());
  return WEEKDAYS.map((weekday, index) => {
    const d = parseISODate(weekOf);
    d.setDate(d.getDate() + index);
    return {
      index,
      weekday,
      dayNum: d.getDate(),
      isToday: toISODate(d) === today,
    };
  });
}

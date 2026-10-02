const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
  const match = datePattern.exec(value);

  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function getLocalWeekStart(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;

  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

export function resolveWeekStart(value: string | null, today = new Date()) {
  const parsed = value ? parseLocalDate(value) : null;

  if (parsed?.getDay() === 1) return formatLocalDate(parsed);

  return formatLocalDate(getLocalWeekStart(today));
}

export function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function getWeekDates(weekStart: string) {
  const monday = parseLocalDate(weekStart);

  if (!monday || monday.getDay() !== 1) {
    throw new Error("Invalid week start");
  }

  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}

export function shiftWeek(weekStart: string, amount: number) {
  const monday = parseLocalDate(weekStart);

  if (!monday || monday.getDay() !== 1) {
    throw new Error("Invalid week start");
  }

  return formatLocalDate(addLocalDays(monday, amount * 7));
}

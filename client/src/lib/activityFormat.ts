// Formats an activity timestamp as "DD.MM.YYYY · h.mm am/pm" — dotted date and
// 12-hour clock (1.48 pm, not 13.48).

export function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  const h24 = d.getHours();
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dd}.${mm}.${yyyy} · ${h12}.${min} ${ampm}`;
}

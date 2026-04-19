const TZ = process.env.APP_TIMEZONE || "Europe/Warsaw";

export function getLocalHour(date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(formatter.format(date), 10);
}

(function exposeWeekFlowCalendar(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.WeekFlowCalendar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const dayIds = ["mon", "tue", "wed", "thu", "fri"];

  function parseCalendarDate(value) {
    const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!match) return null;
    return {
      date: `${match[1]}-${match[2]}-${match[3]}`,
      minute: match[4] ? Number(match[4]) * 60 + Number(match[5]) : null,
    };
  }

  function parseWeekEvents(text, weekStart, maximum = 40) {
    const weekDate = new Date(`${weekStart}T12:00:00`);
    if (Number.isNaN(weekDate.getTime())) throw new Error("Choose a valid week first.");
    const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
    const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
    const rows = [];
    for (const source of blocks) {
      if (rows.length >= maximum) break;
      const block = source.split("END:VEVENT")[0];
      const lines = block.split(/\r?\n/);
      const findValue = (prefix) => lines.find((line) => line.startsWith(prefix))?.split(":").slice(1).join(":");
      const start = parseCalendarDate(findValue("DTSTART"));
      const end = parseCalendarDate(findValue("DTEND"));
      if (!start) continue;
      const eventDate = new Date(`${start.date}T12:00:00`);
      const dayIndex = Math.round((eventDate - weekDate) / 86400000);
      if (dayIndex < 0 || dayIndex > 4) continue;
      const startMinute = start.minute ?? 9 * 60;
      let endMinute = end?.date === start.date && end.minute ? end.minute : 16 * 60;
      if (endMinute <= startMinute) endMinute = Math.min(24 * 60, startMinute + 60);
      rows.push({
        title: (findValue("SUMMARY") || "Calendar event")
          .replaceAll("\\,", ",")
          .replaceAll("\\;", ";")
          .slice(0, 120),
        day_id: dayIds[dayIndex],
        start_minute: startMinute,
        end_minute: endMinute,
      });
    }
    return rows;
  }

  return { parseCalendarDate, parseWeekEvents };
});

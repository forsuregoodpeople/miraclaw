export function timeAgo(dateStr: string) {
  if (!dateStr || typeof dateStr !== "string" || dateStr === "—") return "—";

  // Check if it's a MikroTik duration string (e.g. "1w2d3h4m5s")
  const durationMatch = dateStr.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (durationMatch && dateStr !== "") {
    const w = parseInt(durationMatch[1] || "0", 10);
    const d = parseInt(durationMatch[2] || "0", 10);
    const h = parseInt(durationMatch[3] || "0", 10);
    const m = parseInt(durationMatch[4] || "0", 10);
    const s = parseInt(durationMatch[5] || "0", 10);
    
    // It's a duration of how long it has been seen/uptime.
    if (w > 0) return `${w} mgg lalu`;
    if (d > 0) return `${d} hr lalu`;
    if (h > 0) return `${h} jam lalu`;
    if (m > 0) return `${m} mnt lalu`;
    return `${s} dtk lalu`;
  }

  // Check if it's a MikroTik date format (e.g. "jan/25/2026 14:15:00")
  let parsedDate = Date.parse(dateStr);
  if (isNaN(parsedDate)) {
    // Attempt to parse MikroTik "mon/dd/yyyy HH:MM:SS" mapped to valid JS
    const parts = dateStr.split(" ");
    if (parts.length === 2 && parts[0].includes("/")) {
      const dateParts = parts[0].split("/");
      if (dateParts.length === 3) {
        const [mon, dd, yyyy] = dateParts;
        parsedDate = Date.parse(`${mon} ${dd} ${yyyy} ${parts[1]}`);
      }
    }
  }

  if (isNaN(parsedDate)) return dateStr; // fallback if unparseable

  const diff = Math.floor((Date.now() - parsedDate) / 1000);
  
  if (diff < 0) return "Baru saja"; // slightly in future
  if (diff < 60) return `${diff} dtk lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hr lalu`;
}

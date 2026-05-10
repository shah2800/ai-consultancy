/** Calendar date + relative time, e.g. "May 8 · 13 min ago" */
export function formatLastActivity(d, compact = false) {
  if (!d) return "—";

  const date = new Date(d);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative = "";
  if (diffMins < 1) relative = "Just now";
  else if (diffMins < 60) relative = `${diffMins} min ago`;
  else if (diffHours < 24) relative = `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
  else if (diffDays === 1) relative = "Yesterday";
  else if (diffDays < 7) relative = `${diffDays} days ago`;

  const actualDate = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });

  if (compact) {
    if (diffMins < 1) return `${actualDate} · now`;
    if (diffMins < 60) return `${actualDate} · ${diffMins}m`;
    if (diffHours < 24) return `${actualDate} · ${diffHours}h`;
    if (diffDays === 1) return `${actualDate} · yday`;
    if (diffDays < 7) return `${actualDate} · ${diffDays}d`;
    return actualDate;
  }

  return relative ? `${actualDate} · ${relative}` : actualDate;
}

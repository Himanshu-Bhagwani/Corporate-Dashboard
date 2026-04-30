/**
 * Calculates compliance score from an array of compliance events.
 * Shared formula used by both DashboardView and ComplianceView so they
 * always show identical values from the same data source.
 *
 * Scoring:
 *   - Overdue item   → -15 pts
 *   - Due within 7d  → -5 pts
 *   - Pending > 7d   → -2 pts
 *   - Minimum: 0, Maximum: 100
 */
export function calcComplianceScore(compliance = []) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let overdue = 0;
  let dueSoon = 0;
  let pending = 0;

  for (const f of compliance) {
    if (String(f.status || '').toUpperCase() === 'FILED') continue;
    const d = new Date(f.due_date);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const days = Math.floor((d - now) / 86400000);
    if (days < 0) {
      overdue++;
    } else if (days <= 7) {
      dueSoon++;
    } else {
      pending++;
    }
  }

  const score = Math.max(0, 100 - 15 * overdue - 5 * dueSoon - 2 * pending);
  return { score, overdue, dueSoon, pending };
}

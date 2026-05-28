/**
 * calculatePriority.js
 * Place in: server/utils/calculatePriority.js
 *
 * Call this on each lead before returning from:
 *   - GET /admin/leads
 *   - GET /leads/top
 *   - GET /admin/dashboard
 *
 * Usage:
 *   const { calculatePriority } = require("./utils/calculatePriority");
 *   const leads = await Lead.find(...).lean();
 *   const ranked = leads.map(l => ({ ...l, priorityScore: calculatePriority(l) }))
 *                        .sort((a, b) => b.priorityScore - a.priorityScore);
 */

/**
 * Returns a 0–100 priority score for a lead.
 * Higher = contact sooner.
 */
function calculatePriority(lead) {
  let score = 0;

  // ── 1. Base AI score (0–40 pts) ──────────────────────────────
  // Normalized from the lead's existing 0–100 score field
  const baseScore = Math.min(lead.score || 0, 100);
  score += (baseScore / 100) * 40;

  // ── 2. Status weight (0–25 pts) ──────────────────────────────
  const statusWeights = {
    ready:     25,   // Hottest — just needs enrollment nudge
    hot:       22,
    warm:      14,
    new:        8,   // Fresh leads still matter
    converted:  0,   // Done deal — no urgency
    lost:       2,   // Low but not zero (re-engage opportunity)
  };
  score += statusWeights[lead.status] || 0;

  // ── 3. Recency bonus (0–20 pts) ──────────────────────────────
  // Leads active recently are more likely to convert
  if (lead.lastActivity) {
    const hoursAgo = (Date.now() - new Date(lead.lastActivity)) / 3_600_000;
    if (hoursAgo < 6)   score += 20;
    else if (hoursAgo < 24)  score += 16;
    else if (hoursAgo < 48)  score += 10;
    else if (hoursAgo < 168) score += 4;   // within a week
    // older → 0
  }

  // ── 4. Engagement depth (0–10 pts) ───────────────────────────
  // More messages = more invested
  const msgCount = (lead.messages || []).length;
  if (msgCount >= 10) score += 10;
  else if (msgCount >= 5) score += 7;
  else if (msgCount >= 2) score += 4;
  else if (msgCount === 1) score += 1;

  // ── 5. Uncontacted penalty / bonus ───────────────────────────
  // Brand-new lead with zero replies: bump up so team contacts fast
  const hasAdminReply = (lead.messages || []).some(m => m.role === "admin");
  if (!hasAdminReply && lead.status === "new") score += 5;

  // ── 6. Overdue follow-up urgency (+5 pts) ────────────────────
  if (lead.followUpDate) {
    const followUpOverdue = new Date(lead.followUpDate) < new Date();
    if (followUpOverdue) score += 5;
  }

  // ── 7. Cap at 100 ────────────────────────────────────────────
  return Math.min(Math.round(score), 100);
}

/**
 * Convenience: returns additional CRM intelligence fields
 * Attach these to each lead object before sending to frontend.
 */
function enrichLead(lead) {
  const priorityScore = calculatePriority(lead);

  // Conversion probability (simple heuristic)
  const conversionProbability = Math.min(
    Math.round(
      (lead.score || 0) * 0.6 +
      { converted: 30, ready: 25, hot: 18, warm: 10, new: 3, lost: 0 }[lead.status] +
      Math.min((lead.messages?.length || 0) * 1.5, 10)
    ),
    99
  );

  // Follow-up status label
  let followUpStatus = "never";
  if (lead.lastActivity) {
    const h = (Date.now() - new Date(lead.lastActivity)) / 3_600_000;
    if (h < 24)  followUpStatus = "active";
    else if (h < 48)  followUpStatus = "due";
    else followUpStatus = "overdue";
  }

  // Next suggested action (string — AI can expand on frontend)
  let nextAction = "Nurture lead";
  if (lead.status === "ready")    nextAction = "Send enrollment form";
  else if (lead.status === "hot") nextAction = "Call to close";
  else if (!lead.messages?.length) nextAction = "Send first message";
  else if (priorityScore >= 70)   nextAction = "Follow up urgently";

  return {
    ...lead,
    priorityScore,
    conversionProbability,
    followUpStatus,
    nextAction,
  };
}

module.exports = { calculatePriority, enrichLead };

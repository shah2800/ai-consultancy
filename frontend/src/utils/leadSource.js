/** True when the lead came from the public apply form (source value may vary in casing). */
export function isWebsiteLead(lead) {
  return String(lead?.source || "").trim().toLowerCase() === "website";
}

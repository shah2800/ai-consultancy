/**
 * One-off: count leads visible on /admin/website-applications (same Mongo filter as API).
 * Usage: node scripts/diag-website-leads.js
 * Does not print MONGO_URI or secrets.
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const tenantRaw = String(process.env.WEBSITE_TENANT_USER_ID || "").trim();
  if (!tenantRaw || !mongoose.Types.ObjectId.isValid(tenantRaw)) {
    console.error("WEBSITE_TENANT_USER_ID missing or invalid in .env");
    process.exit(1);
  }
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI missing");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const query = {
    userId: { $in: [new mongoose.Types.ObjectId(tenantRaw), tenantRaw] },
    isMerged: { $ne: true },
    $or: [
      { source: { $regex: /^website$/i } },
      { activityLog: { $elemMatch: { type: "website_apply" } } },
      {
        activityLog: {
          $elemMatch: { description: /Application submitted from public website form/i },
        },
      },
    ],
  };

  const Lead = mongoose.connection.collection("leads");
  const n = await Lead.countDocuments(query);
  console.log("website_applications_count_for_WEBSITE_TENANT_USER_ID=", n);

  const one = await Lead.findOne(query, {
    projection: { name: 1, source: 1, email: 1, userId: 1 },
  });
  if (one) {
    console.log("sample_row=", {
      name: one.name,
      source: one.source,
      email: one.email,
      userId_matches_env: String(one.userId) === tenantRaw,
    });
  } else {
    console.log("sample_row=null (no documents match filter)");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

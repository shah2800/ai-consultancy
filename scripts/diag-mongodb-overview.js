/**
 * Read-only overview of the same DB your API uses (like a quick Compass check).
 * Usage: node scripts/diag-mongodb-overview.js
 * Does not print MONGO_URI or passwords.
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI missing in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;

  const leadsCol = db.collection("leads");
  const usersCol = db.collection("authusers");

  const leadsTotal = await leadsCol.countDocuments({});
  const websiteTag = await leadsCol.countDocuments({
    source: { $regex: /^website$/i },
  });

  const tenantRaw = String(process.env.WEBSITE_TENANT_USER_ID || "").trim();
  let tenantLeads = null;
  if (tenantRaw && mongoose.Types.ObjectId.isValid(tenantRaw)) {
    tenantLeads = await leadsCol.countDocuments({
      userId: { $in: [new mongoose.Types.ObjectId(tenantRaw), tenantRaw] },
    });
  }

  let usersCount = null;
  try {
    usersCount = await usersCol.countDocuments({});
  } catch {
    usersCount = "n/a (collection name may differ)";
  }

  console.log("connected: yes");
  console.log("database_name:", dbName);
  console.log("collection_leads_total_documents:", leadsTotal);
  console.log("collection_leads_source_website_(case_insensitive):", websiteTag);
  if (tenantLeads !== null) {
    console.log("collection_leads_for_WEBSITE_TENANT_USER_ID:", tenantLeads);
  } else {
    console.log("collection_leads_for_WEBSITE_TENANT_USER_ID: (WEBSITE_TENANT_USER_ID not set or invalid)");
  }
  console.log("collection_authusers_documents:", usersCount);
  console.log(
    "--- In Compass, open this database name, then `leads` — counts should match the above. ---"
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("connection_failed:", e.message || e);
  process.exit(1);
});

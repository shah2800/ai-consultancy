/**
 * Point an existing staff/viewer account at an owner's CRM workspace (same leads & settings).
 *
 * Usage (project root):
 *   node scripts/link-user-to-workspace.js staff@company.com owner@company.com
 *
 * Requires MONGO_URI in .env
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const staffEmail = String(process.argv[2] || "").trim().toLowerCase();
const ownerEmail = String(process.argv[3] || "").trim().toLowerCase();

async function main() {
  if (!staffEmail || !ownerEmail) {
    console.error(
      "Usage: node scripts/link-user-to-workspace.js <staff-email> <owner-email>"
    );
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection("authusers");

  const owner = await col.findOne({
    email: new RegExp(`^${ownerEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (!owner?._id) {
    console.error(`Owner not found: ${ownerEmail}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const r = await col.updateOne(
    { email: new RegExp(`^${staffEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    { $set: { workspaceOwnerId: owner._id } }
  );

  if (r.matchedCount === 0) {
    console.error(`Staff user not found: ${staffEmail}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(
    `Linked ${staffEmail} → workspace owner ${ownerEmail} (${owner._id}). Sign out and sign in again.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

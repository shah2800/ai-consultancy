/**
 * Removes all AuthUser accounts except the configured keep-list, and deletes
 * their leads, settings, universities, and notifications.
 *
 * Usage (from project root):
 *   node scripts/prune-team-users.js
 *
 * Optional env override (comma-separated lower-case emails):
 *   TEAM_KEEP_EMAILS=shahzaman2800@gmail.com,admin@gmail.com
 *
 * Requires MONGO_URI in .env
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const KEEP = String(process.env.TEAM_KEEP_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_KEEP = ["shahzaman2800@gmail.com", "admin@gmail.com"];
const keepSet = new Set((KEEP.length ? KEEP : DEFAULT_KEEP));

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const authCol = db.collection("authusers");
  const all = await authCol.find({}).toArray();
  const toRemove = all.filter(
    (u) => !keepSet.has(String(u.email || "").trim().toLowerCase())
  );
  const kept = all.filter((u) =>
    keepSet.has(String(u.email || "").trim().toLowerCase())
  );

  console.log("Keep list:", [...keepSet].join(", "));
  console.log(`Keeping ${kept.length} user(s):`, kept.map((u) => u.email).join(", ") || "(none)");
  console.log(`Removing ${toRemove.length} user(s)`);

  const ids = toRemove.map((u) => u._id);
  if (ids.length === 0) {
    console.log("No extra accounts to delete.");
  } else {
    await db.collection("leads").deleteMany({ userId: { $in: ids } });
    await db.collection("leads").updateMany(
      { assignedTo: { $in: ids } },
      { $set: { assignedTo: null } }
    );
    await db.collection("settings").deleteMany({ userId: { $in: ids } });
    await db.collection("universities").deleteMany({ userId: { $in: ids } });
    await db.collection("notifications").deleteMany({ userId: { $in: ids } });
    const del = await authCol.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${del.deletedCount} auth user(s) and related workspace rows.`);
  }

  await authCol.updateOne(
    { email: "shahzaman2800@gmail.com" },
    { $set: { role: "manager", isActive: true } }
  );
  await authCol.updateOne(
    { email: "admin@gmail.com" },
    { $set: { role: "admin", isActive: true } }
  );
  console.log("Normalized roles: shahzaman2800@gmail.com → manager, admin@gmail.com → admin");

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

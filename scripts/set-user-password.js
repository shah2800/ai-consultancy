/**
 * Set a user's password to a bcrypt hash (fixes manual MongoDB inserts with plain text).
 *
 * Usage (from project root, same folder as package.json):
 *   npm run set-password -- admin@gmail.com YourNewPassword
 *
 * Requires MONGO_URI in .env
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const emailArg = process.argv[2];
const newPassword = process.argv[3];

if (!emailArg || !newPassword) {
  console.error("Usage: npm run set-password -- <email> <newPassword>");
  process.exit(1);
}

if (String(newPassword).length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Add it to .env in the project root.");
    process.exit(1);
  }

  const email = String(emailArg).trim();
  await mongoose.connect(process.env.MONGO_URI);

  const col = mongoose.connection.collection("authusers");
  const hashed = await bcrypt.hash(String(newPassword), 10);

  let r = await col.updateOne({ email }, { $set: { password: hashed } });
  if (r.matchedCount === 0) {
    r = await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { password: hashed } }
    );
  }

  if (r.matchedCount === 0) {
    console.error(`No user found with email "${email}". Check spelling or add the user first.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Password updated for "${email}". You can sign in with the new password.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

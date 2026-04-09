import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mongoose = require("mongoose");
const fs = require("fs");

const env = fs.readFileSync(".env", "utf8");
for (const line of env.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
  process.env[k] = process.env[k] ?? v;
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const docs = await db.collection("users").find({}).toArray();
console.log("Connected. users count:", docs.length);
for (const d of docs) {
  console.log("  email:", d.email, "| approved:", d.isApproved, "| hasHash:", !!d.passwordHash);
}
if (docs.length === 0) console.log("  WARNING: Collection is empty!");
await mongoose.disconnect();

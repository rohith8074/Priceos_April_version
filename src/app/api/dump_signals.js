const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const airbticsDocs = await mongoose.connection.db.collection("airbtics_caches").find().limit(3).toArray();
  console.log("\nAirbtics Docs Sample:");
  airbticsDocs.forEach(d => {
    console.log(`- Key: ${d.cacheKey}`);
    console.log(`  Data Keys: ${Object.keys(d.data || {}).join(", ")}`);
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://lyzrdbadmin:Io5GYCzlC1L9xWpC@jazon-lite-docDB-nlb-08b7318ad71da26e.elb.us-east-1.amazonaws.com:27017/priceos?directConnection=true&tls=true&tlsAllowInvalidHostnames=true&tlsAllowInvalidCertificates=true&retryWrites=false&authSource=admin";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('priceos');
    const docs = await db.collection('agent_caches').find({ agentName: 'property' }).sort({ computedAt: -1 }).limit(1).toArray();
    if (docs.length > 0) {
      console.log("Full error message:");
      console.log(docs[0].errorMessage);
    }
  } finally {
    await client.close();
  }
}
main().catch(console.error);

import mongoose from 'mongoose';
import fs from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'priceos';

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI not found in .env');
  process.exit(1);
}

// ─── SCHEMAS ────────────────────────────────────────────────────────

const CompetitorSchema = new mongoose.Schema({
  airbticsId: { type: String, required: true, unique: true },
  name: String,
  bedrooms: Number,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lon, lat]
  },
  rating: Number,
  ttmOccupancy: Number,
  ttmAdr: Number,
  coverPhoto: String
}, { timestamps: true });

CompetitorSchema.index({ location: '2dsphere' });

const PerformanceSchema = new mongoose.Schema({
  competitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AirbticsCompetitor', index: true },
  airbticsId: { type: String, index: true },
  month: { type: String, required: true, index: true }, // "YYYY-MM-DD"
  adr: Number,
  occupancy: Number,
  revenue: Number
}, { timestamps: true });

// Avoid duplicate rows for the same listing and month
PerformanceSchema.index({ airbticsId: 1, month: 1 }, { unique: true });

const AirbticsCompetitor = mongoose.models.AirbticsCompetitor || mongoose.model('AirbticsCompetitor', CompetitorSchema);
const AirbticsHistory = mongoose.models.AirbticsHistory || mongoose.model('AirbticsHistorical', PerformanceSchema);
const AirbticsForward = mongoose.models.AirbticsForward || mongoose.model('AirbticsForward', PerformanceSchema);

// ─── HELPERS ────────────────────────────────────────────────────────

// Simple CSV parser for quoted strings
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─── MAIN SEED FUNCTION ─────────────────────────────────────────────

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const dataDir = '/Users/rohithp/Desktop/Priceos_April_updated_version/Original_priceos/priceos-backend/data';
    const detailsFile = path.join(dataDir, 'part-00294-e685bf03-a693-439c-b3bb-b8b063ff0db5.c000.csv');
    const historyFile = path.join(dataDir, 'part-00294-56eb3db9-d23c-4bfa-94f6-f328fafbfe54.c000.csv');
    const futureFile = path.join(dataDir, 'part-00294-cac8f0ac-16be-4a89-b16f-326fdca455ea.c000.csv');

    // 1. SEED COMPETITORS
    console.log('--- Seeding Competitor Profiles ---');
    const detailReader = createInterface({ input: fs.createReadStream(detailsFile) });
    let count = 0;
    let header = null;

    for await (const line of detailReader) {
      if (!header) {
        header = parseCSVLine(line);
        continue;
      }
      const values = parseCSVLine(line);
      const row = {};
      header.forEach((key, i) => row[key] = values[i]);

      if (!row.listing_id || isNaN(row.latitude)) continue;

      await AirbticsCompetitor.findOneAndUpdate(
        { airbticsId: row.listing_id },
        {
          name: row.listing_name,
          bedrooms: parseInt(row.bedrooms) || 0,
          location: {
            type: 'Point',
            coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)]
          },
          rating: parseFloat(row.rating_overall) || 0,
          ttmOccupancy: parseFloat(row.ttm_occupancy) || 0,
          ttmAdr: parseFloat(row.ttm_avg_rate_native) || 0,
          coverPhoto: row.cover_photo_url
        },
        { upsert: true }
      );
      count++;
      if (count % 100 === 0) console.log(`  Processed ${count} competitors...`);
    }
    console.log(`Total Competitors Upserted: ${count}`);

    // Map listing IDs to ObjectIds for foreign keys
    const competitorMap = {};
    const comps = await AirbticsCompetitor.find({}, '_id airbticsId');
    comps.forEach(c => competitorMap[c.airbticsId] = c._id);

    // 2. SEED HISTORICAL (Apr-Dec 2025)
    console.log('--- Seeding Historical Performance (Apr-Dec 2025) ---');
    const histReader = createInterface({ input: fs.createReadStream(historyFile) });
    count = 0;
    header = null;
    const histDocs = [];

    for await (const line of histReader) {
      if (!header) {
        header = parseCSVLine(line);
        continue;
      }
      const values = parseCSVLine(line);
      const date = values[header.indexOf('date')];
      
      // Filter: Apr-Dec 2025
      if (date && date >= '2025-04-01' && date <= '2025-12-01') {
        const airbticsId = values[header.indexOf('listing_id')];
        histDocs.push({
          competitorId: competitorMap[airbticsId],
          airbticsId: airbticsId,
          month: date,
          adr: parseFloat(values[header.indexOf('native_rate_avg')]) || 0,
          occupancy: parseFloat(values[header.indexOf('occupancy')]) || 0,
          revenue: parseFloat(values[header.indexOf('native_revenue')]) || 0
        });
        count++;
      }
    }
    if (histDocs.length > 0) {
      await AirbticsHistory.deleteMany({ month: { $gte: '2025-04-01', $lte: '2025-12-01' } });
      await AirbticsHistory.insertMany(histDocs);
    }
    console.log(`Total Historical Records Inserted: ${count}`);

    // 3. SEED FUTURE (Apr-Dec 2026)
    console.log('--- Seeding Future Performance (Apr-Dec 2026) ---');
    const futReader = createInterface({ input: fs.createReadStream(futureFile) });
    count = 0;
    header = null;
    const futDocs = [];

    for await (const line of futReader) {
      if (!header) {
        header = parseCSVLine(line);
        continue;
      }
      const values = parseCSVLine(line);
      const date = values[header.indexOf('date')];

      // Filter: Apr-Dec 2026
      if (date && date >= '2026-04-01' && date <= '2026-12-01') {
        const airbticsId = values[header.indexOf('listing_id')];
        futDocs.push({
          competitorId: competitorMap[airbticsId],
          airbticsId: airbticsId,
          month: date,
          adr: parseFloat(values[header.indexOf('native_rate_avg')]) || 0,
          occupancy: parseFloat(values[header.indexOf('occupancy')]) || 0,
          revenue: parseFloat(values[header.indexOf('native_revenue')]) || 0
        });
        count++;
      }
    }
    if (futDocs.length > 0) {
      await AirbticsForward.deleteMany({ month: { $gte: '2026-04-01', $lte: '2026-12-01' } });
      await AirbticsForward.insertMany(futDocs);
    }
    console.log(`Total Future Records Inserted: ${count}`);

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding Failed:', err);
    process.exit(1);
  }
}

seed();

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const dirs = [
  '/Users/rohithp/Desktop/Priceos_April_updated_version/Private & Shared 2',
  '/Users/rohithp/Desktop/Priceos_April_updated_version/Private & Shared 2/Knowledge Base'
];

async function readPdfs() {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.pdf')) {
        const filePath = path.join(dir, file);
        const dataBuffer = fs.readFileSync(filePath);
        try {
          const data = await pdf(dataBuffer);
          console.log(`\n\n--- FILE: ${file} ---\n`);
          console.log(data.text);
        } catch(e) {
          console.log(`Error reading ${file}: ${e.message}`);
        }
      }
    }
  }
}

readPdfs();

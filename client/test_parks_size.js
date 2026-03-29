import fs from 'fs';
const data = fs.readFileSync('../server/src/data/parks.json', 'utf8');
console.log("Size in mb:", data.length / 1024 / 1024);

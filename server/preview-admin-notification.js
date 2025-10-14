const fs = require('fs');
const path = require('path');
const http = require('http');

// Read the preview HTML file
const htmlPath = path.join(__dirname, 'templates', 'emails', 'preview-admin-notification.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

const PORT = 3005;
server.listen(PORT, () => {
  console.log('\n🎉 Admin Notification Email Preview Server');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`\n📧 Preview the admin notification email in your browser\n`);
  console.log('Press Ctrl+C to stop the server\n');
});


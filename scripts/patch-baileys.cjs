const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'baileys', 'lib', 'Utils', 'validate-connection.js');

if (!fs.existsSync(filePath)) {
  console.log('Baileys not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Platform.WEB') && !content.includes('Platform.MACOS')) {
  content = content.replace(
    'platform: proto.ClientPayload.UserAgent.Platform.WEB',
    'platform: proto.ClientPayload.UserAgent.Platform.MACOS'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Baileys patched: Platform.WEB → Platform.MACOS');
} else if (content.includes('Platform.MACOS')) {
  console.log('ℹ️  Baileys already patched');
} else {
  console.log('⚠️  Pattern not found, Baileys may have changed');
}

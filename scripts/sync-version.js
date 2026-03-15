// 從 package.json 讀取版號並同步到 src/constants.ts
const fs = require('fs');
const path = require('path');

const pkg = require(path.resolve(__dirname, '..', 'package.json'));
const version = `v${pkg.version}`;
const filePath = path.resolve(__dirname, '..', 'src', 'constants.ts');
const content = fs.readFileSync(filePath, 'utf8');
const updated = content.replace(/export const VERSION = "v[^"]*";/, `export const VERSION = "${version}";`);

if (content !== updated) {
  fs.writeFileSync(filePath, updated);
  console.log(`Synced VERSION to ${version}`);
} else {
  console.log(`VERSION already ${version}`);
}

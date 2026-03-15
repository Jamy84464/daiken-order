// pre-commit hook：自動 bump patch 版號並加入暫存區
// 透過環境變數 SKIP_AUTO_VERSION 避免無限迴圈
if (process.env.SKIP_AUTO_VERSION) process.exit(0);

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = pkg.version.split('.').map(Number);
parts[2] += 1;
pkg.version = parts.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 同步到 constants.ts
const constPath = path.resolve(__dirname, '..', 'src', 'constants.ts');
const content = fs.readFileSync(constPath, 'utf8');
const updated = content.replace(/export const VERSION = "v[^"]*";/, `export const VERSION = "v${pkg.version}";`);
fs.writeFileSync(constPath, updated);

// 加入暫存區
execSync('git add package.json src/constants.ts', { cwd: path.resolve(__dirname, '..') });

console.log(`Auto-bumped to v${pkg.version}`);

// Copies the exact library builds into js/vendor/ so the game runs without a CDN.
// Usage: npm install && npm run vendor
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
    ['node_modules/phaser/dist/phaser.min.js', 'js/vendor/phaser.min.js'],
    ['node_modules/chart.js/dist/chart.umd.js', 'js/vendor/chart.umd.js']
];

fs.mkdirSync(path.join(root, 'js/vendor'), { recursive: true });
for (const [from, to] of files) {
    fs.copyFileSync(path.join(root, from), path.join(root, to));
    console.log(`copied ${from} -> ${to}`);
}

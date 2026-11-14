const { createHash } = require('node:crypto');
const { readFileSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');

const buildDirectory = join(__dirname, '..', 'build');
const releaseHash = createHash('sha256');
for (const file of ['asset-manifest.json', 'index.html', 'manifest.json']) {
    releaseHash.update(readFileSync(join(buildDirectory, file)));
}
appendFileSync(join(buildDirectory, 'service-worker.js'), `\n// Build: ${releaseHash.digest('hex')}\n`);

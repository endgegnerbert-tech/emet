import fs from 'fs';
import path from 'path';

const includeDirs = ['test', 'lib', 'scripts', 'mcp', 'bin', 'extensions'];
const includeFiles = ['index.js', 'README.md', 'package.json', 'emet.js', 'emet-mcp.js', 'THIRD_PARTY_NOTICES.md', 'mcp-server.js', 'CHANGELOG.md'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (filePath.endsWith('.js') || filePath.endsWith('.ts') || filePath.endsWith('.md') || filePath.endsWith('.json')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

let filesToProcess = [];
includeDirs.forEach(d => {
  if (fs.existsSync(d)) filesToProcess = filesToProcess.concat(walk(d));
});
includeFiles.forEach(f => {
  if (fs.existsSync(f)) filesToProcess.push(f);
});

for (const file of filesToProcess) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/pi-research/g, 'emet');
  newContent = newContent.replace(/pi_research/g, 'emet');
  newContent = newContent.replace(/PI_RESEARCH/g, 'EMET');
  newContent = newContent.replace(/unblind/g, 'emet');
  newContent = newContent.replace(/UNBLIND/g, 'EMET');
  newContent = newContent.replace(/endgegnerbert-tech/g, 'tomsej');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
}

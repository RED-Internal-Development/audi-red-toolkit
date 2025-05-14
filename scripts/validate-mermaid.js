const fs = require('fs');
const glob = require('glob');
const mermaid = require('@mermaid-js/mermaid-cli');

const mdFiles = glob.sync('docs/**/*.{md,mdx}');

let hasErrors = false;

mdFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf8');
  const mermaidBlocks = [...content.matchAll(/```mermaid\s+([\s\S]*?)```/g)];

  mermaidBlocks.forEach(([, code], index) => {
    try {
        mermaid.parse(code);
    } catch (err) {
        console.error(`❌ Error in file: ${file} [block #${index + 1}]`);
        console.error(err.message);
        hasErrors = true;
    }
  });
});

if (hasErrors) {
  process.exit(1);
} else {
  console.log('✅ All Mermaid diagrams are valid.');
}
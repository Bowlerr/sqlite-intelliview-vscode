#!/usr/bin/env node

/**
 * Build script to ensure external libraries are vendored for packaging
 * This ensures the extension works offline and meets packaging requirements
 */

const fs = require("fs");
const path = require("path");

console.log("📦 Vendoring external libraries for packaging...");

// Ensure Monaco Editor files exist
const monacoSrcPath = path.join(
  __dirname,
  "node_modules",
  "monaco-editor",
  "min",
  "vs"
);
const monacoDestPath = path.join(__dirname, "media", "monaco-editor", "vs");

if (!fs.existsSync(monacoSrcPath)) {
  console.error("❌ Monaco Editor source not found. Run npm install first.");
  process.exit(1);
}

// Copy Monaco Editor files if they don't exist or are outdated
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      // Only copy if destination doesn't exist or source is newer
      if (
        !fs.existsSync(destPath) ||
        fs.statSync(srcPath).mtime > fs.statSync(destPath).mtime
      ) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

console.log("📁 Copying Monaco Editor files...");
copyDirectoryRecursive(monacoSrcPath, monacoDestPath);

// Verify SortableJS exists
const sortablePath = path.join(__dirname, "media", "Sortable.min.js");
if (!fs.existsSync(sortablePath)) {
  console.log("📥 Copying SortableJS...");
  const sortableSrc = path.join(
    __dirname,
    "node_modules",
    "sortablejs",
    "Sortable.min.js"
  );
  if (fs.existsSync(sortableSrc)) {
    fs.copyFileSync(sortableSrc, sortablePath);
  } else {
    console.error("❌ SortableJS source not found in node_modules");
    process.exit(1);
  }
}

// Verify D3.js exists
const d3Path = path.join(__dirname, "media", "d3.min.js");
if (!fs.existsSync(d3Path)) {
  console.log("📥 Copying D3.js...");
  const d3Src = path.join(__dirname, "node_modules", "d3", "dist", "d3.min.js");
  if (fs.existsSync(d3Src)) {
    fs.copyFileSync(d3Src, d3Path);
  } else {
    console.error("❌ D3.js source not found in node_modules");
    process.exit(1);
  }
}

console.log("✅ All external libraries vendored successfully");
console.log("📋 Vendored libraries:");
console.log("   • Monaco Editor (vs/ directory)");
console.log("   • SortableJS (Sortable.min.js)");
console.log("   • D3.js (d3.min.js)");
console.log("");
console.log("🎯 Benefits:");
console.log("   • Extension works completely offline");
console.log("   • No CDN dependencies or CSP issues");
console.log("   • Faster loading from local files");
console.log("   • Consistent behavior across environments");

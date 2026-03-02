#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const specs = require('../config/swagger.config');

const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const jsonPath = path.join(docsDir, 'swagger.json');
const yamlPath = path.join(docsDir, 'swagger.yaml');
const mode = process.argv[2] || 'all';

try {
  fs.mkdirSync(docsDir, { recursive: true });
  if (mode !== '--yaml-only') {
    fs.writeFileSync(jsonPath, `${JSON.stringify(specs, null, 2)}\n`, 'utf8');
    console.log('Swagger JSON generated at docs/swagger.json');
  }
  if (mode !== '--json-only') {
    fs.writeFileSync(yamlPath, yaml.stringify(specs), 'utf8');
    console.log('Swagger YAML generated at docs/swagger.yaml');
  }
} catch (error) {
  console.error(`Swagger generation failed: ${error.message}`);
  process.exit(1);
}

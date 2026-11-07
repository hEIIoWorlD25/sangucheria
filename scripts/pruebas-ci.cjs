// Genera el resultado de la consola y el XML que publicará Jenkins.
const { mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
mkdirSync(path.join(raiz, 'reports'), { recursive: true });
rmSync(path.join(raiz, 'reports', 'junit.xml'), { force: true });

const resultado = spawnSync(process.execPath, [
  '--test',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=junit',
  '--test-reporter-destination=reports/junit.xml',
  'tests/pc11.test.cjs'
], { cwd: raiz, stdio: 'inherit' });

if (resultado.error) console.error(resultado.error.message);
process.exitCode = resultado.status ?? 1;

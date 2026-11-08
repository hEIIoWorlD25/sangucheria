const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const raiz = join(__dirname, '..');
for (const carpeta of ['', 'lib', 'scripts', 'tests']) {
  for (const nombre of readdirSync(join(raiz, carpeta)).filter(n => /\.(js|cjs)$/.test(n))) {
    const archivo = join(raiz, carpeta, nombre);
    const resultado = spawnSync(process.execPath, ['--check', archivo], { stdio: 'inherit' });
    if (resultado.error || resultado.status !== 0) {
      if (resultado.error) console.error(resultado.error.message);
      process.exit(1);
    }
  }
}
console.log('Sintaxis correcta en aplicación, módulos, scripts y pruebas.');

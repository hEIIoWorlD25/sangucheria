// Preparación de la PC11. Ejecutar junto a app.js: node preparar-pc11.cjs
// Ajusta únicamente los bloques revisados y respalda cada archivo existente que cambia.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = {
  "bloquesAppAnteriores": [
    "app.listen(puerto, 'localhost', () => {\n  console.log('Servidor disponible en http://localhost:3000');\n});",
    "app.listen(puerto, process.env.HOST || 'localhost', () => {\n  console.log('Servidor disponible en http://localhost:3000');\n});"
  ],
  "bloqueAppNuevo": "if (require.main === module) {\n  app.listen(puerto, process.env.HOST || 'localhost', () => {\n    console.log('Servidor disponible en http://localhost:3000');\n  });\n}\n\nmodule.exports = app;",
  "lineaDatosAnterior": "const carpetaDatos = path.join(__dirname, 'data');",
  "lineaDatosNueva": "const carpetaDatos = path.resolve(\n  process.env.DATA_DIR || path.join(__dirname, 'data')\n);",
  "archivos": {
    "tests/pc11.test.cjs": "// PC11: pruebas de integración mediante HTTP, con una base temporal por ejecución.\nconst assert = require('node:assert/strict');\nconst { describe, test, before, beforeEach, after } = require('node:test');\nconst { mkdtempSync, rmSync } = require('node:fs');\nconst os = require('node:os');\nconst path = require('node:path');\nconst { randomBytes, scryptSync } = require('node:crypto');\nconst { once } = require('node:events');\n\nconst carpetaTemporal = mkdtempSync(path.join(os.tmpdir(), 'sangucheria-pc11-'));\nprocess.env.DATA_DIR = carpetaTemporal;\nconst db = require('../database');\nconst baseAbierta = db.prepare('PRAGMA database_list').all()\n  .find(base => base.name === 'main');\n// Impide vaciar tickets si se olvidó aplicar el cambio de DATA_DIR.\nassert.equal(path.resolve(baseAbierta.file), path.join(carpetaTemporal, 'tickets.db'),\n  'La base debe ser temporal. Ejecuta primero preparar-pc11.cjs.');\nconst app = require('../app');\n\nconst clienteDemo = { correo: 'cliente.pc8@example.test', password: 'PruebaPC8!2026' };\nconst personalDemo = { correo: 'personal.demo@example.test', password: 'PersonalDemo!2026' };\nconst segundoCliente = { correo: 'cliente.dos.pc11@example.test', password: 'ClienteDosPC11!2026' };\n\nlet servidor;\nlet baseURL;\n\nfunction sesion(cookieInicial = '') {\n  let cookie = cookieInicial;\n  return {\n    get cookie() { return cookie; },\n    async solicitar(ruta, datos) {\n      const cabeceras = {};\n      if (cookie) cabeceras.Cookie = cookie;\n      const respuesta = await fetch(baseURL + ruta, {\n        method: datos === undefined ? 'GET' : 'POST',\n        headers: cabeceras,\n        body: datos === undefined ? undefined : new URLSearchParams(datos),\n        redirect: 'manual',\n        signal: AbortSignal.timeout(5000)\n      });\n      const nuevaCookie = respuesta.headers.getSetCookie()\n        .find(valor => valor.startsWith('sangucheria.sid='));\n      if (nuevaCookie) cookie = nuevaCookie.split(';')[0];\n      return {\n        status: respuesta.status,\n        location: respuesta.headers.get('location'),\n        html: await respuesta.text()\n      };\n    }\n  };\n}\n\nasync function ingresar(credenciales = clienteDemo, destino = '/tickets') {\n  const navegador = sesion();\n  const respuesta = await navegador.solicitar('/login', credenciales);\n  assert.equal(respuesta.status, 303, 'El inicio de sesión debe redirigir.');\n  assert.equal(respuesta.location, destino);\n  return navegador;\n}\n\nfunction tokenCSRF(html) {\n  const coincidencia = html.match(/name=\"csrfToken\"\\s+value=\"([^\"]+)\"/);\n  assert.ok(coincidencia, 'Debe existir un token CSRF en el formulario.');\n  return coincidencia[1];\n}\n\nfunction datosTicket(titulo, cambios = {}) {\n  return {\n    codigoPedido: 'PED-001',\n    titulo,\n    descripcion: 'El pedido llegó incompleto y requiere atención.',\n    categoria: 'Pedido incompleto',\n    prioridad: 'Media',\n    ...cambios\n  };\n}\n\nfunction filaCliente(html, titulo) {\n  const fila = (html.match(/<tr\\b[^>]*>[\\s\\S]*?<\\/tr>/g) || [])\n    .find(elemento => elemento.includes(`<td data-campo=\"titulo\">${titulo}</td>`));\n  assert.ok(fila, `El listado debe mostrar el ticket: ${titulo}`);\n  return fila;\n}\n\nfunction estadoEnFila(fila) {\n  const coincidencia = fila.match(/data-campo=\"estado\">\\s*([^<]+)</);\n  assert.ok(coincidencia, 'La fila debe mostrar el estado del ticket.');\n  return coincidencia[1].trim();\n}\n\nasync function crearTicket(cliente, titulo) {\n  const formulario = await cliente.solicitar('/tickets/nuevo');\n  assert.equal(formulario.status, 200);\n  const respuesta = await cliente.solicitar('/tickets', {\n    ...datosTicket(titulo), csrfToken: tokenCSRF(formulario.html)\n  });\n  assert.equal(respuesta.status, 303);\n  assert.equal(respuesta.location, '/tickets?creado=1');\n  const listado = await cliente.solicitar(respuesta.location);\n  assert.equal(listado.status, 200);\n  assert.match(listado.html, /Ticket registrado correctamente/);\n  const fila = filaCliente(listado.html, titulo);\n  const id = Number(fila.match(/<td>\\s*(\\d+)\\s*<\\/td>/)?.[1]);\n  assert.ok(Number.isSafeInteger(id) && id > 0, 'El ticket debe tener un número.');\n  assert.equal(estadoEnFila(fila), 'Pendiente');\n  return id;\n}\n\nfunction cantidadTickets() {\n  return db.prepare('SELECT count(*) AS cantidad FROM tickets').get().cantidad;\n}\n\ndescribe('PC11 - Sistema de tickets de la sanguchería', { concurrency: false }, () => {\n  before(async () => {\n    // Este usuario y su pedido se crean únicamente en la base temporal.\n    const salt = randomBytes(16).toString('hex');\n    const alta = db.prepare(`\n      INSERT INTO usuarios (nombre, correo, password_hash, salt, rol)\n      VALUES (?, ?, ?, ?, 'cliente')\n    `).run('Segundo cliente PC11', segundoCliente.correo,\n      scryptSync(segundoCliente.password, salt, 64).toString('hex'), salt);\n    db.prepare('INSERT INTO pedidos (codigo, usuario_id, descripcion) VALUES (?, ?, ?)')\n      .run('PED-PC11-002', alta.lastInsertRowid, 'Pedido del segundo cliente');\n\n    // El puerto 0 permite elegir un puerto libre sin ocupar el 3000 ni el 3001.\n    servidor = app.listen(0, '127.0.0.1');\n    await once(servidor, 'listening');\n    baseURL = `http://127.0.0.1:${servidor.address().port}`;\n  });\n\n  beforeEach(() => {\n    db.exec('DELETE FROM tickets');\n  });\n\n  after(async () => {\n    try {\n      if (servidor) {\n        await new Promise((resolve, reject) => {\n          servidor.close(error => error ? reject(error) : resolve());\n          servidor.closeAllConnections();\n        });\n      }\n    } finally {\n      db.close();\n      rmSync(carpetaTemporal, { recursive: true, force: true, maxRetries: 3 });\n    }\n  });\n\n  test('PC11-F01 - Exige sesión para consultar tickets y el panel del personal', async () => {\n    const anonimo = sesion();\n    for (const ruta of ['/tickets', '/personal']) {\n      const respuesta = await anonimo.solicitar(ruta);\n      assert.equal(respuesta.status, 302);\n      assert.equal(respuesta.location, '/login');\n    }\n  });\n\n  test('PC11-F02 - Rechaza una contraseña incorrecta y mantiene el acceso bloqueado', async () => {\n    const cliente = sesion();\n    const respuesta = await cliente.solicitar('/login', {\n      correo: clienteDemo.correo, password: 'Incorrecta-PC11'\n    });\n    assert.equal(respuesta.status, 303);\n    assert.equal(respuesta.location, '/login?error=1');\n    assert.equal((await cliente.solicitar('/tickets')).location, '/login');\n  });\n\n  test('PC11-F03 - El cliente inicia sesión y accede al formulario de incidencias', async () => {\n    const cliente = await ingresar();\n    const listado = await cliente.solicitar('/tickets');\n    assert.equal(listado.status, 200);\n    assert.match(listado.html, /<h1>Mis tickets<\\/h1>/);\n    const formulario = await cliente.solicitar('/tickets/nuevo');\n    assert.equal(formulario.status, 200);\n    assert.match(formulario.html, /id=\"form-ticket\"/);\n    tokenCSRF(formulario.html);\n  });\n\n  test('PC11-F04 - El cliente no puede acceder al panel ni cambiar estados', async () => {\n    const cliente = await ingresar();\n    assert.equal((await cliente.solicitar('/personal')).status, 403);\n    assert.equal((await cliente.solicitar('/personal/tickets/1/estado', {\n      estado: 'En proceso', csrfToken: 'token-invalido'\n    })).status, 403);\n  });\n\n  test('PC11-F05 - Rechaza una descripción de 9 caracteres sin guardar el ticket', async () => {\n    const cliente = await ingresar();\n    const formulario = await cliente.solicitar('/tickets/nuevo');\n    const respuesta = await cliente.solicitar('/tickets', {\n      ...datosTicket('Descripción corta', { descripcion: '123456789' }),\n      csrfToken: tokenCSRF(formulario.html)\n    });\n    assert.equal(respuesta.status, 400);\n    assert.match(respuesta.html, /La descripción debe tener entre 10 y 500 caracteres/);\n    assert.equal(cantidadTickets(), 0);\n  });\n\n  test('PC11-F06 - Rechaza un título de 81 caracteres sin guardar el ticket', async () => {\n    const cliente = await ingresar();\n    const formulario = await cliente.solicitar('/tickets/nuevo');\n    const respuesta = await cliente.solicitar('/tickets', {\n      ...datosTicket('A'.repeat(81)), csrfToken: tokenCSRF(formulario.html)\n    });\n    assert.equal(respuesta.status, 400);\n    assert.match(respuesta.html, /El título debe tener entre 1 y 80 caracteres/);\n    assert.equal(cantidadTickets(), 0);\n  });\n\n  test('PC11-F07 - Registra una incidencia válida con número y estado Pendiente', async () => {\n    const cliente = await ingresar();\n    await crearTicket(cliente, 'Registro válido PC11');\n    assert.equal(cantidadTickets(), 1);\n  });\n\n  test('PC11-F08 - Cada cliente consulta sus tickets y registra solo sobre sus pedidos', async () => {\n    const cliente = await ingresar();\n    await crearTicket(cliente, 'Ticket privado del primer cliente');\n    const otro = await ingresar(segundoCliente);\n    const listado = await otro.solicitar('/tickets');\n    assert.equal(listado.status, 200);\n    assert.ok(!listado.html.includes('Ticket privado del primer cliente'));\n    const formulario = await otro.solicitar('/tickets/nuevo');\n    const respuesta = await otro.solicitar('/tickets', {\n      ...datosTicket('Pedido de otra cuenta'), csrfToken: tokenCSRF(formulario.html)\n    });\n    assert.equal(respuesta.status, 400);\n    assert.match(respuesta.html, /El pedido no existe o no pertenece a tu cuenta/);\n    assert.equal(cantidadTickets(), 1);\n  });\n\n  test('PC11-F09 - Rechaza un registro sin token CSRF', async () => {\n    const cliente = await ingresar();\n    await cliente.solicitar('/tickets/nuevo');\n    const respuesta = await cliente.solicitar('/tickets', datosTicket('Sin token PC11'));\n    assert.equal(respuesta.status, 403);\n    assert.equal(cantidadTickets(), 0);\n  });\n\n  test('PC11-F10 - El personal atiende y resuelve el mismo ticket; el cliente ve Resuelto', async () => {\n    const cliente = await ingresar();\n    const titulo = 'Cambio de estado PC11';\n    const id = await crearTicket(cliente, titulo);\n    const personal = await ingresar(personalDemo, '/personal');\n    assert.equal((await personal.solicitar('/tickets/nuevo')).status, 403);\n\n    for (const [actual, siguiente] of [['Pendiente', 'En proceso'], ['En proceso', 'Resuelto']]) {\n      const panel = await personal.solicitar('/personal');\n      assert.equal(panel.status, 200);\n      const fila = panel.html.match(new RegExp(`<tr data-ticket-id=\"${id}\">[\\\\s\\\\S]*?<\\\\/tr>`))?.[0];\n      assert.ok(fila, 'El personal debe encontrar el mismo número de ticket.');\n      assert.ok(fila.includes(titulo));\n      assert.equal(estadoEnFila(fila), actual);\n\n      const cambio = await personal.solicitar(`/personal/tickets/${id}/estado`, {\n        estado: siguiente, csrfToken: tokenCSRF(fila)\n      });\n      assert.equal(cambio.status, 303);\n      assert.equal(cambio.location, '/personal?actualizado=1');\n\n      const listado = await cliente.solicitar('/tickets');\n      assert.equal(listado.status, 200);\n      const filaActual = filaCliente(listado.html, titulo);\n      assert.equal(Number(filaActual.match(/<td>\\s*(\\d+)\\s*<\\/td>/)?.[1]), id);\n      assert.equal(estadoEnFila(filaActual), siguiente);\n    }\n  });\n\n  test('PC11-F11 - Impide pasar directamente de Pendiente a Resuelto', async () => {\n    const cliente = await ingresar();\n    const titulo = 'Transición no permitida PC11';\n    const id = await crearTicket(cliente, titulo);\n    const personal = await ingresar(personalDemo, '/personal');\n    const panel = await personal.solicitar('/personal');\n    const respuesta = await personal.solicitar(`/personal/tickets/${id}/estado`, {\n      estado: 'Resuelto', csrfToken: tokenCSRF(panel.html)\n    });\n    assert.equal(respuesta.status, 409);\n    const listado = await cliente.solicitar('/tickets');\n    assert.equal(estadoEnFila(filaCliente(listado.html, titulo)), 'Pendiente');\n  });\n\n  test('PC11-F12 - Cerrar sesión invalida también la cookie anterior', async () => {\n    const cliente = await ingresar();\n    const cookieAnterior = cliente.cookie;\n    assert.ok(cookieAnterior);\n    const cierre = await cliente.solicitar('/logout', {});\n    assert.equal(cierre.status, 303);\n    assert.equal(cierre.location, '/login');\n    const reutilizada = await sesion(cookieAnterior).solicitar('/tickets');\n    assert.equal(reutilizada.status, 302);\n    assert.equal(reutilizada.location, '/login');\n  });\n});\n",
    "scripts/pruebas-ci.cjs": "// Genera el resultado de la consola y el XML que publicará Jenkins.\nconst { mkdirSync, rmSync } = require('node:fs');\nconst path = require('node:path');\nconst { spawnSync } = require('node:child_process');\n\nconst raiz = path.resolve(__dirname, '..');\nmkdirSync(path.join(raiz, 'reports'), { recursive: true });\nrmSync(path.join(raiz, 'reports', 'junit.xml'), { force: true });\n\nconst resultado = spawnSync(process.execPath, [\n  '--test',\n  '--test-reporter=spec',\n  '--test-reporter-destination=stdout',\n  '--test-reporter=junit',\n  '--test-reporter-destination=reports/junit.xml',\n  'tests/pc11.test.cjs'\n], { cwd: raiz, stdio: 'inherit' });\n\nif (resultado.error) console.error(resultado.error.message);\nprocess.exitCode = resultado.status ?? 1;\n",
    "Jenkinsfile": "pipeline {\n    agent any\n\n    tools {\n        nodejs 'Node24'\n    }\n\n    options {\n        disableConcurrentBuilds()\n        timeout(time: 10, unit: 'MINUTES')\n    }\n\n    stages {\n        stage('Verificar herramientas') {\n            steps {\n                sh 'node --version'\n                sh 'npm --version'\n            }\n        }\n\n        stage('Instalar dependencias') {\n            steps {\n                sh 'npm ci'\n            }\n        }\n\n        stage('Revisar sintaxis') {\n            steps {\n                sh 'node --check app.js'\n                sh 'node --check database.js'\n                sh 'node --check tickets.js'\n                sh 'node --check personal.js'\n            }\n        }\n\n        stage('Ejecutar pruebas funcionales') {\n            steps {\n                sh 'npm run test:ci'\n            }\n            post {\n                always {\n                    junit testResults: 'reports/junit.xml', allowEmptyResults: false\n                    archiveArtifacts artifacts: 'reports/junit.xml', allowEmptyArchive: false\n                }\n            }\n        }\n    }\n}\n"
  }
};

function normalizar(texto) {
  return texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}
function leer(nombre) {
  return normalizar(fs.readFileSync(path.join(__dirname, nombre), 'utf8'));
}
function fallo(mensaje) {
  throw new Error(mensaje + ' No se modificó ningún archivo.');
}

try {
  for (const nombre of ['app.js', 'database.js', 'package.json', 'package-lock.json']) {
    if (!fs.existsSync(path.join(__dirname, nombre))) {
      fallo('Falta ' + nombre + '. Coloca preparar-pc11.cjs en la carpeta del proyecto.');
    }
  }
  const cambios = new Map();
  const appActual = leer('app.js');
  let appNueva = appActual;
  if (!appActual.includes(CONFIG.bloqueAppNuevo)) {
    const anterior = CONFIG.bloquesAppAnteriores.find(bloque =>
      appActual.endsWith(bloque) || appActual.trimEnd().endsWith(bloque));
    if (!anterior) fallo('El bloque final de app.js difiere del código revisado. Comparte ese bloque para adaptarlo.');
    if (appActual.includes('module.exports = app')) fallo('app.js ya exporta la aplicación con otra estructura.');
    const posicion = appActual.lastIndexOf(anterior);
    appNueva = appActual.slice(0, posicion) + CONFIG.bloqueAppNuevo + '\n';
  }
  cambios.set('app.js', appNueva);

  const datosActuales = leer('database.js');
  let datosNuevos = datosActuales;
  if (!datosActuales.includes(CONFIG.lineaDatosNueva)) {
    if (datosActuales.split(CONFIG.lineaDatosAnterior).length !== 2) {
      fallo('La configuración de la carpeta de datos difiere de la versión revisada.');
    }
    datosNuevos = datosActuales.replace(CONFIG.lineaDatosAnterior, CONFIG.lineaDatosNueva);
  }
  cambios.set('database.js', datosNuevos.endsWith('\n') ? datosNuevos : datosNuevos + '\n');

  const paquete = JSON.parse(leer('package.json'));
  paquete.scripts = paquete.scripts || {};
  const comandoTest = 'node --test tests/pc11.test.cjs';
  const comandoCI = 'node scripts/pruebas-ci.cjs';
  const comandoOriginal = 'echo "Error: no test specified" && exit 1';
  if (paquete.scripts.test && ![comandoOriginal, comandoTest].includes(paquete.scripts.test)) {
    fallo('Ya existe otro comando npm test. Comparte la sección scripts de package.json para integrarlo.');
  }
  if (paquete.scripts['test:ci'] && paquete.scripts['test:ci'] !== comandoCI) {
    fallo('Ya existe un comando test:ci diferente.');
  }
  paquete.scripts.test = comandoTest;
  paquete.scripts['test:ci'] = comandoCI;
  cambios.set('package.json', JSON.stringify(paquete, null, 2) + '\n');

  for (const [nombre, contenido] of Object.entries(CONFIG.archivos)) {
    const destino = path.join(__dirname, nombre);
    if (fs.existsSync(destino) && leer(nombre) !== normalizar(contenido)) {
      fallo('Ya existe una versión diferente de ' + nombre + '.');
    }
    cambios.set(nombre, contenido);
  }

  let ignorados = fs.existsSync(path.join(__dirname, '.gitignore')) ? leer('.gitignore') : '';
  for (const patron of ['node_modules/', 'data/', 'reports/', '.pc11-respaldo/']) {
    if (!ignorados.split('\n').includes(patron)) {
      if (ignorados && !ignorados.endsWith('\n')) ignorados += '\n';
      ignorados += patron + '\n';
    }
  }
  cambios.set('.gitignore', ignorados);

  // Todas las comprobaciones anteriores terminan antes de escribir cambios.
  const pendientes = [...cambios].filter(([nombre, contenido]) => {
    const archivo = path.join(__dirname, nombre);
    return !fs.existsSync(archivo) || leer(nombre) !== normalizar(contenido);
  });
  if (!pendientes.length) {
    console.log('La preparación de la PC11 ya estaba aplicada.');
  } else {
    const respaldo = path.join(__dirname, '.pc11-respaldo', String(Date.now()));
    for (const [nombre] of pendientes) {
      const actual = path.join(__dirname, nombre);
      if (fs.existsSync(actual)) {
        const copia = path.join(respaldo, nombre);
        fs.mkdirSync(path.dirname(copia), { recursive: true });
        fs.copyFileSync(actual, copia);
      }
    }
    for (const [nombre, contenido] of pendientes) {
      const destino = path.join(__dirname, nombre);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, contenido, 'utf8');
      console.log('Preparado: ' + nombre);
    }
    console.log('Respaldo de archivos anteriores: ' + path.relative(__dirname, respaldo));
  }
  console.log('Siguiente paso: npm ci');
  console.log('Después ejecuta: npm run test:ci');
} catch (error) {
  console.error('No se pudo completar la preparación: ' + error.message);
  process.exitCode = 1;
}


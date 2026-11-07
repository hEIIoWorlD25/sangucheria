// PC11: pruebas de integración mediante HTTP, con una base temporal por ejecución.
const assert = require('node:assert/strict');
const { describe, test, before, beforeEach, after } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const { once } = require('node:events');

const carpetaTemporal = mkdtempSync(path.join(os.tmpdir(), 'sangucheria-pc11-'));
process.env.DATA_DIR = carpetaTemporal;
const db = require('../database');
const baseAbierta = db.prepare('PRAGMA database_list').all()
  .find(base => base.name === 'main');
// Impide vaciar tickets si se olvidó aplicar el cambio de DATA_DIR.
assert.equal(path.resolve(baseAbierta.file), path.join(carpetaTemporal, 'tickets.db'),
  'La base debe ser temporal. Ejecuta primero preparar-pc11.cjs.');
const app = require('../app');

const clienteDemo = { correo: 'cliente.pc8@example.test', password: 'PruebaPC8!2026' };
const personalDemo = { correo: 'personal.demo@example.test', password: 'PersonalDemo!2026' };
const segundoCliente = { correo: 'cliente.dos.pc11@example.test', password: 'ClienteDosPC11!2026' };

let servidor;
let baseURL;

function sesion(cookieInicial = '') {
  let cookie = cookieInicial;
  return {
    get cookie() { return cookie; },
    async solicitar(ruta, datos) {
      const cabeceras = {};
      if (cookie) cabeceras.Cookie = cookie;
      const respuesta = await fetch(baseURL + ruta, {
        method: datos === undefined ? 'GET' : 'POST',
        headers: cabeceras,
        body: datos === undefined ? undefined : new URLSearchParams(datos),
        redirect: 'manual',
        signal: AbortSignal.timeout(5000)
      });
      const nuevaCookie = respuesta.headers.getSetCookie()
        .find(valor => valor.startsWith('sangucheria.sid='));
      if (nuevaCookie) cookie = nuevaCookie.split(';')[0];
      return {
        status: respuesta.status,
        location: respuesta.headers.get('location'),
        html: await respuesta.text()
      };
    }
  };
}

async function ingresar(credenciales = clienteDemo, destino = '/tickets') {
  const navegador = sesion();
  const respuesta = await navegador.solicitar('/login', credenciales);
  assert.equal(respuesta.status, 303, 'El inicio de sesión debe redirigir.');
  assert.equal(respuesta.location, destino);
  return navegador;
}

function tokenCSRF(html) {
  const coincidencia = html.match(/name="csrfToken"\s+value="([^"]+)"/);
  assert.ok(coincidencia, 'Debe existir un token CSRF en el formulario.');
  return coincidencia[1];
}

function datosTicket(titulo, cambios = {}) {
  return {
    codigoPedido: 'PED-001',
    titulo,
    descripcion: 'El pedido llegó incompleto y requiere atención.',
    categoria: 'Pedido incompleto',
    prioridad: 'Media',
    ...cambios
  };
}

function filaCliente(html, titulo) {
  const fila = (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [])
    .find(elemento => elemento.includes(`<td data-campo="titulo">${titulo}</td>`));
  assert.ok(fila, `El listado debe mostrar el ticket: ${titulo}`);
  return fila;
}

function estadoEnFila(fila) {
  const coincidencia = fila.match(/data-campo="estado">\s*([^<]+)</);
  assert.ok(coincidencia, 'La fila debe mostrar el estado del ticket.');
  return coincidencia[1].trim();
}

async function crearTicket(cliente, titulo) {
  const formulario = await cliente.solicitar('/tickets/nuevo');
  assert.equal(formulario.status, 200);
  const respuesta = await cliente.solicitar('/tickets', {
    ...datosTicket(titulo), csrfToken: tokenCSRF(formulario.html)
  });
  assert.equal(respuesta.status, 303);
  assert.equal(respuesta.location, '/tickets?creado=1');
  const listado = await cliente.solicitar(respuesta.location);
  assert.equal(listado.status, 200);
  assert.match(listado.html, /Ticket registrado correctamente/);
  const fila = filaCliente(listado.html, titulo);
  const id = Number(fila.match(/<td>\s*(\d+)\s*<\/td>/)?.[1]);
  assert.ok(Number.isSafeInteger(id) && id > 0, 'El ticket debe tener un número.');
  assert.equal(estadoEnFila(fila), 'Pendiente');
  return id;
}

function cantidadTickets() {
  return db.prepare('SELECT count(*) AS cantidad FROM tickets').get().cantidad;
}

describe('PC11 y PC12 - Sistema de tickets de la sanguchería', { concurrency: false }, () => {
  before(async () => {
    // Este usuario y su pedido se crean únicamente en la base temporal.
    const salt = randomBytes(16).toString('hex');
    const alta = db.prepare(`
      INSERT INTO usuarios (nombre, correo, password_hash, salt, rol)
      VALUES (?, ?, ?, ?, 'cliente')
    `).run('Segundo cliente PC11', segundoCliente.correo,
      scryptSync(segundoCliente.password, salt, 64).toString('hex'), salt);
    db.prepare('INSERT INTO pedidos (codigo, usuario_id, descripcion) VALUES (?, ?, ?)')
      .run('PED-PC11-002', alta.lastInsertRowid, 'Pedido del segundo cliente');

    // El puerto 0 permite elegir un puerto libre sin ocupar el 3000 ni el 3001.
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    baseURL = `http://127.0.0.1:${servidor.address().port}`;
  });

  beforeEach(() => {
    db.exec('DELETE FROM tickets');
  });

  after(async () => {
    try {
      if (servidor) {
        await new Promise((resolve, reject) => {
          servidor.close(error => error ? reject(error) : resolve());
          servidor.closeAllConnections();
        });
      }
    } finally {
      db.close();
      rmSync(carpetaTemporal, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  test('PC11-F01 - Exige sesión para consultar tickets y el panel del personal', async () => {
    const anonimo = sesion();
    for (const ruta of ['/tickets', '/personal']) {
      const respuesta = await anonimo.solicitar(ruta);
      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.location, '/login');
    }
  });

  test('PC11-F02 - Rechaza una contraseña incorrecta y mantiene el acceso bloqueado', async () => {
    const cliente = sesion();
    const respuesta = await cliente.solicitar('/login', {
      correo: clienteDemo.correo, password: 'Incorrecta-PC11'
    });
    assert.equal(respuesta.status, 303);
    assert.equal(respuesta.location, '/login?error=1');
    assert.equal((await cliente.solicitar('/tickets')).location, '/login');
  });

  test('PC11-F03 - El cliente inicia sesión y accede al formulario de incidencias', async () => {
    const cliente = await ingresar();
    const listado = await cliente.solicitar('/tickets');
    assert.equal(listado.status, 200);
    assert.match(listado.html, /<h1>Mis tickets<\/h1>/);
    const formulario = await cliente.solicitar('/tickets/nuevo');
    assert.equal(formulario.status, 200);
    assert.match(formulario.html, /id="form-ticket"/);
    tokenCSRF(formulario.html);
  });

  test('PC11-F04 - El cliente no puede acceder al panel ni cambiar estados', async () => {
    const cliente = await ingresar();
    assert.equal((await cliente.solicitar('/personal')).status, 403);
    assert.equal((await cliente.solicitar('/personal/tickets/1/estado', {
      estado: 'En proceso', csrfToken: 'token-invalido'
    })).status, 403);
  });

  test('PC11-F05 - Rechaza una descripción de 9 caracteres sin guardar el ticket', async () => {
    const cliente = await ingresar();
    const formulario = await cliente.solicitar('/tickets/nuevo');
    const respuesta = await cliente.solicitar('/tickets', {
      ...datosTicket('Descripción corta', { descripcion: '123456789' }),
      csrfToken: tokenCSRF(formulario.html)
    });
    assert.equal(respuesta.status, 400);
    assert.match(respuesta.html, /La descripción debe tener entre 10 y 500 caracteres/);
    assert.equal(cantidadTickets(), 0);
  });

  test('PC11-F06 - Rechaza un título de 81 caracteres sin guardar el ticket', async () => {
    const cliente = await ingresar();
    const formulario = await cliente.solicitar('/tickets/nuevo');
    const respuesta = await cliente.solicitar('/tickets', {
      ...datosTicket('A'.repeat(81)), csrfToken: tokenCSRF(formulario.html)
    });
    assert.equal(respuesta.status, 400);
    assert.match(respuesta.html, /El título debe tener entre 1 y 80 caracteres/);
    assert.equal(cantidadTickets(), 0);
  });

  test('PC11-F07 - Registra una incidencia válida con número y estado Pendiente', async () => {
    const cliente = await ingresar();
    await crearTicket(cliente, 'Registro válido PC11');
    assert.equal(cantidadTickets(), 1);
  });

  test('PC11-F08 - Cada cliente consulta sus tickets y registra solo sobre sus pedidos', async () => {
    const cliente = await ingresar();
    await crearTicket(cliente, 'Ticket privado del primer cliente');
    const otro = await ingresar(segundoCliente);
    const listado = await otro.solicitar('/tickets');
    assert.equal(listado.status, 200);
    assert.ok(!listado.html.includes('Ticket privado del primer cliente'));
    const formulario = await otro.solicitar('/tickets/nuevo');
    const respuesta = await otro.solicitar('/tickets', {
      ...datosTicket('Pedido de otra cuenta'), csrfToken: tokenCSRF(formulario.html)
    });
    assert.equal(respuesta.status, 400);
    assert.match(respuesta.html, /El pedido no existe o no pertenece a tu cuenta/);
    assert.equal(cantidadTickets(), 1);
  });

  test('PC11-F09 - Rechaza un registro sin token CSRF', async () => {
    const cliente = await ingresar();
    await cliente.solicitar('/tickets/nuevo');
    const respuesta = await cliente.solicitar('/tickets', datosTicket('Sin token PC11'));
    assert.equal(respuesta.status, 403);
    assert.equal(cantidadTickets(), 0);
  });

  test('PC11-F10 - El personal atiende y resuelve el mismo ticket; el cliente ve Resuelto', async () => {
    const cliente = await ingresar();
    const titulo = 'Cambio de estado PC11';
    const id = await crearTicket(cliente, titulo);
    const personal = await ingresar(personalDemo, '/personal');
    assert.equal((await personal.solicitar('/tickets/nuevo')).status, 403);

    for (const [actual, siguiente] of [['Pendiente', 'En proceso'], ['En proceso', 'Resuelto']]) {
      const panel = await personal.solicitar('/personal');
      assert.equal(panel.status, 200);
      const fila = panel.html.match(new RegExp(`<tr data-ticket-id="${id}">[\\s\\S]*?<\\/tr>`))?.[0];
      assert.ok(fila, 'El personal debe encontrar el mismo número de ticket.');
      assert.ok(fila.includes(titulo));
      assert.equal(estadoEnFila(fila), actual);

      const cambio = await personal.solicitar(`/personal/tickets/${id}/estado`, {
        estado: siguiente, csrfToken: tokenCSRF(fila)
      });
      assert.equal(cambio.status, 303);
      assert.equal(cambio.location, '/personal?actualizado=1');

      const listado = await cliente.solicitar('/tickets');
      assert.equal(listado.status, 200);
      const filaActual = filaCliente(listado.html, titulo);
      assert.equal(Number(filaActual.match(/<td>\s*(\d+)\s*<\/td>/)?.[1]), id);
      assert.equal(estadoEnFila(filaActual), siguiente);
    }
  });

  test('PC11-F11 - Impide pasar directamente de Pendiente a Resuelto', async () => {
    const cliente = await ingresar();
    const titulo = 'Transición no permitida PC11';
    const id = await crearTicket(cliente, titulo);
    const personal = await ingresar(personalDemo, '/personal');
    const panel = await personal.solicitar('/personal');
    const respuesta = await personal.solicitar(`/personal/tickets/${id}/estado`, {
      estado: 'Resuelto', csrfToken: tokenCSRF(panel.html)
    });
    assert.equal(respuesta.status, 409);
    const listado = await cliente.solicitar('/tickets');
    assert.equal(estadoEnFila(filaCliente(listado.html, titulo)), 'Pendiente');
  });

  test('PC11-F12 - Cerrar sesión invalida también la cookie anterior', async () => {
    const cliente = await ingresar();
    const cookieAnterior = cliente.cookie;
    assert.ok(cookieAnterior);
    const cierre = await cliente.solicitar('/logout', {});
    assert.equal(cierre.status, 303);
    assert.equal(cierre.location, '/login');
    const reutilizada = await sesion(cookieAnterior).solicitar('/tickets');
    assert.equal(reutilizada.status, 302);
    assert.equal(reutilizada.location, '/login');
  });

  // PC12: escenarios adicionales sugeridos con apoyo de IA y verificados al ejecutar.
  for (const [nombre, cambios, esperado] of [
    ['Título de 1 y descripción de 10 caracteres', { titulo: 'A', descripcion: 'D'.repeat(10) }, 303],
    ['Título de 80 y descripción de 500 caracteres', { titulo: 'A'.repeat(80), descripcion: 'D'.repeat(500) }, 303],
    ['Descripción de 501 caracteres', { descripcion: 'D'.repeat(501) }, 400],
    ['Título compuesto solo por espacios', { titulo: '   ' }, 400],
    ['Categoría fuera del catálogo', { categoria: 'No existe' }, 400],
    ['Prioridad fuera del catálogo', { prioridad: 'Urgente' }, 400],
    ['Pedido inexistente', { codigoPedido: 'NO-EXISTE' }, 400]
  ]) {
    test(`PC12 - ${nombre}`, async () => {
      const cliente = await ingresar();
      const formulario = await cliente.solicitar('/tickets/nuevo');
      const datos = datosTicket('Caso PC12', cambios);
      const respuesta = await cliente.solicitar('/tickets', {
        ...datos, csrfToken: tokenCSRF(formulario.html)
      });
      assert.equal(respuesta.status, esperado);
      assert.equal(cantidadTickets(), esperado === 303 ? 1 : 0);
      if (esperado === 303) {
        const guardado = db.prepare('SELECT titulo, descripcion, estado FROM tickets').get();
        assert.equal(guardado.titulo, datos.titulo);
        assert.equal(guardado.descripcion, datos.descripcion);
        assert.equal(guardado.estado, 'Pendiente');
      }
    });
  }

  test('PC12 - Rechaza un token incorrecto y el token de otra sesión', async () => {
    const cliente = await ingresar();
    await cliente.solicitar('/tickets/nuevo');
    const otro = await ingresar(segundoCliente);
    const formularioAjeno = await otro.solicitar('/tickets/nuevo');
    for (const csrfToken of ['incorrecto', tokenCSRF(formularioAjeno.html)]) {
      const respuesta = await cliente.solicitar('/tickets', { ...datosTicket('Token ajeno'), csrfToken });
      assert.equal(respuesta.status, 403);
      assert.equal(cantidadTickets(), 0);
    }
  });

  test('PC12 - Rechaza identificadores inválidos e inexistentes sin cambiar tickets', async () => {
    const cliente = await ingresar();
    const id = await crearTicket(cliente, 'Conservar estado');
    const personal = await ingresar(personalDemo, '/personal');
    const panel = await personal.solicitar('/personal');
    for (const [numero, esperado] of [['abc', 400], ['0', 400], ['-1', 400], ['1.5', 400], ['999999', 404]]) {
      const respuesta = await personal.solicitar(`/personal/tickets/${numero}/estado`, {
        estado: 'En proceso', csrfToken: tokenCSRF(panel.html)
      });
      assert.equal(respuesta.status, esperado);
      assert.equal(db.prepare('SELECT estado FROM tickets WHERE id = ?').get(id).estado, 'Pendiente');
    }
  });

  test('PC12 - No permite reabrir un ticket resuelto', async () => {
    const cliente = await ingresar();
    const id = await crearTicket(cliente, 'Ticket finalizado');
    const personal = await ingresar(personalDemo, '/personal');
    const panel = await personal.solicitar('/personal');
    const csrfToken = tokenCSRF(panel.html);
    for (const estado of ['En proceso', 'Resuelto']) {
      assert.equal((await personal.solicitar(`/personal/tickets/${id}/estado`, { estado, csrfToken })).status, 303);
    }
    for (const estado of ['Pendiente', 'En proceso', 'Resuelto']) {
      assert.equal((await personal.solicitar(`/personal/tickets/${id}/estado`, { estado, csrfToken })).status, 409);
    }
    assert.equal(db.prepare('SELECT estado FROM tickets WHERE id = ?').get(id).estado, 'Resuelto');
  });

  test('PC12 - Cambiar estado requiere CSRF válido aun siendo personal', async () => {
    const cliente = await ingresar();
    const id = await crearTicket(cliente, 'Cambio protegido');
    const personal = await ingresar(personalDemo, '/personal');
    await personal.solicitar('/personal');
    for (const datos of [{ estado: 'En proceso' }, { estado: 'En proceso', csrfToken: 'incorrecto' }]) {
      assert.equal((await personal.solicitar(`/personal/tickets/${id}/estado`, datos)).status, 403);
    }
    assert.equal(db.prepare('SELECT estado FROM tickets WHERE id = ?').get(id).estado, 'Pendiente');
  });

  test('PC12 - Muestra el título como texto escapado en ambos paneles', async () => {
    const cliente = await ingresar();
    const formulario = await cliente.solicitar('/tickets/nuevo');
    const titulo = '<script>alert(1)</script>';
    assert.equal((await cliente.solicitar('/tickets', {
      ...datosTicket(titulo), csrfToken: tokenCSRF(formulario.html)
    })).status, 303);
    const personal = await ingresar(personalDemo, '/personal');
    for (const pagina of [await cliente.solicitar('/tickets'), await personal.solicitar('/personal')]) {
      assert.ok(pagina.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert.ok(!pagina.html.includes(titulo));
    }
  });

});


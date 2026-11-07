const express = require('express');
const { exigirRol, prepararCSRF, validarCSRF } = require('./lib/seguridad');
const db = require('./database');

const router = express.Router();

const { categorias, prioridades, validarTicket } = require('./lib/ticket-reglas');

// Permite mostrar textos del usuario de forma segura en el HTML.
const { escapar } = require('./lib/html');

function pagina(titulo, contenido) {
  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapar(titulo)} | Sanguchería</title>

        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: #f5f3ef;
            color: #242424;
            font-family: Arial, sans-serif;
          }
          main {
            max-width: 1000px;
            margin: 24px auto;
            padding: 32px;
            background: white;
            border: 1px solid #e6e1da;
            border-radius: 16px;
          }
          nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 28px;
          }
          h1 { margin-bottom: 12px; }
          p { line-height: 1.5; }
          label {
            display: block;
            margin: 18px 0 8px;
            font-weight: bold;
          }
          input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #bbb;
            border-radius: 8px;
            font: inherit;
          }
          textarea { min-height: 130px; resize: vertical; }
          input:focus, select:focus, textarea:focus {
            outline: 3px solid #f4d4c9;
            border-color: #a33920;
          }
          button, .boton {
            display: inline-block;
            padding: 12px 18px;
            border: none;
            border-radius: 8px;
            background: #a33920;
            color: white;
            font: inherit;
            text-decoration: none;
            cursor: pointer;
          }
          button:hover, .boton:hover { background: #822c18; }
          button:focus-visible, a:focus-visible {
            outline: 3px solid #242424;
            outline-offset: 3px;
          }
          a { color: #a33920; }
          .acciones { margin-top: 24px; }
          .error, .exito { padding: 14px; border-radius: 8px; }
          .error { background: #fff0ed; color: #8c2817; }
          .exito { background: #eaf6ed; color: #205b30; }
          .tabla { overflow-x: auto; margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid #e6e1da;
            overflow-wrap: anywhere;
          }
          th { background: #f5f3ef; }
          @media (max-width: 600px) {
            body { padding: 12px; }
            main { padding: 20px; }
          }
        </style>
      </head>

      <body>
        <main>
          <nav aria-label="Navegación principal">
            <a href="/tickets">Mis tickets</a>
            <form action="/logout" method="POST">
              <button type="submit">Cerrar sesión</button>
            </form>
          </nav>

          ${contenido}
        </main>
      </body>
    </html>
  `;
}

function opciones(valores, elegido) {
  return valores.map(valor => `
    <option value="${escapar(valor)}"
      ${valor === elegido ? 'selected' : ''}>
      ${escapar(valor)}
    </option>
  `).join('');
}

function formulario(token, datos = {}, error = '') {
  return pagina('Nuevo ticket', `
    <h1>Nuevo ticket</h1>
    <p>Cuéntanos qué ocurrió con tu pedido.</p>

    ${error ? `
      <p id="mensaje-error" class="error" role="alert">
        ${escapar(error)}
      </p>
    ` : ''}

    <form id="form-ticket" action="/tickets" method="POST">
      <input type="hidden" name="csrfToken" value="${escapar(token)}">

      <label for="codigo-pedido">Código del pedido</label>
      <input
        id="codigo-pedido"
        name="codigoPedido"
        placeholder="Ejemplo: PED-001"
        value="${escapar(datos.codigoPedido)}"
        maxlength="40"
        required
      >

      <label for="titulo">Título de la incidencia</label>
      <input
        id="titulo"
        name="titulo"
        value="${escapar(datos.titulo)}"
        maxlength="80"
        required
      >

      <label for="descripcion">Descripción</label>
      <textarea
        id="descripcion"
        name="descripcion"
        minlength="10"
        maxlength="500"
        required
      >${escapar(datos.descripcion)}</textarea>

      <label for="categoria">Categoría</label>
      <select id="categoria" name="categoria" required>
        ${opciones(categorias, datos.categoria || 'Pedido incompleto')}
      </select>

      <label for="prioridad">Prioridad</label>
      <select id="prioridad" name="prioridad" required>
        ${opciones(prioridades, datos.prioridad || 'Media')}
      </select>

      <div class="acciones">
        <button id="btn-registrar-ticket" type="submit">
          Registrar ticket
        </button>
        <a href="/tickets">Cancelar</a>
      </div>
    </form>
  `);
}

// Todas las rutas de este módulo requieren iniciar sesión.
router.use(exigirRol('cliente', 'Acceso reservado a clientes.'));

// Lista únicamente los tickets del cliente conectado.
router.get('/', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.id, t.titulo, t.prioridad, t.estado, p.codigo
    FROM tickets t
    JOIN pedidos p ON p.id = t.pedido_id
    WHERE p.usuario_id = ?
    ORDER BY t.id DESC
  `).all(req.session.usuarioId);

  const filas = tickets.map(ticket => `
    <tr>
      <td>${ticket.id}</td>
      <td data-campo="pedido">${escapar(ticket.codigo)}</td>
      <td data-campo="titulo">${escapar(ticket.titulo)}</td>
      <td>${escapar(ticket.prioridad)}</td>
      <td data-campo="estado">${escapar(ticket.estado)}</td>
    </tr>
  `).join('');

  res.send(pagina('Mis tickets', `
    <h1>Mis tickets</h1>
    <p>Consulta las incidencias registradas para tus pedidos.</p>

    ${req.query.creado === '1' ? `
      <p id="mensaje-exito" class="exito" role="status">
        Ticket registrado correctamente
      </p>
    ` : ''}

    <a id="btn-nuevo-ticket" class="boton" href="/tickets/nuevo">
      Nuevo ticket
    </a>

    <div class="tabla">
      <table aria-label="Mis tickets registrados">
        <thead>
          <tr>
            <th scope="col">N.º</th>
            <th scope="col">Pedido</th>
            <th scope="col">Título</th>
            <th scope="col">Prioridad</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${filas || `
            <tr>
              <td colspan="5">Aún no has registrado tickets.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `));
});

// Abre el formulario y prepara un token para su envío.
router.get('/nuevo', (req, res) => {
  prepararCSRF(req);

  res.send(formulario(req.session.csrf));
});

// Valida los datos y guarda el ticket.
router.post('/', validarCSRF('Formulario no válido. Regresa a /tickets/nuevo e inténtalo nuevamente.'), (req, res) => {


  const { datos, error } = validarTicket(req.body);

  if (error) {
    return res.status(400).send(
      formulario(req.session.csrf, datos, error)
    );
  }

  const pedido = db.prepare(`
    SELECT id FROM pedidos
    WHERE codigo = ? AND usuario_id = ?
  `).get(datos.codigoPedido, req.session.usuarioId);

  if (!pedido) {
    return res.status(400).send(
      formulario(
        req.session.csrf,
        datos,
        'El pedido no existe o no pertenece a tu cuenta.'
      )
    );
  }

  db.prepare(`
    INSERT INTO tickets
      (pedido_id, titulo, descripcion, categoria, prioridad)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    pedido.id,
    datos.titulo,
    datos.descripcion,
    datos.categoria,
    datos.prioridad
  );

  res.redirect(303, '/tickets?creado=1');
});

module.exports = router;

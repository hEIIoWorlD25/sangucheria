const { siguienteEstado: obtenerSiguienteEstado } = require('./lib/ticket-reglas');
const express = require('express');
const { exigirRol, prepararCSRF, validarCSRF } = require('./lib/seguridad');
const db = require('./database');

const router = express.Router();

const { escapar } = require('./lib/html');

// Solo permite el acceso al personal autenticado.
router.use(exigirRol('personal', 'Acceso reservado al personal de la sanguchería.'));

router.get('/', (req, res) => {
  prepararCSRF(req);

  const tickets = db.prepare(`
    SELECT
      t.id,
      t.titulo,
      t.descripcion,
      t.prioridad,
      t.estado,
      p.codigo,
      u.nombre AS cliente
    FROM tickets t
    JOIN pedidos p ON p.id = t.pedido_id
    JOIN usuarios u ON u.id = p.usuario_id
    ORDER BY t.id DESC
  `).all();

  const filas = tickets.map(ticket => {
    const siguienteEstado = obtenerSiguienteEstado(ticket.estado);
    const textoBoton = siguienteEstado === 'En proceso' ? 'Iniciar atención' : 'Resolver ticket';

    const accion = siguienteEstado ? `
      <form action="/personal/tickets/${ticket.id}/estado" method="POST">
        <input
          type="hidden"
          name="csrfToken"
          value="${escapar(req.session.csrf)}"
        >
        <input
          type="hidden"
          name="estado"
          value="${escapar(siguienteEstado)}"
        >
        <button type="submit">${textoBoton}</button>
      </form>
    ` : '<span>Atención finalizada</span>';

    return `
      <tr data-ticket-id="${ticket.id}">
        <td>${ticket.id}</td>
        <td>${escapar(ticket.cliente)}</td>
        <td>${escapar(ticket.codigo)}</td>
        <td>
          <strong>${escapar(ticket.titulo)}</strong>
          <p class="descripcion">${escapar(ticket.descripcion)}</p>
        </td>
        <td>${escapar(ticket.prioridad)}</td>
        <td data-campo="estado">${escapar(ticket.estado)}</td>
        <td>${accion}</td>
      </tr>
    `;
  }).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel de atención | Sanguchería</title>

        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            background: #f5f3ef;
            color: #242424;
          }
          main {
            max-width: 1250px;
            margin: 24px auto;
            padding: 32px;
            background: white;
            border: 1px solid #e6e1da;
            border-radius: 16px;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            flex-wrap: wrap;
          }
          h1 { margin: 0 0 12px; }
          p { line-height: 1.5; }
          .marca {
            color: #a33920;
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 1px;
          }
          .tabla { overflow-x: auto; margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid #e6e1da;
            vertical-align: top;
          }
          th { background: #f5f3ef; }
          .descripcion {
            margin: 8px 0 0;
            font-size: 14px;
            color: #666;
            max-width: 350px;
            overflow-wrap: anywhere;
          }
          button {
            padding: 11px 15px;
            border: none;
            border-radius: 8px;
            background: #a33920;
            color: white;
            font: inherit;
            cursor: pointer;
          }
          button:hover { background: #822c18; }
          button:focus-visible {
            outline: 3px solid #242424;
            outline-offset: 3px;
          }
          .exito {
            padding: 14px;
            border-radius: 8px;
            background: #eaf6ed;
            color: #205b30;
          }
          @media (max-width: 600px) {
            body { padding: 12px; }
            main { padding: 20px; }
          }
        </style>
      </head>

      <body>
        <main>
          <header>
            <div>
              <p class="marca">SANGUCHERÍA · PERSONAL</p>
              <h1>Panel de atención</h1>
            </div>

            <form action="/logout" method="POST">
              <button type="submit">Cerrar sesión</button>
            </form>
          </header>

          <p>Consulta las incidencias de los clientes y actualiza su estado.</p>

          ${req.query.actualizado === '1' ? `
            <p id="mensaje-exito" class="exito" role="status">
              Estado actualizado correctamente
            </p>
          ` : ''}

          <div class="tabla">
            <table aria-label="Tickets de los clientes">
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Incidencia</th>
                  <th scope="col">Prioridad</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                ${filas || `
                  <tr>
                    <td colspan="7">Todavía no hay tickets registrados.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `);
});

router.post('/tickets/:id/estado', validarCSRF('Formulario no válido. Regresa al panel y vuelve a intentarlo.'), (req, res) => {


  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).send('Número de ticket no válido.');
  }

  const ticket = db.prepare(
    'SELECT id, estado FROM tickets WHERE id = ?'
  ).get(id);

  if (!ticket) {
    return res.status(404).send('El ticket no existe.');
  }

  const siguienteEstado = obtenerSiguienteEstado(ticket.estado);

  if (!siguienteEstado || req.body.estado !== siguienteEstado) {
    return res.status(409).send(
      'El cambio solicitado no corresponde al estado actual. Regresa al panel.'
    );
  }

  // Actualiza solo si el estado sigue siendo el que acabamos de consultar.
  const resultado = db.prepare(`
    UPDATE tickets
    SET estado = ?
    WHERE id = ? AND estado = ?
  `).run(siguienteEstado, id, ticket.estado);

  if (resultado.changes !== 1) {
    return res.status(409).send(
      'Otro usuario modificó el ticket. Actualiza el panel.'
    );
  }

  res.redirect(303, '/personal?actualizado=1');
});

module.exports = router;

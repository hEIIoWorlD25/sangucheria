
'use strict';

const express = require('express');
const { randomBytes } = require('node:crypto');
const db = require('./database');

const router = express.Router();

// Escapar contenido para prevenir inyección HTML.
function escapar(valor = '') {
  const caracteres = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(valor).replace(
    /[&<>"']/g,
    caracter => caracteres[caracter]
  );
}

// Proteger las rutas del personal.
router.use((req, res, next) => {
  if (!req.session.usuarioId) {
    return res.redirect('/login');
  }

  if (req.session.rol !== 'personal') {
    return res.status(403).send(
      'Acceso reservado al personal de la sanguchería.'
    );
  }

  res.set('Cache-Control', 'no-store');
  next();
});

// Panel principal del personal.
router.get('/', (req, res) => {

  if (!req.session.csrf) {
    req.session.csrf = randomBytes(24).toString('hex');
  }

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

  // Indicadores del dashboard.
  const total = tickets.length;

  const pendientes = tickets.filter(
    t => t.estado === 'Pendiente'
  ).length;

  const enProceso = tickets.filter(
    t => t.estado === 'En proceso'
  ).length;

  const resueltos = tickets.filter(
    t => t.estado === 'Resuelto'
  ).length;

  // Generar las filas conservando los identificadores
  // requeridos por las pruebas automatizadas PC11.
  const filas = tickets.map(ticket => {

    let siguienteEstado = '';
    let textoBoton = '';
    let claseBoton = '';

    if (ticket.estado === 'Pendiente') {
      siguienteEstado = 'En proceso';
      textoBoton = 'Iniciar atención';
      claseBoton = 'bg-orange-800 hover:bg-orange-900';
    } else if (ticket.estado === 'En proceso') {
      siguienteEstado = 'Resuelto';
      textoBoton = 'Resolver ticket';
      claseBoton = 'bg-blue-700 hover:bg-blue-800';
    }

    const claseEstado =
      ticket.estado === 'Pendiente'
        ? 'font-semibold text-amber-700'
        : ticket.estado === 'En proceso'
          ? 'font-semibold text-blue-700'
          : 'font-semibold text-emerald-700';

    const clasePrioridad =
      ticket.prioridad === 'Alta'
        ? 'font-semibold text-red-700'
        : ticket.prioridad === 'Media'
          ? 'font-semibold text-orange-700'
          : 'font-semibold text-stone-500';

    const accion = siguienteEstado ? `
      <form
        action="/personal/tickets/${ticket.id}/estado"
        method="POST"
      >
        <input type="hidden" name="csrfToken" value="${escapar(req.session.csrf)}">
        <input type="hidden" name="estado" value="${escapar(siguienteEstado)}">

        <button
          type="submit"
          class="cursor-pointer whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${claseBoton}"
        >
          ${textoBoton}
        </button>
      </form>
    ` : `
      <span class="inline-flex rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        Atención finalizada
      </span>
    `;

    return `
      <tr data-ticket-id="${ticket.id}">
        <td class="px-6 py-5 font-bold text-stone-700">
          ${ticket.id}
        </td>

        <td class="px-6 py-5">
          <span class="font-semibold text-stone-900">
            ${escapar(ticket.cliente)}
          </span>
        </td>

        <td class="px-6 py-5 text-stone-600">
          ${escapar(ticket.codigo)}
        </td>

        <td class="px-6 py-5">
          <strong class="block font-semibold text-stone-900">
            ${escapar(ticket.titulo)}
          </strong>

          <p class="mt-2 max-w-xs break-words text-xs leading-relaxed text-stone-500">
            ${escapar(ticket.descripcion)}
          </p>
        </td>

        <td class="px-6 py-5 ${clasePrioridad}">
          ${escapar(ticket.prioridad)}
        </td>

        <td class="px-6 py-5 ${claseEstado}" data-campo="estado">${escapar(ticket.estado)}</td>

        <td class="px-6 py-5">
          ${accion}
        </td>
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

  <link rel="stylesheet" href="/styles.css">

  <style>
    tr[data-ticket-id][hidden] {
      display: none !important;
    }
  </style>
</head>

<body class="min-h-screen bg-stone-100 text-stone-800 antialiased">

  <!-- Barra superior -->
  <header class="border-b border-stone-200 bg-white shadow-sm">

    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">

      <div class="flex items-center gap-3">

        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-900 text-2xl shadow-sm">
          🥪
        </div>

        <div>
          <p class="text-lg font-extrabold tracking-tight text-stone-900">
            Sanguchería
          </p>

          <p class="text-xs font-semibold tracking-wider text-stone-500">
            PANEL ADMINISTRATIVO
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">

        <span class="hidden rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-900 sm:inline-flex">
          Personal autorizado
        </span>

        <form action="/logout" method="POST">
          <button
            type="submit"
            class="cursor-pointer rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            Cerrar sesión
          </button>
        </form>

      </div>

    </div>
  </header>

  <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

    <!-- Bienvenida -->
    <section class="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-orange-950 via-red-900 to-orange-800 px-6 py-9 text-white shadow-xl shadow-orange-950/15 sm:px-10">

      <div class="relative z-10">

        <span class="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide">
          GESTIÓN DE INCIDENCIAS
        </span>

        <div class="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <h1>Panel de atención</h1>
        </div>

        <p class="mt-4 max-w-2xl text-sm leading-relaxed text-orange-100 sm:text-base">
          Supervisa las solicitudes de los clientes,
          gestiona las incidencias y realiza el seguimiento
          de cada ticket hasta su resolución.
        </p>

      </div>

      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-300/20 blur-3xl">
      </div>

    </section>

    <!-- Mensaje de actualización -->
    ${req.query.actualizado === '1' ? `
      <div
        id="mensaje-exito"
        role="status"
        class="mb-7 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-semibold text-emerald-800"
      >
        Estado actualizado correctamente
      </div>
    ` : ''}

    <!-- Tarjetas estadísticas -->
    <section
      aria-label="Resumen de atención"
      class="mb-9 grid grid-cols-2 gap-4 lg:grid-cols-4"
    >

      <!-- Total -->
      <article class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 text-2xl">
          📋
        </div>

        <p class="text-sm font-medium text-stone-500">
          Total de tickets
        </p>

        <p class="mt-2 text-4xl font-extrabold text-stone-900">
          ${total}
        </p>

        <p class="mt-2 text-xs text-stone-400">
          Incidencias registradas
        </p>
      </article>

      <!-- Pendientes -->
      <article class="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-2xl">
          🕒
        </div>

        <p class="text-sm font-medium text-stone-500">
          Pendientes
        </p>

        <p class="mt-2 text-4xl font-extrabold text-amber-700">
          ${pendientes}
        </p>

        <p class="mt-2 text-xs text-amber-700">
          Esperando atención
        </p>
      </article>

      <!-- En proceso -->
      <article class="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-2xl">
          ⚙️
        </div>

        <p class="text-sm font-medium text-stone-500">
          En proceso
        </p>

        <p class="mt-2 text-4xl font-extrabold text-blue-700">
          ${enProceso}
        </p>

        <p class="mt-2 text-xs text-blue-700">
          Atención iniciada
        </p>
      </article>

      <!-- Resueltos -->
      <article class="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
          ✅
        </div>

        <p class="text-sm font-medium text-stone-500">
          Resueltos
        </p>

        <p class="mt-2 text-4xl font-extrabold text-emerald-700">
          ${resueltos}
        </p>

        <p class="mt-2 text-xs text-emerald-700">
          Atención finalizada
        </p>
      </article>

    </section>

    <!-- Tabla administrativa -->
    <section class="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg shadow-stone-200/50">

      <div class="border-b border-stone-100 px-6 py-6">

        <div class="flex flex-wrap items-center justify-between gap-4">

          <div>
            <h2 class="text-xl font-extrabold text-stone-900">
              Administración de tickets
            </h2>

            <p class="mt-2 text-sm text-stone-500">
              Consulta las incidencias y actualiza sus estados.
            </p>
          </div>

          <span
            id="contador-resultados"
            aria-live="polite"
            class="rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-stone-600"
          >
            ${total} resultados
          </span>
        </div>

        <!-- Filtros -->
        <div class="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">

          <div>
            <label for="buscar-tickets" class="sr-only">
              Buscar incidencias
            </label>

            <input
              id="buscar-tickets"
              type="search"
              placeholder="Buscar por cliente, pedido o incidencia..."
              class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >
          </div>

          <div>
            <label for="filtrar-estado" class="sr-only">
              Filtrar por estado
            </label>

            <select
              id="filtrar-estado"
              class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >
              <option value="Todos">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En proceso">En proceso</option>
              <option value="Resuelto">Resuelto</option>
            </select>
          </div>

        </div>

      </div>

      <!-- Tabla de incidencias -->
      <div class="overflow-x-auto">

        <table
          aria-label="Tickets de los clientes"
          class="w-full min-w-[950px] border-collapse text-left text-sm"
        >

          <thead class="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">

            <tr>
              <th scope="col" class="px-6 py-4">N.º</th>
              <th scope="col" class="px-6 py-4">Cliente</th>
              <th scope="col" class="px-6 py-4">Pedido</th>
              <th scope="col" class="px-6 py-4">Incidencia</th>
              <th scope="col" class="px-6 py-4">Prioridad</th>
              <th scope="col" class="px-6 py-4">Estado</th>
              <th scope="col" class="px-6 py-4">Acción</th>
            </tr>

          </thead>

          <tbody class="divide-y divide-stone-100">
            ${filas || `
              <tr>
                <td colspan="7" class="px-6 py-12 text-center text-stone-500">
                  Todavía no hay tickets registrados.
                </td>
              </tr>
            `}
          </tbody>

        </table>

      </div>

      <div
        id="sin-resultados"
        role="status"
        class="hidden border-t border-stone-100 px-6 py-10 text-center text-sm text-stone-500"
      >
        No encontramos incidencias con los filtros seleccionados.
      </div>

    </section>

    <footer class="mt-10 text-center text-xs text-stone-400">
      Sanguchería · Panel de gestión de incidencias
    </footer>

  </main>

  <!-- Filtros interactivos -->
  <script>
    (() => {
      const buscador = document.getElementById('buscar-tickets');
      const filtro = document.getElementById('filtrar-estado');
      const contador = document.getElementById('contador-resultados');
      const sinResultados = document.getElementById('sin-resultados');

      const filas = Array.from(
        document.querySelectorAll('tr[data-ticket-id]')
      );

      function normalizar(texto) {
        return String(texto)
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase();
      }

      function aplicarFiltros() {
        const busqueda = normalizar(buscador.value.trim());
        const estado = filtro.value;
        let visibles = 0;

        filas.forEach(fila => {
          const contenido = normalizar(fila.textContent);
          const celdaEstado = fila.querySelector(
            '[data-campo="estado"]'
          );
          const estadoActual = celdaEstado.textContent.trim();

          const coincideBusqueda = contenido.includes(busqueda);
          const coincideEstado =
            estado === 'Todos' || estadoActual === estado;

          const mostrar = coincideBusqueda && coincideEstado;

          fila.hidden = !mostrar;

          if (mostrar) {
            visibles++;
          }
        });

        contador.textContent =
          visibles + (visibles === 1 ? ' resultado' : ' resultados');

        sinResultados.classList.toggle(
          'hidden',
          visibles > 0 || filas.length === 0
        );
      }

      buscador.addEventListener('input', aplicarFiltros);
      filtro.addEventListener('change', aplicarFiltros);
    })();
  </script>

</body>
</html>
  `);
});

// Actualizar estado de una incidencia.
router.post('/tickets/:id/estado', (req, res) => {

  // Comprobar token CSRF.
  if (
    typeof req.session.csrf !== 'string' ||
    req.body?.csrfToken !== req.session.csrf
  ) {
    return res.status(403).send(
      'Formulario no válido. Regresa al panel y vuelve a intentarlo.'
    );
  }

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

  let siguienteEstado = '';

  if (ticket.estado === 'Pendiente') {
    siguienteEstado = 'En proceso';
  } else if (ticket.estado === 'En proceso') {
    siguienteEstado = 'Resuelto';
  }

  // Evitar transiciones incorrectas.
  if (!siguienteEstado || req.body.estado !== siguienteEstado) {
    return res.status(409).send(
      'El cambio solicitado no corresponde al estado actual. Regresa al panel.'
    );
  }

  // Actualización segura del estado actual.
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

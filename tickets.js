
'use strict';

const express = require('express');
const { randomBytes } = require('node:crypto');
const db = require('./database');

const router = express.Router();

const categorias = [
  'Pedido incompleto',
  'Producto equivocado',
  'Demora',
  'Problema de pago',
  'Otro'
];

const prioridades = ['Baja', 'Media', 'Alta'];

// Evita que se interprete HTML ingresado por el usuario.
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

// Plantilla principal de las páginas del cliente.
function pagina(titulo, contenido) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapar(titulo)} | Sanguchería</title>
  <link rel="stylesheet" href="/styles.css">
</head>

<body class="min-h-screen bg-stone-100 text-stone-800 antialiased">

  <div class="min-h-screen">

    <header class="border-b border-stone-200 bg-white shadow-sm">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">

        <a href="/tickets"
           class="flex items-center gap-3">

          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-900 text-2xl shadow-sm">
            🥪
          </span>

          <span>
            <span class="block text-lg font-extrabold tracking-tight text-stone-900">
              Sanguchería
            </span>

            <span class="block text-xs font-medium tracking-wide text-stone-500">
              PORTAL DE ATENCIÓN
            </span>
          </span>
        </a>

        <nav aria-label="Navegación principal"
             class="flex items-center gap-3">

          <a href="/tickets"
             class="rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-900 transition-colors hover:bg-orange-100">
            Mis tickets
          </a>

          <form action="/logout" method="POST">
            <button type="submit"
              class="cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-900">
              Cerrar sesión
            </button>
          </form>

        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      ${contenido}
    </main>

    <footer class="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-stone-400">
      Sanguchería · Sistema de gestión de incidencias
    </footer>

  </div>
</body>
</html>
  `;
}

// Genera las opciones del formulario.
function opciones(valores, elegido) {
  return valores.map(valor => `
    <option value="${escapar(valor)}"
      ${valor === elegido ? 'selected' : ''}>
      ${escapar(valor)}
    </option>
  `).join('');
}

// Formulario moderno para registrar incidencias.
function formulario(token, datos = {}, error = '') {
  return pagina('Nuevo ticket', `

    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">

      <div>
        <a href="/tickets"
           class="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-800 transition hover:text-orange-950">
          ← Volver a mis tickets
        </a>

        <p class="mb-2 text-xs font-bold uppercase tracking-widest text-orange-800">
          NUEVA INCIDENCIA
        </p>

        <h1 class="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
          Nuevo ticket
        </h1>

        <p class="mt-3 max-w-2xl text-stone-500">
          Cuéntanos qué ocurrió con tu pedido.
          Nuestro equipo podrá hacer seguimiento a tu solicitud.
        </p>
      </div>

      <span class="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-900">
        Atención al cliente
      </span>

    </div>

    <section class="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50">

      <div class="border-b border-stone-100 bg-stone-50 px-6 py-5 sm:px-9">
        <h2 class="text-lg font-bold text-stone-900">
          Detalles de tu incidencia
        </h2>

        <p class="mt-1 text-sm text-stone-500">
          Completa los campos para registrar tu solicitud.
        </p>
      </div>

      <div class="px-6 py-7 sm:px-9 sm:py-9">

        ${error ? `
          <p id="mensaje-error"
             role="alert"
             class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            ${escapar(error)}
          </p>
        ` : ''}

        <form id="form-ticket"
              action="/tickets"
              method="POST"
              class="space-y-6">

          <input type="hidden"
                 name="csrfToken"
                 value="${escapar(token)}">

          
<!-- Selección de uno o varios pedidos -->
<div>
  <p class="mb-3 text-sm font-semibold text-stone-700">
    Selecciona los pedidos relacionados
  </p>

  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    ${Array.from({ length: 12 }, (_, i) => {
      const codigo = `PED-${String(i + 1).padStart(3, '0')}`;

      const seleccionados = Array.isArray(datos.codigosPedido)
        ? datos.codigosPedido
        : datos.codigoPedido
          ? [datos.codigoPedido]
          : [];

      return `
        <label class="flex cursor-pointer items-center gap-2
          rounded-xl border border-stone-200 p-3
          transition hover:border-orange-400 hover:bg-orange-50">

          <input
            type="checkbox"
            name="codigoPedido"
            value="${codigo}"
            ${seleccionados.includes(codigo) ? 'checked' : ''}
            class="h-4 w-4 accent-orange-800"
          >

          <span class="text-sm font-medium text-stone-700">
            ${codigo}
          </span>
        </label>
      `;
    }).join('')}
  </div>

  <p class="mt-3 text-sm text-stone-500">
    Puedes seleccionar uno o varios pedidos
    para registrar una sola incidencia.
  </p>
</div>

          <!-- Título -->
          <div>
            <label for="titulo"
                   class="mb-2 block text-sm font-semibold text-stone-700">
              Título de la incidencia
            </label>

            <input
              id="titulo"
              name="titulo"
              placeholder="Describe brevemente qué sucedió"
              value="${escapar(datos.titulo)}"
              maxlength="80"
              required
              class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-stone-900 shadow-sm outline-none transition-all duration-200 focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >

            <p class="mt-2 text-right text-xs text-stone-400">
              <span id="contador-titulo">0</span>/80 caracteres
            </p>
          </div>

          <!-- Descripción -->
          <div>
            <label for="descripcion"
                   class="mb-2 block text-sm font-semibold text-stone-700">
              Descripción
            </label>

            <textarea
              id="descripcion"
              name="descripcion"
              minlength="10"
              maxlength="500"
              required
              rows="5"
              placeholder="Explica lo sucedido con tu pedido..."
              class="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-stone-900 shadow-sm outline-none transition-all duration-200 focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >${escapar(datos.descripcion)}</textarea>

            <div class="mt-2 flex justify-between gap-4 text-xs text-stone-400">
              <span>Mínimo 10 caracteres</span>
              <span>
                <span id="contador-descripcion">0</span>/500
              </span>
            </div>
          </div>

          <!-- Categoría y prioridad -->
          <div class="grid gap-6 sm:grid-cols-2">

            <div>
              <label for="categoria"
                     class="mb-2 block text-sm font-semibold text-stone-700">
                Categoría
              </label>

              <select
                id="categoria"
                name="categoria"
                required
                class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-stone-900 shadow-sm outline-none transition-all focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
              >
                ${opciones(
                  categorias,
                  datos.categoria || 'Pedido incompleto'
                )}
              </select>
            </div>

            <div>
              <label for="prioridad"
                     class="mb-2 block text-sm font-semibold text-stone-700">
                Prioridad
              </label>

              <select
                id="prioridad"
                name="prioridad"
                required
                class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-stone-900 shadow-sm outline-none transition-all focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
              >
                ${opciones(
                  prioridades,
                  datos.prioridad || 'Media'
                )}
              </select>
            </div>

          </div>

          <!-- Botones -->
          <div class="flex flex-col-reverse gap-3 border-t border-stone-100 pt-6 sm:flex-row sm:justify-end">

            <a href="/tickets"
               class="inline-flex items-center justify-center rounded-xl border border-stone-200 px-6 py-3.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">
              Cancelar
            </a>

            <button
              id="btn-registrar-ticket"
              type="submit"
              class="cursor-pointer rounded-xl bg-orange-800 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-900/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-900 hover:shadow-xl active:translate-y-0"
            >
              Registrar ticket
            </button>

          </div>

        </form>
      </div>

    </section>

    <script>
      // Contadores interactivos.
      for (const [id, contador] of [
        ['titulo', 'contador-titulo'],
        ['descripcion', 'contador-descripcion']
      ]) {
        const entrada = document.getElementById(id);
        const salida = document.getElementById(contador);

        const actualizar = () => {
          salida.textContent = String(
            Array.from(entrada.value).length
          );
        };

        entrada.addEventListener('input', actualizar);
        actualizar();
      }
    </script>

  `);
}

// Validación de sesión y rol.
router.use((req, res, next) => {
  if (!req.session.usuarioId) {
    return res.redirect('/login');
  }

  if (req.session.rol !== 'cliente') {
    return res.status(403).send(
      'Acceso reservado a clientes.'
    );
  }

  res.set('Cache-Control', 'no-store');
  next();
});

// Panel principal del cliente.
router.get('/', (req, res) => {

  const tickets = db.prepare(`
    SELECT t.id, t.titulo, t.prioridad, t.estado, 
COALESCE(
  (
    SELECT GROUP_CONCAT(
      CASE
        WHEN p2.codigo GLOB 'PED-???-USR-[0-9]*'
          THEN SUBSTR(p2.codigo, 1, 7)
        ELSE p2.codigo
      END,
      ', '
    )
    FROM ticket_pedidos tp
    JOIN pedidos p2 ON p2.id = tp.pedido_id
    WHERE tp.ticket_id = t.id
  ),
  CASE
    WHEN p.codigo GLOB 'PED-???-USR-[0-9]*'
      THEN SUBSTR(p.codigo, 1, 7)
    ELSE p.codigo
  END
) AS codigo

    FROM tickets t
    JOIN pedidos p ON p.id = t.pedido_id
    WHERE p.usuario_id = ?
    ORDER BY t.id DESC
  `).all(req.session.usuarioId);

  // Estadísticas.
  const pendientes = tickets.filter(
    ticket => ticket.estado === 'Pendiente'
  ).length;

  const enProceso = tickets.filter(
    ticket => ticket.estado === 'En proceso'
  ).length;

  const resueltos = tickets.filter(
    ticket => ticket.estado === 'Resuelto'
  ).length;

  // Filas de la tabla.
  // Se conservan los atributos data-campo de PC11.
  const filas = tickets.map(ticket => `
    <tr
      data-ticket-row
      data-estado="${escapar(ticket.estado)}"
      data-busqueda="${escapar(
        ticket.titulo + ' ' + ticket.codigo + ' ' + ticket.id
      )}"
      class="transition-colors hover:bg-orange-50/40"
    >
      <td>${ticket.id}</td>
      <td data-campo="pedido">${escapar(ticket.codigo)}</td>
      <td data-campo="titulo">${escapar(ticket.titulo)}</td>
      <td>${escapar(ticket.prioridad)}</td>
      <td data-campo="estado">${escapar(ticket.estado)}</td>
    </tr>
  `).join('');

  res.send(pagina('Mis tickets', `

    <!-- Encabezado del dashboard -->
    <section class="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-orange-950 via-red-900 to-orange-800 px-6 py-9 text-white shadow-xl shadow-orange-950/15 sm:px-10 sm:py-11">

      <div class="relative z-10 max-w-2xl">

        <span class="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">
          PANEL DEL CLIENTE
        </span>

        <div class="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <h1>Mis tickets</h1>
        </div>

        <p class="mt-3 text-sm leading-relaxed text-orange-100 sm:text-base">
          Consulta tus incidencias, conoce su estado
          y registra una nueva solicitud cuando lo necesites.
        </p>

        <a
          id="btn-nuevo-ticket"
          href="/tickets/nuevo"
          class="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-orange-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-50 hover:shadow-xl"
        >
          + Nuevo ticket
        </a>

      </div>

      <div aria-hidden="true"
           class="pointer-events-none absolute -right-24 -top-20 h-80 w-80 rounded-full bg-orange-300/20 blur-3xl">
      </div>
    </section>

    <!-- Mensaje de registro correcto -->
    ${req.query.creado === '1' ? `
      <p id="mensaje-exito"
         role="status"
         class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">
        Ticket registrado correctamente
      </p>
    ` : ''}

    <!-- Estadísticas del cliente -->
    <section aria-label="Resumen de incidencias"
             class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">

      <div class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <p class="text-sm font-medium text-stone-500">
          Total de tickets
        </p>

        <p class="mt-3 text-3xl font-extrabold text-stone-900">
          ${tickets.length}
        </p>

        <span class="mt-2 inline-block text-xs text-stone-400">
          Incidencias registradas
        </span>
      </div>

      <div class="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <p class="text-sm font-medium text-stone-500">
          Pendientes
        </p>

        <p class="mt-3 text-3xl font-extrabold text-amber-700">
          ${pendientes}
        </p>

        <span class="mt-2 inline-block text-xs text-amber-700">
          Por atender
        </span>
      </div>

      <div class="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <p class="text-sm font-medium text-stone-500">
          En proceso
        </p>

        <p class="mt-3 text-3xl font-extrabold text-blue-700">
          ${enProceso}
        </p>

        <span class="mt-2 inline-block text-xs text-blue-700">
          Recibiendo atención
        </span>
      </div>

      <div class="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <p class="text-sm font-medium text-stone-500">
          Resueltos
        </p>

        <p class="mt-3 text-3xl font-extrabold text-emerald-700">
          ${resueltos}
        </p>

        <span class="mt-2 inline-block text-xs text-emerald-700">
          Atención finalizada
        </span>
      </div>

    </section>

    <!-- Tabla de tickets -->
    <section class="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg shadow-stone-200/40">

      <div class="border-b border-stone-100 px-5 py-6 sm:px-7">

        <div class="flex flex-wrap items-start justify-between gap-4">

          <div>
            <h2 class="text-xl font-bold text-stone-900">
              Historial de incidencias
            </h2>

            <p class="mt-1 text-sm text-stone-500">
              Encuentra tus solicitudes por número, pedido o título.
            </p>
          </div>

          <span
            id="tickets-visibles"
            aria-live="polite"
            class="rounded-full bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-600"
          >
            ${tickets.length} resultados
          </span>

        </div>

        <!-- Buscador y filtro -->
        <div class="mt-5 grid gap-3 sm:grid-cols-[1fr_220px]">

          <label class="block">
            <span class="sr-only">Buscar tickets</span>

            <input
              id="buscar-tickets"
              type="search"
              placeholder="Buscar ticket o código..."
              class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >
          </label>

          <label class="block">
            <span class="sr-only">Filtrar por estado</span>

            <select
              id="filtro-estado"
              class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-100"
            >
              <option value="todos">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En proceso">En proceso</option>
              <option value="Resuelto">Resuelto</option>
            </select>
          </label>

        </div>
      </div>

      <!-- Tabla -->
      <div class="overflow-x-auto">

        <table
          aria-label="Mis tickets registrados"
          class="w-full min-w-[650px] border-collapse text-left text-sm"
        >

          <thead class="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th scope="col" class="px-6 py-4">N.º</th>
              <th scope="col" class="px-6 py-4">Pedido</th>
              <th scope="col" class="px-6 py-4">Título</th>
              <th scope="col" class="px-6 py-4">Prioridad</th>
              <th scope="col" class="px-6 py-4">Estado</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-stone-100 text-stone-700">
            ${filas || `
              <tr>
                <td colspan="5"
                    class="px-6 py-12 text-center text-stone-500">
                  Aún no has registrado tickets.
                </td>
              </tr>
            `}
          </tbody>

        </table>
      </div>

      <p
        id="sin-resultados"
        role="status"
        class="hidden border-t border-stone-100 px-6 py-10 text-center text-sm text-stone-500"
      >
        No hay tickets que coincidan con tu búsqueda.
      </p>

    </section>

    <!-- Estilos compatibles con las pruebas PC11 -->
    <style>
      table[aria-label="Mis tickets registrados"] tbody td {
        padding: 1rem 1.5rem;
        vertical-align: middle;
      }

      table[aria-label="Mis tickets registrados"]
      tbody td[data-campo="titulo"] {
        font-weight: 600;
        color: #292524;
      }

      table[aria-label="Mis tickets registrados"]
      tbody td[data-campo="estado"] {
        font-weight: 600;
      }

      tr[data-estado="Pendiente"] td[data-campo="estado"] {
        color: #a16207;
      }

      tr[data-estado="En proceso"] td[data-campo="estado"] {
        color: #1d4ed8;
      }

      tr[data-estado="Resuelto"] td[data-campo="estado"] {
        color: #047857;
      }

      tr[data-ticket-row][hidden] {
        display: none;
      }
    </style>

    <!-- Buscador interactivo -->
    <script>
      (() => {
        const buscar = document.getElementById('buscar-tickets');
        const filtro = document.getElementById('filtro-estado');
        const filas = Array.from(
          document.querySelectorAll('tr[data-ticket-row]')
        );

        const contador = document.getElementById('tickets-visibles');
        const vacio = document.getElementById('sin-resultados');

        const normalizar = valor =>
          valor.normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '')
            .toLowerCase();

        function aplicarFiltros() {
          const texto = normalizar(buscar.value.trim());
          const estado = filtro.value;

          let visibles = 0;

          filas.forEach(fila => {
            const coincide =
              normalizar(fila.dataset.busqueda || '').includes(texto) &&
              (estado === 'todos' || fila.dataset.estado === estado);

            fila.hidden = !coincide;

            if (coincide) visibles++;
          });

          contador.textContent =
            visibles + (visibles === 1 ? ' resultado' : ' resultados');

          vacio.classList.toggle(
            'hidden',
            visibles > 0 || filas.length === 0
          );
        }

        buscar.addEventListener('input', aplicarFiltros);
        filtro.addEventListener('change', aplicarFiltros);
      })();
    </script>

  `));
});


router.get('/nuevo', (req, res) => {
  if (!req.session.csrf) {
    req.session.csrf = randomBytes(24).toString('hex');
  }

  // Buscar un pedido perteneciente al cliente actual.
  const pedido = db.prepare(`
    SELECT codigo
    FROM pedidos
    WHERE usuario_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(req.session.usuarioId);

  // Mostrar su código en el formulario.
  res.send(formulario(req.session.csrf, {
    codigoPedido: pedido?.codigo || ''
  }));
});



router.post('/', (req, res) => {
  // Mantener la protección CSRF.
  if (
    typeof req.session.csrf !== 'string' ||
    req.body?.csrfToken !== req.session.csrf
  ) {
    return res.status(403).send(
      'Formulario no válido. Regresa a /tickets/nuevo e inténtalo nuevamente.'
    );
  }

  // Aceptar uno o varios códigos enviados por el formulario.
  const recibidos = Array.isArray(req.body?.codigoPedido)
    ? req.body.codigoPedido
    : [req.body?.codigoPedido];

  const codigosPedido = recibidos
    .filter(valor => typeof valor === 'string')
    .map(valor => valor.trim());

  const datos = {
    codigoPedido: codigosPedido[0] || '',
    codigosPedido
  };

  const campos = [
    'titulo',
    'descripcion',
    'categoria',
    'prioridad'
  ];

  let tiposValidos = recibidos.length === codigosPedido.length;

  for (const campo of campos) {
    if (typeof req.body?.[campo] !== 'string') {
      tiposValidos = false;
      datos[campo] = '';
    } else {
      datos[campo] = req.body[campo].trim();
    }
  }

  let error = '';

  if (!tiposValidos) {
    error = 'Los campos deben contener texto.';
  } else if (
    codigosPedido.length < 1 ||
    codigosPedido.length > 12 ||
    codigosPedido.some(
      codigo => !/^PED-(00[1-9]|01[0-2])$/.test(codigo)
    )
  ) {
    error = 'Selecciona pedidos válidos entre PED-001 y PED-012.';
  } else if (
    new Set(codigosPedido).size !== codigosPedido.length
  ) {
    error = 'No repitas el mismo pedido.';
  } else if (
    [...datos.titulo].length < 1 ||
    [...datos.titulo].length > 80
  ) {
    error = 'El título debe tener entre 1 y 80 caracteres.';
  } else if (
    [...datos.descripcion].length < 10 ||
    [...datos.descripcion].length > 500
  ) {
    error = 'La descripción debe tener entre 10 y 500 caracteres.';
  } else if (!categorias.includes(datos.categoria)) {
    error = 'Selecciona una categoría válida.';
  } else if (!prioridades.includes(datos.prioridad)) {
    error = 'Selecciona una prioridad válida.';
  }

  if (error) {
    return res.status(400).send(
      formulario(req.session.csrf, datos, error)
    );
  }

  const usuarioId = req.session.usuarioId;

  // Comprobar que el cliente tiene habilitados
  // los pedidos de demostración.
  const marcador = db.prepare(`
    SELECT id FROM pedidos
    WHERE codigo = ? AND usuario_id = ?
  `).get(`DEMO-${usuarioId}`, usuarioId);

  const referencias = [];

  for (const codigo of codigosPedido) {
    // Buscar el pedido propio.
    const pedidoPropio = db.prepare(`
      SELECT id FROM pedidos
      WHERE codigo = ? AND usuario_id = ?
    `).get(codigo, usuarioId);

    if (pedidoPropio) {
      referencias.push({ id: pedidoPropio.id });
      continue;
    }

    if (!marcador) {
      return res.status(400).send(
        formulario(
          req.session.csrf,
          datos,
          'El pedido no existe o no pertenece a tu cuenta.'
        )
      );
    }

    // Crear una referencia interna exclusiva del cliente.
    referencias.push({
      interno: `${codigo}-USR-${usuarioId}`,
      codigo
    });
  }

  // Guardar todo o nada.
  db.exec('BEGIN IMMEDIATE');

  try {
    const idsPedidos = [];

    for (const referencia of referencias) {
      if (referencia.id) {
        idsPedidos.push(referencia.id);
        continue;
      }

      db.prepare(`
        INSERT INTO pedidos (codigo, usuario_id, descripcion)
        VALUES (?, ?, ?)
        ON CONFLICT(codigo) DO NOTHING
      `).run(
        referencia.interno,
        usuarioId,
        `Pedido de demostración ${referencia.codigo}`
      );

      const pedido = db.prepare(`
        SELECT id FROM pedidos
        WHERE codigo = ? AND usuario_id = ?
      `).get(referencia.interno, usuarioId);

      if (!pedido) {
        throw new Error('No se pudo asociar el pedido.');
      }

      idsPedidos.push(pedido.id);
    }

    // Un único ticket, aunque incluya varios pedidos.
    const resultado = db.prepare(`
      INSERT INTO tickets
        (pedido_id, titulo, descripcion, categoria, prioridad)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      idsPedidos[0],
      datos.titulo,
      datos.descripcion,
      datos.categoria,
      datos.prioridad
    );

    const ticketId = Number(resultado.lastInsertRowid);

    // Relacionar los pedidos seleccionados con el ticket.
    const asociar = db.prepare(`
      INSERT INTO ticket_pedidos (ticket_id, pedido_id)
      VALUES (?, ?)
    `);

    for (const pedidoId of idsPedidos) {
      asociar.run(ticketId, pedidoId);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.redirect(303, '/tickets?creado=1');
});


module.exports = router;

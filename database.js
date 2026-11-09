const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scryptSync } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// La base de datos se guardará dentro de la carpeta data.
const carpetaDatos = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, 'data')
);
fs.mkdirSync(carpetaDatos, { recursive: true });

const db = new DatabaseSync(
  path.join(carpetaDatos, 'tickets.db')
);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'cliente'
      CHECK (rol IN ('cliente', 'personal'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    usuario_id INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY,

    pedido_id INTEGER NOT NULL,

    titulo TEXT NOT NULL
      CHECK (length(trim(titulo)) BETWEEN 1 AND 80),

    descripcion TEXT NOT NULL
      CHECK (length(trim(descripcion)) BETWEEN 10 AND 500),

    categoria TEXT NOT NULL
      CHECK (categoria IN (
        'Pedido incompleto',
        'Producto equivocado',
        'Demora',
        'Problema de pago',
        'Otro'
      )),

    prioridad TEXT NOT NULL
      CHECK (prioridad IN ('Baja', 'Media', 'Alta')),

    estado TEXT NOT NULL DEFAULT 'Pendiente'
      CHECK (estado IN (
        'Pendiente',
        'En proceso',
        'Resuelto'
      )),

    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );


  CREATE INDEX IF NOT EXISTS idx_tickets_pedido
    ON tickets(pedido_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_pedidos (
    ticket_id INTEGER NOT NULL,
    pedido_id INTEGER NOT NULL,

    PRIMARY KEY (ticket_id, pedido_id),

    FOREIGN KEY (ticket_id)
      REFERENCES tickets(id) ON DELETE CASCADE,

    FOREIGN KEY (pedido_id)
      REFERENCES pedidos(id)
  );
`);

const correoPrueba = 'cliente.pc8@example.test';

const usuarioExistente = db.prepare(
  'SELECT id FROM usuarios WHERE correo = ?'
).get(correoPrueba);

// Crea el cliente solamente si todavía no existe.
if (!usuarioExistente) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(
    'PruebaPC8!2026',
    salt,
    64
  ).toString('hex');

  db.prepare(`
    INSERT INTO usuarios
      (nombre, correo, password_hash, salt, rol)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Cliente PC8',
    correoPrueba,
    hash,
    salt,
    'cliente'
  );
}

const cliente = db.prepare(
  'SELECT id FROM usuarios WHERE correo = ?'
).get(correoPrueba);

db.prepare(`
  INSERT INTO pedidos (codigo, usuario_id, descripcion)
  VALUES (?, ?, ?)
  ON CONFLICT(codigo) DO NOTHING
`).run(
  'PED-001',
  cliente.id,
  'Pedido de prueba para la PC8'
);

const correoPersonal = 'personal.demo@example.test';

const personalExistente = db.prepare(
  'SELECT id FROM usuarios WHERE correo = ?'
).get(correoPersonal);

if (!personalExistente) {
  const saltPersonal = randomBytes(16).toString('hex');

  const hashPersonal = scryptSync(
    'PersonalDemo!2026',
    saltPersonal,
    64
  ).toString('hex');

  db.prepare(`
    INSERT INTO usuarios
      (nombre, correo, password_hash, salt, rol)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Personal de la sanguchería',
    correoPersonal,
    hashPersonal,
    saltPersonal,
    'personal'
  );
}

// Pedidos de demostración del cliente de prueba.
const insertarPedidoDemo = db.prepare(`
  INSERT INTO pedidos (codigo, usuario_id, descripcion)
  VALUES (?, ?, ?)
  ON CONFLICT(codigo) DO NOTHING
`);

for (let numero = 2; numero <= 12; numero++) {
  const codigo = `PED-${String(numero).padStart(3, '0')}`;

  insertarPedidoDemo.run(
    codigo,
    cliente.id,
    `Pedido de demostración número ${numero}`
  );
}


// Asignar un pedido de prueba a clientes sin pedidos.
// No modifica pedidos ni tickets existentes.
db.prepare(`
  INSERT INTO pedidos (codigo, usuario_id, descripcion)
  SELECT
    'DEMO-' || u.id,
    u.id,
    'Pedido de demostración del cliente'
  FROM usuarios AS u
  WHERE u.rol = 'cliente'
    AND NOT EXISTS (
      SELECT 1
      FROM pedidos AS p
      WHERE p.usuario_id = u.id
    )
`).run();

// Muestra los datos cuando ejecutamos este archivo directamente.
if (require.main === module) {
  console.log('Base de datos preparada correctamente.');

  console.table(
    db.prepare(
      'SELECT id, nombre, correo, rol FROM usuarios'
    ).all()
  );

  console.table(
    db.prepare(
      'SELECT codigo, usuario_id, descripcion FROM pedidos'
    ).all()
  );

  db.close();
}

module.exports = db;

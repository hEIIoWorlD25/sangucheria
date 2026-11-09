const express = require('express');
const session = require('express-session');
const path = require('node:path');
const {
  randomBytes,
  scryptSync,
  timingSafeEqual
} = require('node:crypto');
const db = require('./database');

const app = express();
const puerto = 3000;

function destinoSegunRol(rol) {
  return rol === 'personal' ? '/personal' : '/tickets';
}

app.use(express.urlencoded({
  extended: false,
  limit: '10kb'
}));

app.use(session({
  name: 'sangucheria.sid',
  secret: randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (!req.session.usuarioId) {
    return res.redirect('/login');
  }

  res.redirect(destinoSegunRol(req.session.rol));
});

app.get('/login', (req, res) => {
  if (req.session.usuarioId) {
    return res.redirect(destinoSegunRol(req.session.rol));
  }

  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res, next) => {
  const { correo, password } = req.body || {};

  if (
    typeof correo !== 'string' ||
    typeof password !== 'string' ||
    !correo.trim() ||
    !password ||
    correo.length > 254 ||
    password.length > 1024
  ) {
    return res.redirect(303, '/login?error=1');
  }

  const usuario = db.prepare(
    'SELECT * FROM usuarios WHERE correo = ?'
  ).get(correo.trim().toLowerCase());

  if (!usuario) {
    return res.redirect(303, '/login?error=1');
  }

  const hashIngresado = scryptSync(password, usuario.salt, 64);
  const hashGuardado = Buffer.from(usuario.password_hash, 'hex');

  const passwordCorrecta =
    hashIngresado.length === hashGuardado.length &&
    timingSafeEqual(hashIngresado, hashGuardado);

  if (!passwordCorrecta) {
    return res.redirect(303, '/login?error=1');
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.usuarioId = usuario.id;
    req.session.rol = usuario.rol;

    req.session.save((error) => {
      if (error) return next(error);
      res.redirect(303, destinoSegunRol(usuario.rol));
    });
  });
});

/* REGISTRO SEGURO DE CLIENTES */

function formularioRegistroCliente(token, error = '') {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Crear cuenta | Sanguchería</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body class="min-h-screen bg-stone-100 flex items-center justify-center p-6">
      <main class="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 class="mb-2 text-3xl font-bold text-orange-900">
          Crear cuenta
        </h1>
        <p class="mb-6 text-stone-500">
          Regístrate como cliente de nuestra sanguchería.
        </p>

        ${error ? `
          <p role="alert" class="mb-4 rounded-lg bg-red-50 p-3 text-red-700">
            ${error}
          </p>
        ` : ''}

        <form action="/registro/cliente" method="POST" class="space-y-4">
          <input type="hidden" name="csrfToken" value="${token}">

          <label class="block">
            <span class="font-medium">Nombre completo</span>
            <input name="nombre" required maxlength="80"
              autocomplete="name"
              class="mt-2 w-full rounded-xl border border-stone-300 p-3">
          </label>

          <label class="block">
            <span class="font-medium">Correo electrónico</span>
            <input name="correo" type="email" required maxlength="254"
              autocomplete="email"
              class="mt-2 w-full rounded-xl border border-stone-300 p-3">
          </label>

          <label class="block">
            <span class="font-medium">Contraseña</span>
            <input name="password" type="password" required
              minlength="12" maxlength="128"
              autocomplete="new-password"
              class="mt-2 w-full rounded-xl border border-stone-300 p-3">
          </label>

          <label class="block">
            <span class="font-medium">Confirmar contraseña</span>
            <input name="confirmarPassword" type="password" required
              minlength="12" maxlength="128"
              autocomplete="new-password"
              class="mt-2 w-full rounded-xl border border-stone-300 p-3">
          </label>

          <button type="submit"
            class="w-full rounded-xl bg-orange-800 p-4 font-semibold text-white hover:bg-orange-900">
            Registrar cliente
          </button>
        </form>

        <a href="/login"
          class="mt-6 block text-center font-medium text-orange-800">
          Volver al inicio de sesión
        </a>
      </main>
    </body>
    </html>
  `;
}

app.get('/registro/cliente', (req, res) => {
  if (req.session.usuarioId) {
    return res.redirect(destinoSegunRol(req.session.rol));
  }

  if (!req.session.csrfRegistro) {
    req.session.csrfRegistro = randomBytes(24).toString('hex');
  }

  res.send(formularioRegistroCliente(req.session.csrfRegistro));
});

app.post('/registro/cliente', (req, res) => {
  if (req.session.usuarioId) {
    return res.status(403).send('Debes cerrar sesión antes de registrarte.');
  }

  if (
    typeof req.session.csrfRegistro !== 'string' ||
    typeof req.body?.csrfToken !== 'string' ||
    req.body.csrfToken !== req.session.csrfRegistro
  ) {
    return res.status(403).send('Formulario no válido.');
  }

  const { nombre, correo, password, confirmarPassword } = req.body;

  const datosValidos =
    typeof nombre === 'string' &&
    typeof correo === 'string' &&
    typeof password === 'string' &&
    typeof confirmarPassword === 'string';

  if (!datosValidos) {
    return res.status(400).send(
      formularioRegistroCliente(req.session.csrfRegistro, 'Datos incorrectos.')
    );
  }

  const nombreLimpio = nombre.trim();
  const correoLimpio = correo.trim().toLowerCase();

  if (
    nombreLimpio.length < 2 ||
    nombreLimpio.length > 80 ||
    correoLimpio.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio) ||
    password.length < 12 ||
    password.length > 128 ||
    password !== confirmarPassword
  ) {
    return res.status(400).send(
      formularioRegistroCliente(
        req.session.csrfRegistro,
        'Revisa tus datos. La contraseña debe tener al menos 12 caracteres y coincidir.'
      )
    );
  }

  const existente = db.prepare(
    'SELECT id FROM usuarios WHERE correo = ?'
  ).get(correoLimpio);

  if (existente) {
    return res.status(409).send(
      formularioRegistroCliente(
        req.session.csrfRegistro,
        'Este correo ya se encuentra registrado.'
      )
    );
  }

  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  
const nuevoCliente = db.prepare(`
  INSERT INTO usuarios (nombre, correo, password_hash, salt, rol)
  VALUES (?, ?, ?, ?, 'cliente')
`).run(nombreLimpio, correoLimpio, hash, salt);

const nuevoId = Number(nuevoCliente.lastInsertRowid);

// Pedido de demostración exclusivo del cliente.
db.prepare(`
  INSERT INTO pedidos (codigo, usuario_id, descripcion)
  VALUES (?, ?, ?)
`).run(
  `DEMO-${nuevoId}`,
  nuevoId,
  'Pedido de demostración del cliente'
);


  delete req.session.csrfRegistro;

  res.redirect(303, '/login?registro=1');
});


app.use('/tickets', require('./tickets'));
app.use('/personal', require('./personal'));

app.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie('sangucheria.sid', { path: '/' });
    res.redirect(303, '/login');
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send('Ocurrió un error en el servidor.');
});

if (require.main === module) {
  app.listen(puerto, process.env.HOST || 'localhost', () => {
    console.log('Servidor disponible en http://localhost:3000');
  });
}

module.exports = app;

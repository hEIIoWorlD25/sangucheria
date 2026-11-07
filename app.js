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


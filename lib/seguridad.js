const { randomBytes } = require('node:crypto');

function exigirRol(rol, mensaje) {
  return (req, res, next) => {
    if (!req.session.usuarioId) return res.redirect('/login');
    if (req.session.rol !== rol) return res.status(403).send(mensaje);
    res.set('Cache-Control', 'no-store');
    next();
  };
}

function prepararCSRF(req) {
  if (!req.session.csrf) req.session.csrf = randomBytes(24).toString('hex');
  return req.session.csrf;
}

function validarCSRF(mensaje) {
  return (req, res, next) => {
    if (typeof req.session.csrf !== 'string' || req.body?.csrfToken !== req.session.csrf) {
      return res.status(403).send(mensaje);
    }
    next();
  };
}

module.exports = { exigirRol, prepararCSRF, validarCSRF };

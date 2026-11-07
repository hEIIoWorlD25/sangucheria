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

module.exports = { escapar };

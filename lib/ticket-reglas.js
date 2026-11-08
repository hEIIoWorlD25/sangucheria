const categorias = [
  'Pedido incompleto',
  'Producto equivocado',
  'Demora',
  'Problema de pago',
  'Otro'
];

const prioridades = ['Baja', 'Media', 'Alta'];

function validarTicket(cuerpo = {}) {
  const campos = [
    'codigoPedido',
    'titulo',
    'descripcion',
    'categoria',
    'prioridad'
  ];

  const datos = {};
  let tiposValidos = true;

  for (const campo of campos) {
    if (typeof cuerpo[campo] !== 'string') {
      tiposValidos = false;
      datos[campo] = '';
    } else {
      datos[campo] = cuerpo[campo].trim();
    }
  }

  let error = '';

  if (!tiposValidos) {
    error = 'Los campos deben contener texto.';
  } else if (!datos.codigoPedido || datos.codigoPedido.length > 40) {
    error = 'Ingresa un código de pedido válido.';
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

  return { datos, error };
}

function siguienteEstado(estado) {
  if (estado === "Pendiente") return "En proceso";
  if (estado === "En proceso") return "Resuelto";
  return "";
}

module.exports = { categorias, prioridades, validarTicket, siguienteEstado };

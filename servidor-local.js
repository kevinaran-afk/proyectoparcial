/* =============================================================================
   EProfile — servidor de desarrollo
   Solo sirve para probar el proyecto en tu computadora antes de subirlo.
   Reproduce lo que hace Netlify: sirve los archivos estáticos, aplica las
   mismas reglas de rutas de netlify.toml y ejecuta la función de /api.

   Uso:   node servidor-local.js      y abre http://localhost:8888

   Este archivo NO es necesario en Netlify; puedes dejarlo o borrarlo del ZIP.
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('./netlify/functions/api.js');

const PUERTO = process.env.PORT || 8888;
const RAIZ = __dirname;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

/* Mismas reglas que netlify.toml, en el mismo orden. */
function resolverRuta(camino) {
  if (/^\/netlify(\/|$)/.test(camino) || camino === '/netlify.toml') return { archivo: '/404.html', estado: 404 };
  if (camino === '/' ) return { archivo: '/index.html', estado: 200 };
  if (camino === '/entrar') return { archivo: '/entrar.html', estado: 200 };
  if (camino === '/admin') return { archivo: '/admin.html', estado: 200 };

  const partes = camino.split('/').filter(Boolean);
  if (partes.length === 2 && partes[1] === 'admin') return { archivo: '/panel.html', estado: 200 };
  if (partes.length === 2 && partes[1] === 'tarjeta') return { archivo: '/tarjeta.html', estado: 200 };
  if (partes.length === 1) return { archivo: '/perfil.html', estado: 200 };
  return { archivo: '/404.html', estado: 404 };
}

function servirArchivo(respuesta, rutaRelativa, estado) {
  const completa = path.join(RAIZ, rutaRelativa);
  if (!completa.startsWith(RAIZ)) { respuesta.writeHead(403).end('Prohibido'); return; }
  fs.readFile(completa, function (error, contenido) {
    if (error) { respuesta.writeHead(404, { 'content-type': 'text/plain' }).end('No encontrado'); return; }
    respuesta.writeHead(estado || 200, { 'content-type': TIPOS[path.extname(completa)] || 'application/octet-stream' });
    respuesta.end(contenido);
  });
}

http.createServer(function (peticion, respuesta) {
  const url = new URL(peticion.url, 'http://localhost:' + PUERTO);
  const camino = decodeURIComponent(url.pathname);

  /* --- API --- */
  if (camino.startsWith('/api/')) {
    let cuerpo = '';
    peticion.on('data', function (trozo) { cuerpo += trozo; });
    peticion.on('end', async function () {
      const parametros = {};
      url.searchParams.forEach(function (valor, clave) { parametros[clave] = valor; });
      try {
        const salida = await handler({
          path: camino,
          httpMethod: peticion.method,
          queryStringParameters: parametros,
          headers: peticion.headers,
          body: cuerpo || null,
          isBase64Encoded: false,
        });
        const cabeceras = Object.assign({}, salida.headers);
        if (salida.multiValueHeaders && salida.multiValueHeaders['Set-Cookie']) {
          cabeceras['Set-Cookie'] = salida.multiValueHeaders['Set-Cookie'];
        }
        respuesta.writeHead(salida.statusCode, cabeceras);
        respuesta.end(salida.body);
      } catch (e) {
        respuesta.writeHead(500, { 'content-type': 'application/json' });
        respuesta.end(JSON.stringify({ ok: false, mensaje: 'Error interno.' }));
      }
    });
    return;
  }

  /* --- Archivos reales (tienen prioridad, igual que en Netlify) --- */
  const posible = path.join(RAIZ, camino);
  const bloqueado = /^\/netlify(\/|$)/.test(camino) || camino === '/netlify.toml';
  if (camino !== '/' && !bloqueado && fs.existsSync(posible) && fs.statSync(posible).isFile()) {
    servirArchivo(respuesta, camino, 200);
    return;
  }

  const destino = resolverRuta(camino);
  servirArchivo(respuesta, destino.archivo, destino.estado);
}).listen(PUERTO, function () {
  console.log('EProfile en http://localhost:' + PUERTO);
  console.log('Cuentas de prueba: admin@eprofile.edu / Admin2026*');
  console.log('                   fernanda@eprofile.edu / Fernanda2026*');
});

# EProfile

Plataforma web donde cada estudiante mantiene un perfil profesional público en una
dirección propia y permanente, con panel de edición, borradores, publicación,
CV en PDF, código QR, tarjeta digital y tarjeta de contacto vCard.

Proyecto de la asignatura de Nuevas Tecnologías.

---

## 1. Objetivo

Que un estudiante pueda administrar toda su información profesional desde
formularios, sin tocar código, y que cualquier persona pueda consultar ese perfil,
descargar su CV o guardar sus datos de contacto desde cualquier dispositivo.

---

## 2. Tecnologías

| Capa | Qué se usa |
|---|---|
| Frontend | HTML, CSS y JavaScript sin framework ni paso de compilación |
| Backend | Netlify Functions (Node.js, sin dependencias de npm) |
| Datos | Un archivo **JSON** guardado en Supabase Storage |
| Imágenes | **Supabase Storage** (único servicio externo) |
| PDF | jsPDF, cargado desde CDN en el navegador |
| QR | QRious, cargado desde CDN en el navegador |

No se usa MySQL, PostgreSQL, MongoDB, SQLite, Firebase, Supabase Database,
Supabase Auth ni ningún ORM.

---

## 3. Cómo se resuelve la persistencia sin base de datos

Esto es lo importante de la arquitectura, y conviene explicarlo en la presentación.

**La limitación real de Netlify:** las Netlify Functions se ejecutan en
contenedores efímeros y de solo lectura. Si una función escribiera en
`/data/data.json` dentro del despliegue, ese cambio desaparecería en la siguiente
invocación, porque cada ejecución arranca desde una copia limpia de los archivos
subidos. No es una limitación de JavaScript: es del entorno de ejecución.

**La solución que usa este proyecto:** el JSON del sistema no vive dentro del
despliegue, sino como un **archivo** llamado `data.json` dentro de un bucket
privado de Supabase Storage. Las Netlify Functions lo descargan, lo modifican en
memoria y lo vuelven a subir por HTTP.

```
Navegador  ──►  /api/*  ──►  Netlify Function  ──►  Supabase Storage
                                                     ├── eprofile-datos/data.json   (privado)
                                                     └── eprofile-publico/fotos/…   (público)
```

Sigue siendo un archivo JSON: no hay tablas, ni consultas SQL, ni ORM.
Supabase se usa exclusivamente como almacenamiento de archivos, que es
justamente lo que permite el enunciado. El JSON se puede abrir, leer y descargar
desde el panel de Supabase, o desde el propio sistema con
**Administración → Ver el archivo JSON**.

**Nota sobre escrituras simultáneas:** al ser un solo archivo, si dos personas
guardaran exactamente en el mismo instante, la última escritura ganaría. Para dos
o tres estudiantes esto no ocurre en la práctica; resolverlo bien exigiría un
sistema de bloqueo o una base de datos, que es justo lo que el proyecto evita.

**Antes de configurar Supabase** el sistema funciona igual, pero guardando en la
memoria del servidor: todo se puede probar y los paneles muestran el aviso
«Almacenamiento sin configurar». En cuanto se ponen las claves, la persistencia
pasa a ser real y permanente.

---

## 4. Estructura del proyecto

```
/
├── index.html              Página principal y directorio de perfiles
├── entrar.html             Inicio de sesión
├── perfil.html             EProfile pública        →  /:slug
├── panel.html              Panel del estudiante    →  /:slug/admin
├── admin.html              Panel de administración →  /admin
├── tarjeta.html            Tarjeta digital         →  /:slug/tarjeta
├── 404.html
├── netlify.toml            Rutas, cabeceras y carpeta de funciones
├── _redirects              Las mismas rutas, por si Netlify no lee netlify.toml
├── servidor-local.js       Servidor de desarrollo (no se necesita en Netlify)
│
├── assets/
│   ├── css/estilos.css
│   └── js/
│       ├── comun.js        Cliente de la API, sesión, diálogos, utilidades
│       ├── inicio.js       Directorio y buscador
│       ├── entrar.js       Inicio de sesión
│       ├── perfil.js       EProfile pública y vista previa del borrador
│       ├── panel.js        Editor completo del estudiante
│       ├── admin.js        Gestión de estudiantes y cuentas
│       ├── tarjeta.js      Tarjeta de presentación digital
│       ├── cv-pdf.js       Generación del PDF con las tres plantillas
│       ├── qr.js           Código QR: ver, descargar e imprimir
│       └── vcard.js        Generación de la vCard
│
├── data/
│   └── estructura.json     Documentación de la estructura del JSON
│
└── netlify/
    └── functions/
        └── api.js          Toda la API: sesiones, perfiles, imágenes, administración
```

### Por qué una sola función y no diez archivos

Netlify Drop no ejecuta `npm install` ni un paso de compilación: sube los archivos
tal cual. Una función que importe paquetes de npm o archivos vecinos puede no
arrancar en ese modo de despliegue. Por eso `api.js` es autocontenido —usa solo
`crypto` de Node y `fetch`— y funciona como enrutador: recibe todas las rutas
`/api/*` y las reparte internamente. El archivo está dividido en secciones
numeradas y la tabla completa de rutas está comentada en la sección 7 del propio
archivo.

---

## 5. Configuración de Supabase Storage

### 5.1 Crear el proyecto y los buckets

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto gratuito.
2. Ve a **Storage** y crea **dos buckets**:

| Bucket | Público | Para qué |
|---|---|---|
| `eprofile-publico` | **Sí** | Las fotografías. Deben ser visibles para cualquier visitante. |
| `eprofile-datos` | **No** | El archivo `data.json`. Contiene los hashes de las contraseñas. |

### 5.2 Copiar las claves

En **Project Settings → API** copia:

- **Project URL** → `SUPABASE_URL`
- **service_role secret** → `SUPABASE_SERVICE_KEY`

Se usa la clave `service_role` porque solo la lee la Netlify Function, del lado
del servidor: nunca llega al navegador. Con ella no hace falta escribir ninguna
política SQL en Supabase.

### 5.3 Escribir las claves en el proyecto

Abre `netlify/functions/api.js` y busca el bloque `CONFIG` (sección 1):

```js
const CONFIG = {
  SUPABASE_URL:          process.env.SUPABASE_URL          || '',
  SUPABASE_SERVICE_KEY:  process.env.SUPABASE_SERVICE_KEY  || '',
  SUPABASE_ANON_KEY:     process.env.SUPABASE_ANON_KEY     || '',
  SUPABASE_BUCKET:       process.env.SUPABASE_BUCKET       || 'eprofile-publico',
  SUPABASE_BUCKET_DATOS: process.env.SUPABASE_BUCKET_DATOS || 'eprofile-datos',
  ...
  SECRETO_SESION:        process.env.SECRETO_SESION        || 'eprofile-firma-de-sesion-cambia-esta-frase-larga',
```

Sustituye las cadenas vacías por tus valores:

```js
  SUPABASE_URL:          process.env.SUPABASE_URL         || 'https://xxxxxxxx.supabase.co',
  SUPABASE_SERVICE_KEY:  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOi...',
```

Cambia también `SECRETO_SESION` por cualquier frase larga tuya: es lo que firma
las sesiones.

> **Sobre poner las claves en el código.** Se hace así porque es un proyecto
> académico de demostración y Netlify Drop no permite configurar variables de
> entorno antes del primer despliegue. La carpeta `netlify/` está bloqueada por
> `netlify.toml` para que nadie pueda leer el archivo desde el navegador. Si
> prefieres no dejarlas escritas, súbelo primero con los valores vacíos, define
> `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en **Site settings → Environment
> variables** y vuelve a arrastrar el ZIP: el código lee primero las variables de
> entorno y solo usa el valor escrito como respaldo.

---

## 6. Subir a Netlify Drop

1. Selecciona **el contenido** de la carpeta del proyecto (no la carpeta) y
   comprímelo en un ZIP. El archivo `index.html` debe quedar en la raíz del ZIP;
   si queda dentro de una subcarpeta, el sitio dará 404.
2. Entra a [app.netlify.com/drop](https://app.netlify.com/drop).
3. Arrastra el ZIP.
4. Abre la dirección que te da Netlify (algo como `https://nombre.netlify.app`).
5. Inicia sesión y comprueba que puedes guardar y publicar.

Netlify detecta la carpeta `netlify/functions` y despliega la API automáticamente.
Puedes comprobarlo abriendo `https://tu-sitio.netlify.app/api/estado`: debe
responder algo como `{"ok":true,"persistencia":"supabase",...}`. Si dice
`"persistencia":"temporal"`, es que faltan las claves de Supabase.

---

## 7. Probarlo en tu computadora

Solo necesitas Node.js instalado:

```
node servidor-local.js
```

y abre `http://localhost:8888`. El servidor reproduce las mismas rutas de Netlify
y ejecuta la misma función de la API. Es únicamente para desarrollo: el proyecto
desplegado no depende de él, y puedes borrarlo del ZIP si quieres.

---

## 8. Roles y permisos

| Acción | Visitante | Estudiante | Administrador |
|---|:--:|:--:|:--:|
| Ver perfiles publicados, CV, QR, vCard, tarjeta | ✓ | ✓ | ✓ |
| Iniciar sesión | — | ✓ | ✓ |
| Editar **su** perfil, subir foto, guardar borrador, publicar | — | ✓ | ✓ |
| Editar el perfil de **otro** estudiante | — | **✗** | ✓ |
| Crear, editar, activar, desactivar y eliminar estudiantes | — | ✗ | ✓ |
| Restablecer contraseñas | — | ✗ | ✓ |
| Ver el archivo JSON completo | — | ✗ | ✓ |

**Aislamiento entre estudiantes.** No depende de ocultar botones. Cada petición a
`/api/perfil`, `/api/publicar`, `/api/despublicar` y `/api/foto` vuelve a
comprobar en el servidor que el `estudianteId` de la sesión coincide con el
perfil solicitado. Si Fernanda escribe a mano `/kevin/admin`, la API responde
403 y la página muestra «No tienes permisos para acceder a este perfil».

Además, el rol y el estado de la cuenta se releen del JSON en cada petición: si el
administrador desactiva a alguien, su sesión abierta deja de funcionar de
inmediato.

---

## 9. Rutas

| Ruta | Qué es | Acceso |
|---|---|---|
| `/` | Página principal y directorio | Público |
| `/entrar` | Inicio de sesión | Público |
| `/fernanda` | EProfile pública de Fernanda | Público |
| `/fernanda/tarjeta` | Tarjeta digital de Fernanda | Público |
| `/fernanda?vista=borrador` | Vista previa del borrador | Dueño o administrador |
| `/fernanda/admin` | Panel de Fernanda | Fernanda o administrador |
| `/kevin` | EProfile pública de Kevin | Público |
| `/kevin/tarjeta` | Tarjeta digital de Kevin | Público |
| `/kevin/admin` | Panel de Kevin | Kevin o administrador |
| `/admin` | Panel de administración | Solo administrador |

### API

```
GET    /api/estado                 Estado del sistema
GET    /api/perfiles               Directorio de perfiles publicados
GET    /api/perfil-publico?slug=   Perfil publicado
POST   /api/login                  Inicio de sesión
POST   /api/logout                 Cierre de sesión
GET    /api/sesion                 Usuario de la sesión actual

GET    /api/perfil?slug=           Borrador + publicado + metadatos
PUT    /api/perfil?slug=           Guardar borrador
POST   /api/publicar?slug=         Publicar
POST   /api/despublicar?slug=      Retirar de la vista pública
POST   /api/foto?slug=             Subir o quitar la fotografía
POST   /api/password               Cambiar la propia contraseña

GET    /api/admin/estudiantes      Listado
POST   /api/admin/estudiantes      Crear
PUT    /api/admin/estudiantes?id=  Editar / activar / desactivar
DELETE /api/admin/estudiantes?id=  Eliminar
POST   /api/admin/password?id=     Restablecer contraseña
GET    /api/admin/exportar         Descargar el data.json
```

---

## 10. Estructura del JSON

El archivo tiene dos listas, `usuarios` y `estudiantes`, y cada estudiante guarda
dos versiones de su perfil: `borrador` y `publicado`. En
[`data/estructura.json`](data/estructura.json) está el ejemplo completo con todos
los campos comentados.

```
data.json
├── version, creadoEn, actualizadoEn
├── usuarios[]      id, email, nombre, rol, estudianteId, activo, hash, creadoEn
└── estudiantes[]   id, slug, activo, creadoEn, actualizadoEn, publicadoEn
    ├── borrador    ← lo que el estudiante está editando
    └── publicado   ← copia congelada; es lo único que ve un visitante (o null)
```

Cada perfil (`borrador` y `publicado`) contiene: `nombre`, `profesion`, `resena`,
`fotoUrl`, `ubicacion`, `contacto`, `enlaces[]`, `formacion[]`, `experiencia[]`,
`habilidades[]`, `proyectos[]`, `reconocimientos[]` y `plantillaCv`.

Las imágenes **no** se guardan en el JSON: solo se guarda la URL pública que
devuelve Supabase Storage.

---

## 11. Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@eprofile.edu` | `Admin2026*` |
| Estudiante 1 — Fernanda | `fernanda.delangel@iest.edu.mx` | `Fernanda2026*` |
| Estudiante 2 — Kevin Leonardo Aran Cruz | `kevin.aran@iest.edu.mx` | `Companero2026*` |

Las contraseñas se guardan con **PBKDF2-SHA256, 150 000 iteraciones y sal
distinta por usuario**; nunca en texto plano. Estas son las contraseñas iniciales:
cámbialas desde **Mi cuenta** o desde el panel de administración.

### Cambiar nombres, correos o direcciones

Todo se edita desde la aplicación: entra como administrador → fila del estudiante
→ **Editar** → nombre, correo y dirección del perfil.

Editar `CUENTAS_INICIALES` en `netlify/functions/api.js` solo tiene efecto si el
archivo `data.json` todavía no existe en Supabase Storage; una vez creado, manda
el JSON. Para volver a partir de cero, borra `data.json` del bucket
`eprofile-datos` y el sistema lo regenera en la siguiente petición.

---

## 12. Cómo probar cada requisito

**Borradores y publicación (el más importante de enseñar)**

1. Abre `/fernanda` sin sesión y fíjate en la reseña.
2. Entra como Fernanda, ve a **Datos generales** y cambia la reseña.
3. Pulsa **Guardar borrador**.
4. Vuelve a abrir `/fernanda` en otra pestaña: **sigue mostrando el texto
   anterior**.
5. Pulsa **Vista previa**: ahí sí aparece el texto nuevo, con el aviso de que es
   un borrador.
6. Ve a **Publicación → Publicar perfil** y recarga `/fernanda`: ahora sí cambió.

**Perfil incompleto**

Borra el nombre y la carrera, guarda, e intenta publicar: aparece «Completa tu
nombre completo y tu carrera o profesión antes de publicar».

**Aislamiento entre estudiantes**

Con la sesión de Fernanda abierta, escribe a mano `/kevin/admin` en la barra
de direcciones. Sale «Sin permisos». Lo mismo con `/admin`.

**Fotografía**

**Datos generales → Subir fotografía**. Prueba primero con un PDF (lo rechaza) y
con una imagen de más de 2 MB (lo rechaza). Con una imagen válida, ábrela en una
pestaña nueva: la URL apunta a `supabase.co/storage/...`. Esa URL es lo único que
queda guardado en el JSON.

**CV y plantillas**

En **CV** elige Minimalista, descarga; elige Profesional, descarga; elige
Clásica, descarga. Los tres PDF son distintos: una columna con mucho aire, columna
lateral verde con contacto y habilidades, y versión con serifas y encabezado
centrado. Todos salen de la misma información del perfil.

**QR**

**Publicación → Ver código QR**. Escanéalo con el teléfono: abre `/fernanda`.
Descárgalo o imprímelo. Edita y publica cualquier cosa: el mismo QR impreso sigue
funcionando, porque la dirección no cambia.

**vCard**

En el perfil público, **Guardar contacto**. Se descarga un `.vcf`; ábrelo en el
teléfono y ofrece guardar el contacto con nombre, correo, teléfono y la dirección
del perfil.

**Tarjeta digital**

`/fernanda/tarjeta`. Pulsa **Imprimir**: en la vista de impresión desaparecen la
barra y los botones y queda solo la tarjeta.

**Secciones vacías**

Un perfil sin experiencia no muestra la sección Experiencia: no aparece vacía,
simplemente no está.

**Administración**

Crea un estudiante; intenta repetir el mismo correo (lo rechaza), el mismo slug
(lo rechaza) y usar `admin` como slug (lo rechaza). Restablece su contraseña y
entra con ella. Desactívalo y comprueba que ya no puede iniciar sesión ni aparece
en el directorio. Vuelve a activarlo y elimínalo.

**Otro dispositivo**

Abre la dirección del sitio desde el teléfono, o escanea el QR. Todo lo publicado
se ve igual, porque los datos viven en Supabase Storage y no en el navegador.

---

## 13. Validaciones y errores

El servidor valida correo con formato correcto, campos obligatorios, contraseñas
de mínimo 8 caracteres, slug duplicado, slug reservado, correo duplicado, tipo de
archivo permitido, tamaño máximo de imagen, credenciales, cuenta desactivada,
perfil incompleto y permisos sobre cada perfil.

Los mensajes técnicos nunca llegan al navegador: quedan en los registros de
Netlify y la persona ve textos como «No tienes permisos para acceder a este
perfil» o «Los datos no pudieron procesarse. Intenta nuevamente».

---

## 14. Seguridad

- Contraseñas con PBKDF2-SHA256, 150 000 iteraciones y sal por usuario.
- Comparaciones en tiempo constante para contraseñas y firmas.
- Sesión en una cookie `HttpOnly`, `Secure`, `SameSite=Lax`, firmada con
  HMAC-SHA256 y con caducidad de 8 horas. Un token manipulado se rechaza.
- Rol y estado de cuenta releídos del JSON en cada petición.
- Todos los permisos se comprueban en el servidor, nunca solo en el navegador.
- Entradas saneadas y recortadas antes de guardarse en el JSON.
- La carpeta `netlify/` y `netlify.toml` están bloqueadas por HTTP.
- El `data.json` vive en un bucket privado; solo las fotografías son públicas.

Al ser un proyecto académico, la clave de Supabase puede quedar escrita en el
código de la función; en un sistema real iría siempre en variables de entorno.

---

## 15. Diseño

Paleta de blancos rotos, negros, grises cálidos, verde sobrio y morado oscuro.
No se usan azul, rojo ni amarillo como colores principales, y los estados se
distinguen con bordes, relleno y peso tipográfico en lugar de colores de alarma.
Tipografía con serifas para los títulos y de palo seco para la interfaz.
Todas las pantallas se han comprobado a 360, 414, 768 y 1280 píxeles sin
desplazamiento horizontal.

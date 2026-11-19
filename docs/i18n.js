/* English / Español. English is whatever the HTML already says; this file holds the Spanish and the switching.
   The demo adds its own strings with I18N.add({ key: [english, spanish] }). All text is ours, so innerHTML is safe here. */
(function () {
  "use strict";
  var STORE = "screening-docs-lang";
  var ES = {
    "meta.title": "Screening room: ver juntos, al mismo tiempo",
    "nav.skip": "Saltar al contenido", "nav.label": "Secciones", "nav.demo": "Demostración", "nav.how": "Cómo funciona",
    "nav.features": "Funciones", "nav.performance": "Rendimiento", "nav.run": "Pruébalo", "lang.label": "Idioma",
    "hero.eyebrow": "Código abierto · en tu propio servidor · salas privadas",
    "hero.title": "Mirar juntos, al mismo tiempo.",
    "hero.lead": "Un lugar privado para ver un video juntos, hecho para teléfonos: la imagen de todos va al mismo ritmo.",
    "hero.demo": "Probar la demostración", "hero.github": "Ver en GitHub", "hero.builtLabel": "Hecho con",
    "hero.chipLang": "English y Español",
    "hero.art": "Tres teléfonos mostrando el mismo instante de un video, todos en 01:23.4",
    "demo.h": "Demostración interactiva",
    "demo.intro": "Una sala simulada, tres teléfonos y las pantallas que los rodean: elegir idioma, entrar con un código de sala, reproducir al paso, cargar, pantalla completa, calidad y la biblioteca del anfitrión. Todo funciona en tu navegador: sin servidor, sin video y sin enviar nada a ningún sitio.",
    "tour.start": "Empezar el recorrido guiado", "tour.lead": "Un paseo paso a paso por toda la app. Se puede saltar y funciona con el teclado.",
    "tour.hide": "Texto", "tour.back": "Atrás", "tour.do": "Mostrar", "tour.next": "Siguiente", "tour.skip": "Saltar",
    "tour.keys": "Teclado: ← y → cambian de paso, Esc salta el recorrido.",
    "demo.tryH": "O prueba por tu cuenta",
    "demo.try1": "Elige un idioma y crea una sala en el teléfono del anfitrión con un código como <b>movie-night</b>. En los teléfonos de Ann y Bob prueba primero un código incorrecto y luego el correcto.",
    "demo.try2": "Pulsa <b>Reproducir a todos</b> en el teléfono del anfitrión: los tres empiezan juntos, 550 ms después de pulsar. Cualquiera puede pausar; pulsa <b>Esperando</b> en un espectador y el anfitrión recibe <b>Reproducir ya</b>.",
    "demo.try3": "Arrastra la barra de búsqueda del anfitrión (las de los espectadores están bloqueadas). Pulsa <b>Pausarme</b> en Bob y luego <b>Volver</b>.",
    "demo.try4": "En <b>Problemas de red</b> pon la conexión de Ann en <b>Lenta</b>, luego <b>Sin conexión</b>, luego <b>Normal</b>, y mira a los demás.",
    "demo.try5": "Abre <b>Subtítulos</b>, <b>Volumen</b> y <b>Calidad</b> en cualquier teléfono. En Calidad, activa <b>Teléfono de gama baja</b> mientras la sala reproduce y mira cómo el Ahorro de datos se activa solo.",
    "demo.try6": "Pulsa <b>Pantalla completa</b> en un teléfono: los controles se desvanecen a los 5 segundos, y <b>Un amigo escribe</b> muestra el chat como burbujas. <b>Teclado</b> muestra el diseño al escribir.",
    "demo.try7": "Baja hasta <b>Herramientas del anfitrión</b>: sube un archivo, llega al tope de 4 GB, borra un video, añade un archivo de subtítulos.",
    "demo.note": "<b>Qué es simulado.</b> La sala, los relojes, las latencias, el desfase, la velocidad de conexión, el tamaño del búfer, el teléfono modesto y el teclado son inventados en tu navegador; las reglas que siguen salen del código de la app. El video de muestra real dura 12 segundos y tiene solo una pista de subtítulos en inglés: la línea de tiempo de 5 minutos y la pista en español de esta demostración son añadidos. No se ha comprobado en teléfonos reales, y el texto en español, aquí y en la app, se escribió sin revisión de un hablante nativo.",
    "demo.noscript": "La demostración interactiva necesita JavaScript.",
    "gate.note": "Esta es la primera pantalla de la app real, que solo se muestra en la primera visita. Aquí aparece siempre, para que puedas verla. Los botones del encabezado de la página también cambian el idioma.",
    "board.room": "Reloj de la sala", "board.reset": "Reiniciar demostración",
    "board.legend": "El desfase es cuánto se aleja cada teléfono de la sala, en milisegundos. Pasados 180 ms, un teléfono ajusta su velocidad; pasados 550 ms, salta. Cada teléfono simulado tiene un reloj ligeramente distinto, por eso los números se mueven.",
    "board.eventsH": "Lo que hizo el servidor",
    "how.h": "Cómo funciona",
    "how.intro": "Un servidor pequeño guarda un único estado por sala y avisa a cada teléfono de lo que cambió. Cada teléfono reproduce el video por sí mismo y mantiene su propio reloj en hora.",
    "how.dgTitle": "Arquitectura: teléfonos, el servidor de la aplicación y Nginx",
    "how.dgDesc": "Los teléfonos reciben las novedades de la sala desde la aplicación por Server-Sent Events y envían comandos pequeños como peticiones POST. Los archivos de video llegan a los teléfonos desde Nginx, después de que la aplicación comprueba quién puede verlos.",
    "how.dgServer": "Servidor de la app", "how.dgState": "un estado compartido por sala", "how.dgOnce": "calculado una vez por cambio",
    "how.dgFiles": "archivos MP4 / HLS", "how.dgSse": "novedades en vivo (SSE)", "how.dgPost": "comandos pequeños (POST)",
    "how.dgAuth": "«¿puede verlo?»", "how.dgBytes": "bytes de video",
    "how.c1h": "Novedades en vivo por SSE",
    "how.c1": "Cada espectador mantiene abierto un flujo de Server-Sent Events. Los comandos (reproducir, pausar, chat, reaccionar) son peticiones POST diminutas. Sin WebSocket: un flujo comparte la conexión con la página y el video, y el navegador se reconecta solo.",
    "how.c2h": "El servidor hace el trabajo una sola vez",
    "how.c2": "Un play, una pausa o un nuevo miembro se calcula una vez por cambio y se entrega a todos. Después del primer mensaje, a cada espectador solo se le envía lo que cambió, no toda la sala otra vez.",
    "how.c3h": "Los bytes del video no pasan por la app",
    "how.c3": "La app comprueba que estás en la sala y que ese es el video de la sala; luego Nginx envía el archivo: un MP4 con peticiones por rangos, o segmentos HLS. La app nunca transporta el video.",
    "how.c4h": "Un dispositivo que despierta tarde",
    "how.c4": "Un teléfono que se reconecta pide la posición de la sala, abre el video ahí y aprende cuánto tarda un salto en ese dispositivo, para que el siguiente salto caiga en el lugar justo.",
    "how.clockH": "Un reloj compartido",
    "how.s1": "<b>La reproducción se programa 550 ms por delante.</b> El servidor marca el momento de inicio un poco en el futuro, para que cada teléfono tenga tiempo de enterarse y empezar a la vez.",
    "how.s2": "<b>Cada teléfono mide su reloj contra el del servidor</b> al conectarse y de nuevo cada minuto, y se queda con la respuesta más rápida.",
    "how.s3": "<b>Desfase pequeño: cambiar la velocidad.</b> Con más de 0,18 s de diferencia, el teléfono reproduce a 0,94× o 1,06× hasta volver al paso.",
    "how.s4": "<b>Desfase grande: saltar.</b> Con más de 0,55 s de diferencia, el teléfono salta. Apunta un poco por delante, según el tiempo de salto que aprendió en ese dispositivo.",
    "how.s5": "<b>Cualquiera puede pausar; solo el anfitrión puede reproducir o saltar.</b> El toque de una persona no puede reiniciar ni empujar la línea de tiempo de todos.",
    "feat.h": "Qué incluye",
    "feat.1h": "Hecho para teléfonos", "feat.1": "Diseño pensado primero para móvil, botones grandes, una fila de botones que se desplaza de lado y un diseño que sigue funcionando con el teclado en pantalla abierto.",
    "feat.2h": "Pantalla completa que gira", "feat.2": "La pantalla completa gira el teléfono de lado donde el navegador lo permite, y el chat de los demás aparece como burbujas que puedes tocar para responder. (Los iPhone no se pueden obligar a girar.)",
    "feat.3h": "Subtítulos con ajustes en vivo", "feat.3": "Un panel de subtítulos se abre bajo los botones: elige una pista y cambia retraso, tamaño, posición, colores y contorno mientras miras. Cada persona tiene su propio estilo.",
    "feat.4h": "Calidad por persona", "feat.4": "En los videos adaptativos (HLS), cada persona elige Auto, Ahorro de datos o una calidad fija. Los archivos sueltos tienen una sola calidad.",
    "feat.5h": "Volumen en tu dispositivo", "feat.5": "Una fila de volumen solo para este dispositivo, útil con WhatsApp o Discord abierto junto a la película. Los teléfonos que bloquean el volumen del video usan un volumen por software.",
    "feat.6h": "Una carga que se explica", "feat.6": "Un indicador dice «Saltando…» o «Cargando…», las conexiones caídas se reintentan y, tras 3 segundos, se avisa a la sala: «Ann está cargando…». Nada pausa la sala.",
    "feat.7h": "Subidas con tope de 4 GB", "feat.7": "El anfitrión puede subir videos. La carpeta de medios tiene un tope total de 4 GB por defecto (es un ajuste), con una barra de uso y un botón Eliminar para liberar espacio.",
    "feat.8h": "English y Español", "feat.8": "Se pregunta en la primera visita y se puede cambiar en cualquier momento. Todo el texto está traducido, incluidos los mensajes del servidor.",
    "feat.9h": "Ligero en teléfonos modestos", "feat.9": "La página detecta cuándo tarda en responder y pasa sola a un modo más ligero, y un video adaptativo que pierde fotogramas pasa a Ahorro de datos.",
    "feat.10h": "Datos del video desde la web", "feat.10": "Opcional. El anfitrión toca Buscar detalles y un modelo con búsqueda web que tú configuras completa título, sinopsis y reparto. Envía el nombre del archivo, el título, la duración y el tamaño de imagen (más la pista que escriba el anfitrión), y solo cuando el anfitrión toca el botón.",
    "feat.11h": "Salas privadas", "feat.11": "Crea una sala con un código que elijas (de 4 a 20 letras, números, guiones o guiones bajos) o uno aleatorio. Los intentos fallidos tienen límite de frecuencia.",
    "feat.12h": "Chat y reacciones", "feat.12": "Menciones con @ que se resaltan para la persona nombrada, @everyone, y emojis que cruzan la imagen para todos.",
    "perf.h": "Rendimiento",
    "perf.caveat": "<b>Son mediciones, no promesas.</b> Se tomaron en un solo portátil con Windows 11 ARM64, con el generador de carga en la misma máquina, así que los números absolutos en un servidor serán distintos y las cifras de CPU tienen unos ±0,5 s de ruido entre ejecuciones. Compara los números entre sí, no con un servidor.",
    "perf.loadH": "La prueba de carga",
    "perf.load": "5 salas × 20 espectadores = 100 conexiones en vivo durante 25 segundos. Los anfitriones reproducen y pausan cada segundo, los espectadores escriben más o menos una vez por segundo y reaccionan unas cinco veces por segundo por sala, y se hacen unas 30 peticiones de rango de video por segundo: unos 17.000 eventos entregados, 840 comandos y 690 peticiones de medios, mucho más movimiento que una fiesta de visionado real.",
    "perf.t1cap": "CPU y memoria del servidor en la prueba de carga", "perf.t1a": "Versión", "perf.t1b": "Segundos de CPU (ejecución de 25 s)", "perf.t1c": "Memoria máxima",
    "perf.r1": "Antes de este trabajo", "perf.r2": "Tras los cambios de código",
    "perf.r3b": "5,86 (una segunda ejecución: 6,92)", "perf.r3c": "117 MB (una segunda ejecución: 109 MB)",
    "perf.read1": "<b>Cómo leerlo:</b> los cambios de código quitaron cerca del 15 % de la CPU (algo más que el ruido). Las opciones de memoria quitaron cerca del 38 % del máximo a cambio de un 5 a 10 % más de CPU, porque una generación joven pequeña hace que el recolector de basura trabaje más a menudo. Un perfil de CPU mostró que el código propio de la app es solo el 1,3 % del tiempo ocupado; el resto es la maquinaria por petición de Next.js y la escritura en sockets.",
    "perf.bunH": "Bun: entorno de ejecución, compilar y bytecode",
    "perf.bun": "Se probó Bun 1.4.4 (Windows ARM64 nativo) con la misma compilación independiente que se ejecuta bajo Node 26. Como entorno de ejecución funciona, con contrapartidas:",
    "perf.t2cap": "Node 26 comparado con Bun 1.4.4", "perf.t2a": "Medida",
    "perf.b1": "Tiempo hasta que el puerto acepta conexiones (mediana de 5 arranques)",
    "perf.b2": "Tiempo hasta servir la página de inicio (mediana de 5)",
    "perf.b3": "Segundos de CPU en la prueba de carga de 25 s (dos ejecuciones)", "perf.b3a": "5,81 y 6,25", "perf.b3b": "6,58 y 6,14",
    "perf.b4": "Memoria máxima en la prueba de carga (dos ejecuciones)", "perf.b4a": "183 y 167 MB", "perf.b4b": "140 y 134 MB",
    "perf.read2": "<b>Cómo leerlo:</b> Bun arranca cerca de un 30 % más rápido y usa cerca de un 20 % menos de memoria de fábrica, con una CPU igual dentro del ruido. Pero Node con las opciones de memoria de arriba llega a 109–117 MB, por debajo de los 134–140 MB de Bun, así que la ventaja de memoria desaparece al ajustar Node. Las subidas, el lanzamiento de <code>ffprobe</code> y las caídas largas de conexión no se probaron con Bun.",
    "perf.compile": "<b><code>bun build --compile</code> no se pudo hacer funcionar.</b> Empaquetar Next.js falló por archivos que su salida independiente omite y por <code>react-dom/server</code>; la única variante que compila (95,6 MB, 95,9 MB con <code>--bytecode</code>) no encuentra <code>next</code> al arrancar. Por eso no hay versión compilada ni medición de una. <b>Recomendación: quedarse con Node 24+.</b>",
    "run.h": "Pruébalo tú mismo",
    "run.intro": "Necesita <b>Node 24 o más reciente</b>. Luego abre la dirección desde cualquier teléfono de la misma red.",
    "run.deploy": "Ponerlo en un servidor: Nginx, HTTPS, systemd, límites y cuota de disco",
    "run.readme": "El README: scripts, prueba de carga y notas de rendimiento",
    "run.prep": "deja un video listo para el navegador (MP4, o una escalera HLS adaptativa con <code>--hls</code>).",
    "run.load": "repite la prueba de carga de arriba contra un servidor de prueba.",
    "foot.note": "Esta página es una demostración con datos simulados. No tiene contenido de video, ni rastreo, ni cookies, y no hace peticiones a otros sitios; solo recuerda tu idioma, en tu navegador. El texto en español se escribió sin revisión de un hablante nativo."
  };
  var DEMO = {}; // key -> [en, es]
  var lang = "en", listeners = [], enText = {}, enAttr = {};

  function t(key, params) {
    var s;
    if (DEMO[key]) s = DEMO[key][lang === "es" ? 1 : 0];
    else if (lang === "es" && ES[key] != null) s = ES[key];
    else s = enText[key];
    if (s == null) s = key;
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : m; });
    return s;
  }

  function setNode(el) {
    var key = el.getAttribute("data-i18n");
    if (key) {
      if (!(key in enText) && !DEMO[key]) enText[key] = el.tagName === "TITLE" ? el.textContent : el.innerHTML;
      var s = t(key);
      if (el.tagName === "TITLE") { if (el.textContent !== s) el.textContent = s; }
      else if (el.innerHTML !== s) el.innerHTML = s;
    }
    var pairs = el.getAttribute("data-i18n-attr");
    if (pairs) pairs.split(";").forEach(function (p) {
      var i = p.indexOf(":"), attr = p.slice(0, i), k = p.slice(i + 1);
      if (!(k in enAttr) && !DEMO[k]) enAttr[k] = el.getAttribute(attr);
      var v = DEMO[k] ? t(k) : (lang === "es" && ES[k] != null ? ES[k] : enAttr[k]);
      if (v != null) el.setAttribute(attr, v);
    });
  }
  function apply(root) {
    root = root || document;
    if (root.nodeType === 1) setNode(root);
    var list = root.querySelectorAll("[data-i18n],[data-i18n-attr]");
    for (var i = 0; i < list.length; i++) setNode(list[i]);
  }

  function set(next, remember) {
    lang = next === "es" ? "es" : "en";
    document.documentElement.lang = lang;
    apply(document);
    var b = document.querySelectorAll(".lang button");
    for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", String(b[i].getAttribute("data-lang") === lang));
    if (remember) { try { localStorage.setItem(STORE, lang); } catch (e) { /* storage may be blocked */ } }
    listeners.forEach(function (fn) { fn(lang); });
  }

  function initial() {
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) { /* storage may be blocked */ }
    if (saved === "en" || saved === "es") return saved;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return /^es\b/i.test(nav) ? "es" : "en";
  }

  window.I18N = {
    t: t, apply: apply, set: set,
    get lang() { return lang; },
    add: function (dict) { for (var k in dict) DEMO[k] = dict[k]; },
    onChange: function (fn) { listeners.push(fn); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    // Capture the English text before anything is translated.
    var all = document.querySelectorAll("[data-i18n],[data-i18n-attr]");
    for (var i = 0; i < all.length; i++) setNode(all[i]);
    var b = document.querySelectorAll(".lang button");
    for (var j = 0; j < b.length; j++) b[j].addEventListener("click", function (e) { set(e.currentTarget.getAttribute("data-lang"), true); });
    var want = initial();
    if (want !== "en") set(want, false); else set("en", false);
  });
})();

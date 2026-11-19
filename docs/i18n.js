/* English / Español. English is whatever the HTML already says; this file holds the Spanish and the switching.
   The demo adds its own strings with I18N.add({ key: [english, spanish] }). All text is ours, so innerHTML is safe here. */
(function () {
  "use strict";
  var STORE = "screening-docs-lang";
  var ES = {
    "meta.title": "Screening Room: ver juntos, en sincronía",
    "nav.skip": "Saltar al contenido",
    "nav.label": "Secciones",
    "nav.demo": "Demostración",
    "nav.how": "Cómo funciona",
    "nav.features": "Funciones",
    "nav.performance": "Rendimiento",
    "nav.run": "Pruébalo",
    "lang.label": "Idioma",
    "hero.eyebrow": "Código abierto · en tu propio servidor · salas privadas",
    "hero.title": "Ver juntos, en sincronía.",
    "hero.lead": "Una sala para ver videos en grupo, en tu propio servidor y hecha para teléfonos. Un servidor pequeño, una carpeta de videos y un código de sala: todos ven el mismo fotograma en el mismo momento.",
    "hero.demo": "Probar la demostración",
    "hero.github": "Ver en GitHub",
    "hero.builtLabel": "Hecho con",
    "hero.chipLang": "English y Español",
    "demo.h": "Demostración interactiva",
    "demo.intro": "Una sala simulada con tres teléfonos. Ponla en marcha, páusala, corta la conexión de alguien y mira a los demás. Todo ocurre en tu navegador: sin servidor, sin video, no se envía nada a ningún sitio.",
    "tour.start": "Empezar el recorrido guiado",
    "tour.lead": "Un paseo paso a paso por toda la app. Se puede saltar y funciona con el teclado.",
    "tour.hide": "Texto",
    "tour.back": "Atrás",
    "tour.do": "Mostrar",
    "tour.next": "Siguiente",
    "tour.skip": "Saltar",
    "tour.keys": "Teclado: ← y → cambian de paso, Esc salta el recorrido.",
    "demo.tryH": "Cosas para probar por tu cuenta",
    "demo.try1": "Elige un idioma y crea una sala en el teléfono del anfitrión con un código como <b>movie-night</b>. En los teléfonos de Ann y Bob prueba primero un código incorrecto y luego el correcto.",
    "demo.try2": "Pulsa <b>Reproducir a todos</b> en el teléfono del anfitrión: los tres empiezan juntos, 550 ms después de pulsar. Cualquiera puede pausar; pulsa <b>Pedir inicio</b> en un espectador y el anfitrión recibe <b>Reproducir ya</b>.",
    "demo.try3": "Arrastra la barra de búsqueda del anfitrión (las de los espectadores están bloqueadas). Pulsa <b>Pausarme</b> en Bob y luego <b>Volver</b>.",
    "demo.try4": "En <b>Problemas de red</b> pon la conexión de Ann en <b>Lenta</b>, luego <b>Sin conexión</b>, luego <b>Normal</b>, y mira a los demás.",
    "demo.try5": "Abre <b>Subtítulos</b>, <b>Volumen</b> y <b>Calidad</b> en cualquier teléfono. En Calidad, activa <b>Teléfono de gama baja</b> mientras la sala reproduce y mira cómo el Ahorro de datos se activa solo.",
    "demo.try6": "Pulsa <b>Pantalla completa</b> en un teléfono: los controles se desvanecen a los 5 segundos, y <b>Un amigo escribe</b> muestra el chat como burbujas. <b>Teclado</b> muestra el diseño al escribir.",
    "demo.try7": "Baja hasta <b>Herramientas del anfitrión</b>: sube un archivo, llega al tope de 4 GB, borra un video, añade un archivo de subtítulos.",
    "demo.note": "<b>Una simulación.</b> La sala, los relojes, la red y los teléfonos de esta página se inventan en tu navegador y siguen las reglas del código de la app. La línea de tiempo de 5 minutos y la pista de subtítulos en español son extras de la demostración: el video de muestra real dura 12 segundos y tiene subtítulos en inglés.",
    "demo.noscript": "La demostración interactiva necesita JavaScript.",
    "gate.note": "Esta es la primera pantalla de la app real, que solo se muestra en la primera visita. Aquí aparece siempre, para que puedas verla. Los botones del encabezado de la página también cambian el idioma.",
    "board.room": "Reloj de la sala",
    "board.reset": "Reiniciar demostración",
    "board.legend": "El desfase es cuánto se aleja cada teléfono de la sala, en milisegundos. Pasados 180 ms, un teléfono ajusta su velocidad; pasados 550 ms, salta. Cada teléfono simulado tiene un reloj ligeramente distinto, por eso los números se mueven.",
    "board.eventsH": "Lo que hizo el servidor",
    "how.h": "Cómo funciona",
    "how.intro": "Un servidor pequeño guarda un único estado por sala y avisa a cada teléfono de lo que cambió. Cada teléfono reproduce el video por sí mismo y mantiene su propio reloj en hora.",
    "how.dgTitle": "Arquitectura: teléfonos, el servidor de la aplicación y Nginx",
    "how.dgDesc": "Los teléfonos reciben las novedades de la sala desde la aplicación por Server-Sent Events y envían comandos pequeños como peticiones POST. Los archivos de video llegan a los teléfonos desde Nginx, después de que la aplicación comprueba quién puede verlos.",
    "how.dgServer": "Servidor de la app",
    "how.dgState": "un estado compartido por sala",
    "how.dgOnce": "calculado una vez por cambio",
    "how.dgFiles": "archivos MP4 / HLS",
    "how.dgSse": "novedades en vivo (SSE)",
    "how.dgPost": "comandos pequeños (POST)",
    "how.dgAuth": "«¿puede verlo?»",
    "how.dgBytes": "bytes de video",
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
    "perf.h": "Rendimiento",
    "perf.loadH": "La prueba de carga",
    "perf.load": "5 salas × 20 espectadores = 100 conexiones en vivo durante 25 segundos. Los anfitriones reproducen y pausan cada segundo, los espectadores escriben más o menos una vez por segundo y reaccionan unas cinco veces por segundo por sala, y se hacen unas 30 peticiones de rango de video por segundo: unos 17.000 eventos entregados, 840 comandos y 690 peticiones de medios, mucho más movimiento que una fiesta de visionado real.",
    "perf.t1cap": "CPU y memoria del servidor en la prueba de carga",
    "perf.t1a": "Versión",
    "perf.t1b": "Segundos de CPU (ejecución de 25 s)",
    "perf.t1c": "Memoria máxima",
    "perf.r1": "Antes de este trabajo",
    "perf.r2": "Tras los cambios de código",
    "perf.r3b": "5,86 (una segunda ejecución: 6,92)",
    "perf.r3c": "117 MB (una segunda ejecución: 109 MB)",
    "perf.read1": "<b>Cómo leerlo:</b> los cambios de código quitaron cerca del 15 % de la CPU (algo más que el ruido). Las opciones de memoria quitaron cerca del 38 % del máximo a cambio de un 5 a 10 % más de CPU, porque una generación joven pequeña hace que el recolector de basura trabaje más a menudo. Un perfil de CPU mostró que el código propio de la app es solo el 1,3 % del tiempo ocupado; el resto es la maquinaria por petición de Next.js y la escritura en sockets.",
    "run.h": "Pruébalo tú mismo",
    "run.intro": "Necesita <b>Node 24 o más reciente</b> y FFmpeg. El sitio empieza bloqueado: entra como administrador (la contraseña es <code>password</code> hasta que definas <code>ADMIN_PASSWORD</code>) y luego abre la dirección desde cualquier teléfono de la misma red.",
    "foot.note": "Esta página es una demostración simulada. No usa cookies, no rastrea y no hace peticiones a otros sitios; solo recuerda tu idioma, en tu navegador. El texto en español no ha tenido revisión de un hablante nativo.",
    "feat.1h": "Hecho para teléfonos",
    "feat.1": "Un diseño pensado primero para móvil, con botones grandes. Ajustes y subtítulos se abren como hojas que nunca mueven la imagen, y todo sigue funcionando con el teclado en pantalla.",
    "feat.2h": "Pantalla completa que gira",
    "feat.2": "La pantalla completa pone el teléfono de lado donde el navegador lo permite. El chat de los demás aparece como globos que puedes tocar para responder. (Los iPhone no se pueden girar a la fuerza.)",
    "feat.3h": "Subtítulos con ajustes en vivo",
    "feat.3": "Elige una pista y cambia retraso, tamaño, posición, colores y contorno mientras miras. Cada espectador conserva su propio estilo.",
    "feat.4h": "Calidad por persona",
    "feat.4": "En los videos adaptativos (HLS), cada persona elige Automática, Ahorro de datos o una calidad fija, sin afectar a nadie más.",
    "feat.5h": "Una carga que se explica",
    "feat.5": "Un indicador dice qué está pasando, las conexiones caídas se reintentan y, a los 3 segundos, la sala sabe quién está cargando. Nada pausa la sala.",
    "feat.6h": "Chat y reacciones",
    "feat.6": "Menciones con @ que destacan para la persona nombrada, @everyone y emojis que cruzan la imagen para todos.",
    "feat.7h": "Salas privadas",
    "feat.7": "Crea una sala con un código que elijas o con un enlace aleatorio. Cualquiera puede salir; la siguiente persona pasa a ser anfitrión. Un enlace viejo a una sala cerrada ofrece crearla de nuevo.",
    "feat.8h": "Un bloqueo y una página de administración",
    "feat.8": "El sitio permanece cerrado hasta que el administrador lo abre; quien llega antes espera en una página que lo deja pasar sola. La página de administración muestra cada sala, quita personas y cierra salas.",
    "feat.9h": "Subidas con tope de almacenamiento",
    "feat.9": "El administrador sube videos desde dentro de una sala. La carpeta de medios tiene un tope de 4 GB por defecto, con una barra de uso y Borrar para hacer espacio.",
    "feat.10h": "Ligero en teléfonos modestos",
    "feat.10": "La página nota cuándo un dispositivo va justo y pasa a un modo más ligero y a Ahorro de datos. Las animaciones respetan el ajuste de reducir movimiento del dispositivo.",
    "feat.11h": "English y Español",
    "feat.11": "Se pregunta en la primera visita y se puede cambiar en cualquier momento. Todo está traducido, incluidos los mensajes del servidor.",
    "feat.12h": "Imagen de Docker, lista para descargar",
    "feat.12": "Cada cambio compila y publica una imagen. Las guías cubren Nginx con HTTPS, actualizar y volver atrás.",
    "nav.screens": "Pantallas",
    "hero.shotWide": "Una sala en un portátil: la película con un subtítulo y reacciones de emoji, los controles debajo y el chat al lado",
    "hero.shotPhone": "La misma sala en un teléfono: la película arriba y, debajo, los controles, el chat y las reacciones",
    "screens.h": "La aplicación",
    "screens.intro": "Capturas reales, hechas con el breve video de muestra que viene con el proyecto.",
    "screens.a1": "Un teléfono de lado: la película llena la pantalla, un mensaje del chat aparece como globo y hay una tira de reacciones en la esquina",
    "screens.c1": "<b>De lado o en pantalla completa.</b> La película llena el teléfono, el chat llega como globos que puedes tocar para responder y las reacciones quedan a un toque.",
    "screens.a2": "La hoja de Subtítulos: elección de pista y controles de sincronía bajo la película en marcha",
    "screens.c2": "<b>Subtítulos.</b> Elige una pista y ajusta sincronía y estilo mientras la película sigue.",
    "screens.a3": "La pestaña Personas: el código de la sala, un botón Invitar amigos y la lista de personas",
    "screens.c3": "<b>Personas.</b> Comparte el código o un enlace, mira quién está y sal con dos toques.",
    "screens.a4": "La pestaña Video del anfitrión: un botón Subir, la biblioteca y el espacio usado",
    "screens.c4": "<b>La biblioteca del anfitrión.</b> Sube videos, cambia de video y vigila el tope de almacenamiento.",
    "screens.a5": "La pantalla de bloqueo: una explicación breve, un botón Comprobar de nuevo y el acceso del administrador plegado",
    "screens.c5": "<b>La pantalla de bloqueo.</b> Cerrado hasta que el administrador lo abre. Quien llega antes entra solo cuando se abre.",
    "screens.a6": "La página de administración: si el sitio está abierto, y una sala con sus personas y botones para quitar a alguien o cerrarla",
    "screens.c6": "<b>La página de administración.</b> Abre o bloquea el sitio, quita a una persona, cierra una sala.",
    "perf.intro": "Un solo proceso de Node con una base de datos integrada. Todo lo de abajo se midió en un portátil, con el generador de carga en la misma máquina, así que lee las cifras como comparaciones y no como datos de un servidor.",
    "perf.s1": "espectadores en la prueba de carga, en un solo proceso",
    "perf.s2": "de memoria máxima con las opciones recomendadas",
    "perf.s3": "enviados a cada espectador por un play o una pausa",
    "perf.s4": "entre dos navegadores en una sala, en una misma máquina",
    "perf.more": "La comparación de Node con Bun, qué se cambió y cómo repetir la prueba están en las <a href=\"https://github.com/monstercameron/synchronized-video-streaming/blob/main/notes/performance.md\">notas de rendimiento</a>.",
    "run.dockerH": "O descarga la imagen",
    "run.docker": "Cada cambio publica <code>ghcr.io/monstercameron/synchronized-video-streaming</code>. La guía de Docker cubre un servidor con Nginx y HTTPS, actualizar y volver atrás.",
    "run.l1": "Guía de despliegue con Docker",
    "run.l2": "Despliegue sin Docker: Nginx, systemd, límites y copias de seguridad",
    "run.l3": "Notas de rendimiento",
    "run.l4": "El README",
    "foot.docker": "Guía de Docker",
    "foot.license": "Licencia MIT",
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

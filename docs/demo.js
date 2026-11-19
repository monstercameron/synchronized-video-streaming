/* A simulated watch party: three phones, one room, no server, no video. The rules mirror the app (use-room-playback.ts, room-store.ts,
   room-shared.ts, video-player.tsx levelCap, use-video-health.ts, use-buffering.ts, chat-bubbles.tsx, use-keyboard-layout.ts):
   play is scheduled 550 ms ahead; over 0.18 s off -> speed 0.94x / 1.06x; over 0.55 s off (0.12 s after an update) -> jump, aiming ahead
   by the seek time learned on that device; anyone can pause, only the host can play or seek. The latencies, clock errors, buffer length
   and the "weak phone" limit are made up. */
(function () {
  "use strict";
  const DUR = 300, AHEAD = 550, NUDGE = 0.18, JUMP = 0.55, JUMP_NEW = 0.12;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥", "👍", "🎉"];
  const PALETTE = "😀 😂 🤣 😊 😍 😘 😎 🤩 🥳 😅 😉 🙃 🤔 🙄 😬 😴 😮 😱 🤯 😢 😭 😡 🥺 😇 👍 👎 👏 🙌 🙏 💪 🤝 👋 ❤️ 💔 💯 🔥 ✨ 🎉 🎬 🍿 👀 🤌 🫶 😏 🫠 🤭 🤫 😤".split(" ");
  const GROUP = ["everyone", "here"];
  // The ladder scripts/prepare-media.mjs builds (its target bitrates plus audio, in Mb/s, rounded), with the usual 16:9 widths.
  const LADDER = [{ h: 240, w: 426, m: 0.4 }, { h: 360, w: 640, m: 0.9 }, { h: 480, w: 854, m: 1.4 }, { h: 720, w: 1280, m: 3.1 }, { h: 1080, w: 1920, m: 5.5 }];
  const MBPS = {}; LADDER.forEach(l => { MBPS[l.h] = l.m; });
  const WIDTH = { "1080": 320, "720": 240, "480": 160, "360": 120, "240": 80 };
  const LINK_SLOW = 1.0;   // Mb/s on a "slow" connection (made up)
  const BUF = 10;          // seconds of video a phone has loaded ahead in the demo (really up to 30 s, 15 s in Data saver)
  const WEAK = 360;        // the weak phone plays up to this height smoothly (made up)
  const GIVE_UP = 20000;   // 0.8 + 1.6 + 3.2 + 6.4 + 8 s of retries, then the error screen
  const CODE_OK = /^[a-z0-9](?:[a-z0-9_-]{2,18})[a-z0-9]$/;

  I18N.add({
    "d.host": ["Host", "Anfitrión"], "d.roleHost": ["Host", "Anfitrión"], "d.roleViewer": ["Viewer", "Espectador"],
    "d.phone": ["{name}'s phone", "Teléfono de {name}"], "d.phoneHost": ["Host's phone", "Teléfono del anfitrión"],
    "d.playAll": ["Play all", "Reproducir a todos"], "d.pauseAll": ["Pause all", "Pausar a todos"], "d.waiting": ["Waiting", "Esperando"],
    "d.asked": ["Asked ✓", "Pedido ✓"],
    "d.pauseMe": ["Pause me", "Pausarme"], "d.rejoin": ["Rejoin", "Volver"],
    "d.seek": ["Seek", "Buscar"], "d.seekHost": ["Seek (host only)", "Buscar (solo el anfitrión)"],
    "d.chat": ["Chat", "Chat"], "d.subs": ["Subtitles", "Subtítulos"], "d.volume": ["Volume", "Volumen"], "d.quality": ["Quality", "Calidad"],
    "d.fullscreen": ["Full screen", "Pantalla completa"], "d.exit": ["Exit", "Salir"], "d.keyboard": ["Keyboard", "Teclado"],
    "d.subOff": ["Off", "Desactivados"], "d.delay": ["Delay", "Retraso"], "d.size": ["Size", "Tamaño"], "d.language": ["Language", "Idioma"],
    "d.volNote": ["This device only. The demo has no sound.", "Solo este dispositivo. La demostración no tiene sonido."],
    "d.qNote": ["Worked out for a 390 × 844 phone at 2× pixel density, as the app's levelCap() does. Auto never fetches more pixels than the screen can show: about 480p on a portrait phone, 1080p in full screen. Data saver tests at 1× and stays at 480p or below (240p on a portrait phone). A real video offers only the rungs made for it; a single file has one quality.",
      "Calculado para un teléfono de 390 × 844 con píxeles 2×, como hace levelCap() en la app. Auto nunca pide más píxeles de los que la pantalla puede mostrar: unos 480p en vertical, 1080p a pantalla completa. Ahorro de datos prueba a 1× y se queda en 480p o menos (240p en vertical). Un video real ofrece solo los escalones que se hicieron para él; un archivo suelto tiene una sola calidad."],
    "quality.auto": ["Auto", "Automática"], "quality.autoDetail": ["Best quality your connection and screen can use", "La mejor calidad que permiten tu conexión y tu pantalla"],
    "quality.saver": ["Data saver", "Ahorro de datos"], "quality.saverDetail": ["480p or lower, small buffers. Best for older phones", "480p o menos, búferes pequeños. Ideal para teléfonos antiguos"],
    "quality.rate": ["{rate} Mb/s", "{rate} Mb/s"], "quality.playingNow": ["Playing now", "Reproduciéndose"],
    "quality.currently": ["Currently playing {height}p. ", "Reproduciendo ahora en {height}p. "],
    "quality.fixedNote": ["A fixed quality stays where you put it. If your connection cannot keep up it will stall instead of dropping down, so choose Auto if it does. Only you are affected; everyone else keeps their own setting.",
      "Una calidad fija se queda donde la pones. Si tu conexión no da abasto, se cortará en vez de bajar, así que elige Automática si pasa. Solo te afecta a ti; los demás conservan su propio ajuste."],
    "d.lowEnd": ["Low-end phone", "Teléfono de gama baja"],
    "d.lowEndNote": ["Phones that report little memory or few CPU cores already start on Data saver. This switch is the other case: a phone that looks fine but drops frames. Here it plays smoothly only up to 360p (made up).",
      "Los teléfonos que declaran poca memoria o pocos núcleos ya empiezan en Ahorro de datos. Este interruptor es el otro caso: un teléfono que parece bien pero pierde fotogramas. Aquí solo rinde hasta 360p (inventado)."],
    "health.dropping": ["This device is dropping frames and cannot keep up with this video.", "Este dispositivo está perdiendo fotogramas y no puede con este video."],
    "player.autoSaver": ["This device was dropping frames, so Data saver was turned on for you. You can change it in Settings.", "Este dispositivo perdía fotogramas, así que se activó el ahorro de datos. Puedes cambiarlo en Ajustes."],
    "player.switchSaver": ["Switch to Data saver", "Cambiar a ahorro de datos"],
    "player.saverAlready": ["Data saver is already on. Closing other apps can help.", "El ahorro de datos ya está activado. Cerrar otras apps puede ayudar."],
    "player.dismiss": ["Dismiss", "Descartar"],
    "people.struggling": ["Struggling", "Con problemas"],
    "d.placeholder": ["Message the room — @ to mention", "Escribe a la sala — @ para mencionar"], "d.send": ["Send", "Enviar"], "d.message": ["Write a message", "Escribe un mensaje"],
    "d.react": ["React {e}", "Reaccionar con {e}"], "d.reactions": ["Send a reaction", "Enviar una reacción"],
    "chat.emoji": ["Emoji", "Emojis"], "chat.mentionSomeone": ["Mention someone", "Mencionar a alguien"], "chat.notifyRoom": ["notify the room", "avisar a la sala"],
    "chat.bubble": ["{author} said: {text}. Tap to reply.", "{author} dijo: {text}. Toca para responder."],
    "chat.replyTo": ["Reply to {name}", "Responder a {name}"], "chat.closeReply": ["Close reply", "Cerrar respuesta"],
    "d.buffering": ["Buffering…", "Cargando…"], "d.jumping": ["Jumping…", "Saltando…"],
    "d.slowHint": ["This is taking a while. Check your connection.", "Esto está tardando. Revisa tu conexión."],
    "player.offline": ["You're offline. Playback continues when you're back.", "Sin conexión. La reproducción continúa cuando vuelvas."],
    "player.reconnecting": ["Connection to the video lost. Trying again…", "Se perdió la conexión con el video. Reintentando…"],
    "player.err.load": ["The video could not load. Try loading it again.", "No se pudo cargar el video. Intenta cargarlo de nuevo."],
    "player.tryAgain": ["Try again", "Intentar de nuevo"],
    "err.request.failed": ["The room request failed. Try again.", "La solicitud a la sala falló. Inténtalo de nuevo."],
    "status.live": ["Live", "En vivo"], "status.reconnecting": ["Reconnecting", "Reconectando"],
    "d.tagBuf": ["Buffering", "Cargando"],
    "d.bufOne": ["{names} is buffering…", "{names} está cargando…"], "d.bufMany": ["{names} are buffering…", "{names} están cargando…"],
    "d.wantPlay": ["{names} is waiting for the video to start.", "{names} está esperando a que empiece el video."],
    "d.wantPlayMany": ["{names} are waiting for the video to start.", "{names} están esperando a que empiece el video."],
    "d.playNow": ["Play now", "Reproducir ya"],
    "d.stPlaying": ["Playing", "Reproduciendo"], "d.stPaused": ["Paused", "En pausa"],
    "d.ok": ["In step", "Al paso"], "d.ready": ["Ready", "Listo"], "d.fast": ["Playing at {rate}×", "Reproduce a {rate}×"],
    "d.jump": ["Jumping", "Saltando"], "d.buf": ["Buffering", "Cargando"], "d.local": ["Paused (just me)", "Pausado (solo yo)"],
    "d.lead": ["seek lead {ms} ms", "adelanto de salto {ms} ms"], "d.notJoined": ["Not joined yet", "Aún no ha entrado"],
    "d.offlineState": ["Offline", "Sin conexión"],
    // join screen (app/screening-room.tsx)
    "join.title.new": ["Watch together", "Mira en grupo"],
    "join.lede.new": ["Start a room and send its code to your friends, or join one with a code you were given.", "Crea una sala y envía su código a tus amigos, o únete a una con un código que te hayan dado."],
    "join.modeLabel": ["Start or join", "Crear o unirse"], "join.tab.start": ["Start a room", "Crear una sala"], "join.tab.join": ["Join with a code", "Unirse con un código"],
    "join.name": ["Your display name", "Tu nombre"], "join.code.optional": ["Room code (optional)", "Código de sala (opcional)"], "join.code": ["Room code", "Código de sala"],
    "join.code.placeholderStart": ["e.g. movie-night, or leave blank", "p. ej. noche-de-cine, o déjalo en blanco"],
    "join.code.placeholderJoin": ["e.g. movie-night (or paste the link)", "p. ej. noche-de-cine (o pega el enlace)"],
    "join.hint.join": ["Ask the host for their room code. You can paste the whole invite link too.", "Pídele al anfitrión su código de sala. También puedes pegar el enlace de invitación completo."],
    "join.hint.customBefore": ["Your friends will type ", "Tus amigos escribirán "], "join.hint.customAfter": [" to join. Anyone with this code can join, so make it hard to guess.", " para unirse. Cualquiera con este código puede entrar, así que hazlo difícil de adivinar."],
    "join.hint.rules": ["Use 4 to 20 letters, numbers, dashes or underscores.", "Usa de 4 a 20 letras, números, guiones o guiones bajos."],
    "join.hint.blank": ["Leave it blank for a random one, or choose something your friends can type. Anyone with the code can join.", "Déjalo en blanco para uno aleatorio, o elige algo que tus amigos puedan escribir. Cualquiera con el código puede entrar."],
    "join.busy": ["One moment…", "Un momento…"], "join.submit.join": ["Join room", "Entrar a la sala"], "join.submit.start": ["Start room", "Crear sala"],
    "join.err.needCode": ["Type the room code you were given.", "Escribe el código de sala que te dieron."],
    "err.room.notFound": ["No room has that code or link.", "Ninguna sala tiene ese código o enlace."],
    "err.code.invalid": ["That is not a valid room code. Use 4 to 20 letters, numbers, dashes or underscores.", "Ese no es un código de sala válido. Usa de 4 a 20 letras, números, guiones o guiones bajos."],
    "err.join.tooMany": ["Too many wrong codes. Wait a minute and try again.", "Demasiados códigos incorrectos. Espera un minuto e inténtalo de nuevo."],
    "language.label": ["Language", "Idioma"],
    "d.nameFixed": ["The demo's names are fixed so the walkthrough stays readable.", "Los nombres de la demostración son fijos para que el recorrido sea legible."],
    "d.phoneTabs": ["Phone", "Teléfono"],
    "d.hostStarts": ["In this demo only the Host phone starts the room; the others join it with its code.", "En esta demostración solo el teléfono del anfitrión crea la sala; los demás entran con su código."],
    "d.skipJoin": ["Skip: everyone joins now", "Saltar: todos entran ahora"],
    "people.roomCode": ["Room code", "Código de sala"], "people.copyCode": ["Copy code", "Copiar código"], "common.copied": ["Copied", "Copiado"],
    // sideways, full screen and keyboard
    "d.exitFull": ["Exit full screen", "Salir de pantalla completa"],
    "d.sideHint": ["Full screen turns a phone sideways where the browser allows it. The timeline and buttons fade after 5 seconds without a touch; touch or move to bring them back. Chat from others appears as bubbles; tap one to reply.",
      "La pantalla completa gira el teléfono de lado donde el navegador lo permite. La línea de tiempo y los botones se desvanecen a los 5 segundos sin tocar; toca o mueve para recuperarlos. El chat de los demás aparece como burbujas; toca una para responder."],
    "d.rotated": ["Phone physically sideways (reply bar instead of leaving full screen)", "Teléfono físicamente de lado (barra de respuesta en vez de salir de pantalla completa)"],
    "d.friend": ["A friend writes (simulated)", "Un amigo escribe (simulado)"],
    "d.kbHint": ["With the keyboard up the picture shrinks to 30% of what you can see, and the buttons and reactions step aside so the chat and box stay in view. The keys are a drawing.",
      "Con el teclado abierto la imagen se reduce al 30 % de lo visible y los botones y reacciones se apartan, para que el chat y la caja sigan a la vista. Las teclas son un dibujo."],
    "d.keyboardOn": ["Hide keyboard", "Ocultar teclado"],
    "d.cueOther": ["Subtitle line {n} ({lang})", "Línea de subtítulos {n} ({lang})"],
    // network
    "d.logReady": ["Room ready. Three phones joined.", "Sala lista. Se unieron tres teléfonos."],
    "d.logStart": ["Room {code} started by the host.", "Sala {code} creada por el anfitrión."],
    "d.logJoin": ["{name} joined with the code.", "{name} entró con el código."],
    "d.logMiss": ["{name} tried a code that no room has.", "{name} probó un código que ninguna sala tiene."],
    "d.logPlay": ["Play from {pos}, scheduled 550 ms ahead. Worked out once, sent to all.", "Reproducir desde {pos}, programado 550 ms por delante. Calculado una vez, enviado a todos."],
    "d.logPause": ["{name} paused the room at {pos}.", "{name} pausó la sala en {pos}."],
    "d.logSeek": ["Host moved the room to {pos}.", "El anfitrión llevó la sala a {pos}."],
    "d.logAsk": ["{name} is waiting. The host was asked to play.", "{name} está esperando. Se pidió al anfitrión que reproduzca."],
    "d.logEnd": ["The video ended.", "El video terminó."],
    "d.logBuf": ["{name} has been buffering for 3 s. The room was told; nobody was paused.", "{name} lleva 3 s cargando. Se avisó a la sala; nadie fue pausado."],
    "d.logRecover": ["{name} has data again and jumps back to the room.", "{name} ya tiene datos y salta de vuelta a la sala."],
    "d.logPauseMe": ["{name} paused only their own screen.", "{name} pausó solo su pantalla."],
    "d.logRejoin": ["{name} rejoined the room.", "{name} volvió a la sala."],
    "d.logJump": ["{name} was {ms} ms off, so it jumped (aimed {lead} ms ahead).", "{name} estaba a {ms} ms, así que saltó (apuntó {lead} ms por delante)."],
    "d.logRate": ["{name} is {ms} ms off: playing at {rate}× until back in step.", "{name} está a {ms} ms: reproduce a {rate}× hasta recuperar el paso."],
    "d.logSlow": ["Ann's connection is now slow (simulated, about 1 Mb/s).", "La conexión de Ann ahora es lenta (simulada, cerca de 1 Mb/s)."],
    "d.logFast": ["Ann's connection is back to normal.", "La conexión de Ann volvió a la normalidad."],
    "d.logAdapt": ["{name}'s player dropped to {q}p to fit the slow link.", "El reproductor de {name} bajó a {q}p para ajustarse al enlace lento."],
    "d.logOffline": ["{name} went offline. Retrying after 0.8, 1.6, 3.2, 6.4 and 8 s; the picture plays on from what is loaded. The room cannot be told while offline.", "{name} se quedó sin conexión. Reintenta tras 0,8, 1,6, 3,2, 6,4 y 8 s; la imagen sigue con lo que ya cargó. No se puede avisar a la sala sin conexión."],
    "d.logBack": ["{name} is back online. The download restarts at once and a fresh snapshot of the room arrives.", "{name} volvió a estar en línea. La descarga se reanuda al instante y llega una instantánea nueva de la sala."],
    "d.logGiveUp": ["{name}: the retries ran out. The error screen is shown.", "{name}: se agotaron los reintentos. Se muestra la pantalla de error."],
    "d.logDrop": ["{name}'s device is dropping frames and told the room.", "El dispositivo de {name} pierde fotogramas y se lo dijo a la sala."],
    "d.logAutoSaver": ["{name}: Data saver turned on automatically (once).", "{name}: el ahorro de datos se activó solo (una vez)."],
    "d.logOkAgain": ["{name}'s device keeps up again.", "El dispositivo de {name} vuelve a rendir bien."],
    "d.logSwitch": ["Host switched to “{title}”. Everyone is paused at 0:00.", "El anfitrión cambió a «{title}». Todos están en pausa en 0:00."],
    "d.logFull": ["{name} went full screen.", "{name} pasó a pantalla completa."],
    "d.logExitFull": ["{name} left full screen.", "{name} salió de pantalla completa."],
    "d.netH": ["Network trouble", "Problemas de red"], "d.netFor": ["Ann's connection", "Conexión de Ann"],
    "d.netOk": ["Normal", "Normal"], "d.netSlow": ["Slow", "Lenta"], "d.netOff": ["Offline", "Sin conexión"],
    "d.netNote": ["Slow is about 1 Mb/s: a fixed 480p or more stalls, Auto steps down once, Data saver does not notice. Offline plays on from what is loaded, then says so; nobody else is told, because the connection that would tell them is the one that is down.",
      "Lenta son unos 1 Mb/s: un 480p fijo o más se corta, Auto baja una vez, Ahorro de datos ni lo nota. Sin conexión sigue con lo ya cargado y luego lo dice; a los demás no se les avisa, porque la conexión que les avisaría es la que está caída."]
  });
  const t = I18N.t;

  const CUES = [
    ["Did you hear that?", "¿Lo oíste?"], ["Wait, go back a little.", "Espera, retrocede un poco."], ["I think it is this way.", "Creo que es por aquí."],
    ["Look at the sky.", "Mira el cielo."], ["We are almost there.", "Ya casi llegamos."], ["Not again…", "Otra vez no…"],
    ["Say that one more time.", "Dilo una vez más."], ["That was close.", "Eso estuvo cerca."], ["Shh. Someone is coming.", "Shh. Viene alguien."],
    ["Well, that settles it.", "Bueno, eso lo decide todo."]
  ];
  const FRIEND = [["Did you see that?", "¿Viste eso?"], ["@{me}, look at the sky!", "¡@{me}, mira el cielo!"], ["No way, again?", "¿Otra vez? No puede ser."], ["@everyone this part is great", "@everyone esta parte está genial"]];
  const CONFIG = [
    { id: "host", host: true, name: "Host", lat: 40, err: 0, skew: 1.0, seek: 200 },
    { id: "ann", host: false, name: "Ann", lat: 90, err: 35, skew: 0.987, seek: 350 },
    { id: "bob", host: false, name: "Bob", lat: 140, err: -60, skew: 1.011, seek: 500 }
  ];

  let gen = 0, room, viewers, logs, want, last, activeTab = 0, built = false, visible = true, timer = 0, stage = "lang", misses = [];
  let caps = [{ lang: "en" }, { lang: "es" }], counts = { play: 0, pause: 0, seek: 0, ask: 0, chat: 0, react: 0, mention: 0, friend: 0 };
  const stageListeners = [], buildListeners = [];
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = s - m * 60; return String(m).padStart(2, "0") + ":" + (r < 10 ? "0" : "") + r.toFixed(1); };
  const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  const setHidden = (el, h) => { if (el && el.hidden !== h) el.hidden = h; };
  const nameOf = v => v.host ? t("d.host") : v.name;
  const later = (ms, fn) => { const g = gen; setTimeout(() => { if (g === gen) fn(); }, ms); };
  const lat = v => v.net === "slow" ? 900 : v.lat;
  const seekMs = v => v.net === "slow" ? 1400 : v.seek;
  const roomPos = now => room.playing ? Math.min(DUR, room.pos + Math.max(0, now - room.anchor) / 1000) : room.pos;
  const num = (n, d) => n.toFixed(d).replace(".", I18N.lang === "es" ? "," : ".");
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const joined = () => viewers.filter(v => v.joined);
  const snapshot = () => ({ playing: room.playing, pos: room.pos, anchor: room.anchor, rev: room.rev });
  const fixedOf = q => { const m = /^h(\d+)$/.exec(q); return m ? Number(m[1]) : 0; };
  function langName(code) {
    try { const n = new Intl.DisplayNames([I18N.lang], { type: "language" }).of(code); if (n && n !== code) return n.charAt(0).toLocaleUpperCase(I18N.lang) + n.slice(1); } catch (e) { /* unknown code */ }
    return code;
  }

  /* ---------- the "server" ---------- */
  function addLog(key, params) { logs.unshift({ key, params: params || {}, pos: roomPos(performance.now()) }); if (logs.length > 14) logs.pop(); renderLog(); }
  function broadcast() {
    viewers.forEach(v => {
      if (!v.joined || v.net === "offline") return;
      later(lat(v), () => { const s = snapshot(); if (v.net !== "offline" && s.rev > v.known.rev) { v.known = s; v.fresh = true; } });
    });
  }
  function send(from, fn) {
    if (from.net === "offline") { from.cmdErr = t("err.request.failed"); return; }
    from.cmdErr = "";
    later(lat(from), fn);
  }
  function serverPlay() {
    const now = performance.now();
    if (room.pos >= DUR) room.pos = 0;
    room.pos = roomPos(now); room.playing = true; room.anchor = now + AHEAD; room.rev++; counts.play++;
    want.clear(); setWant();
    addLog("d.logPlay", { pos: fmt(room.pos) });
    broadcast();
  }
  function serverPause(by) {
    const now = performance.now();
    if (!room.playing) return;
    room.pos = roomPos(now); room.playing = false; room.rev++; counts.pause++;
    addLog("d.logPause", { name: nameOf(by), pos: fmt(room.pos) });
    broadcast();
  }
  function serverSeek(pos) {
    const now = performance.now();
    room.pos = Math.max(0, Math.min(DUR, pos)); room.anchor = now + AHEAD; room.rev++; counts.seek++;
    addLog("d.logSeek", { pos: fmt(room.pos) });
    broadcast();
  }
  function serverAsk(by) {
    if (room.playing) return;
    want.add(by.id); counts.ask++;
    addLog("d.logAsk", { name: nameOf(by) });
    setWant();
  }
  function serverLoad(title) {
    room.pos = 0; room.playing = false; room.rev++; want.clear(); setWant();
    addLog("d.logSwitch", { title });
    broadcast();
  }
  function setWant() { const h = viewers[0]; const ids = Array.from(want); later(lat(h), () => { h.wantIds = ids; }); }
  function deliver(from, fn) { // to the sender at once, to everyone else after both trips (an offline phone gets what it missed on return)
    viewers.forEach(v => {
      if (!v.joined) return;
      if (v === from) fn(v);
      else if (v.net === "offline") v.missed.push(fn);
      else later(lat(from) + lat(v), () => fn(v));
    });
  }

  /* ---------- quality ladder (app/video-player.tsx levelCap, app/use-playback-quality.ts) ---------- */
  function fitHeight(v, ratio) { // the lowest rung that has as many pixels as the player shows, at that pixel density
    const P = v.side ? { w: 844, h: 390 } : { w: 390, h: 219 };
    const l = LADDER.find(x => x.w >= P.w * ratio || x.h >= P.h * ratio) || LADDER[LADDER.length - 1];
    return l.h;
  }
  function capOf(v) {
    const f = fixedOf(v.q);
    if (f) return f;
    return v.q === "saver" ? Math.min(fitHeight(v, 1), 480) : fitHeight(v, 2);
  }
  function level(v) {
    const c = capOf(v);
    if (v.net === "slow" && v.adapted && !fixedOf(v.q)) {
      const ok = LADDER.filter(l => l.h <= c && l.m <= LINK_SLOW).pop();
      return ok ? ok.h : 240;
    }
    return c;
  }
  const fits = v => v.net !== "slow" || MBPS[level(v)] <= LINK_SLOW;

  /* ---------- one phone's sync step (the same rules as use-room-playback.ts) ---------- */
  function jumpTo(v, target, now, moving) {
    const lead = moving ? v.lead : 0;
    v.jump = { start: now, until: now + seekMs(v) };
    v.pos = Math.min(DUR, target + lead);
    return lead;
  }
  function step(v, now, dt) {
    if (!v.joined) return;
    const t0 = now + v.err, k = v.known;
    const advancing = k.playing && t0 >= k.anchor;
    const target = advancing ? Math.min(DUR, k.pos + (t0 - k.anchor) / 1000) : k.pos;
    const fresh = v.fresh; v.fresh = false;
    v.rate = 1;
    if (v.jump && now >= v.jump.until) { v.lead = v.lead ? v.lead * 0.5 + (seekMs(v) / 1000) * 0.5 : seekMs(v) / 1000; v.jump = null; v.settle = now + 300; }
    if (v.net === "offline" && !v.failed && now - v.offAt >= GIVE_UP) { v.failed = true; addLog("d.logGiveUp", { name: nameOf(v) }); }
    if (v.stall) {
      if (now >= v.stall.until || (!k.playing && !v.stall.offline)) {
        if (v.stall.told) { addLog("d.logRecover", { name: nameOf(v) }); v.clearAt = now + 1000; }
        if (v.stall.slowStall && !fixedOf(v.q)) { v.adapted = true; addLog("d.logAdapt", { name: nameOf(v), q: level(v) }); }
        v.stall = null; v.nextStall = now + 14000; v.buf = BUF;
      } else {
        if (!v.stall.told && !v.stall.offline && now - v.stall.start >= 3000) { v.stall.told = true; addLog("d.logBuf", { name: nameOf(v) }); }
        return;
      }
    }
    if (v.localPause) return;
    if (v.jump) return;
    const drift = target - v.pos;
    if (now >= v.settle && (Math.abs(drift) > JUMP || (fresh && Math.abs(drift) > JUMP_NEW))) {
      const lead = jumpTo(v, target, now, advancing);
      addLog("d.logJump", { name: nameOf(v), ms: Math.round(Math.abs(drift) * 1000), lead: Math.round(lead * 1000) });
      return;
    }
    if (!advancing) v.adv = false;
    if (advancing) {
      if (!v.adv) { v.adv = true; dt = Math.min(dt, Math.max(0, (t0 - k.anchor) / 1000)); } // start exactly at the anchor, not a frame late
      v.rate = Math.abs(drift) > NUDGE ? (drift > 0 ? 1.06 : 0.94) : 1;
      if (v.rate !== 1 && now - v.lastRateLog > 5000) { v.lastRateLog = now; addLog("d.logRate", { name: nameOf(v), ms: Math.round(Math.abs(drift) * 1000), rate: num(v.rate, 2) }); }
      if (v.net === "slow" && !v.stall && now >= v.nextStall && !fits(v)) v.stall = { start: now, until: now + 5000, told: false, slowStall: true };
      if (v.net === "offline") { // the picture plays on from what is loaded, then runs dry
        v.buf -= dt * v.rate;
        if (v.buf <= 0 && !v.stall) { v.stall = { start: now, until: Infinity, told: false, offline: true }; return; }
      }
      v.pos = Math.min(DUR, v.pos + dt * v.rate * v.skew);
      health(v, dt);
    }
  }
  // use-video-health.ts: two checks in a row with more than 20% of frames dropped -> struggling; Auto moves to Data saver once.
  function health(v, dt) {
    if (!v.lowEnd) return;
    if (level(v) > WEAK) {
      v.dropT += dt; v.goodT = 0;
      if (v.health === "ok" && v.dropT >= 8) {
        v.health = "struggling"; v.noteOff = false;
        addLog("d.logDrop", { name: nameOf(v) });
        if (!v.autoSw && v.q === "auto") {
          v.autoSw = true; v.q = "saver"; syncQ(v);
          addLog("d.logAutoSaver", { name: nameOf(v) });
        }
      }
    } else {
      v.dropT = 0; v.goodT += dt;
      if (v.health === "struggling" && v.goodT >= 10) { v.health = "ok"; addLog("d.logOkAgain", { name: nameOf(v) }); }
    }
  }
  function tickRoom(now) {
    if (room.playing && roomPos(now) >= DUR) { room.pos = DUR; room.playing = false; room.rev++; addLog("d.logEnd"); broadcast(); }
    viewers.forEach(v => { if (v.clearAt && now >= v.clearAt) v.clearAt = 0; });
  }

  /* ---------- building the phones ---------- */
  function joinHTML(id, host) {
    return '<form class="join" novalidate data-join>' +
      '<h4 data-i18n="join.title.new"></h4><p class="small" data-i18n="join.lede.new"></p>' +
      '<div class="seg" role="radiogroup" data-i18n-attr="aria-label:join.modeLabel"><button type="button" role="radio" data-mode="start" aria-checked="' + host + '" data-i18n="join.tab.start"></button><button type="button" role="radio" data-mode="join" aria-checked="' + !host + '" data-i18n="join.tab.join"></button></div>' +
      '<label for="' + id + '-nm" data-i18n="join.name"></label><input id="' + id + '-nm" type="text" readonly data-name aria-describedby="' + id + '-nmh"><p class="small" id="' + id + '-nmh" data-i18n="d.nameFixed"></p>' +
      '<label for="' + id + '-cd" data-code-label></label><input id="' + id + '-cd" type="text" maxlength="40" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" data-code aria-describedby="' + id + '-hint">' +
      '<p class="small" id="' + id + '-hint" data-hint></p>' +
      '<button class="btn primary" type="submit" data-submit></button><p class="err" role="alert" data-err></p>' +
      '<div class="lang-switch" role="radiogroup" data-i18n-attr="aria-label:language.label"><button type="button" role="radio" lang="en" data-lg="en">English</button><button type="button" role="radio" lang="es" data-lg="es">Español</button></div></form>';
  }
  function phoneHTML(v) {
    const id = "ph-" + v.id;
    const q = ["1080", "720", "480", "360", "240"].map(h => '<label class="qrow"><input type="radio" name="' + id + '-qq" value="h' + h + '"><span class="qt">' + h + 'p <small data-now="' + h + '" hidden data-i18n="quality.playingNow"></small></span><span class="qd" data-rate="' + h + '"></span></label>').join("");
    return '<article class="phone" id="' + id + '" role="group" aria-labelledby="' + id + '-h" data-joined="false">' +
      '<div class="phone-head"><h3 id="' + id + '-h"></h3><span class="tag ' + (v.host ? "host" : "") + '" data-i18n="' + (v.host ? "d.roleHost" : "d.roleViewer") + '"></span><span class="tag alert" data-tagbuf data-i18n="d.tagBuf" hidden></span><span class="tag warn" data-tagweak data-i18n="people.struggling" hidden></span><span class="pill" data-pill></span></div>' +
      joinHTML(id, v.host) +
      '<div class="live" hidden>' +
      '<div class="screen"><canvas width="320" height="180" aria-hidden="true"></canvas><div class="subs" aria-hidden="true"></div><div class="floats" aria-hidden="true"></div><div class="bubbles"></div><span class="badge" aria-hidden="true"></span>' +
      '<div class="spinner" role="status" hidden><div class="ring" aria-hidden="true"></div><span></span><small></small></div>' +
      '<div class="fail" hidden><p role="alert" data-i18n="player.err.load"></p><button type="button" class="btn small" data-retry data-i18n="player.tryAgain"></button></div>' +
      '<div class="fs" data-on="true"><div class="tl" aria-hidden="true"><i></i></div><div class="fsbtn"><button class="btn small primary" type="button" data-fsmain></button><button class="btn small" type="button" data-fslocal></button><button class="btn small" type="button" data-fsexit data-i18n="d.exit" data-i18n-attr="aria-label:d.exitFull"></button></div></div>' +
      '<form class="qr" hidden><input type="text" maxlength="500" autocomplete="off" enterkeyhint="send"><button class="btn small primary" type="submit" data-i18n="d.send"></button><button class="btn small" type="button" data-qrclose data-i18n-attr="aria-label:chat.closeReply">✕</button></form></div>' +
      '<div class="sidebar" hidden><p class="small" data-i18n="d.sideHint"></p><div class="row2"><button class="btn small" type="button" data-rot aria-pressed="false" data-i18n="d.rotated"></button><button class="btn small" type="button" data-friend data-i18n="d.friend"></button></div></div>' +
      '<div class="readout"><span data-pos></span><span data-notice></span></div>' +
      (v.host ? '<div class="play-now" data-want hidden><span></span><button class="btn small primary" type="button" data-playnow data-i18n="d.playNow"></button></div>' : "") +
      '<p class="notice err" role="alert" data-cmderr hidden></p>' +
      '<div class="notice struggle" role="status" data-weak hidden><p data-i18n="health.dropping"></p><p data-autosaver data-i18n="player.autoSaver" hidden></p><p data-already data-i18n="player.saverAlready" hidden></p><div class="row2"><button class="btn small" type="button" data-toSaver data-i18n="player.switchSaver"></button><button class="btn small" type="button" data-dismiss data-i18n="player.dismiss"></button></div></div>' +
      '<div class="seekrow"><label for="' + id + '-seek" data-i18n="' + (v.host ? "d.seek" : "d.seekHost") + '"></label><input id="' + id + '-seek" type="range" min="0" max="' + DUR + '" step="1" value="0"' + (v.host ? "" : " disabled") + '></div>' +
      '<div class="row"><button class="btn small primary" type="button" data-main></button><button class="btn small" type="button" data-local></button>' +
      '<button class="btn small" type="button" data-toggle="subs" aria-expanded="false" aria-controls="' + id + '-subs" data-i18n="d.subs"></button>' +
      '<button class="btn small" type="button" data-toggle="vol" aria-expanded="false" aria-controls="' + id + '-vol" data-i18n="d.volume"></button>' +
      '<button class="btn small" type="button" data-toggle="q" aria-expanded="false" aria-controls="' + id + '-q" data-i18n="d.quality"></button>' +
      '<button class="btn small" type="button" data-full aria-pressed="false" data-i18n="d.fullscreen"></button>' +
      '<button class="btn small" type="button" data-kbd aria-pressed="false" data-i18n="d.keyboard"></button></div>' +
      '<div class="panel" id="' + id + '-subs" hidden><div class="opt" role="radiogroup" data-i18n-attr="aria-label:d.language" data-tracks></div>' +
      '<div class="grid"><label for="' + id + '-delay" data-i18n="d.delay"></label><input id="' + id + '-delay" data-delay type="range" min="-2" max="2" step="0.1" value="0"><output></output>' +
      '<label for="' + id + '-size" data-i18n="d.size"></label><input id="' + id + '-size" data-size type="range" min="0.8" max="1.6" step="0.1" value="1"><output></output></div></div>' +
      '<div class="panel" id="' + id + '-vol" hidden><div class="grid"><label for="' + id + '-v" data-i18n="d.volume"></label><input id="' + id + '-v" data-volume type="range" min="0" max="100" step="1" value="100"><output>100%</output></div><p class="small" data-i18n="d.volNote"></p></div>' +
      '<div class="panel" id="' + id + '-q" hidden><div class="qrows" role="radiogroup" data-i18n-attr="aria-label:d.quality">' +
      '<label class="qrow"><input type="radio" name="' + id + '-qq" value="auto" checked><span class="qt" data-i18n="quality.auto"></span><span class="qd" data-i18n="quality.autoDetail"></span></label>' +
      '<label class="qrow"><input type="radio" name="' + id + '-qq" value="saver"><span class="qt" data-i18n="quality.saver"></span><span class="qd" data-i18n="quality.saverDetail"></span></label>' + q +
      '</div><p class="small"><span data-qnow></span> <span data-i18n="quality.fixedNote"></span></p><p class="small" data-i18n="d.qNote"></p>' +
      '<label class="sw"><input type="checkbox" data-lowend><span data-i18n="d.lowEnd"></span></label><p class="small" data-i18n="d.lowEndNote"></p></div>' +
      '<div class="chat"><ol aria-label="Chat" data-i18n-attr="aria-label:d.chat"></ol>' +
      '<ul class="mention-list" role="listbox" data-i18n-attr="aria-label:chat.mentionSomeone" hidden></ul><div class="emoji-picker" role="group" data-i18n-attr="aria-label:chat.emoji" hidden>' + PALETTE.map(e => '<button type="button" data-ins="' + e + '">' + e + '</button>').join("") + '</div>' +
      '<form class="composer"><button class="emoji-toggle" type="button" data-emojitoggle aria-pressed="false" data-i18n-attr="aria-label:chat.emoji">🙂</button><input type="text" maxlength="500" autocomplete="off" enterkeyhint="send" data-i18n-attr="placeholder:d.placeholder;aria-label:d.message"><button class="btn small primary" type="submit" data-i18n="d.send"></button></form>' +
      '<div class="react" role="group" data-i18n-attr="aria-label:d.reactions">' + REACTIONS.map(e => '<button type="button" data-emoji="' + e + '">' + e + '</button>').join("") + '</div></div>' +
      '<p class="small kbhint" data-i18n="d.kbHint" hidden></p><div class="kb" aria-hidden="true" hidden></div>' +
      '</div></article>';
  }

  function build() {
    gen++;
    const now = performance.now();
    room = { playing: false, pos: 0, anchor: 0, rev: 0, code: "", title: "The Last Ferry" };
    want = new Set(); logs = []; last = now; misses = [];
    caps = [{ lang: "en" }, { lang: "es" }]; counts = { play: 0, pause: 0, seek: 0, ask: 0, chat: 0, react: 0, mention: 0, friend: 0 };
    viewers = CONFIG.map(c => Object.assign({}, c, {
      pos: 0, rate: 1, known: { playing: false, pos: 0, anchor: 0, rev: 0 }, fresh: false, localPause: false, jump: null, stall: null,
      settle: 0, lead: 0, net: "ok", adapted: false, nextStall: Infinity, lastRateLog: -1e9, clearAt: 0, wantIds: [], chat: [], missed: [],
      sub: "off", delay: 0, size: 1, q: "auto", panel: "", shown: 0, drawKey: "",
      joined: false, mode: c.host ? "start" : "join", code: "", offAt: 0, buf: BUF, failed: false, cmdErr: "",
      side: false, rot: false, kbd: false, idleAt: 0, bubbles: [], reacts: [],
      lowEnd: false, health: "ok", dropT: 0, goodT: 0, autoSw: false, noteOff: false, sugg: [], pick: 0, picker: false
    }));
    const host = $("#phones"), tabs = $("#phone-tabs");
    host.innerHTML = ""; tabs.innerHTML = ""; host.removeAttribute("data-side");
    viewers.forEach((v, i) => {
      host.insertAdjacentHTML("beforeend", phoneHTML(v));
      v.el = $("#ph-" + v.id);
      v.ui = {
        canvas: $("canvas", v.el), subs: $(".subs", v.el), floats: $(".floats", v.el), badge: $(".badge", v.el), spin: $(".spinner", v.el),
        pos: $("[data-pos]", v.el), notice: $("[data-notice]", v.el), main: $("[data-main]", v.el), local: $("[data-local]", v.el),
        seek: $(".seekrow input", v.el), tagbuf: $("[data-tagbuf]", v.el), tagweak: $("[data-tagweak]", v.el), pill: $("[data-pill]", v.el), title: $("h3", v.el), chat: $(".chat ol", v.el),
        want: $("[data-want]", v.el), qnow: $("[data-qnow]", v.el), live: $(".live", v.el), join: $("[data-join]", v.el), fs: $(".fs", v.el), tl: $(".tl i", v.el),
        fsmain: $("[data-fsmain]", v.el), fslocal: $("[data-fslocal]", v.el), bubbles: $(".bubbles", v.el), qr: $(".qr", v.el), side: $(".sidebar", v.el),
        cmderr: $("[data-cmderr]", v.el), weak: $("[data-weak]", v.el), fail: $(".fail", v.el), kb: $(".kb", v.el), kbhint: $(".kbhint", v.el),
        input: $(".composer input", v.el), sugg: $(".mention-list", v.el), picker: $(".emoji-picker", v.el), tracks: $("[data-tracks]", v.el)
      };
      v.ctx = v.ui.canvas.getContext("2d");
      wire(v);
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.id = "tab-" + v.id; b.setAttribute("aria-controls", "ph-" + v.id);
      b.addEventListener("click", () => activate(i, true));
      b.addEventListener("keydown", e => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); activate((i + (e.key === "ArrowRight" ? 1 : 2)) % 3, true); }
      });
      tabs.appendChild(b); v.tab = b;
      renderTracks(v);
    });
    I18N.apply(host);
    labels();
    activate(activeTab, false);
    setNetButtons();
    $("#b-code").hidden = true;
    buildListeners.forEach(fn => fn());
  }

  function activate(i, focus) {
    activeTab = i;
    viewers.forEach((v, j) => {
      v.el.classList.toggle("active", j === i);
      v.tab.setAttribute("aria-selected", String(j === i));
      v.tab.tabIndex = j === i ? 0 : -1;
    });
    if (focus) viewers[i].tab.focus();
  }

  function updateSkip() { setHidden($("#b-skip"), stage === "lang" || !viewers || viewers.every(x => x.joined)); }
  function setStage(s) {
    stage = s;
    const el = $("#demo-stage"); if (el) el.setAttribute("data-stage", s);
    updateSkip();
    stageListeners.forEach(fn => fn(s));
  }

  /* ---------- joining ---------- */
  function randomId() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789_-"; let s = ""; for (let i = 0; i < 22; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  const cleanCode = raw => raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/-{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  function normalizeId(raw) {
    let s = raw.trim(); const m = /[?&]room=([^&#\s]+)/.exec(s);
    if (m) { try { s = decodeURIComponent(m[1]); } catch (e) { /* keep as typed */ } }
    return /^[A-Za-z0-9_-]{22}$/.test(s) ? s : cleanCode(s);
  }
  function renderJoin(v) {
    const f = v.ui.join, start = v.mode === "start";
    $$("[data-mode]", f).forEach(b => b.setAttribute("aria-checked", String(b.getAttribute("data-mode") === v.mode)));
    setText($("[data-code-label]", f), t(start ? "join.code.optional" : "join.code"));
    const code = $("[data-code]", f), nm = $("[data-name]", f);
    nm.value = nameOf(v);
    const ph = t(start ? "join.code.placeholderStart" : "join.code.placeholderJoin"); if (code.placeholder !== ph) code.placeholder = ph;
    code.required = !start; code.setAttribute("aria-required", String(!start));
    const hint = $("[data-hint]", f), raw = code.value.trim(), clean = cleanCode(code.value);
    hint.textContent = "";
    if (!start) hint.textContent = t("join.hint.join");
    else if (raw) {
      if (CODE_OK.test(clean)) {
        hint.appendChild(document.createTextNode(t("join.hint.customBefore")));
        const s = document.createElement("strong"); s.textContent = clean; hint.appendChild(s);
        hint.appendChild(document.createTextNode(t("join.hint.customAfter")));
      } else hint.textContent = t("join.hint.rules");
    } else hint.textContent = t("join.hint.blank");
    setText($("[data-submit]", f), t(start ? "join.submit.start" : "join.submit.join"));
    $$("[data-lg]", f).forEach(b => b.setAttribute("aria-checked", String(b.getAttribute("data-lg") === I18N.lang)));
    setText($("[data-err]", f), v.errKey ? t(v.errKey) : "");
  }
  function startRoom(v, raw) {
    const clean = cleanCode(raw);
    if (raw.trim() && !CODE_OK.test(clean)) { v.errKey = "err.code.invalid"; renderJoin(v); return false; }
    room.code = raw.trim() ? clean : randomId();
    addLog("d.logStart", { code: room.code });
    markJoined(v);
    setText($("#b-code-val"), room.code); $("#b-code").hidden = false;
    return true;
  }
  function joinRoom(v, raw) {
    const now = performance.now();
    misses = misses.filter(a => now - a < 60000);
    if (misses.length >= 10) { v.errKey = "err.join.tooMany"; renderJoin(v); return false; }
    if (!raw.trim()) { v.errKey = "join.err.needCode"; renderJoin(v); return false; }
    if (!room.code || normalizeId(raw) !== room.code) { misses.push(now); v.errKey = "err.room.notFound"; addLog("d.logMiss", { name: nameOf(v) }); renderJoin(v); return false; }
    addLog("d.logJoin", { name: nameOf(v) });
    markJoined(v);
    return true;
  }
  function markJoined(v) {
    const now = performance.now();
    v.joined = true; v.errKey = ""; v.known = snapshot(); v.pos = roomPos(now); v.shown = v.pos; v.settle = now + 400;
    v.el.setAttribute("data-joined", "true"); v.ui.join.hidden = true; v.ui.live.hidden = false;
    if (v.host) setStage("room");
    if (viewers.every(x => x.joined)) { addLog("d.logReady"); }
    updateSkip();
    setWant();
  }
  function submitJoin(v) {
    const raw = $("[data-code]", v.ui.join).value;
    v.errKey = "";
    if (v.mode === "start") { if (v.host) startRoom(v, raw); else v.errKey = "d.hostStarts"; }
    else joinRoom(v, raw);
    if (!v.joined) renderJoin(v);
  }
  function ensureRoom() { // the tour's shortcut: start the room and let everyone in
    if (stage === "lang") setStage("join");
    if (!viewers[0].joined) startRoom(viewers[0], "movie-night");
    viewers.slice(1).forEach(v => { if (!v.joined) { room.code && joinRoom(v, room.code); } });
    setStage("room");
  }
  function ensurePlaying() { ensureRoom(); if (!room.playing) serverPlay(); }

  /* ---------- wiring one phone ---------- */
  function mainAction(v) {
    if (v.known.playing) send(v, () => serverPause(v));
    else if (v.host) send(v, serverPlay);
    else send(v, () => serverAsk(v));
  }
  function toggleLocal(v) {
    const now = performance.now();
    if (!v.localPause) { v.localPause = true; addLog("d.logPauseMe", { name: nameOf(v) }); }
    else {
      v.localPause = false; v.settle = now; addLog("d.logRejoin", { name: nameOf(v) });
      const t0 = now + v.err, k = v.known, adv = k.playing && t0 >= k.anchor;
      jumpTo(v, adv ? Math.min(DUR, k.pos + (t0 - k.anchor) / 1000) : k.pos, now, adv);
    }
  }
  function wake(v) { v.idleAt = performance.now() + 5000; }
  function syncQ(v) {
    $$('input[name$="-qq"]', v.el).forEach(r => { r.checked = r.value === v.q; });
  }
  function setPanel(v, name) {
    v.panel = name;
    $$("[data-toggle]", v.el).forEach(o => {
      const on = o.getAttribute("data-toggle") === v.panel;
      o.setAttribute("aria-expanded", String(on));
      $("#" + o.getAttribute("aria-controls")).hidden = !on;
    });
    wake(v);
  }
  function setSide(v, on, opts) {
    on = !!on; if (v.side === on) return;
    v.side = on; v.drawKey = "";
    v.el.classList.toggle("side", on);
    $("#phones").toggleAttribute("data-side", viewers.some(x => x.side));
    $("[data-full]", v.el).setAttribute("aria-pressed", String(on));
    setHidden(v.ui.side, !on);
    if (on) { setKbd(v, false); setPanel(v, ""); wake(v); }
    else { closeReply(v); v.rot = false; $("[data-rot]", v.el).setAttribute("aria-pressed", "false"); v.bubbles = []; v.ui.bubbles.innerHTML = ""; }
    addLog(on ? "d.logFull" : "d.logExitFull", { name: nameOf(v) });
    if (opts && opts.focus) { const b = on ? $("[data-fsexit]", v.el) : $("[data-full]", v.el); if (b) b.focus({ preventScroll: true }); }
  }
  function setKbd(v, on, opts) {
    on = !!on; if (v.kbd === on) return;
    v.kbd = on;
    v.el.classList.toggle("kbd", on);
    setHidden(v.ui.kb, !on); setHidden(v.ui.kbhint, !on);
    const b = $("[data-kbd]", v.el); b.setAttribute("aria-pressed", String(on)); setText(b, t(on ? "d.keyboardOn" : "d.keyboard"));
    if (on) { setSide(v, false); setPanel(v, ""); if (!(opts && opts.nofocus)) v.ui.input.focus({ preventScroll: true }); }
    else if (opts && opts.focus) b.focus({ preventScroll: true });
  }
  function addBubble(o, author, text, mention) {
    const max = o.lowEnd ? 2 : 3;
    const b = document.createElement("button");
    b.type = "button"; b.className = "bubble"; b.setAttribute("data-mention", String(!!mention));
    b.setAttribute("aria-label", t("chat.bubble", { author, text }));
    const s = document.createElement("strong"); s.textContent = author; const p = document.createElement("span"); p.textContent = text;
    b.appendChild(s); b.appendChild(p);
    b.style.animationDuration = (mention ? 11 : 7) + "s";
    b.addEventListener("click", () => startReply(o, author));
    o.ui.bubbles.appendChild(b);
    while (o.ui.bubbles.childElementCount > max) o.ui.bubbles.removeChild(o.ui.bubbles.firstChild);
    later(mention ? 11000 : 7000, () => b.remove());
  }
  function startReply(o, author) {
    if (o.rot) { // physically sideways: a reply bar over the picture
      const f = o.ui.qr, i = $("input", f);
      f.hidden = false; f.setAttribute("data-to", author); i.value = "@" + author + " "; i.setAttribute("aria-label", t("chat.replyTo", { name: author }));
      i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length);
    } else { // full screen: leave it and use the real message box with the keyboard up
      setSide(o, false);
      if (!coarse) setKbd(o, true, { nofocus: true });
      o.ui.input.value = "@" + author + " "; o.ui.input.focus({ preventScroll: true }); o.ui.input.setSelectionRange(o.ui.input.value.length, o.ui.input.value.length);
      o.el.scrollIntoView({ block: "nearest" });
    }
  }
  function closeReply(v) { v.ui.qr.hidden = true; }
  function friendSays(v) {
    const others = joined().filter(o => o !== v); if (!others.length) return;
    const from = others[counts.friend % others.length], line = FRIEND[counts.friend % FRIEND.length]; counts.friend++;
    const text = line[I18N.lang === "es" ? 1 : 0].replace("{me}", nameOf(v));
    sendChat(from, text);
  }
  function sendChat(v, text) {
    counts.chat++;
    deliver(v, o => addChat(o, v, text));
  }
  function sendReact(v, e) {
    const now = performance.now();
    v.reacts = v.reacts.filter(a => now - a < 2000);
    if (v.reacts.length >= 6) return; // the real limit: 6 reactions per 2 seconds per person
    v.reacts.push(now); counts.react++;
    deliver(v, o => floatEmoji(o, e));
  }

  function updateSugg(v) {
    const i = v.ui.input, before = i.value.slice(0, i.selectionStart == null ? i.value.length : i.selectionStart);
    const m = /(?:^|\s)@([^\s@]{0,32})$/u.exec(before);
    if (!m || v.mentionClosed) { v.sugg = []; }
    else {
      const names = joined().filter(o => o !== v).map(nameOf).concat(GROUP);
      v.sugg = names.filter((n, k) => names.indexOf(n) === k && n.toLowerCase().indexOf(m[1].toLowerCase()) === 0).slice(0, 5);
    }
    v.pick = Math.min(v.pick, Math.max(0, v.sugg.length - 1));
    renderSugg(v);
  }
  function renderSugg(v) {
    const ul = v.ui.sugg; ul.innerHTML = "";
    v.sugg.forEach((n, k) => {
      const li = document.createElement("li"); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(k === v.pick));
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("data-active", String(k === v.pick)); b.tabIndex = -1;
      const a = document.createElement("span"); a.className = "avatar"; a.setAttribute("aria-hidden", "true"); a.textContent = GROUP.indexOf(n) >= 0 ? "@" : n.charAt(0).toUpperCase();
      const s = document.createElement("span"); s.textContent = "@" + n; b.appendChild(a); b.appendChild(s);
      if (GROUP.indexOf(n) >= 0) { const sm = document.createElement("small"); sm.textContent = t("chat.notifyRoom"); b.appendChild(sm); }
      b.addEventListener("pointerdown", e => e.preventDefault());
      b.addEventListener("click", () => acceptSugg(v, n));
      li.appendChild(b); ul.appendChild(li);
    });
    ul.hidden = !v.sugg.length;
  }
  function acceptSugg(v, n) {
    const i = v.ui.input, pos = i.selectionStart == null ? i.value.length : i.selectionStart, before = i.value.slice(0, pos), at = before.lastIndexOf("@");
    i.value = i.value.slice(0, at) + "@" + n + " " + i.value.slice(pos);
    const p = at + n.length + 2; i.setSelectionRange(p, p); i.focus({ preventScroll: true });
    v.pick = 0; v.mentionClosed = false; updateSugg(v);
  }

  function wire(v) {
    const u = v.ui, f = u.join;
    // join screen
    $$("[data-mode]", f).forEach(b => b.addEventListener("click", () => { v.mode = b.getAttribute("data-mode"); v.errKey = ""; renderJoin(v); }));
    $("[data-code]", f).addEventListener("input", () => { v.errKey = ""; renderJoin(v); });
    $$("[data-lg]", f).forEach(b => b.addEventListener("click", () => I18N.set(b.getAttribute("data-lg"), true)));
    f.addEventListener("submit", e => { e.preventDefault(); submitJoin(v); });
    // controls
    u.main.addEventListener("click", () => mainAction(v));
    u.fsmain.addEventListener("click", () => mainAction(v));
    u.local.addEventListener("click", () => toggleLocal(v));
    u.fslocal.addEventListener("click", () => toggleLocal(v));
    if (v.host) {
      u.seek.addEventListener("change", () => { const p = Number(u.seek.value); send(v, () => serverSeek(p)); });
      $("[data-playnow]", v.el).addEventListener("click", () => send(v, serverPlay));
    }
    v.el.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => setPanel(v, v.panel === b.getAttribute("data-toggle") ? "" : b.getAttribute("data-toggle"))));
    $("[data-full]", v.el).addEventListener("click", () => setSide(v, !v.side));
    $("[data-fsexit]", v.el).addEventListener("click", () => setSide(v, false, { focus: true }));
    $("[data-kbd]", v.el).addEventListener("click", () => setKbd(v, !v.kbd, { focus: true }));
    $("[data-rot]", v.el).addEventListener("click", e => { v.rot = !v.rot; e.currentTarget.setAttribute("aria-pressed", String(v.rot)); if (!v.rot) closeReply(v); });
    $("[data-friend]", v.el).addEventListener("click", () => friendSays(v));
    ["pointermove", "pointerdown", "keydown", "focusin"].forEach(n => v.el.addEventListener(n, () => wake(v), { passive: true }));
    // subtitles, quality
    v.el.addEventListener("change", e => {
      const r = e.target;
      if (r.name && /-sub$/.test(r.name)) v.sub = r.value;
      else if (r.name && /-qq$/.test(r.name)) { v.q = r.value; v.adapted = false; if (v.net === "slow") v.nextStall = performance.now() + 300; }
    });
    const delay = $("[data-delay]", v.el), size = $("[data-size]", v.el), vol = $("[data-volume]", v.el);
    const showOut = () => {
      setText(delay.nextElementSibling, (v.delay > 0 ? "+" : "") + num(v.delay, 1) + " s");
      setText(size.nextElementSibling, Math.round(v.size * 100) + "%");
    };
    delay.addEventListener("input", () => { v.delay = Number(delay.value); showOut(); });
    size.addEventListener("input", () => { v.size = Number(size.value); showOut(); });
    vol.addEventListener("input", () => { setText(vol.nextElementSibling, vol.value + "%"); });
    v.showOut = showOut; showOut();
    $("[data-lowend]", v.el).addEventListener("change", e => { setLowEnd(v, e.target.checked); });
    $("[data-toSaver]", v.el).addEventListener("click", () => { v.q = "saver"; syncQ(v); });
    $("[data-dismiss]", v.el).addEventListener("click", () => { v.noteOff = true; });
    $("[data-retry]", v.el).addEventListener("click", () => { v.failed = false; const now = performance.now(); if (v.net === "offline") v.offAt = now; else if (v.stall) v.stall.until = now + 600; });
    // chat
    const form = $(".composer", v.el), input = u.input;
    const submit = text => { sendChat(v, text); };
    form.addEventListener("submit", e => {
      e.preventDefault();
      const text = input.value.trim(); if (!text || v.sugg.length) return;
      input.value = ""; v.sugg = []; renderSugg(v); submit(text);
    });
    input.addEventListener("input", () => { v.mentionClosed = false; v.pick = 0; updateSugg(v); });
    input.addEventListener("click", () => updateSugg(v));
    input.addEventListener("keyup", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") updateSugg(v); });
    input.addEventListener("keydown", e => {
      if (v.sugg.length) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); v.pick = (v.pick + (e.key === "ArrowDown" ? 1 : v.sugg.length - 1)) % v.sugg.length; renderSugg(v); }
        else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); acceptSugg(v, v.sugg[v.pick]); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); v.mentionClosed = true; updateSugg(v); }
      } else if (e.key === "Escape" && v.picker) { e.stopPropagation(); togglePicker(v, false); }
    });
    $("[data-emojitoggle]", v.el).addEventListener("click", () => togglePicker(v, !v.picker));
    v.el.querySelectorAll("[data-ins]").forEach(b => {
      b.addEventListener("pointerdown", e => e.preventDefault());
      b.addEventListener("click", () => { const i = input, p = i.selectionStart == null ? i.value.length : i.selectionStart; i.value = i.value.slice(0, p) + b.getAttribute("data-ins") + i.value.slice(p); const q = p + b.getAttribute("data-ins").length; i.setSelectionRange(q, q); i.focus({ preventScroll: true }); });
    });
    v.el.querySelectorAll("[data-emoji]").forEach(b => b.addEventListener("click", () => sendReact(v, b.getAttribute("data-emoji"))));
    // quick reply bar
    const qr = u.qr;
    qr.addEventListener("submit", e => {
      e.preventDefault();
      const i = $("input", qr), msg = i.value.trim(), to = qr.getAttribute("data-to");
      if (!msg || msg === "@" + to) return;
      closeReply(v); submit(msg);
    });
    $("[data-qrclose]", qr).addEventListener("click", () => closeReply(v));
    qr.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); closeReply(v); } });
    // the drawn keyboard types into the chat box
    const kb = u.kb;
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    rows.forEach(r => { const d = document.createElement("div"); r.split("").forEach(c => { const b = document.createElement("button"); b.type = "button"; b.tabIndex = -1; b.textContent = c; b.setAttribute("data-k", c); d.appendChild(b); }); kb.appendChild(d); });
    const last = document.createElement("div");
    [["@", "@"], ["space", " "], ["⌫", "\b"], ["↵", "\n"]].forEach(a => { const b = document.createElement("button"); b.type = "button"; b.tabIndex = -1; b.textContent = a[0]; b.setAttribute("data-k", a[1]); if (a[0] === "space") b.className = "wide"; last.appendChild(b); });
    kb.appendChild(last);
    kb.addEventListener("pointerdown", e => e.preventDefault());
    kb.addEventListener("click", e => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      const c = b.getAttribute("data-k");
      if (c === "\n") { form.requestSubmit(); return; }
      const p = input.selectionStart == null ? input.value.length : input.selectionStart;
      if (c === "\b") { if (p > 0) { input.value = input.value.slice(0, p - 1) + input.value.slice(p); input.setSelectionRange(p - 1, p - 1); } }
      else { input.value = input.value.slice(0, p) + c + input.value.slice(p); input.setSelectionRange(p + 1, p + 1); }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  function togglePicker(v, on) { v.picker = on; v.ui.picker.hidden = !on; $("[data-emojitoggle]", v.el).setAttribute("aria-pressed", String(on)); }
  function setLowEnd(v, on) {
    v.lowEnd = on; v.dropT = 0; v.goodT = 0; $("[data-lowend]", v.el).checked = on;
    if (!on) { v.health = "ok"; }
  }

  function setNet(v, state) {
    const now = performance.now();
    if (v.net === state) return;
    const was = v.net; v.net = state;
    if (state === "slow") {
      v.nextStall = now + 300; v.adapted = false;
      addLog("d.logSlow");
    } else if (state === "offline") {
      v.offAt = now; v.buf = BUF; v.failed = false;
      addLog("d.logOffline", { name: nameOf(v) });
    } else {
      v.nextStall = Infinity; v.adapted = false;
      if (was === "offline") {
        v.cmdErr = ""; v.failed = false;
        addLog("d.logBack", { name: nameOf(v) });
        if (v.stall) v.stall.until = now + lat(v) + 500;
        later(lat(v) + 200, () => { v.known = snapshot(); v.fresh = true; const q = v.missed; v.missed = []; q.forEach(fn => fn(v)); });
      } else { addLog("d.logFast"); if (v.stall) v.stall.until = now + 500; }
      v.buf = BUF;
    }
    setNetButtons();
  }
  function setNetButtons() {
    const a = viewers && viewers[1]; if (!a) return;
    $$("#b-net [data-net]").forEach(b => b.setAttribute("aria-checked", String(b.getAttribute("data-net") === a.net)));
  }

  function addChat(o, author, text) {
    const me = mentionRe(o);
    const mention = author !== o && me.test(text);
    o.chat.push({ from: nameOf(author), id: author.id, text, mention });
    if (mention) counts.mention++;
    if (o.chat.length > 4) o.chat.shift();
    renderChat(o);
    if (o.side && author !== o) addBubble(o, nameOf(author), text, mention);
  }
  function mentionRe(o) {
    const aliases = [o.id, nameOf(o)].concat(GROUP).map(esc).join("|");
    return new RegExp("(^|[^\\p{L}\\p{N}_@])@(" + aliases + ")(?![\\p{L}\\p{N}_])", "iu");
  }
  function renderChat(o) {
    const ol = o.ui.chat; ol.innerHTML = "";
    const all = viewers.map(nameOf).concat(viewers.map(x => x.id), GROUP).filter((n, k, a) => a.indexOf(n) === k).map(esc).join("|");
    const mark = new RegExp("(^|[^\\p{L}\\p{N}_@])@(" + all + ")(?![\\p{L}\\p{N}_])", "giu");
    o.chat.forEach(m => {
      const li = document.createElement("li"), b = document.createElement("b");
      const from = viewers.find(x => x.id === m.id);
      b.textContent = (from ? nameOf(from) : m.from) + ": ";
      li.appendChild(b);
      let c = 0, x;
      mark.lastIndex = 0;
      while ((x = mark.exec(m.text))) {
        const s = x.index + x[1].length;
        li.appendChild(document.createTextNode(m.text.slice(c, s)));
        const mk = document.createElement("mark"); mk.className = "mention"; mk.textContent = "@" + x[2]; li.appendChild(mk);
        c = s + x[2].length + 1;
      }
      li.appendChild(document.createTextNode(m.text.slice(c)));
      if (m.mention) li.className = "me-mentioned";
      ol.appendChild(li);
    });
  }
  function floatEmoji(o, e) {
    const f = o.ui.floats;
    while (f.childElementCount > (o.lowEnd ? 10 : 40)) f.removeChild(f.firstChild);
    const s = document.createElement("span");
    s.textContent = e; s.style.left = 8 + Math.random() * 78 + "%";
    s.addEventListener("animationend", () => s.remove());
    f.appendChild(s);
  }

  /* ---------- drawing and updating the page ---------- */
  function draw(v) {
    const lv = level(v), w = WIDTH[lv], h = Math.round(w * 9 / 16), p = v.shown;
    const key = lv + "|" + Math.round(p * 20);
    if (key === v.drawKey) return;
    v.drawKey = key;
    const c = v.ui.canvas, g = v.ctx;
    if (c.width !== w) { c.width = w; c.height = h; }
    const hue = (Math.floor(p / 10) * 47) % 360;
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "hsl(" + hue + ",45%,24%)"); grad.addColorStop(1, "hsl(" + ((hue + 40) % 360) + ",45%,10%)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(w * ((p % 10) / 10), 0, Math.max(2, w * 0.012), h);
    g.fillStyle = "#ffcf83"; g.beginPath();
    g.arc(w * (0.5 + 0.32 * Math.sin(p * 1.3)), h * (0.45 + 0.2 * Math.sin(p * 0.9)), h * 0.11, 0, 6.2832); g.fill();
    g.fillStyle = "#fff"; g.font = "700 " + Math.round(h * 0.16) + "px ui-monospace,Consolas,monospace"; g.textBaseline = "top";
    g.fillText(fmt(p), w * 0.04, h * 0.06);
  }
  function cue(v) {
    if (v.sub === "off") return "";
    const p = v.shown - v.delay;
    if (p < 0) return "";
    const i = Math.floor(p / 6);
    if (p - i * 6 >= 4) return "";
    if (v.sub === "en" || v.sub === "es") return CUES[i % CUES.length][v.sub === "es" ? 1 : 0];
    return t("d.cueOther", { n: (i % 9) + 1, lang: langName(v.sub) });
  }
  function renderTracks(v) {
    const box = v.ui.tracks, id = "ph-" + v.id;
    if (!box) return;
    const cur = v.sub;
    box.innerHTML = "";
    const mk = (val, label, lang) => {
      const l = document.createElement("label"), i = document.createElement("input"), s = document.createElement("span");
      i.type = "radio"; i.name = id + "-sub"; i.value = val; i.checked = val === cur; s.textContent = label; if (lang) s.lang = lang;
      l.appendChild(i); l.appendChild(s); box.appendChild(l);
    };
    mk("off", t("d.subOff"));
    caps.forEach(c => mk(c.lang, langName(c.lang)));
    if (cur !== "off" && !caps.some(c => c.lang === cur)) v.sub = "off";
    const off = $('input[value="off"]', box); if (v.sub === "off" && off) off.checked = true;
    $("[data-toggle=subs]", v.el).disabled = !caps.length;
  }
  function labels() {
    if (!built && !viewers) return;
    viewers.forEach(v => {
      setText(v.ui.title, v.host ? t("d.phoneHost") : t("d.phone", { name: v.name }));
      setText(v.tab, nameOf(v));
      v.showOut();
      renderChat(v);
      renderJoin(v);
      renderTracks(v);
      v.el.querySelectorAll("[data-emoji]").forEach(b => b.setAttribute("aria-label", t("d.react", { e: b.getAttribute("data-emoji") })));
      $$("[data-rate]", v.el).forEach(s => setText(s, t("quality.rate", { rate: num(MBPS[s.getAttribute("data-rate")], 1) })));
      setText($("[data-kbd]", v.el), t(v.kbd ? "d.keyboardOn" : "d.keyboard"));
      setText($("[data-full]", v.el), t("d.fullscreen"));
      v.ui.input.setAttribute("aria-label", t("d.message"));
    });
    renderLog();
  }
  function renderLog() {
    if (!logs) return;
    const ol = $("#b-log"); if (!ol) return;
    ol.innerHTML = "";
    logs.slice(0, 6).forEach(e => {
      const li = document.createElement("li");
      const p = Object.assign({}, e.params); if (typeof p.rate === "number") p.rate = num(p.rate, 2);
      li.textContent = fmt(e.pos) + "  " + t(e.key, p);
      ol.appendChild(li);
    });
  }

  function render(now) {
    const rp = roomPos(now);
    setText($("#b-clock"), fmt(rp));
    const st = $("#b-state"), playing = room.playing;
    setText(st, t(playing ? "d.stPlaying" : "d.stPaused")); st.classList.toggle("on", playing);
    const drifts = $("#b-drifts");
    if (!drifts.firstChild) viewers.forEach(v => { drifts.insertAdjacentHTML("beforeend", '<div class="drift" id="dr-' + v.id + '"><span class="n"></span><span class="bar"><i></i></span><span class="ms"></span><span class="extra"></span></div>'); });
    const strug = [];
    viewers.forEach(v => {
      const row = $("#dr-" + v.id), u = v.ui;
      setText($(".n", row), nameOf(v));
      if (!v.joined) { setText($(".ms", row), "—"); setText($(".extra", row), t("d.notJoined")); $(".bar i", row).style.width = "0"; return; }
      const spinMs = v.stall ? now - v.stall.start : 0;
      if (!v.stall && !v.jump && !v.localPause) v.shown = v.pos; // the picture freezes while it is stalled or jumping
      else if (v.localPause && !v.jump) v.shown = v.pos;
      const driftMs = (v.pos - rp) * 1000;
      const offline = v.net === "offline";
      // spinner and failure screen
      let spin = "";
      if (v.stall && spinMs >= 400) spin = offline ? "offline" : "buffering";
      else if (v.jump && now - v.jump.start >= 250) spin = "jumping";
      if (spin) setText($("span", u.spin), t(spin === "offline" ? "player.offline" : spin === "jumping" ? "d.jumping" : "d.buffering"));
      setText($("small", u.spin), v.stall && spinMs >= 3000 && !offline ? t("d.slowHint") : "");
      const showFail = v.failed && !!v.stall;
      setHidden(u.fail, !showFail);
      const wantSpin = !!spin && !showFail;
      if (u.spin.hidden === wantSpin) u.spin.hidden = !wantSpin;
      setText(u.pill, t(offline ? "status.reconnecting" : "status.live")); u.pill.setAttribute("data-state", offline ? "reconnecting" : "live");
      // head and notice
      const told = !!(v.stall && v.stall.told) || v.clearAt > 0;
      if (u.tagbuf.hidden === told) u.tagbuf.hidden = !told;
      const weak = v.health === "struggling";
      setHidden(u.tagweak, !weak); if (weak) strug.push(nameOf(v));
      const others = viewers.filter(o => o !== v && o.joined && ((o.stall && o.stall.told) || o.clearAt > 0)).map(nameOf);
      setText(u.notice, others.length ? t(others.length > 1 ? "d.bufMany" : "d.bufOne", { names: others.join(", ") }) : "");
      setText(u.pos, fmt(v.pos));
      const lv = level(v);
      setText(u.badge, lv + "p");
      // controls
      const known = v.known.playing;
      const asked = !v.host && want.has(v.id) && !known;
      const mainTxt = t(known ? "d.pauseAll" : v.host ? "d.playAll" : asked ? "d.asked" : "d.waiting");
      setText(u.main, mainTxt); setText(u.fsmain, mainTxt);
      const locTxt = t(v.localPause ? "d.rejoin" : "d.pauseMe");
      setText(u.local, locTxt); setText(u.fslocal, locTxt);
      u.local.setAttribute("aria-pressed", String(v.localPause));
      u.local.disabled = u.fslocal.disabled = !v.localPause && !known; // like the app: nothing to pause alone while the room is paused
      if (document.activeElement !== u.seek) u.seek.value = Math.round(v.host ? roomPos(now) : v.pos);
      if (v.host) {
        const ids = v.wantIds.filter(id => !known);
        const names = ids.map(id => nameOf(viewers.find(o => o.id === id)));
        if (u.want.hidden === !!names.length) u.want.hidden = !names.length;
        setText($("span", u.want), names.length ? t(names.length > 1 ? "d.wantPlayMany" : "d.wantPlay", { names: names.join(", ") }) : "");
      }
      setText(u.qnow, v.q === "auto" ? t("quality.currently", { height: lv }) : "");
      $$("[data-now]", v.el).forEach(s => setHidden(s, Number(s.getAttribute("data-now")) !== lv));
      setText(u.subs, cue(v));
      u.subs.style.fontSize = (0.7 * v.size).toFixed(2) + "rem";
      // full screen overlay
      const on = now < v.idleAt || v.panel !== "";
      if (u.fs.getAttribute("data-on") !== String(on)) u.fs.setAttribute("data-on", String(on));
      u.tl.style.width = (v.pos / DUR * 100).toFixed(1) + "%";
      // notices
      setText(u.cmderr, v.cmdErr); setHidden(u.cmderr, !v.cmdErr);
      const showWeak = weak && !v.noteOff;
      setHidden(u.weak, !showWeak);
      if (showWeak) { setHidden($("[data-autosaver]", v.el), !v.autoSw); setHidden($("[data-already]", v.el), v.autoSw || v.q !== "saver"); setHidden($("[data-toSaver]", v.el), v.q === "saver"); }
      if (visible) draw(v);
      // board row
      const ms = Math.round(driftMs);
      setText($(".ms", row), (ms > 0 ? "+" : "") + ms + " ms");
      const bar = $(".bar i", row), w = Math.min(50, Math.abs(driftMs) / 600 * 50);
      bar.style.width = w + "%"; bar.style.left = (driftMs >= 0 ? 50 : 50 - w) + "%";
      const cls = Math.abs(driftMs) < 180 ? "" : Math.abs(driftMs) < 550 ? "warn" : "bad";
      if (bar.className !== cls) bar.className = cls;
      let state;
      if (offline) state = t("d.offlineState");
      else if (v.localPause) state = t("d.local");
      else if (v.stall && spinMs >= 400) state = t("d.buf");
      else if (v.jump) state = t("d.jump");
      else if (v.rate !== 1) state = t("d.fast", { rate: v.rate });
      else state = t(room.rev ? "d.ok" : "d.ready");
      setText($(".extra", row), state + " · " + lv + "p" + (weak ? " · " + t("people.struggling") : "") + (v.lead ? " · " + t("d.lead", { ms: Math.round(v.lead * 1000) }) : ""));
    });
    room.strugglers = strug;
  }

  function frame() {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (stage !== "lang") {
      tickRoom(now);
      viewers.forEach(v => step(v, now, dt));
      render(now);
    }
    timer = reduce ? setTimeout(frame, 250) : requestAnimationFrame(frame);
  }

  function initGate() {
    const pref = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").slice(0, 2).toLowerCase();
    $$("#gate [data-pick]").forEach(b => {
      b.setAttribute("data-suggested", String(b.getAttribute("data-pick") === (pref === "es" ? "es" : "en")));
      b.addEventListener("click", () => {
        I18N.set(b.getAttribute("data-pick"), true);
        setStage("join");
        if (viewers) { activate(0, false); const c = $("[data-code]", viewers[0].ui.join); if (c) c.focus({ preventScroll: true }); }
      });
    });
  }

  function init() {
    if (!$("#phones")) return;
    built = true;
    build();
    setStage("lang");
    initGate();
    $$("#b-net [data-net]").forEach(b => b.addEventListener("click", () => { setNet(viewers[1], b.getAttribute("data-net")); }));
    $("#b-reset").addEventListener("click", () => { $("#b-drifts").innerHTML = ""; build(); setStage("join"); });
    $("#b-skip").addEventListener("click", () => { ensureRoom(); });
    $("#b-copy").addEventListener("click", e => {
      const b = e.currentTarget;
      try { if (navigator.clipboard) navigator.clipboard.writeText(room.code).catch(() => {}); } catch (x) { /* clipboard may be blocked */ }
      b.textContent = t("common.copied"); setTimeout(() => { setText(b, t("people.copyCode")); }, 1500);
    });
    I18N.onChange(() => { labels(); });
    setStage("lang");
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: "100px" }).observe($("#demo"));
    last = performance.now();
    frame();
  }

  /* ---------- what the tour and the host panel can use ---------- */
  window.SIM = {
    get stage() { return stage; }, setStage, get viewers() { return viewers; }, get room() { return room; }, get counts() { return counts; },
    get caps() { return caps; }, activate, nameOf, ensureRoom, ensurePlaying, log: addLog, onStage: fn => stageListeners.push(fn), onBuild: fn => buildListeners.push(fn),
    restart() { $("#b-drifts").innerHTML = ""; build(); setStage("lang"); },
    setCaps(list) { caps = list; viewers.forEach(renderTracks); },
    switchVideo(title, list) { room.title = title; caps = list; viewers.forEach(renderTracks); serverLoad(title); },
    get strugglers() { return (room && room.strugglers) || []; },
    act: {
      play() { const h = viewers[0]; if (h.joined && !room.playing) send(h, serverPlay); },
      pauseBy(v) { if (room.playing) mainAction(v); },
      ask(v) { if (!room.playing) mainAction(v); },
      seek(pos) { const h = viewers[0]; send(h, () => serverSeek(pos)); },
      local: toggleLocal, setNet, setSide, setKbd, setLowEnd, setPanel, friendSays, sendChat, sendReact, startRoom, joinRoom, renderJoin,
      setQ(v, q) { v.q = q; v.adapted = false; if (v.net === "slow") v.nextStall = performance.now() + 300; syncQ(v); },
      choose(code) { I18N.set(code, true); setStage("join"); }, submitJoin
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();

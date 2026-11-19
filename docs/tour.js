/* The guided tour: a docked card that walks through the demo's scenarios in order. Every step can be done by hand or with
   "Show me"; the tour can be skipped at any point; arrow keys move between steps and Escape skips it. The card is not modal:
   the demo underneath stays fully usable. All the text is in the dictionary below, English and Spanish. */
(function () {
  "use strict";
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = {
    "tour.count": ["Step {n} of {total}", "Paso {n} de {total}"],
    "tour.done": ["✓ Done. Press Next when you are ready.", "✓ Hecho. Pulsa Siguiente cuando quieras."],
    "tour.try": ["Try it yourself, or press Show me.", "Pruébalo tú, o pulsa Mostrar."],
    "tour.finish": ["Finish", "Terminar"], "tour.restart": ["Start again", "Empezar de nuevo"],
    "tour.s1.t": ["Pick a language", "Elige un idioma"],
    "tour.s1.b": ["The app asks which language to use on the first visit, in both languages at once, before showing anything else. You can change it later from the join screen, the video details or Settings.",
      "La app pregunta qué idioma usar en la primera visita, en los dos idiomas a la vez, antes de mostrar nada más. Se puede cambiar después desde la pantalla de entrada, los detalles del video o Ajustes."],
    "tour.s2.t": ["Start a room with a code", "Crea una sala con un código"],
    "tour.s2.b": ["The host picks a code of 4 to 20 letters, numbers, dashes or underscores, or leaves it blank for a random one. Anyone with the code can join, so treat it like a password. Try a bad one first, like “a b”.",
      "El anfitrión elige un código de 4 a 20 letras, números, guiones o guiones bajos, o lo deja en blanco para uno aleatorio. Quien tenga el código puede entrar: trátalo como una contraseña. Prueba antes uno malo, como «a b»."],
    "tour.s3.t": ["Friends join with the code", "Los amigos entran con el código"],
    "tour.s3.b": ["Ann and Bob choose Join with a code and type it (the invite link works too). A wrong code gets “No room has that code or link.”, and 10 wrong tries in a minute make the server say wait.",
      "Ann y Bob eligen Unirse con un código y lo escriben (el enlace de invitación también sirve). Un código incorrecto da «Ninguna sala tiene ese código o enlace.», y 10 fallos en un minuto hacen que el servidor pida esperar."],
    "tour.s4.t": ["Play together", "Reproducir juntos"],
    "tour.s4.b": ["Only the host can press Play all. The start is scheduled 550 ms ahead so all three phones begin on the same frame; the drift bars show each phone being nudged into step.",
      "Solo el anfitrión puede pulsar Reproducir a todos. El inicio se programa 550 ms por delante para que los tres teléfonos empiecen en el mismo fotograma; las barras de desfase muestran cómo se corrige cada uno."],
    "tour.s5.t": ["Anyone can pause", "Cualquiera puede pausar"],
    "tour.s5.b": ["Ann presses Pause all and everyone stops, with her name in the log. Anyone can pause, but only the host can start the room or move the timeline.",
      "Ann pulsa Pausar a todos y todos se detienen, con su nombre en el registro. Cualquiera puede pausar, pero solo el anfitrión puede reanudar o mover la línea de tiempo."],
    "tour.s6.t": ["Viewers ask the host to play", "Los espectadores piden al anfitrión que reproduzca"],
    "tour.s6.b": ["A viewer cannot start the video, so the button says Waiting. Pressing it sends the host a Play now prompt (and buzzes their phone). Press Play now on the Host's phone.",
      "Un espectador no puede iniciar el video, así que el botón dice Esperando. Al pulsarlo, el anfitrión recibe un aviso Reproducir ya (y su teléfono vibra). Pulsa Reproducir ya en el teléfono del anfitrión."],
    "tour.s7.t": ["Only the host can seek", "Solo el anfitrión puede saltar"],
    "tour.s7.b": ["The viewers' seek bars are locked. When the host drags theirs, everyone jumps; each phone aims a little ahead by the seek time it has learned, so it lands in step.",
      "Las barras de los espectadores están bloqueadas. Cuando el anfitrión arrastra la suya, todos saltan; cada teléfono apunta un poco por delante según el tiempo de salto que aprendió, para caer al paso."],
    "tour.s8.t": ["Pause me, then Rejoin", "Pausarme y luego Volver"],
    "tour.s8.b": ["Bob takes a call: Pause me stops only his screen while the room keeps playing. Rejoin jumps him back to where the room is now.",
      "Bob recibe una llamada: Pausarme detiene solo su pantalla mientras la sala sigue. Volver lo lleva de nuevo al punto donde está la sala ahora."],
    "tour.s9.t": ["When a connection stalls", "Cuando una conexión se corta"],
    "tour.s9.b": ["Make Ann's connection Slow. Her player says “Buffering…”; after 3 seconds the room is told “Ann is buffering…”. Nobody is paused: she jumps back when data arrives, and on Auto quality steps down a rung.",
      "Pon la conexión de Ann en Lenta. Su reproductor dice «Cargando…»; tras 3 segundos se avisa a la sala: «Ann está cargando…». Nadie se pausa: ella salta de vuelta cuando llegan los datos y, en Automática, baja un escalón."],
    "tour.s10.t": ["Subtitles", "Subtítulos"],
    "tour.s10.b": ["Open Subtitles on any phone, pick a track and drag the delay. Each person has their own track, delay and size. The real sample ships with one English track; the Spanish one is a demo extra.",
      "Abre Subtítulos en cualquier teléfono, elige una pista y mueve el retraso. Cada persona tiene su propia pista, retraso y tamaño. El video de muestra real trae solo inglés; el español es un añadido de la demostración."],
    "tour.s11.t": ["Chat, @-mentions and emoji", "Chat, menciones con @ y emojis"],
    "tour.s11.b": ["Type @ in the message box for suggestions: a name, @everyone or @here. A mention is highlighted for the person named. Reaction emoji float across everyone's picture (6 per 2 seconds at most); 🙂 opens the full picker.",
      "Escribe @ en la caja de mensajes para ver sugerencias: un nombre, @everyone o @here. La mención se resalta para la persona nombrada. Los emojis de reacción cruzan la imagen de todos (6 cada 2 segundos como máximo); 🙂 abre el selector completo."],
    "tour.s12.t": ["Full screen, or a phone held sideways", "Pantalla completa, o teléfono de lado"],
    "tour.s12.b": ["Full screen turns a phone sideways where the browser allows it. The timeline and buttons fade after 5 seconds without a touch, and chat from others shows as speech bubbles (3 at most; 7 seconds, or 11 for a mention). Tap one to reply.",
      "La pantalla completa gira el teléfono de lado donde el navegador lo permite. La línea de tiempo y los botones se desvanecen a los 5 segundos sin tocar, y el chat de los demás aparece como burbujas (3 como máximo; 7 segundos, u 11 si es una mención). Toca una para responder."],
    "tour.s13.t": ["With the keyboard open", "Con el teclado abierto"],
    "tour.s13.b": ["Tapping a bubble leaves full screen and opens the message box with “@name ” typed and the keyboard up. With the keyboard open the picture shrinks to 30% of what you can see and the buttons and reactions step aside, so the box is never hidden.",
      "Tocar una burbuja sale de la pantalla completa y abre la caja de mensajes con «@nombre » escrito y el teclado abierto. Con el teclado abierto, la imagen se reduce al 30 % de lo visible y los botones y reacciones se apartan, así la caja nunca queda oculta."],
    "tour.s14.t": ["Quality: Auto, Data saver or a fixed rung", "Calidad: Automática, Ahorro de datos o un escalón fijo"],
    "tour.s14.b": ["Adaptive videos come as a ladder, from 1080p to 240p. Each person picks Auto, Data saver or one rung; nobody else is affected. Auto never fetches more pixels than the screen can show; a fixed rung stays put and stalls rather than step down.",
      "Los videos adaptativos vienen como una escalera, de 1080p a 240p. Cada persona elige Automática, Ahorro de datos o un escalón; a nadie más le afecta. Automática nunca pide más píxeles de los que la pantalla puede mostrar; un escalón fijo se queda y se corta en vez de bajar."],
    "tour.s15.t": ["A phone that cannot keep up", "Un teléfono que no puede con el video"],
    "tour.s15.b": ["Turn on Low-end phone while the room plays. After about 8 seconds of dropped frames the player tells the room, and a phone on Auto switches itself to Data saver, once, with a notice. The host sees who is struggling in the Video tab.",
      "Activa Teléfono de gama baja mientras la sala reproduce. Tras unos 8 segundos de fotogramas perdidos, el reproductor avisa a la sala y un teléfono en Automática pasa solo a Ahorro de datos, una vez, con un aviso. El anfitrión ve quién tiene problemas en la pestaña Video."],
    "tour.s16.t": ["Offline", "Sin conexión"],
    "tour.s16.b": ["Take Ann offline. The pill says Reconnecting and the picture plays on from what is loaded (10 seconds here; really up to 30), then says “You're offline. Playback continues when you're back.” It retries after 0.8, 1.6, 3.2, 6.4 and 8 seconds, then shows an error with Try again (from the code: outages that long were not tested). The room cannot be told while Ann is offline.",
      "Deja a Ann sin conexión. El indicador dice Reconectando y la imagen sigue con lo ya cargado (10 segundos aquí; en realidad hasta 30), luego dice «Sin conexión. La reproducción continúa cuando vuelvas.» Reintenta tras 0,8, 1,6, 3,2, 6,4 y 8 segundos y luego muestra un error con Intentar de nuevo (según el código: caídas tan largas no se probaron). A la sala no se le puede avisar mientras Ann está sin conexión."],
    "tour.s17.t": ["Back online", "De vuelta en línea"],
    "tour.s17.b": ["Restore the connection. The download restarts at once, a fresh snapshot of the room arrives, and Ann jumps back to where everyone is, even if the room paused while she was away.",
      "Restaura la conexión. La descarga se reanuda al instante, llega una instantánea nueva de la sala y Ann salta de vuelta a donde está todo el mundo, aunque la sala se haya pausado mientras estaba fuera."],
    "tour.s18.t": ["The host's library", "La biblioteca del anfitrión"],
    "tour.s18.b": ["The host's Video tab lists the library, uploads files and keeps the media folder under a 4 GB cap. A file that will not fit is refused before it is sent. Delete a video to make room; add a subtitle file to the current one.",
      "La pestaña Video del anfitrión lista la biblioteca, sube archivos y mantiene la carpeta de medios bajo un tope de 4 GB. Un archivo que no cabe se rechaza antes de enviarlo. Borra un video para hacer espacio; añade un archivo de subtítulos al actual."],
    "tour.s19.t": ["That is the tour", "Eso es todo el recorrido"],
    "tour.s19.b": ["What you saw follows the app's own rules, but the room, the network and the phones are simulated. The README on GitHub covers buffering, quality and the performance numbers in detail.",
      "Lo que viste sigue las reglas de la propia app, pero la sala, la red y los teléfonos son simulados. El README en GitHub explica con detalle la carga, la calidad y las cifras de rendimiento."]
  };
  I18N.add(D);
  const t = I18N.t, $ = (s, r) => (r || document).querySelector(s);
  let steps = [], idx = 0, open = false, minimized = false, userMin = false, flags = {}, poll = 0, ctl = {};
  const small = window.matchMedia ? matchMedia("(max-height: 700px), (max-width: 480px)") : { matches: false };
  const V = n => SIM.viewers[n];
  const sel = (id, s) => () => $("#ph-" + id + " " + s);

  steps = [
    { id: "lang", target: () => $("#gate .gate-card"), run: () => { SIM.act.choose(I18N.lang); }, done: () => SIM.stage !== "lang",
      ensure: () => { if (SIM.stage !== "lang") SIM.restart(); } },
    { id: "start", phone: 0, target: sel("host", "[data-join]"), ensure: () => { if (SIM.stage === "lang") SIM.setStage("join"); },
      run: () => { const f = V(0); if (!f.joined) { const c = $("[data-code]", f.ui.join); c.value = "movie-night"; SIM.act.renderJoin(f); SIM.act.submitJoin(f); } }, done: () => V(0).joined },
    { id: "join", phone: 1, target: sel("ann", "[data-join]"), ensure: () => { if (SIM.stage === "lang") SIM.setStage("join"); if (!V(0).joined) { SIM.act.startRoom(V(0), "movie-night"); } },
      run: () => { [1, 2].forEach(i => { const v = V(i); if (!v.joined) { v.mode = "join"; const c = $("[data-code]", v.ui.join); c.value = SIM.room.code; SIM.act.renderJoin(v); SIM.act.submitJoin(v); } }); }, done: () => V(1).joined && V(2).joined },
    { id: "play", phone: 0, target: sel("host", "[data-main]"), ensure: () => SIM.ensureRoom(), run: () => { if (!SIM.room.playing) SIM.act.play(); }, done: () => SIM.counts.play > 0 },
    { id: "pause", phone: 1, target: sel("ann", "[data-main]"), ensure: () => SIM.ensurePlaying(), run: () => SIM.act.pauseBy(V(1)), done: () => SIM.counts.pause > 0 },
    { id: "ask", phone: 2, target: sel("bob", "[data-main]"), ensure: () => SIM.ensureRoom(), run: () => { if (SIM.room.playing) SIM.act.pauseBy(V(0)); setTimeout(() => SIM.act.ask(V(2)), 500); }, done: () => SIM.counts.ask > 0 },
    { id: "seek", phone: 0, target: sel("host", ".seekrow"), ensure: () => SIM.ensurePlaying(), run: () => SIM.act.seek(120), done: () => SIM.counts.seek > 0 },
    { id: "local", phone: 2, target: sel("bob", "[data-local]"), ensure: () => SIM.ensurePlaying(), run: () => SIM.act.local(V(2)), done: () => flags.local === true },
    { id: "buffer", target: () => $("#b-net"), ensure: () => SIM.ensurePlaying(), run: () => SIM.act.setNet(V(1), "slow"), done: () => flags.buf },
    { id: "subs", phone: 2, target: sel("bob", "[data-toggle=subs]"), ensure: () => SIM.ensureRoom(), run: () => { SIM.act.setPanel(V(2), "subs"); const r = $('#ph-bob input[value="en"]'); if (r) { r.checked = true; V(2).sub = "en"; } }, done: () => V(2).sub !== "off" },
    { id: "chat", phone: 1, target: sel("ann", ".composer"), ensure: () => SIM.ensureRoom(), run: () => { SIM.act.sendChat(V(1), "@" + SIM.nameOf(V(2)) + (I18N.lang === "es" ? " ¿viste eso?" : " did you see that?")); SIM.act.sendReact(V(1), "🎉"); }, done: () => SIM.counts.mention > 0 },
    { id: "side", phone: 2, target: sel("bob", "[data-full]"), ensure: () => SIM.ensurePlaying(), run: () => { SIM.act.setSide(V(2), true); setTimeout(() => SIM.act.friendSays(V(2)), 500); setTimeout(() => SIM.act.friendSays(V(2)), 1300); }, done: () => V(2).side },
    { id: "kbd", phone: 2, target: sel("bob", "[data-kbd]"), ensure: () => SIM.ensureRoom(), run: () => SIM.act.setKbd(V(2), true, { nofocus: true }), done: () => V(2).kbd },
    { id: "quality", phone: 2, target: sel("bob", "[data-toggle=q]"), ensure: () => { SIM.ensureRoom(); SIM.act.setKbd(V(2), false); }, run: () => SIM.act.setPanel(V(2), "q"), done: () => V(2).panel === "q" },
    { id: "lowend", phone: 2, target: sel("bob", "[data-lowend]"), ensure: () => { SIM.ensurePlaying(); SIM.act.setSide(V(2), false); SIM.act.setKbd(V(2), false); SIM.act.setPanel(V(2), "q"); },
      run: () => { if (V(2).q !== "auto" && !V(2).autoSw) SIM.act.setQ(V(2), "auto"); SIM.act.setLowEnd(V(2), true); }, done: () => V(2).autoSw },
    { id: "offline", target: () => $("#b-net"), ensure: () => SIM.ensurePlaying(), run: () => SIM.act.setNet(V(1), "offline"), done: () => flags.off },
    { id: "back", target: () => $("#b-net"), ensure: () => SIM.ensureRoom(), run: () => SIM.act.setNet(V(1), "ok"), done: () => flags.off && V(1).net === "ok" },
    { id: "host", target: () => $("#host-tools"), ensure: () => SIM.ensureRoom(), run: () => { const u = $("#ht-upload"); if (u) { u.click(); const b = Array.prototype.find.call(document.querySelectorAll("#ht-pick button"), x => /^concert/.test(x.textContent)); if (b) b.click(); } }, done: () => !!$('#ht-ups .upload[data-error="true"]') },
    { id: "end", ensure: () => {}, run: () => { start(); } }
  ];

  function poller() {
    if (!SIM.viewers) return;
    if (V(2).localPause) flags.local = "paused"; else if (flags.local === "paused") flags.local = true;
    if (V(1).stall && V(1).stall.told || V(1).adapted) flags.buf = true;
    if (V(1).net === "offline") flags.off = true;
    refreshDone();
  }
  function refreshDone() {
    const s = steps[idx]; if (!s || !open) return;
    const d = s.done ? s.done() : false;
    const txt = d ? t("tour.done") : (s.run && s.id !== "end" ? t("tour.try") : "");
    if (ctl.done.textContent !== txt) ctl.done.textContent = txt;
  }

  function scrollTo(el) {
    if (!el) return;
    const nav = $(".nav"), navH = nav ? nav.offsetHeight : 56, card = ctl.card.offsetHeight + 16;
    const r = el.getBoundingClientRect(), avail = window.innerHeight - navH - card;
    const wantTop = navH + (r.height < avail ? (avail - r.height) / 2 : 8);
    window.scrollTo({ top: window.scrollY + r.top - wantTop, behavior: reduce ? "auto" : "smooth" });
  }
  function highlight(el) {
    const old = document.querySelector(".tour-hl"); if (old) old.classList.remove("tour-hl");
    if (el) el.classList.add("tour-hl");
  }
  function render(scroll) {
    const s = steps[idx], n = idx + 1;
    ctl.count.textContent = t("tour.count", { n, total: steps.length });
    ctl.title.textContent = t("tour." + (n === steps.length ? "s19" : "s" + n) + ".t");
    ctl.text.innerHTML = t("tour." + (n === steps.length ? "s19" : "s" + n) + ".b");
    ctl.back.disabled = idx === 0;
    ctl.next.textContent = t(idx === steps.length - 1 ? "tour.finish" : "tour.next");
    ctl.doBtn.textContent = s.id === "end" ? t("tour.restart") : t("tour.do");
    ctl.doBtn.hidden = !s.run;
    if (scroll && !userMin) { minimized = false; setMin(); }
    ctl.done.textContent = "";
    refreshDone();
    if (scroll) {
      if (s.ensure) s.ensure();
      if (s.phone != null) SIM.activate(s.phone, false);
      setTimeout(() => { if (!open) return; const el = s.target && s.target(); highlight(el); scrollTo(el); }, 80);
    }
  }
  function go(n) { idx = Math.max(0, Math.min(steps.length - 1, n)); render(true); }
  function start() {
    SIM.restart(); flags = {}; idx = 0; open = true; minimized = false; userMin = false;
    ctl.card.hidden = false; setMin();
    ctl.start.setAttribute("aria-expanded", "true");
    render(true);
    clearInterval(poll); poll = setInterval(poller, 300);
    setTimeout(() => ctl.title.focus({ preventScroll: true }), 100);
  }
  function skip() {
    open = false; clearInterval(poll); ctl.card.hidden = true; highlight(null); ctl.start.setAttribute("aria-expanded", "false");
    ctl.start.focus({ preventScroll: true });
  }
  function setMin() { ctl.body.hidden = minimized; ctl.keys.hidden = minimized; ctl.min.setAttribute("aria-expanded", String(!minimized)); }
  // On a small screen the card gets out of the way as soon as you start using the demo; the next step opens it again.
  function tuck() { if (open && small.matches && !userMin && !minimized) { minimized = true; setMin(); } }

  function init() {
    if (!window.SIM || !$("#tour")) return;
    ctl = { card: $("#tour"), count: $("#tour-count"), title: $("#tour-title"), text: $("#tour-text"), done: $("#tour-done"), back: $("#tour-back"), next: $("#tour-next"), doBtn: $("#tour-do"),
      skip: $("#tour-skip"), min: $("#tour-min"), body: $("#tour-body"), keys: $(".keys", $("#tour")), start: $("#tour-start") };
    ctl.start.setAttribute("aria-controls", "tour"); ctl.start.setAttribute("aria-expanded", "false");
    ctl.start.addEventListener("click", start);
    ctl.back.addEventListener("click", () => go(idx - 1));
    ctl.next.addEventListener("click", () => { if (idx === steps.length - 1) skip(); else go(idx + 1); });
    ctl.skip.addEventListener("click", skip);
    ctl.doBtn.addEventListener("click", () => { const s = steps[idx]; if (s.run) { s.run(); setTimeout(poller, 120); setTimeout(tuck, 600); } });
    ctl.min.addEventListener("click", () => { minimized = !minimized; userMin = true; setMin(); });
    document.addEventListener("pointerdown", e => { if (open && !ctl.card.contains(e.target)) tuck(); }, true);
    document.addEventListener("keydown", e => {
      if (!open || e.defaultPrevented) return;
      const tag = (e.target && e.target.tagName) || "";
      if (e.key === "Escape" && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) { skip(); return; }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && ctl.card.contains(e.target)) { e.preventDefault(); go(idx + (e.key === "ArrowRight" ? 1 : -1)); }
    });
    I18N.onChange(() => { if (open) render(false); });
  }
  document.addEventListener("DOMContentLoaded", init);
})();

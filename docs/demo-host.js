/* The host's Video tab, simulated: library, upload with progress, the storage cap, refused uploads, delete, subtitle upload.
   Wording and rules follow app/library-panel.tsx, app/media-quota.ts and app/i18n/en.ts. The files are made up and nothing is
   read from your computer, uploaded or stored: the "file chooser" below is a drawing with a few pretend files. */
(function () {
  "use strict";
  const QUOTA = 4e9;                   // MEDIA_QUOTA_GB default: 4 (decimal gigabytes)
  const MAXUP = 20 * 1024 ** 3;        // MAX_UPLOAD_GB default: 20
  const TYPES = [".mp4", ".m4v", ".mov", ".webm", ".mkv", ".srt", ".vtt"];
  const LANGS = ["en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh", "ar", "hi", "ru", "tr", "pl"];
  const FILES = [
    { name: "road-trip.mp4", size: 9e8, dur: 1120, h: 1080 }, { name: "concert.mp4", size: 2.3e9, dur: 4320, h: 1080 },
    { name: "slides.pdf", size: 2e6 }, { name: "huge-film.mkv", size: 25 * 1024 ** 3, dur: 9000, h: 1080 }
  ];
  const SUBFILES = [{ name: "movie.srt" }, { name: "captions.vtt" }, { name: "notes.txt" }];

  I18N.add({
    "ht.h": ["Host tools: the Video tab", "Herramientas del anfitrión: la pestaña Video"],
    "ht.intro": ["What the host sees in the room's Video tab. Viewers see only the video that is playing, their own quality choice and a note that the host decides what plays. The files here are made up: nothing is uploaded, read from your computer or stored.",
      "Lo que ve el anfitrión en la pestaña Video de la sala. Los espectadores ven solo el video que se reproduce, su propia calidad y una nota de que el anfitrión decide qué se reproduce. Los archivos de aquí son inventados: no se sube, lee ni guarda nada de tu computadora."],
    "ht.locked": ["Start a room on the Host's phone to open the Video tab.", "Crea una sala en el teléfono del anfitrión para abrir la pestaña Video."],
    "ht.pick": ["Pick a file (a drawn chooser with pretend files)", "Elige un archivo (un selector dibujado con archivos inventados)"],
    "ht.cancel": ["Cancel", "Cancelar"], "ht.capNote": ["The cap counts everything in the media folder: videos, subtitles and posters.", "El tope cuenta todo lo que hay en la carpeta de medios: videos, subtítulos y carteles."],
    "lib.upload": ["Upload video", "Subir video"], "lib.rescan": ["Rescan", "Volver a escanear"], "lib.scanning": ["Scanning…", "Escaneando…"],
    "lib.uploading": ["Uploading {name}", "Subiendo {name}"], "lib.nowPlaying": ["Now playing", "En reproducción"],
    "lib.bandwidth.one": ["≈ {rate} Mb/s each · {total} Mb/s for 1 person", "≈ {rate} Mb/s por persona · {total} Mb/s para 1 persona"],
    "lib.bandwidth.other": ["≈ {rate} Mb/s each · {total} Mb/s for {count} people", "≈ {rate} Mb/s por persona · {total} Mb/s para {count} personas"],
    "lib.subs.one": ["1 subtitle", "1 subtítulo"], "lib.subs.other": ["{count} subtitles", "{count} subtítulos"],
    "lib.deleteTitleBusy": ["Switch to another video before deleting this one", "Cambia a otro video antes de borrar este"],
    "lib.deleteTitle": ["Delete from the server and free {size}", "Borrar del servidor y liberar {size}"],
    "lib.deleteConfirm": ["Tap again to delete ({size})", "Toca otra vez para borrar ({size})"],
    "lib.deletePlaying": ["Playing now", "Reproduciéndose"], "lib.delete": ["Delete · {size}", "Borrar · {size}"],
    "lib.switchNote": ["Switching videos pauses everyone at 0:00.", "Cambiar de video pausa a todos en 0:00."],
    "lib.refuse.type": ["{ext} is not supported. Use MP4, WebM, MKV, MOV, SRT, VTT or an image.", "{ext} no es compatible. Usa MP4, WebM, MKV, MOV, SRT, VTT o una imagen."],
    "lib.refuse.limit": ["That file is larger than the {limit} upload limit.", "Ese archivo supera el límite de subida de {limit}."],
    "lib.refuse.space": ["The server only has {free} free of its {quota} and this file is {size}. Delete a video below to make room.", "El servidor solo tiene {free} libres de sus {quota} y este archivo ocupa {size}. Borra un video de abajo para hacer espacio."],
    "lib.struggling.one": ["{name}'s device is struggling with this video. Switch to a lighter version, ideally an adaptive (HLS) one, or ask them to turn on Data saver.", "El dispositivo de {name} tiene problemas con este video. Cambia a una versión más ligera, idealmente adaptativa (HLS), o pídele que active el ahorro de datos."],
    "lib.struggling.other": ["{name} and {rest} more are having trouble with this video. Switch to a lighter version, ideally an adaptive (HLS) one, or ask them to turn on Data saver.", "{name} y {rest} más tienen problemas con este video. Cambia a una versión más ligera, idealmente adaptativa (HLS), o pídeles que activen el ahorro de datos."],
    "storage.group": ["Server storage", "Almacenamiento del servidor"], "storage.bar": ["{used} of {quota} used", "{used} de {quota} usados"],
    "storage.ofUsed": [" of {quota} used", " de {quota} usados"], "storage.free": [" · {free} free", " · {free} libres"], "storage.full": [" · full", " · lleno"],
    "storage.fullWarn": ["The server is full. Delete a video you no longer need to upload a new one.", "El servidor está lleno. Borra un video que ya no necesites para subir uno nuevo."],
    "compat.universal": ["Plays everywhere", "Se reproduce en todas partes"], "compat.limited": ["Some browsers", "Algunos navegadores"],
    "note.mkv": ["MKV plays in Chrome, Edge and Firefox, not on iPhone or Safari. Remux to MP4 for everyone.", "MKV se reproduce en Chrome, Edge y Firefox, no en iPhone ni en Safari. Conviértelo a MP4 para que funcione para todos."],
    "qc.legend": ["Your playback quality", "Tu calidad de reproducción"], "qc.group": ["Playback quality", "Calidad de reproducción"],
    "qc.saver": ["Adaptive video stays at 480p or below with small buffers: best for older phones and slow connections. ", "El video adaptativo se queda en 480p o menos con búferes pequeños: ideal para teléfonos antiguos y conexiones lentas. "],
    "qc.auto": ["Adaptive video plays the best quality your connection allows. ", "El video adaptativo se reproduce con la mejor calidad que permita tu conexión. "],
    "qc.fixed": ["Fixed at {height}p. Pick Auto or Data saver here, or any quality in the player's Settings (the gear). ", "Fijada en {height}p. Elige Automática o Ahorro de datos aquí, o cualquier calidad en los Ajustes del reproductor (el engranaje). "],
    "subs.add.legend": ["Subtitles for this video", "Subtítulos de este video"], "subs.add.none": ["None yet.", "Todavía no hay."],
    "subs.add.language": ["Subtitle language", "Idioma de los subtítulos"], "subs.add.other": ["Other…", "Otro…"], "subs.add.code": ["Language code", "Código de idioma"],
    "subs.add.placeholder": ["e.g. sv", "p. ej. sv"], "subs.add.button": ["Add .srt / .vtt", "Añadir .srt / .vtt"],
    "subs.add.errCode": ["Type a language code such as en, pt-BR or ja.", "Escribe un código de idioma como es, pt-BR o ja."],
    "subs.add.errFile": ["Choose a .srt or .vtt file.", "Elige un archivo .srt o .vtt."], "subs.add.busy": ["Adding {name}…", "Añadiendo {name}…"],
    "subs.add.ok": ["Subtitles added. Everyone can choose them in the player's Settings (the gear).", "Subtítulos añadidos. Todos pueden elegirlos en los Ajustes del reproductor (el engranaje)."],
    "lib.fileType": ["That file type", "Ese tipo de archivo"]
  });
  const t = I18N.t, $ = (s, r) => (r || document).querySelector(s);
  const tn = (k, n, p) => t(k + (n === 1 ? ".one" : ".other"), Object.assign({ count: n }, p || {}));
  const num = (n, d) => n.toFixed(d).replace(".", I18N.lang === "es" ? "," : ".");
  const size = b => b >= 1e9 ? num(b / 1e9, 1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB";
  const dur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0"); return h ? h + ":" + String(m).padStart(2, "0") + ":" + r : m + ":" + r; };
  const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  const langName = c => { try { const n = new Intl.DisplayNames([I18N.lang], { type: "language" }).of(c); if (n && n !== c) return n.charAt(0).toLocaleUpperCase(I18N.lang) + n.slice(1); } catch (e) { /* unknown */ } return c; };

  let items, uploads, uid, confirming, confirmTimer, scanning, subLang, subCustom, subStatus, root, els = {}, lastKey = "";

  function reset() {
    items = [
      { id: "ferry", title: "The Last Ferry", dur: 12, h: 720, codec: "H264", size: 2.6e6, mbps: 1.1, caps: ["en", "es"], compat: "universal" },
      { id: "holiday", title: "holiday trip", dur: 1450, h: 1080, codec: "H264", size: 1.2e9, mbps: 6.6, caps: [], compat: "universal" },
      { id: "dinner", title: "family dinner", dur: 5520, h: 720, codec: "H264", size: 1.5e9, mbps: 2.2, caps: [], compat: "limited", note: "note.mkv" }
    ];
    uploads = []; uid = 0; confirming = ""; scanning = false; subLang = "en"; subCustom = ""; subStatus = null; lastKey = "";
  }
  const used = () => items.reduce((a, i) => a + i.size, 0);
  const pending = () => uploads.reduce((a, u) => a + (u.error ? 0 : u.size), 0);
  const free = () => Math.max(0, QUOTA - used() - pending());
  const current = () => items.find(i => i.id === SIM.room.vid) || items[0];

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function skeleton() {
    root.innerHTML = "";
    const wrap = el("div", "wrap-in");
    const h = el("h3"); h.id = "ht-h"; h.setAttribute("data-i18n", "ht.h"); wrap.appendChild(h);
    const p = el("p", "small"); p.setAttribute("data-i18n", "ht.intro"); wrap.appendChild(p);
    const locked = el("p", "note"); locked.setAttribute("data-i18n", "ht.locked"); locked.id = "ht-locked"; wrap.appendChild(locked);
    const body = el("div", "ht-body"); body.id = "ht-body"; wrap.appendChild(body);
    root.appendChild(wrap);
    body.innerHTML =
      '<p class="struggle-banner" role="status" id="ht-strug" hidden></p>' +
      '<fieldset class="ht-f"><legend data-i18n="qc.legend"></legend><div class="seg" role="radiogroup" data-i18n-attr="aria-label:qc.group"><button type="button" role="radio" data-q="auto" data-i18n="quality.auto"></button><button type="button" role="radio" data-q="saver" data-i18n="quality.saver"></button></div><p class="small" id="ht-qtext"></p></fieldset>' +
      '<fieldset class="ht-f"><legend data-i18n="subs.add.legend"></legend><p id="ht-caps"></p>' +
      '<div class="subs-form"><select id="ht-lang" data-i18n-attr="aria-label:subs.add.language"></select><input id="ht-custom" maxlength="11" hidden data-i18n-attr="aria-label:subs.add.code;placeholder:subs.add.placeholder"><button type="button" class="btn small" id="ht-addsub" aria-expanded="false" aria-controls="ht-subpick" data-i18n="subs.add.button"></button></div>' +
      '<div class="picker" id="ht-subpick" role="group" data-i18n-attr="aria-label:ht.pick" hidden></div><p id="ht-substatus" hidden></p></fieldset>' +
      '<div class="storage" role="group" data-i18n-attr="aria-label:storage.group"><div class="storage-bar" role="img" id="ht-bar"><i></i></div><p id="ht-stext"></p><p class="err" id="ht-full" hidden data-i18n="storage.fullWarn"></p><p class="small" data-i18n="ht.capNote"></p></div>' +
      '<div class="library-actions"><button type="button" class="btn small primary" id="ht-upload" aria-expanded="false" aria-controls="ht-pick" data-i18n="lib.upload"></button><button type="button" class="btn small" id="ht-rescan" data-i18n="lib.rescan"></button></div>' +
      '<div class="picker" id="ht-pick" role="group" data-i18n-attr="aria-label:ht.pick" hidden></div>' +
      '<div id="ht-ups"></div><ul class="video-list" id="ht-list"></ul><p class="small" data-i18n="lib.switchNote"></p>';
    els = {
      strug: $("#ht-strug"), qtext: $("#ht-qtext"), caps: $("#ht-caps"), lang: $("#ht-lang"), custom: $("#ht-custom"), addsub: $("#ht-addsub"), subpick: $("#ht-subpick"), substatus: $("#ht-substatus"),
      bar: $("#ht-bar"), stext: $("#ht-stext"), full: $("#ht-full"), upload: $("#ht-upload"), rescan: $("#ht-rescan"), pick: $("#ht-pick"), ups: $("#ht-ups"), list: $("#ht-list"), body: body, locked: locked
    };
    // language list
    LANGS.forEach(c => { const o = el("option"); o.value = c; els.lang.appendChild(o); });
    const other = el("option"); other.value = "other"; other.setAttribute("data-i18n", "subs.add.other"); els.lang.appendChild(other);
    els.lang.addEventListener("change", () => { subLang = els.lang.value; els.custom.hidden = subLang !== "other"; });
    els.custom.addEventListener("input", () => { subCustom = els.custom.value; });
    // pretend file choosers
    chooser(els.subpick, els.addsub, SUBFILES, f => addSubtitles(f));
    chooser(els.pick, els.upload, FILES, f => upload(f));
    els.rescan.addEventListener("click", () => { if (scanning) return; scanning = true; render(); setTimeout(() => { scanning = false; render(); }, 700); });
    $$q("[data-q]").forEach(b => b.addEventListener("click", () => { SIM.act.setQ(SIM.viewers[0], b.getAttribute("data-q")); sync(); }));
    I18N.apply(root);
  }
  const $$q = s => Array.prototype.slice.call(root.querySelectorAll(s));

  function chooser(box, opener, files, pick) {
    files.forEach(f => {
      const b = el("button", "btn small"); b.type = "button"; b.textContent = f.name + (f.size ? " · " + size(f.size) : "");
      b.addEventListener("click", () => { close(); pick(f); });
      box.appendChild(b);
    });
    const c = el("button", "btn small"); c.type = "button"; c.setAttribute("data-i18n", "ht.cancel"); c.addEventListener("click", () => { close(); opener.focus(); }); box.appendChild(c);
    function close() { box.hidden = true; opener.setAttribute("aria-expanded", "false"); }
    opener.addEventListener("click", () => {
      const open = box.hidden; els.subpick.hidden = true; els.pick.hidden = true; els.addsub.setAttribute("aria-expanded", "false"); els.upload.setAttribute("aria-expanded", "false");
      box.hidden = !open; opener.setAttribute("aria-expanded", String(open));
      if (open) box.querySelector("button").focus({ preventScroll: true });
    });
    box.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); opener.focus(); } });
  }

  /* ---- actions ---- */
  function upload(f) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase(), id = ++uid;
    const refusal = TYPES.indexOf(ext) < 0 ? t("lib.refuse.type", { ext: ext || t("lib.fileType") })
      : f.size > MAXUP ? t("lib.refuse.limit", { limit: size(MAXUP) })
      : f.size > free() ? t("lib.refuse.space", { free: size(free()), quota: size(QUOTA), size: size(f.size) }) : "";
    if (refusal) { uploads.push({ id, name: f.name, size: f.size, percent: 0, error: refusal, refKey: "" }); render(); return; }
    const u = { id, name: f.name, size: f.size, percent: 0 }; uploads.push(u); render();
    const tick = setInterval(() => {
      if (uploads.indexOf(u) < 0) { clearInterval(tick); return; }
      u.percent = Math.min(100, u.percent + 8);
      if (u.percent >= 100) {
        clearInterval(tick);
        uploads.splice(uploads.indexOf(u), 1);
        items.push({ id: "up" + id, title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), dur: f.dur || 600, h: f.h || 1080, codec: "H264", size: f.size, mbps: Math.round(f.size * 8 / (f.dur || 600) / 1e5) / 10, caps: [], compat: "universal" });
        scanning = true; render(); setTimeout(() => { scanning = false; render(); }, 500); return;
      }
      render();
    }, 250);
  }
  function remove(item) {
    if (item === current()) return;
    if (confirming !== item.id) { confirming = item.id; clearTimeout(confirmTimer); confirmTimer = setTimeout(() => { confirming = ""; render(); }, 4000); render(); return; }
    confirming = ""; clearTimeout(confirmTimer);
    items.splice(items.indexOf(item), 1); render();
    els.upload.focus({ preventScroll: true });
  }
  function choose(item) {
    if (item === current()) return;
    SIM.room.vid = item.id;
    SIM.switchVideo(item.title, item.caps.map(l => ({ lang: l })));
    render();
  }
  function addSubtitles(f) {
    const code = subLang === "other" ? subCustom.trim() : subLang;
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) { subStatus = { text: t("subs.add.errCode"), kind: "err" }; render(); return; }
    if (!/\.(srt|vtt)$/i.test(f.name)) { subStatus = { text: t("subs.add.errFile"), kind: "err" }; render(); return; }
    subStatus = { text: t("subs.add.busy", { name: f.name }), kind: "busy" }; render();
    setTimeout(() => {
      const it = current(); if (it.caps.indexOf(code) < 0) it.caps.push(code);
      SIM.setCaps(it.caps.map(l => ({ lang: l })));
      subStatus = { text: t("subs.add.ok"), kind: "ok" }; render();
    }, 700);
  }

  /* ---- drawing ---- */
  function sync() { // what depends on the phones: the quality choice and who is struggling
    if (!els.strug) return;
    const host = SIM.viewers[0], names = SIM.strugglers, key = host.q + "|" + names.join(",") + "|" + I18N.lang;
    if (key === lastKey) return; lastKey = key;
    els.strug.hidden = !names.length;
    setText(els.strug, names.length ? tn("lib.struggling", names.length, { name: names[0], rest: names.length - 1 }) : "");
    $$q("[data-q]").forEach(b => b.setAttribute("aria-checked", String(host.q === b.getAttribute("data-q"))));
    const f = /^h(\d+)$/.exec(host.q);
    setText(els.qtext, f ? t("qc.fixed", { height: f[1] }) : host.q === "saver" ? t("qc.saver") : t("qc.auto"));
  }
  function render() {
    if (!els.list) return;
    const ready = SIM.stage === "room";
    root.hidden = SIM.stage === "lang"; els.locked.hidden = ready; els.body.hidden = !ready;
    if (!ready) return;
    sync();
    const cur = current(), people = Math.max(1, SIM.viewers.filter(v => v.joined).length);
    // subtitles
    Array.prototype.forEach.call(els.lang.options, o => { if (o.value !== "other") setText(o, langName(o.value)); });
    els.lang.value = subLang;
    setText(els.caps, cur.caps.length ? cur.caps.map(langName).join(", ") : t("subs.add.none"));
    els.substatus.hidden = !subStatus;
    if (subStatus) { setText(els.substatus, subStatus.text); els.substatus.className = subStatus.kind === "err" ? "err" : subStatus.kind === "ok" ? "ok" : "small"; els.substatus.setAttribute("role", subStatus.kind === "ok" ? "status" : "alert"); }
    // storage
    const pct = Math.min(100, Math.round((used() + pending()) / QUOTA * 100));
    els.bar.firstChild.style.inlineSize = pct + "%"; els.bar.firstChild.style.width = pct + "%"; els.bar.setAttribute("data-full", String(free() < QUOTA * 0.05));
    els.bar.setAttribute("aria-label", t("storage.bar", { used: size(used()), quota: size(QUOTA) }));
    els.stext.textContent = ""; const st = el("strong", null, size(used())); els.stext.appendChild(st);
    els.stext.appendChild(document.createTextNode(t("storage.ofUsed", { quota: size(QUOTA) }) + (free() > 0 ? t("storage.free", { free: size(free()) }) : t("storage.full"))));
    els.full.hidden = free() > 0;
    setText(els.rescan, t(scanning ? "lib.scanning" : "lib.rescan")); els.rescan.disabled = scanning;
    // uploads
    els.ups.innerHTML = "";
    uploads.forEach(u => {
      const d = el("div", "upload"); d.setAttribute("data-error", String(!!u.error)); d.appendChild(el("span", null, u.name));
      if (u.error) { const e = el("em", null, u.error); e.setAttribute("role", "alert"); d.appendChild(e); }
      else { const p = el("progress"); p.max = 100; p.value = u.percent; p.setAttribute("aria-label", t("lib.uploading", { name: u.name })); d.appendChild(p); }
      els.ups.appendChild(d);
    });
    // library: reconcile in place, so a focused button stays focused
    const have = {};
    Array.prototype.forEach.call(els.list.children, li => { have[li.getAttribute("data-id")] = li; });
    Object.keys(have).forEach(id => { if (!items.some(i => i.id === id)) els.list.removeChild(have[id]); });
    items.forEach((it, idx) => {
      let li = have[it.id];
      if (!li) {
        li = el("li"); li.setAttribute("data-id", it.id);
        const b = el("button", "video-item"); b.type = "button"; b.addEventListener("click", () => choose(it));
        b.appendChild(el("span", "video-title")); b.appendChild(el("span", "video-meta")); b.appendChild(el("span", "video-meta")); b.appendChild(el("span", "compat")); b.appendChild(el("span", "video-note"));
        const d = el("button", "btn video-delete"); d.type = "button"; d.addEventListener("click", () => remove(it));
        li.appendChild(b); li.appendChild(d);
      }
      if (els.list.children[idx] !== li) els.list.insertBefore(li, els.list.children[idx] || null);
      const b = li.firstChild, d = li.lastChild, isCur = it === cur, cs = b.children;
      cs[0].textContent = it.title; if (isCur) { const s = el("small", null, t("lib.nowPlaying")); cs[0].appendChild(s); }
      setText(cs[1], [dur(it.dur), it.h + "p", it.codec, size(it.size)].join(" · "));
      setText(cs[2], tn("lib.bandwidth", people, { rate: num(it.mbps, 1), total: num(Math.round(it.mbps * people * 10) / 10, 1) }) + (it.caps.length ? " · " + tn("lib.subs", it.caps.length) : ""));
      setText(cs[3], t("compat." + it.compat)); cs[3].setAttribute("data-compat", it.compat); b.setAttribute("data-compat", it.compat);
      setText(cs[4], it.note ? t(it.note) : ""); cs[4].hidden = !it.note;
      b.setAttribute("data-current", String(isCur)); b.disabled = false;
      d.disabled = isCur; d.setAttribute("data-confirm", String(confirming === it.id));
      d.title = isCur ? t("lib.deleteTitleBusy") : t("lib.deleteTitle", { size: size(it.size) });
      setText(d, confirming === it.id ? t("lib.deleteConfirm", { size: size(it.size) }) : isCur ? t("lib.deletePlaying") : t("lib.delete", { size: size(it.size) }));
    });
  }

  function init() {
    root = $("#host-tools"); if (!root || !window.SIM) return;
    reset(); SIM.room.vid = "ferry"; skeleton(); render();
    SIM.onStage(render);
    SIM.onBuild(() => { reset(); SIM.room.vid = "ferry"; skeleton(); render(); });
    I18N.onChange(() => { lastKey = ""; render(); });
    setInterval(() => { if (!document.hidden) sync(); }, 400);
  }
  document.addEventListener("DOMContentLoaded", init);
})();

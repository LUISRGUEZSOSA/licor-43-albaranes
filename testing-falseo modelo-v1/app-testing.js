const N8N_UPLOAD_URL = "https://growtur.app.n8n.cloud/webhook/upload-image";
const N8N_CONFIRM_DATA =
  "https://growtur.app.n8n.cloud/webhook/confirm-mapping";
//endpoint del backup de mapping para testing

// --- TESTING: catálogo simulado para evitar coste ---
const TESTING_PRODUCTS = true; // pon a false en producción
let TEST_PRODUCTS = ["Licor 43 baristo 0.7", "Berezko 1", "QUESO PARMESANO"]; // <— se llenará dinámicamente con el .json

let DEFAULT_UXC_BY_NAME = new Map(); // nombre -> unidadesxformato (>0)

// --- TESTING: evitar llamadas a webhooks (upload/confirm) y simular respuesta ---
const TESTING_WEBHOOKS = true; // pon a false en producción

function makeFakeMappingPayload() {
  // Forma "wrapped" que ya reconoce looksLikeMappingPayload()
  return [
    {
      lines: [
        { descripcion: "Licor 43 baristo 0.7", seleccionado: "", codigo: "1" },
        { descripcion: "Berezko 1", seleccionado: "", codigo: "2" },
        { descripcion: "QUESO PARMESANO", seleccionado: "", codigo: "3" },
      ],
    },
  ];
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
//helpers pdf
function isImageFile(f) {
  return (
    (f.type && f.type.startsWith("image/")) ||
    /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name || "")
  );
}
function isPdfFile(f) {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
}

(function () {
  const INPUT_CAM = document.getElementById("fileCamera");
  const INPUT_PICK = document.getElementById("filePicker");
  const DZ = document.getElementById("dropzone");
  const BTN_CAM = document.getElementById("btnCam");
  const BTN_EX = document.getElementById("btnExplorar");
  const BTN_GO = document.getElementById("btnEnviar");
  const BTN_RS = document.getElementById("btnReset");
  const STATUS = document.getElementById("status");
  const BTN_CONFIRM_JSON = document.getElementById("btnConfirmarJson");

  const THUMB = document.getElementById("thumb");
  const FILE_N = document.getElementById("fileName");
  const FILE_I = document.getElementById("fileInfo");
  const PILL_F = document.getElementById("pillFecha").querySelector("b");

  // Revisión de Descripciones (nueva UI)
  const OCR_REVIEW = document.getElementById("ocrReview");
  const OCR_LIST = document.getElementById("ocrList");
  const OCR_STATUS = document.getElementById("ocrStatus");

  // Fecha de pago = hoy (ISO yyyy-mm-dd)
  const todayISO = new Date().toISOString().slice(0, 10);
  PILL_F.textContent = todayISO;

  // Estado local
  let fileOptimizada = null;
  let lastServerJson = null;
  let reviewDocIndex = 0; // índice del documento si backend devuelve array

  // Catálogo de productos (desde productos_mas_formato.json) → para autocompletar
  let PRODUCTS = [];
  loadProducts();

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  async function loadProducts() {
    // función auxiliar para crear objetos desde el JSON
    // dentro de loadProducts()
    const toObjs = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((p) => {
          // Acepta variantes de clave para 'codigo' y 'nombre'
          const rawCodigo =
            p?.codigo ??
            p?.cod ??
            p?.code ??
            p?.id ??
            p?.Codigo ??
            p?.ID ??
            p?.CODIGO ??
            p?.["código"] ??
            "";
          const rawNombre =
            p?.nombre ??
            p?.Nombre ??
            p?.name ??
            p?.descripcion ??
            p?.Descripción ??
            "";

          const codigo = String(rawCodigo ?? "").trim();
          const nombre = String(rawNombre ?? "").trim();
          const unidadesxformato = Number(p?.unidadesxformato) || 0;

          return {
            codigo,
            nombre,
            // ⬇️ conservamos campos del JSON de catálogo
            unidadesxformato: Number(p?.unidadesxformato) || 0,
            reconocido: Boolean(p?.reconocido) || false,
            codigo_touch:
              p?.codigo_touch != null && p?.codigo_touch !== ""
                ? String(p.codigo_touch).trim()
                : null,
          };
        })
        .filter((p) => p.nombre) // como mínimo, nombre
        .map((p, i) => ({
          ...p,
          // etiqueta del dropdown: "codigo · nombre" (o solo nombre si no hay código)
          label: p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre,
        }));

    if (TESTING_PRODUCTS) {
      try {
        const res = await fetch("productos_mas_formato.json", {
          cache: "no-store",
        });
        if (!res.ok)
          throw new Error("No se pudo cargar productos_mas_formato.json");
        const data = await res.json();

        const objs = toObjs(data);
        // mapa de unidades por nombre (si vienen en productos_mas_formato.json)
        DEFAULT_UXC_BY_NAME = new Map(
          objs.map((o) => [o.nombre, Number(o.unidadesxformato) || 0])
        );

        // si no hay JSON válido, caemos al fallback de nombres
        PRODUCTS = objs.length
          ? objs
          : TEST_PRODUCTS.map((n, i) => ({
              codigo: String(i + 1),
              nombre: n,
              label: `${i + 1} · ${n}`,
            }));

        console.log("Productos (testing):", PRODUCTS.slice(0, 5));
      } catch (e) {
        console.warn(
          "productos_mas_formato.json no disponible o mal formado:",
          e
        );
        // fallback (igual que antes), generando objetos
        PRODUCTS = TEST_PRODUCTS.map((n, i) => ({
          codigo: String(i + 1),
          nombre: n,
          label: `${i + 1} · ${n}`,
        }));
      }
      return;
    }

    // Producción
    try {
      const res = await fetch("productos_mas_formato.json", {
        cache: "no-store",
      });
      if (!res.ok)
        throw new Error("No se pudo cargar productos_mas_formato.json");
      const data = await res.json();
      PRODUCTS = toObjs(data);
    } catch (e) {
      console.warn(
        "productos_mas_formato.json no disponible o mal formado:",
        e
      );
      // fallback seguro con objetos
      PRODUCTS = TEST_PRODUCTS.map((n, i) => ({
        codigo: String(i + 1),
        nombre: n,
        label: `${i + 1} · ${n}`,
      }));
    }
    try {
      const res2 = await fetch("productos_mas_formato.json", {
        cache: "no-store",
      });
      if (res2.ok) {
        const data2 = await res2.json();
        const objs2 = toObjs(data2);
        DEFAULT_UXC_BY_NAME = new Map(
          objs2.map((o) => [o.nombre, Number(o.unidadesxformato) || 0])
        );
      }
    } catch (_) {
      // si no existe, dejamos el mapa vacío; la UI sigue editable
    }
  }
  function getDefaultUxc(nombre) {
    // 1) preferimos el mapa construido desde productos_mas_formato.json
    const m = DEFAULT_UXC_BY_NAME.get(nombre);
    if (Number.isFinite(m) && m > 0) return m;

    // 2) fallback: si el objeto del combo trae unidadesxformato
    const it = (PRODUCTS || []).find((p) => p && p.nombre === nombre);
    const n = Number(it?.unidadesxformato);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function getLineCodigoByIdx(lineIdx) {
    const lines = getLinesFromPayload(lastServerJson);
    if (!Array.isArray(lines) || !lines[lineIdx]) return "";
    const raw =
      lines[lineIdx]?.codigo ??
      lines[lineIdx]?.code ??
      lines[lineIdx]?.codigo_proveedor ??
      null;
    return raw != null ? String(raw).trim() : "";
  }

  // Botones → cada uno abre su input correspondiente
  BTN_CAM.addEventListener("click", () => INPUT_CAM.click());
  BTN_EX.addEventListener("click", () => INPUT_PICK.click());

  // Lectura de archivos
  INPUT_CAM.addEventListener("change", () => {
    const f = INPUT_CAM.files?.[0];
    if (f) handleFile(f);
    INPUT_CAM.value = "";
  });
  INPUT_PICK.addEventListener("change", () => {
    const f = INPUT_PICK.files?.[0];
    if (f) handleFile(f);
    INPUT_PICK.value = "";
  });

  // Drag & Drop
  ["dragenter", "dragover"].forEach((ev) =>
    DZ.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        DZ.classList.add("drag");
      },
      false
    )
  );
  ["dragleave", "drop"].forEach((ev) =>
    DZ.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        DZ.classList.remove("drag");
      },
      false
    )
  );
  DZ.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  BTN_RS.addEventListener("click", resetUI);

  async function handleFile(f) {
    resetUI(false);
    FILE_N.textContent = f.name || "imagen";
    FILE_I.textContent = `${(f.size / 1024 / 1024).toFixed(2)} MB · ${
      f.type || "image/*"
    }`;

    // Vista previa
    const url = URL.createObjectURL(f);
    THUMB.innerHTML = "";
    if (isImageFile(f)) {
      const img = document.createElement("img");
      img.src = url;
      THUMB.appendChild(img);
    } else if (isPdfFile(f)) {
      const pill = document.createElement("div");
      pill.textContent = "📄 PDF listo";
      pill.style.display = "grid";
      pill.style.placeItems = "center";
      pill.style.width = "100%";
      pill.style.height = "100%";
      pill.style.fontWeight = "800";
      THUMB.appendChild(pill);
    } else {
      const pill = document.createElement("div");
      pill.textContent = "Archivo no soportado";
      pill.style.display = "grid";
      pill.style.placeItems = "center";
      pill.style.width = "100%";
      pill.style.height = "100%";
      THUMB.appendChild(pill);
    }

    // Optimizar
    try {
      if (isImageFile(f)) {
        STATUS.textContent = "🛠️ Optimizando imagen...";
        fileOptimizada = await optimizarImagen(f, 1600, 0.85);
        STATUS.textContent = `✅ Lista (${(
          fileOptimizada.size /
          1024 /
          1024
        ).toFixed(2)} MB)`;
      } else if (isPdfFile(f)) {
        fileOptimizada = f;
        STATUS.textContent = "✅ PDF listo";
      } else {
        throw new Error("Tipo de archivo no soportado");
      }
      BTN_GO.disabled = false;
      BTN_RS.disabled = false;
    } catch (err) {
      console.error(err);
      STATUS.textContent = "❌ Error al procesar el archivo";
      STATUS.className = "status err";
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function resetUI(clearThumb = true) {
    reviewDocIndex = 0;

    STATUS.textContent = "";
    STATUS.className = "status";
    BTN_GO.disabled = true;
    BTN_RS.disabled = true;

    if (clearThumb) {
      THUMB.innerHTML = '<span class="hint">Sin archivo</span>';
      FILE_N.textContent = "—";
      FILE_I.textContent = "Max 10MB · Se optimiza antes de enviar";
    }
    fileOptimizada = null;

    // Limpiamos ambos inputs por si acaso
    if (INPUT_CAM) INPUT_CAM.value = "";
    if (INPUT_PICK) INPUT_PICK.value = "";

    BTN_CONFIRM_JSON.disabled = true;
    lastServerJson = null;
    // limpiar UI de revisión
    OCR_LIST.innerHTML = "";
    OCR_STATUS.textContent = "";
    OCR_REVIEW.hidden = true;

    BTN_CONFIRM_JSON.classList.remove("sec"); // vuelve a amarillo
  }

  // 🔧 Limpia valores que puedan venir con "=" desde n8n
  function cleanVal(v, fallback = "") {
    if (v == null) return fallback;
    if (typeof v === "string") {
      const t = v.trim().replace(/^=+/, "");
      return t || fallback;
    }
    return v;
  }

  // Envío
  BTN_GO.addEventListener("click", submit);

  async function submit() {
    if (!fileOptimizada) return;

    BTN_GO.disabled = true;
    STATUS.textContent = "🚀 Subiendo archivo...";

    // Sugerencia: nombre limpio + timestamp
    const ts = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14); // yyyyMMddHHmmss
    const safeName = (fileOptimizada.name || "albaran.jpg").replace(
      /\s+/g,
      "_"
    );
    const finalName = `${ts}_${safeName}`;

    // Importante: el Webhook espera el binario en el campo "data"
    const fd = new FormData();
    fd.append("data", fileOptimizada, finalName);

    // Metadatos opcionales
    fd.append("almacen", "Almacén Experiencia 43");
    fd.append("fecha_pago", todayISO);
    fd.append("filename", finalName);

    try {
      // 🧪 TESTING: no llamar al webhook; simular OCR/mapeo
      if (TESTING_WEBHOOKS) {
        STATUS.textContent = "🧪 Modo testing: simulando OCR…";
        await delay(600);
        const payload = makeFakeMappingPayload();
        lastServerJson = payload;
        tryInitOcrReview(payload);
        STATUS.textContent = "✅ Subida simulada";
        STATUS.className = "status ok";
        BTN_RS.disabled = false;
        return; // <— evitamos la llamada real
      }
      const res = await fetch(N8N_UPLOAD_URL, { method: "POST", body: fd });

      if (res.ok) {
        // 👇 Parseo robusto: JSON si es application/json; si no, intento desde texto
        const contentType = (
          res.headers.get("content-type") || ""
        ).toLowerCase();
        let payload = null;

        if (contentType.includes("application/json")) {
          payload = await res.json().catch(() => null);
        } else {
          const text = await res.text().catch(() => "");
          payload = safeParsePossiblyWrappedArray(text);
        }

        // Si sigue sin parsear, no podemos renderizar
        if (!payload) {
          console.warn("No se pudo parsear la respuesta del webhook");
          STATUS.textContent =
            "⚠️ Respuesta no reconocida. No se pudo generar la revisión.";
          STATUS.className = "status err";
          BTN_RS.disabled = false;
          return;
        }

        lastServerJson = payload;
        tryInitOcrReview(payload); // si es payload de mapeo, muestra dropdowns

        STATUS.textContent = "✅ Subida correctamente";
        STATUS.className = "status ok";
        BTN_RS.disabled = false;
      } else {
        STATUS.textContent = `❌ Error ${res.status || ""}`;
        STATUS.className = "status err";
        BTN_GO.disabled = false;
        BTN_CONFIRM_JSON.disabled = true;
        lastServerJson = null;
      }
    } catch (err) {
      console.error(err);
      STATUS.textContent = "❌ Error de red. Intenta de nuevo.";
      STATUS.className = "status err";
      BTN_GO.disabled = false;
      BTN_CONFIRM_JSON.disabled = true;
      lastServerJson = null;
    }
  }

  BTN_CONFIRM_JSON.addEventListener("click", confirmarJson);

  // Quita líneas duplicadas de un texto (por si n8n responde 1 línea por item)
  function collapseDuplicateLines(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const seen = new Set();
    const uniq = [];
    for (const l of lines) {
      if (!seen.has(l)) {
        seen.add(l);
        uniq.push(l);
      }
    }
    return uniq.join("\n");
  }

  // Muestra la respuesta del webhook en la zona de productos y recarga
  function showResponseInReviewAndReload(text, delayMs = 2500) {
    let pretty = text || "";
    // Si viniera JSON, prettify (no suele ser tu caso, es text/plain)
    try {
      const obj = JSON.parse(pretty);
      pretty = JSON.stringify(obj, null, 2);
    } catch (_) {}

    OCR_REVIEW.hidden = false;
    OCR_LIST.innerHTML = `
    <pre style="
      white-space: pre-wrap;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 12px;
      margin: 0;
      overflow:auto;
      max-height: 50vh;
    ">${pretty}</pre>
  `;
    OCR_STATUS.textContent = "🔄 Refrescando...";
    OCR_REVIEW.scrollIntoView({ behavior: "smooth", block: "start" });

    setTimeout(() => location.reload(), delayMs);
  }

  async function confirmarJson() {
    if (!lastServerJson) return;

    BTN_CONFIRM_JSON.disabled = true;
    BTN_CONFIRM_JSON.classList.add("sec"); // cambia a oscuro al enviar

    STATUS.textContent = "🔁 Enviando confirmación...";

    try {
      // 🧪 TESTING: simular confirmación sin llamar a n8n
      if (TESTING_WEBHOOKS) {
        // Normaliza UXC también en testing
        normalizeUxcTouchBeforePost();

        // Muestra el JSON que realmente se enviaría
        const salida = JSON.stringify(lastServerJson, null, 2);

        STATUS.textContent = "✅ Confirmación (testing)";
        STATUS.className = "status ok";

        // Enséñalo en la zona de revisión y (si quieres) recarga después
        // sube el delay para que te dé tiempo a copiarlo
        showResponseInReviewAndReload(salida, 4000);
        return; // <— no llamamos a n8n en testing
      }
      normalizeUxcTouchBeforePost();

      const res = await fetch(N8N_CONFIRM_DATA, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(lastServerJson),
      });

      const confirmText = await res.text();

      if (res.ok) {
        STATUS.textContent = "✅ Confirmación enviada";
        STATUS.className = "status ok";

        // n8n pudo responder texto repetido (1 por item) -> deduplicamos
        const clean = collapseDuplicateLines(confirmText || "");

        // Mostrar en la sección de productos y refrescar
        showResponseInReviewAndReload(clean, 2500);
      } else {
        STATUS.textContent = `❌ Error al confirmar ${res.status || ""}`;
        STATUS.className = "status err";
        BTN_CONFIRM_JSON.disabled = false;
      }
    } catch (err) {
      console.error(err);
      STATUS.textContent = "❌ Error de red al confirmar.";
      STATUS.className = "status err";
      BTN_CONFIRM_JSON.disabled = false;
    }
  }

  // Optimización: redimensiona con canvas y exporta a JPEG
  function optimizarImagen(file, maxDim = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const fr = new FileReader();

      fr.onload = () => {
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));

      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", {
          alpha: false,
          desynchronized: true,
        });
        if (ctx.imageSmoothingEnabled !== undefined)
          ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, w, h);

        c.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("toBlob() devolvió null"));
            const out = new File([blob], (file.name || "albaran") + ".jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(out);
          },
          "image/jpeg",
          quality
        );
      };

      fr.readAsDataURL(file);
    });
  }

  // Intenta extraer un JSON válido de una cadena que puede venir con "Array:" u otro ruido
  function safeParsePossiblyWrappedArray(text) {
    if (!text || typeof text !== "string") return null;

    // Caso simple: empieza por "[" o "{"
    const trimmed = text.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {}
    }

    // Caso con "Array:" -> intentamos recortar desde el primer "[" hasta el último "]"
    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first !== -1 && last !== -1 && last > first) {
      const inner = text.slice(first, last + 1).trim();
      try {
        return JSON.parse(inner);
      } catch (_) {}
    }

    // Último intento: quitar "Array:" y volver a probar
    const cleaned = text.replace(/Array\s*:/g, "").trim();
    if (cleaned.startsWith("[") || cleaned.startsWith("{")) {
      try {
        return JSON.parse(cleaned);
      } catch (_) {}
    }

    return null;
  }

  function looksLikeMappingPayload(data) {
    // Forma A: [{ lines: [...] }]
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      data[0] &&
      Array.isArray(data[0].lines)
    ) {
      return { ok: true, shape: "wrapped" };
    }
    // Forma B: [[ {...}, {...} ]]
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      Array.isArray(data[0]) &&
      data[0].length > 0 &&
      typeof data[0][0] === "object"
    ) {
      return { ok: true, shape: "array0" };
    }
    // Forma C: [{...}, {...}]  (array plano de líneas)
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      typeof data[0] === "object" &&
      !Array.isArray(data[0])
    ) {
      return { ok: true, shape: "flat" };
    }
    return { ok: false, shape: null };
  }

  function tryInitOcrReview(data) {
    const probe = looksLikeMappingPayload(data);
    if (!probe.ok) {
      BTN_CONFIRM_JSON.disabled = false;
      return;
    }
    reviewDocIndex = 0;
    const lines = getLinesFromPayload(data);
    renderOcrUI({ lines });
  }

  function getLinesFromPayload(data) {
    const probe = looksLikeMappingPayload(data);
    if (!probe.ok) return [];

    if (probe.shape === "wrapped") {
      return data[reviewDocIndex] && Array.isArray(data[reviewDocIndex].lines)
        ? data[reviewDocIndex].lines
        : [];
    }
    if (probe.shape === "array0") {
      return Array.isArray(data[0]) ? data[0] : [];
    }
    if (probe.shape === "flat") {
      return Array.isArray(data) ? data : [];
    }
    return [];
  }
  function normalizeUxcTouchBeforePost() {
    const lines = getLinesFromPayload(lastServerJson);
    lines.forEach((ln) => {
      const n = parseInt(String(ln?.uxc_touch ?? ""), 10);
      ln.uxc_touch = Number.isFinite(n) && n >= 0 ? n : 0;
    });
  }

  function renderOcrUI(doc) {
    OCR_REVIEW.hidden = false;
    OCR_LIST.innerHTML = "";
    OCR_STATUS.textContent = "";

    // --- 1) Fila de cabecera (solo desktop; en móvil se oculta por CSS) ---
    const head = document.createElement("div");
    head.className = "row head";

    const h1 = document.createElement("div");
    h1.className = "cell desc";
    h1.textContent = "Desc. Proveedor";

    const h3 = document.createElement("div");
    h3.className = "cell extra";
    h3.style.display = "flex";
    h3.style.justifyContent = "flex-start";
    h3.textContent = "Buscador de productos";

    const h4 = document.createElement("div");
    h4.className = "cell extra";
    h4.textContent = "Cantidad Envase (Kg/L/UDS)";

    head.appendChild(h1);
    head.appendChild(h3);
    head.appendChild(h4);
    OCR_LIST.appendChild(head);

    // --- 2) Filas de datos ---
    const lines = Array.isArray(doc.lines) ? doc.lines : [];
    lines.forEach((ln, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      let uxcInput; // referencia a la celda UXC de esta fila

      // Columna 1: descripción
      const cDesc = document.createElement("div");
      cDesc.className = "cell desc";
      cDesc.setAttribute("data-label", "Desc. Proveedor");
      cDesc.textContent = cleanVal(ln.descripcion, "— sin descripción —");

      // Columna 3: dropdown "Buscador de productos" (de momento vacío)
      const cExtra = document.createElement("div");
      cExtra.className = "cell extra";
      cExtra.setAttribute("data-label", "Extra");

      // Ensamblado de la fila
      row.appendChild(cDesc);

      // row.appendChild(cExtra);
      cExtra.className = "cell extra";
      cExtra.setAttribute("data-label", "Buscador de productos");

      const combo = document.createElement("div");
      combo.className = "combo";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "combo-input";
      input.placeholder = "Busca producto…";

      // Botón de lupa para reabrir búsqueda cuando hay selección
      const btnLupa = document.createElement("button");
      btnLupa.type = "button";
      btnLupa.className = "icon-btn search-toggle";
      btnLupa.title = "Cambiar producto";
      btnLupa.setAttribute("aria-label", "Cambiar producto");
      btnLupa.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2z"/>
    </svg>`;
      btnLupa.addEventListener("click", () => {
        if (!locked) return;
        locked = false;
        input.readOnly = false;
        input.focus();
        openListWith(PRODUCTS);
        updateSearchToggleVisibility();
      });

      const list = document.createElement("div");
      list.className = "combo-list";
      list.hidden = true;

      // Estado: una vez seleccionado, bloqueamos el buscador
      let locked = false;
      function updateSearchToggleVisibility() {
        btnLupa.style.display = locked ? "inline-flex" : "none";
      }

      function renderList(items) {
        list.innerHTML = "";
        const toShow = items.slice(0, 100); // límite defensivo
        if (toShow.length === 0) {
          const empty = document.createElement("div");
          empty.className = "combo-empty";
          empty.textContent = "Sin resultados";
          list.appendChild(empty);
          return;
        }
        toShow.forEach((it) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "combo-item";
          btn.textContent = it.codigo
            ? `${it.codigo} · ${it.nombre}`
            : it.nombre; // <-- etiqueta "codigo · nombre"
          btn.addEventListener("click", () => {
            input.value = it.label; // <-- mantenemos el nombre en input
            input.readOnly = true;
            locked = true;
            list.hidden = true;
            setSeleccionForLine(idx, { nombre: it.nombre, codigo: it.codigo }); // <-- guardamos el nombre (compat)y

            refreshConfirmEnable();
            updateSearchToggleVisibility();
            // Prefill UXC por defecto solo si no hay valor manual
            const def = getDefaultUxc(it.nombre);
            if (
              def > 0 &&
              uxcInput &&
              (!uxcInput.value || uxcInput.value === "0")
            ) {
              uxcInput.value = String(def);
              setUxcForLine(idx, def);
            }
            // Marcar como reconocido y asociar codigo_touch si está vacío
            const lineCode = getLineCodigoByIdx(idx);
            if (it) {
              it.reconocido = true;
              if (
                (it.codigo_touch == null || it.codigo_touch === "") &&
                lineCode
              ) {
                it.codigo_touch = String(lineCode);
              }
            }
            // ⬅️ Reflejar también en el JSON que se envía (lastServerJson)
            if (lineCode) {
              patchLine(idx, {
                reconocido: true,
                codigo_touch: String(lineCode),
              });
            } else {
              patchLine(idx, { reconocido: true });
            }
          });
          list.appendChild(btn);
        });
      }

      function openListWith(items) {
        renderList(items);
        list.hidden = false;
      }

      input.addEventListener("focus", () => {
        if (!locked) openListWith(PRODUCTS);
      });

      input.addEventListener("input", () => {
        if (locked) return;
        const q = input.value.trim();
        if (!q) {
          openListWith(PRODUCTS);
          return;
        }

        const qn = norm(q);
        const filtered = PRODUCTS.filter(
          (it) =>
            String(it.codigo).toLowerCase().includes(qn) ||
            norm(it.nombre).includes(qn) // <-- búsqueda por código
        );
        openListWith(filtered);
      });

      function openListWith(items) {
        renderList(items);
        list.hidden = false;
      }
      /*
      const currentSel = cleanVal(ln.seleccionado, "");
      if (currentSel) {
        input.value = currentSel;
        input.readOnly = true;
        locked = true;
      } */
      input.addEventListener("focus", () => {
        if (!locked) openListWith(PRODUCTS);
      });
      input.addEventListener("click", () => {
        if (locked) {
          locked = false;
          input.readOnly = false;
          // coloca el cursor al final: sensación de "está listo para editar"
          try {
            input.setSelectionRange(input.value.length, input.value.length);
          } catch {}
          openListWith(PRODUCTS);
          updateSearchToggleVisibility();
          return;
        }
        if (list.hidden) openListWith(PRODUCTS);
      });

      // cerrar al clicar fuera (scoped al combo de esta fila)
      document.addEventListener("click", (e) => {
        if (!combo.contains(e.target)) list.hidden = true;
      });

      combo.appendChild(input);
      combo.appendChild(btnLupa); // lupa al lado del input
      combo.appendChild(list);
      updateSearchToggleVisibility();

      cExtra.appendChild(combo);

      // insertar en la fila antes de montar en el DOM
      row.appendChild(cExtra);
      // --- Columna UXC (nueva) ---
      const cUxc = document.createElement("div");
      cUxc.className = "cell extra";
      cUxc.setAttribute("data-label", "UXC");

      uxcInput = document.createElement("input");
      uxcInput.type = "number";
      uxcInput.className = "combo-input"; // reusa estilo del input del combo
      uxcInput.placeholder = "";
      uxcInput.min = "0";
      uxcInput.step = "1";
      uxcInput.inputMode = "numeric";

      // Solo permitir enteros >= 0 en UI (pero dejar vacío posible)
      uxcInput.addEventListener("input", () => {
        uxcInput.value = uxcInput.value.replace(/[^\d]/g, "");
      });

      // Al salir, persistimos en el payload (vacío/NaN -> 0)
      uxcInput.addEventListener("blur", () => {
        const n = parseInt(uxcInput.value, 10);
        const val = Number.isFinite(n) && n >= 0 ? n : 0;

        // 1) Persistir en el payload (uxc_touch)
        setUxcForLine(idx, val);

        // 2) Actualizar catálogo: unidadesxformato del producto seleccionado
        const selName = cleanVal(
          getLinesFromPayload(lastServerJson)[idx]?.seleccionado,
          ""
        );
        if (selName) {
          const prod = (PRODUCTS || []).find((p) => p && p.nombre === selName);
          if (prod) {
            prod.unidadesxformato = val;
            // refrescar el mapa de defecto para futuras filas
            DEFAULT_UXC_BY_NAME.set(prod.nombre, val);
          }
        }
        // ⬅️ Reflejar también en la línea del JSON
        patchLine(idx, { unidadesxformato: val });
      });

      cUxc.appendChild(uxcInput);
      row.appendChild(cUxc);

      // Si la fila ya venía con selección, prefiere el defecto de catálogo
      const currentSel = cleanVal(ln.seleccionado, "");

      if (currentSel) {
        const def = getDefaultUxc(currentSel);
        if (def > 0) {
          uxcInput.value = String(def);
          setUxcForLine(idx, def);
        }
      }
      // Autoselect por codigo del payload si coincide con codigo_touch de algún producto
      if (!cleanVal(ln.seleccionado, "")) {
        const lineCode = getLineCodigoByIdx(idx);
        if (lineCode) {
          const prodMatch = (PRODUCTS || []).find(
            (p) =>
              p &&
              p.codigo_touch != null &&
              String(p.codigo_touch) === String(lineCode)
          );
          if (prodMatch) {
            // Fija selección en UI y en payload
            input.value = prodMatch.label;
            input.readOnly = true;
            locked = true;
            setSeleccionForLine(idx, {
              nombre: prodMatch.nombre,
              codigo: prodMatch.codigo,
            });
            refreshConfirmEnable();
            updateSearchToggleVisibility();

            // UXC por defecto si procede
            const def = getDefaultUxc(prodMatch.nombre);
            if (
              def > 0 &&
              uxcInput &&
              (!uxcInput.value || uxcInput.value === "0")
            ) {
              uxcInput.value = String(def);
              setUxcForLine(idx, def);
            }

            // ✅ Marcar reconocido en catálogo y en la línea del JSON
            prodMatch.reconocido = true;
            patchLine(idx, {
              reconocido: true,
              codigo_touch: String(lineCode),
            });
          }
        }
      }

      OCR_LIST.appendChild(row);
    });

    refreshConfirmEnable();
  }

  function setSeleccionForLine(lineIdx, value) {
    const probe = looksLikeMappingPayload(lastServerJson);
    if (!probe.ok) return;

    // Soporta string legacy u objeto { nombre, codigo }
    let selNombre = "";
    let selCodigo = "";
    if (value && typeof value === "object") {
      selNombre = String(value.nombre || value.label || "").trim();
      selCodigo = String(value.codigo || "").trim();
    } else {
      selNombre = String(value || "").trim();
      selCodigo = "";
    }

    function assignLine(arr) {
      if (!Array.isArray(arr) || !arr[lineIdx]) return;
      arr[lineIdx].seleccionado = selNombre || "";
      if (selCodigo) arr[lineIdx].codigo_seleccionado = selCodigo; // <-- añade el código al payload
    }

    if (probe.shape === "wrapped") {
      const doc = lastServerJson[reviewDocIndex];
      if (!doc || !Array.isArray(doc.lines) || !doc.lines[lineIdx]) return;
      doc.lines[lineIdx].seleccionado = selNombre || "";
      if (selCodigo) doc.lines[lineIdx].codigo_seleccionado = selCodigo;
    } else if (probe.shape === "array0") {
      assignLine(lastServerJson[0]);
    } else if (probe.shape === "flat") {
      assignLine(lastServerJson);
    }
  }
  function setUxcForLine(lineIdx, value) {
    const n = parseInt(value, 10);
    const val = Number.isFinite(n) && n >= 0 ? n : 0;

    const probe = looksLikeMappingPayload(lastServerJson);
    if (!probe.ok) return;

    if (probe.shape === "wrapped") {
      const doc = lastServerJson[reviewDocIndex];
      if (!doc || !Array.isArray(doc.lines) || !doc.lines[lineIdx]) return;
      doc.lines[lineIdx].uxc_touch = val;
    } else if (probe.shape === "array0") {
      const arr = lastServerJson[0];
      if (!Array.isArray(arr) || !arr[lineIdx]) return;
      arr[lineIdx].uxc_touch = val;
    } else if (probe.shape === "flat") {
      const arr = lastServerJson;
      if (!Array.isArray(arr) || !arr[lineIdx]) return;
      arr[lineIdx].uxc_touch = val;
    }
  }

  function patchLine(lineIdx, patch) {
    const probe = looksLikeMappingPayload(lastServerJson);
    if (!probe.ok || !patch) return;

    const apply = (ln) => {
      if (!ln || typeof ln !== "object") return;
      Object.keys(patch).forEach((k) => {
        ln[k] = patch[k];
      });
    };

    if (probe.shape === "wrapped") {
      const doc = lastServerJson[reviewDocIndex];
      if (doc && Array.isArray(doc.lines) && doc.lines[lineIdx]) {
        apply(doc.lines[lineIdx]);
      }
    } else if (probe.shape === "array0") {
      const arr = lastServerJson[0];
      if (Array.isArray(arr) && arr[lineIdx]) apply(arr[lineIdx]);
    } else if (probe.shape === "flat") {
      const arr = lastServerJson;
      if (Array.isArray(arr) && arr[lineIdx]) apply(arr[lineIdx]);
    }
  }

  function allLinesSelected() {
    const lines = getLinesFromPayload(lastServerJson);
    if (!lines.length) return false; // si no hay líneas, no habilitamos
    return lines.every((ln) => {
      const v = cleanVal(ln?.seleccionado, "");
      return v.length > 0;
    });
  }

  function refreshConfirmEnable() {
    const ready = allLinesSelected();
    BTN_CONFIRM_JSON.disabled = !ready;
    OCR_STATUS.textContent = ready
      ? "Listo para enviar."
      : "Selecciona una opción para cada línea.";
    OCR_STATUS.className = ready ? "status ok" : "status";
  }
})();

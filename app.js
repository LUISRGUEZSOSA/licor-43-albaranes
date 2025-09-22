const N8N_UPLOAD_URL = "https://growtur.app.n8n.cloud/webhook/upload-image";
const N8N_CONFIRM_DATA =
  "https://growtur.app.n8n.cloud/webhook/confirm-mapping";

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

  // Revisión de conceptos (nueva UI)
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

  function renderOcrUI(doc) {
    OCR_REVIEW.hidden = false;
    OCR_LIST.innerHTML = "";
    OCR_STATUS.textContent = "";

    const lines = Array.isArray(doc.lines) ? doc.lines : [];
    lines.forEach((ln, idx) => {
      const row = document.createElement("div");
      row.className = "row";

      // descripción
      const cDesc = document.createElement("div");
      cDesc.className = "cell desc";
      cDesc.textContent = cleanVal(ln.descripcion, "— sin descripción —");

      // dropdown
      const cMap = document.createElement("div");
      cMap.className = "cell map";
      const sel = document.createElement("select");
      sel.className = "map-select";

      // opciones desde nombre_map (preferente), fallback a opciones[].label
      const fromNombreMap = Array.isArray(ln.nombre_map) ? ln.nombre_map : [];
      let options = fromNombreMap.filter(
        (v) => v != null && String(v).trim() !== ""
      );
      if (options.length === 0 && Array.isArray(ln.opciones)) {
        options = ln.opciones
          .map((o) => o?.label)
          .filter((lab) => lab != null && String(lab).trim() !== "");
      }

      const currentSel = cleanVal(ln.seleccionado, "");
      const hasMany = options.length > 1;

      if (hasMany && !currentSel) {
        const optPH = document.createElement("option");
        optPH.value = "";
        optPH.textContent = "— Selecciona —";
        sel.appendChild(optPH);
      }

      options.forEach((label) => {
        const opt = document.createElement("option");
        opt.value = String(label);
        opt.textContent = String(label);
        sel.appendChild(opt);
      });

      // selección por defecto
      if (currentSel && options.includes(currentSel)) {
        sel.value = currentSel;
      } else if (options.length === 1) {
        sel.value = options[0] || "";
        setSeleccionForLine(idx, sel.value);
      } else {
        sel.value = ""; // placeholder si existe o quedará vacío
      }

      sel.addEventListener("change", () => {
        setSeleccionForLine(idx, sel.value);
        refreshConfirmEnable();
      });

      cMap.appendChild(sel);
      row.appendChild(cDesc);
      row.appendChild(cMap);
      OCR_LIST.appendChild(row);
    });

    refreshConfirmEnable();
  }

  function setSeleccionForLine(lineIdx, value) {
    const probe = looksLikeMappingPayload(lastServerJson);
    if (!probe.ok) return;

    if (probe.shape === "wrapped") {
      const doc = lastServerJson[reviewDocIndex];
      if (!doc || !Array.isArray(doc.lines) || !doc.lines[lineIdx]) return;
      doc.lines[lineIdx].seleccionado = value || "";
    } else if (probe.shape === "array0") {
      const arr = lastServerJson[0];
      if (!Array.isArray(arr) || !arr[lineIdx]) return;
      arr[lineIdx].seleccionado = value || "";
    } else if (probe.shape === "flat") {
      const arr = lastServerJson;
      if (!Array.isArray(arr) || !arr[lineIdx]) return;
      arr[lineIdx].seleccionado = value || "";
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

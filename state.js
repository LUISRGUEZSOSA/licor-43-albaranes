// state.js — constantes, flags, estado y helpers del payload/shape
(function (w) {
  const N8N_UPLOAD_URL = "https://growtur.app.n8n.cloud/webhook/upload-image";
  const N8N_CONFIRM_DATA =
    "https://growtur.app.n8n.cloud/webhook/confirm-mapping";
  const TESTING_PRODUCTS = true; // (mantén tus valores)
  const TESTING_WEBHOOKS = true; // (mantén tus valores)

  // Estado global
  let fileOptimizada = null;
  let lastServerJson = null;
  let reviewDocIndex = 0;

  // Helpers de forma/payload
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

  // Exponer API de estado
  w.State = {
    // constantes/flags
    N8N_UPLOAD_URL,
    N8N_CONFIRM_DATA,
    TESTING_PRODUCTS,
    TESTING_WEBHOOKS,
    // estado
    get fileOptimizada() {
      return fileOptimizada;
    },
    set fileOptimizada(v) {
      fileOptimizada = v;
    },
    get lastServerJson() {
      return lastServerJson;
    },
    set lastServerJson(v) {
      lastServerJson = v;
    },
    get reviewDocIndex() {
      return reviewDocIndex;
    },
    set reviewDocIndex(v) {
      reviewDocIndex = v;
    },
    // helpers forma/payload
    looksLikeMappingPayload,
    getLinesFromPayload,
    normalizeUxcTouchBeforePost,
    setSeleccionForLine,
    setUxcForLine,
    patchLine,
  };
})(window);

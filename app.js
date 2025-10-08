// app.js — arranque, DOM y wiring entre módulos
(function (w) {
  const U = w.Utils;
  const S = w.State;
  const C = w.Catalog;
  const O = w.OcrUI;
  const N = w.Net;

  // 1) DOM refs (idénticos a tus querySelector actuales)
  const DOM = {
    INPUT_CAM: document.getElementById("fileCamera"),
    INPUT_PICK: document.getElementById("filePicker"),
    DZ: document.getElementById("dropzone"),
    BTN_CAM: document.getElementById("btnCam"),
    BTN_EX: document.getElementById("btnExplorar"),
    BTN_GO: document.getElementById("btnEnviar"),
    BTN_RS: document.getElementById("btnReset"),
    STATUS: document.getElementById("status"),
    BTN_CONFIRM_JSON: document.getElementById("btnConfirmarJson"),
    THUMB: document.getElementById("thumb"),
    FILE_N: document.getElementById("fileName"),
    FILE_I: document.getElementById("fileInfo"),
    PILL_F: document.getElementById("pillFecha").querySelector("b"),
    OCR_REVIEW: document.getElementById("ocrReview"),
    OCR_LIST: document.getElementById("ocrList"),
    OCR_STATUS: document.getElementById("ocrStatus"),
  };

  // dar DOM a los módulos que lo necesitan
  O.setDOMRefs({
    OCR_REVIEW: DOM.OCR_REVIEW,
    OCR_LIST: DOM.OCR_LIST,
    OCR_STATUS: DOM.OCR_STATUS,
    BTN_CONFIRM_JSON: DOM.BTN_CONFIRM_JSON,
  });
  N.setDOMRefs({
    ...DOM,
    OCR_REVIEW: DOM.OCR_REVIEW,
    OCR_LIST: DOM.OCR_LIST,
    OCR_STATUS: DOM.OCR_STATUS,
    BTN_CONFIRM_JSON: DOM.BTN_CONFIRM_JSON,
  });

  // 2) Inicialización simple que tenías en app-testing.js
  const todayISO = new Date().toISOString().slice(0, 10);
  DOM.PILL_F.textContent = todayISO;

  // 3) Cargar catálogo
  C.loadProducts();

  // 4) Handlers (idénticos a los tuyos, solo referenciando módulos)
  DOM.BTN_CAM.addEventListener("click", () => DOM.INPUT_CAM.click());
  DOM.BTN_EX.addEventListener("click", () => DOM.INPUT_PICK.click());

  function resetUI(clearThumb = true) {
    S.reviewDocIndex = 0;
    DOM.STATUS.textContent = "";
    DOM.STATUS.className = "status";
    DOM.BTN_GO.disabled = true;
    DOM.BTN_RS.disabled = true;
    if (clearThumb) {
      DOM.THUMB.innerHTML = '<span class="hint">Sin archivo</span>';
      DOM.FILE_N.textContent = "—";
      DOM.FILE_I.textContent = "Max 10MB · Se optimiza antes de enviar";
    }
    S.fileOptimizada = null;
    if (DOM.INPUT_CAM) DOM.INPUT_CAM.value = "";
    if (DOM.INPUT_PICK) DOM.INPUT_PICK.value = "";
    DOM.BTN_CONFIRM_JSON.disabled = true;
    S.lastServerJson = null;
    DOM.OCR_LIST.innerHTML = "";
    DOM.OCR_STATUS.textContent = "";
    DOM.OCR_REVIEW.hidden = true;
    DOM.BTN_CONFIRM_JSON.classList.remove("sec");
  }

  DOM.BTN_RS.addEventListener("click", resetUI);

  function handleFile(f) {
    resetUI(false);
    DOM.FILE_N.textContent = f.name || "imagen";
    DOM.FILE_I.textContent = `${(f.size / 1024 / 1024).toFixed(2)} MB · ${
      f.type || "image/*"
    }`;

    const url = URL.createObjectURL(f);
    DOM.THUMB.innerHTML = "";
    if (U.isImageFile(f)) {
      const img = document.createElement("img");
      img.src = url;
      DOM.THUMB.appendChild(img);
    } else if (U.isPdfFile(f)) {
      const pill = document.createElement("div");
      pill.textContent = "📄 PDF listo";
      pill.style.cssText =
        "display:grid;place-items:center;width:100%;height:100%;font-weight:800;";
      DOM.THUMB.appendChild(pill);
    } else {
      const pill = document.createElement("div");
      pill.textContent = "Archivo no soportado";
      pill.style.cssText =
        "display:grid;place-items:center;width:100%;height:100%;";
      DOM.THUMB.appendChild(pill);
    }

    (async () => {
      try {
        if (U.isImageFile(f)) {
          DOM.STATUS.textContent = "🛠️ Optimizando imagen...";
          S.fileOptimizada = await U.optimizarImagen(f, 1600, 0.85);
          DOM.STATUS.textContent = `✅ Lista ${(
            S.fileOptimizada.size /
            1024 /
            1024
          ).toFixed(2)} MB`;
        } else if (U.isPdfFile(f)) {
          S.fileOptimizada = f;
          DOM.STATUS.textContent = "✅ PDF listo";
        } else {
          throw new Error("Tipo de archivo no soportado");
        }
        DOM.BTN_GO.disabled = false;
        DOM.BTN_RS.disabled = false;
      } catch (err) {
        console.error(err);
        DOM.STATUS.textContent = "❌ Error al procesar el archivo";
        DOM.STATUS.className = "status err";
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
  }

  DOM.INPUT_CAM.addEventListener("change", () => {
    const f = DOM.INPUT_CAM.files?.[0];
    if (f) handleFile(f);
    DOM.INPUT_CAM.value = "";
  });
  DOM.INPUT_PICK.addEventListener("change", () => {
    const f = DOM.INPUT_PICK.files?.[0];
    if (f) handleFile(f);
    DOM.INPUT_PICK.value = "";
  });

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) =>
    DOM.DZ.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        DOM.DZ.classList.add("drag");
      },
      false
    )
  );
  ["dragleave", "drop"].forEach((ev) =>
    DOM.DZ.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        DOM.DZ.classList.remove("drag");
      },
      false
    )
  );
  DOM.DZ.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  // Submit + Confirm
  DOM.BTN_GO.addEventListener("click", () => N.submit(todayISO));
  DOM.BTN_CONFIRM_JSON.addEventListener("click", N.confirmarJson);

  // Payload fake (solo testing) — usa tu mismo contenido actual
  window.makeFakeMappingPayload = function () {
    return [
      {
        lines: [
          {
            descripcion: "Licor 43 baristo 0.7",
            seleccionado: "",
            codigo: "1",
          },
          { descripcion: "Berezko 1", seleccionado: "", codigo: "2" },
          { descripcion: "QUESO PARMESANO", seleccionado: "", codigo: "3" },
        ],
      },
    ];
  };
})(window);

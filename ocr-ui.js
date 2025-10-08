// ocr-ui.js — renderiza la revisión OCR y gestiona interacciones de cada fila
(function (w) {
  const { norm, cleanVal } = w.Utils;
  const {
    lastServerJson,
    reviewDocIndex,
    getLinesFromPayload,
    setSeleccionForLine,
    setUxcForLine,
    patchLine,
  } = w.State;
  const { PRODUCTS, getDefaultUxc } = w.Catalog;

  // Referencias de DOM (se asignan en app.js)
  let DOM = {};
  function setDOMRefs(refs) {
    DOM = refs;
  }

  function allLinesSelected() {
    const lines = w.State.getLinesFromPayload(w.State.lastServerJson);
    if (!lines.length) return false;
    return lines.every((ln) => cleanVal(ln?.seleccionado, "").length > 0);
  }

  function refreshConfirmEnable() {
    const ready = allLinesSelected();
    DOM.BTN_CONFIRM_JSON.disabled = !ready;
    DOM.OCR_STATUS.textContent = ready
      ? "Listo para enviar."
      : "Selecciona una opción para cada línea.";
    DOM.OCR_STATUS.className = ready ? "status ok" : "status";
  }

  function getLineCodigoByIdx(lineIdx) {
    const lines = w.State.getLinesFromPayload(w.State.lastServerJson);
    if (!Array.isArray(lines) || !lines[lineIdx]) return "";
    const raw =
      lines[lineIdx]?.codigo ??
      lines[lineIdx]?.code ??
      lines[lineIdx]?.codigo_proveedor ??
      null;
    return raw != null ? String(raw).trim() : "";
  }

  function renderOcrUI(doc) {
    DOM.OCR_REVIEW.hidden = false;
    DOM.OCR_LIST.innerHTML = "";
    DOM.OCR_STATUS.textContent = "";

    // Cabecera
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
    DOM.OCR_LIST.appendChild(head);

    // Filas
    const lines = Array.isArray(doc.lines) ? doc.lines : [];
    lines.forEach((ln, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      let uxcInput;

      // Desc
      const cDesc = document.createElement("div");
      cDesc.className = "cell desc";
      cDesc.setAttribute("data-label", "Desc. Proveedor");
      cDesc.textContent = cleanVal(ln.descripcion, "— sin descripción —");

      // Combo
      const cExtra = document.createElement("div");
      cExtra.className = "cell extra";
      cExtra.setAttribute("data-label", "Buscador de productos");
      const combo = document.createElement("div");
      combo.className = "combo";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "combo-input";
      input.placeholder = "Busca producto…";

      const btnLupa = document.createElement("button");
      btnLupa.type = "button";
      btnLupa.className = "icon-btn search-toggle";
      btnLupa.title = "Cambiar producto";
      btnLupa.setAttribute("aria-label", "Cambiar producto");
      btnLupa.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2z"/></svg>`;

      const list = document.createElement("div");
      list.className = "combo-list";
      list.hidden = true;

      let locked = false;
      function updateSearchToggleVisibility() {
        btnLupa.style.display = locked ? "inline-flex" : "none";
      }

      function renderList(items) {
        list.innerHTML = "";
        const toShow = items.slice(0, 100);
        if (!toShow.length) {
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
            : it.nombre;
          btn.addEventListener("click", () => {
            input.value = it.label;
            input.readOnly = true;
            locked = true;
            list.hidden = true;
            w.State.setSeleccionForLine(idx, {
              nombre: it.nombre,
              codigo: it.codigo,
            });
            refreshConfirmEnable();
            updateSearchToggleVisibility();

            // Prefill UXC si procede
            const def = w.Catalog.getDefaultUxc(it.nombre);
            if (
              def > 0 &&
              uxcInput &&
              (!uxcInput.value || uxcInput.value === "0")
            ) {
              uxcInput.value = String(def);
              w.State.setUxcForLine(idx, def);
            }

            // Reconocido + codigo_touch si estaba vacío
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
            // Reflejar en JSON
            if (lineCode) {
              w.State.patchLine(idx, {
                reconocido: true,
                codigo_touch: String(lineCode),
              });
            } else {
              w.State.patchLine(idx, { reconocido: true });
            }
          });
          list.appendChild(btn);
        });
      }

      function openListWith(items) {
        renderList(items);
        list.hidden = false;
      }

      btnLupa.addEventListener("click", () => {
        if (!locked) return;
        locked = false;
        input.readOnly = false;
        input.focus();
        openListWith(w.Catalog.PRODUCTS);
        updateSearchToggleVisibility();
      });

      input.addEventListener("focus", () => {
        if (!locked) openListWith(w.Catalog.PRODUCTS);
      });
      input.addEventListener("input", () => {
        if (locked) return;
        const q = input.value.trim();
        if (!q) return openListWith(w.Catalog.PRODUCTS);
        const qn = w.Utils.norm(q);
        const filtered = w.Catalog.PRODUCTS.filter(
          (it) =>
            String(it.codigo).toLowerCase().includes(qn) ||
            w.Utils.norm(it.nombre).includes(qn)
        );
        openListWith(filtered);
      });

      document.addEventListener("click", (e) => {
        if (!combo.contains(e.target)) list.hidden = true;
      });

      combo.appendChild(input);
      combo.appendChild(btnLupa);
      combo.appendChild(list);
      updateSearchToggleVisibility();

      // Celda UXC
      const cUxc = document.createElement("div");
      cUxc.className = "cell extra";
      cUxc.setAttribute("data-label", "UXC");

      uxcInput = document.createElement("input");
      uxcInput.type = "number";
      uxcInput.className = "combo-input";
      uxcInput.placeholder = "";
      uxcInput.min = "0";
      uxcInput.step = "1";
      uxcInput.inputMode = "numeric";
      uxcInput.addEventListener("input", () => {
        uxcInput.value = uxcInput.value.replace(/[^\d]/g, "");
      });
      uxcInput.addEventListener("blur", () => {
        const n = parseInt(uxcInput.value, 10);
        const val = Number.isFinite(n) && n >= 0 ? n : 0;
        w.State.setUxcForLine(idx, val);
        const selName = w.Utils.cleanVal(
          w.State.getLinesFromPayload(w.State.lastServerJson)[idx]
            ?.seleccionado,
          ""
        );
        if (selName) {
          const prod = (w.Catalog.PRODUCTS || []).find(
            (p) => p && p.nombre === selName
          );
          if (prod) {
            prod.unidadesxformato = val;
            w.Catalog.DEFAULT_UXC_BY_NAME.set(prod.nombre, val);
          }
        }
        w.State.patchLine(idx, { unidadesxformato: val });
      });

      // Montaje
      row.appendChild(cDesc);
      cExtra.appendChild(combo);
      row.appendChild(cExtra);
      cUxc.appendChild(uxcInput);
      row.appendChild(cUxc);

      // Prefill si ya venía selección
      const currentSel = w.Utils.cleanVal(ln.seleccionado, "");
      if (currentSel) {
        const def = w.Catalog.getDefaultUxc(currentSel);
        if (def > 0) {
          uxcInput.value = String(def);
          w.State.setUxcForLine(idx, def);
        }
      }

      // Autoselect por codigo ↔ codigo_touch
      if (!w.Utils.cleanVal(ln.seleccionado, "")) {
        const lineCode = getLineCodigoByIdx(idx);
        if (lineCode) {
          const prodMatch = (w.Catalog.PRODUCTS || []).find(
            (p) =>
              p &&
              p.codigo_touch != null &&
              String(p.codigo_touch) === String(lineCode)
          );
          if (prodMatch) {
            input.value = prodMatch.label;
            input.readOnly = true;
            locked = true;
            w.State.setSeleccionForLine(idx, {
              nombre: prodMatch.nombre,
              codigo: prodMatch.codigo,
            });
            refreshConfirmEnable();
            updateSearchToggleVisibility();

            const def = w.Catalog.getDefaultUxc(prodMatch.nombre);
            if (
              def > 0 &&
              uxcInput &&
              (!uxcInput.value || uxcInput.value === "0")
            ) {
              uxcInput.value = String(def);
              w.State.setUxcForLine(idx, def);
            }
            prodMatch.reconocido = true;
            w.State.patchLine(idx, {
              reconocido: true,
              codigo_touch: String(lineCode),
            });
          }
        }
      }

      DOM.OCR_LIST.appendChild(row);
    });

    refreshConfirmEnable();
  }

  function tryInitOcrReview(data) {
    const probe = w.State.looksLikeMappingPayload(data);
    if (!probe.ok) {
      DOM.BTN_CONFIRM_JSON.disabled = false;
      return;
    }
    w.State.reviewDocIndex = 0;
    const lines = w.State.getLinesFromPayload(data);
    renderOcrUI({ lines });
  }

  // Exponer
  w.OcrUI = { setDOMRefs, renderOcrUI, tryInitOcrReview, refreshConfirmEnable };
})(window);

// network.js — envío al webhook y confirmación (testing / producción)
(function (w) {
  const U = w.Utils;
  const S = w.State;
  const C = w.Catalog;
  const O = w.OcrUI;

  let DOM = {};
  function setDOMRefs(refs) {
    DOM = refs;
  }

  function showResponseInReviewAndReload(text, delayMs = 2500) {
    let pretty = text || "";
    try {
      const obj = JSON.parse(pretty);
      pretty = JSON.stringify(obj, null, 2);
    } catch (_) {}
    DOM.OCR_REVIEW.hidden = false;
    DOM.OCR_LIST.innerHTML = `<pre style="
      white-space: pre-wrap;background: rgba(255,255,255,0.03);border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;padding: 12px;margin: 0;overflow:auto;max-height: 50vh;">${pretty}</pre>`;
    DOM.OCR_STATUS.textContent = "🔄 Refrescando...";
    DOM.OCR_REVIEW.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => location.reload(), delayMs);
  }

  async function submit(todayISO) {
    if (!S.fileOptimizada) return;
    DOM.BTN_GO.disabled = true;
    DOM.STATUS.textContent = "🚀 Subiendo archivo...";

    const ts = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14);
    const safeName = (S.fileOptimizada.name || "albaran.jpg").replace(
      /\s+/g,
      "_"
    );
    const finalName = `${ts}_${safeName}`;

    const fd = new FormData();
    fd.append("data", S.fileOptimizada, finalName);
    fd.append("almacen", "Almacén Experiencia 43");
    fd.append("fecha_pago", todayISO);
    fd.append("filename", finalName);

    try {
      if (S.TESTING_WEBHOOKS) {
        DOM.STATUS.textContent = "🧪 Modo testing: simulando OCR…";
        await U.delay(600);
        const payload = makeFakeMappingPayload(); // definido en app.js
        S.lastServerJson = payload;
        O.tryInitOcrReview(payload);
        DOM.STATUS.textContent = "✅ Subida simulada";
        DOM.STATUS.className = "status ok";
        DOM.BTN_RS.disabled = false;
        return;
      }

      const res = await fetch(S.N8N_UPLOAD_URL, { method: "POST", body: fd });
      if (res.ok) {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        let payload = null;
        if (ct.includes("application/json"))
          payload = await res.json().catch(() => null);
        else
          payload = U.safeParsePossiblyWrappedArray(
            await res.text().catch(() => "")
          );

        if (!payload) {
          DOM.STATUS.textContent =
            "⚠️ Respuesta no reconocida. No se pudo generar la revisión.";
          DOM.STATUS.className = "status err";
          DOM.BTN_RS.disabled = false;
          return;
        }

        S.lastServerJson = payload;
        O.tryInitOcrReview(payload);
        DOM.STATUS.textContent = "✅ Subida correctamente";
        DOM.STATUS.className = "status ok";
        DOM.BTN_RS.disabled = false;
      } else {
        DOM.STATUS.textContent = `❌ Error ${res.status || ""}`;
        DOM.STATUS.className = "status err";
        DOM.BTN_GO.disabled = false;
        DOM.BTN_CONFIRM_JSON.disabled = true;
        S.lastServerJson = null;
      }
    } catch (err) {
      console.error(err);
      DOM.STATUS.textContent = "❌ Error de red. Intenta de nuevo.";
      DOM.STATUS.className = "status err";
      DOM.BTN_GO.disabled = false;
      DOM.BTN_CONFIRM_JSON.disabled = true;
      S.lastServerJson = null;
    }
  }

  async function confirmarJson() {
    if (!S.lastServerJson) return;
    DOM.BTN_CONFIRM_JSON.disabled = true;
    DOM.BTN_CONFIRM_JSON.classList.add("sec");
    DOM.STATUS.textContent = "🔁 Enviando confirmación...";

    try {
      if (S.TESTING_WEBHOOKS) {
        S.normalizeUxcTouchBeforePost();

        // ⬇️ Persistir parches en backend (si existe)
        try {
          if (w.Backend && w.Backend.isEnabled && w.Backend.isEnabled()) {
            await w.Backend.persistPatches(w.Catalog.getAndClearPatches());
          }
        } catch (e) {
          console.warn(
            "No se pudieron guardar cambios en backend (testing):",
            e
          );
        }

        const salida = JSON.stringify(S.lastServerJson, null, 2);
        DOM.STATUS.textContent = "✅ Confirmación (testing)";
        DOM.STATUS.className = "status ok";
        showResponseInReviewAndReload(salida, 4000);
        return;
      }

      S.normalizeUxcTouchBeforePost();

      const res = await fetch(S.N8N_CONFIRM_DATA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(S.lastServerJson),
      });
      const txt = await res.text();
      if (res.ok) {
        // ⬇️ Persistir parches en backend (si existe)
        try {
          if (w.Backend && w.Backend.isEnabled && w.Backend.isEnabled()) {
            await w.Backend.persistPatches(w.Catalog.getAndClearPatches());
          }
        } catch (e) {
          console.warn("No se pudieron guardar cambios en backend (prod):", e);
        }

        DOM.STATUS.textContent = "✅ Confirmación enviada";
        DOM.STATUS.className = "status ok";
        showResponseInReviewAndReload(
          U.collapseDuplicateLines(txt || ""),
          2500
        );
      } else {
        DOM.STATUS.textContent = `❌ Error al confirmar ${res.status || ""}`;
        DOM.STATUS.className = "status err";
        DOM.BTN_CONFIRM_JSON.disabled = false;
      }
    } catch (err) {
      console.error(err);
      DOM.STATUS.textContent = "❌ Error de red al confirmar.";
      DOM.STATUS.className = "status err";
      DOM.BTN_CONFIRM_JSON.disabled = false;
    }
  }

  // Exponer
  w.Net = { setDOMRefs, submit, confirmarJson, showResponseInReviewAndReload };
})(window);

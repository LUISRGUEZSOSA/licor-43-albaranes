(function (w) {
  function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function isImageFile(f) {
    return (
      (f.type && f.type.startsWith("image/")) ||
      /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name || "")
    );
  }

  function isPdfFile(f) {
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
  }

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

  function cleanVal(v, fallback = "") {
    if (v == null) return fallback;
    if (typeof v === "string") {
      const t = v.trim().replace(/^=+/, "");
      return t || fallback;
    }
    return v;
  }

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

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  // Exponer utilidades
  w.Utils = {
    delay,
    isImageFile,
    isPdfFile,
    optimizarImagen,
    cleanVal,
    safeParsePossiblyWrappedArray,
    collapseDuplicateLines,
    norm,
  };
})(window);

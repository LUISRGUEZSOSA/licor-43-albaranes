const N8N_UPLOAD_URL = "https://growtur.app.n8n.cloud/webhook/upload-image"; // tu URL prod

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
  const OUT = document.getElementById("out");
  const THUMB = document.getElementById("thumb");
  const FILE_N = document.getElementById("fileName");
  const FILE_I = document.getElementById("fileInfo");
  const PILL_F = document.getElementById("pillFecha").querySelector("b");

  // Fecha de pago = hoy (ISO yyyy-mm-dd)
  const todayISO = new Date().toISOString().slice(0, 10);
  PILL_F.textContent = todayISO;

  // Estado local
  let fileOriginal = null;
  let fileOptimizada = null;

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
    fileOriginal = f;
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
      // Previsualización simple para PDF (píldora). Si quieres, podrías usar <embed>, pero mantiene esto ligero.
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
        // Para PDF no hay optimización: se sube tal cual.
        fileOptimizada = f;
        STATUS.textContent = "✅ PDF listo (sin optimizar)";
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
    STATUS.textContent = "";
    STATUS.className = "status";
    OUT.textContent = "";
    BTN_GO.disabled = true;
    BTN_RS.disabled = true;

    if (clearThumb) {
      THUMB.innerHTML = '<span class="hint">Sin archivo</span>';
      FILE_N.textContent = "—";
      FILE_I.textContent = "Max 10MB · Se optimiza antes de enviar";
    }
    fileOriginal = null;
    fileOptimizada = null;
    // Limpiamos ambos inputs por si acaso
    if (INPUT_CAM) INPUT_CAM.value = "";
    if (INPUT_PICK) INPUT_PICK.value = "";
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

    // Puedes seguir enviando metadatos; si los quieres usar en n8n, añade un "Set" antes de subir
    fd.append("almacen", "Almacén Experiencia 43");
    fd.append("fecha_pago", todayISO);
    fd.append("filename", finalName); // así lo mapeas fácil en n8n si quieres

    try {
      const res = await fetch(N8N_UPLOAD_URL, {
        method: "POST",
        body: fd,
      });

      // Tu workflow responde con JSON { ok, id, name, webViewLink }
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        OUT.textContent = "Tu albarán ha sido procesado correctamente";
        STATUS.textContent = "✅ Subida correctamente";
        STATUS.className = "status ok";
        BTN_RS.disabled = false;
      } else {
        // En error, mostramos información mínima para depurar
        const text = await res.text().catch(() => "");
        STATUS.textContent = `❌ Error ${res.status || ""}`;
        STATUS.className = "status err";
        OUT.textContent = text || "Se produjo un error al procesar el albarán.";
        BTN_GO.disabled = false;
      }
    } catch (err) {
      console.error(err);
      STATUS.textContent = "❌ Error de red. Intenta de nuevo.";
      STATUS.className = "status err";
      OUT.textContent = "No se pudo conectar con el servidor.";
      BTN_GO.disabled = false;
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
})();

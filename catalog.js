// catalog.js — carga de productos, mapa de UXC por nombre y helpers
(function (w) {
  const { TESTING_PRODUCTS } = w.State;

  // estado local del módulo
  let PRODUCTS = [];
  let DEFAULT_UXC_BY_NAME = new Map();

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
        PRODUCTS = objs.length ? objs : [];


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

  // Exponer
  w.Catalog = {
    get PRODUCTS() {
      return PRODUCTS;
    },
    set PRODUCTS(v) {
      PRODUCTS = v;
    },
    DEFAULT_UXC_BY_NAME,
    loadProducts,
    getDefaultUxc,
  };
})(window);

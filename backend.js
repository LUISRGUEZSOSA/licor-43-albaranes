// backend.js — Firestore compat: lectura, seeded inicial y parches granulares
(function (w) {
  let db = null;
  let enabled = false;

  function init() {
    try {
      if (!w.firebase || !w.firebase.firestore) return false;
      // Reutiliza el app inicializado por auth.js
      db = w.firebase.firestore();
      enabled = true;
      return true;
    } catch (e) {
      console.warn("[Backend] Firestore no disponible:", e);
      enabled = false;
      return false;
    }
  }

  async function readProducts() {
    if (!enabled) return null;
    const snap = await db.collection("productos").get();
    const out = [];
    snap.forEach((doc) => out.push(doc.data()));
    return out;
  }

  // Si la colección está vacía, sembramos exactamente los objetos dados
  async function upsertProducts(objs) {
    if (!enabled || !Array.isArray(objs) || !objs.length)
      return { ok: true, skipped: true };
    const batch = db.batch();
    for (const p of objs) {
      const key = p?.codigo ? "codigo" : "nombre";
      const keyValue = p?.[key];
      if (!keyValue) continue;
      const id = `${key}-${String(keyValue).replace(/[^\w.-]/g, "_")}`;
      const ref = db.collection("productos").doc(id);
      batch.set(ref, p, { merge: true });
    }
    await batch.commit();
    return { ok: true };
  }

  // patches: [{ key, keyValue, changes }]
  async function persistPatches(patches) {
    if (!enabled || !Array.isArray(patches) || patches.length === 0)
      return { ok: true, skipped: true };
    const batch = db.batch();

    for (const p of patches) {
      const { key, keyValue, changes } = p || {};
      if (!key || !keyValue || !changes || typeof changes !== "object")
        continue;

      let q = db.collection("productos").where(key, "==", keyValue).limit(1);
      const qs = await q.get();
      let ref = null;

      if (!qs.empty) {
        ref = qs.docs[0].ref;
      } else {
        const id = `${key}-${String(keyValue).replace(/[^\w.-]/g, "_")}`;
        ref = db.collection("productos").doc(id);
        batch.set(ref, { [key]: keyValue }, { merge: true });
      }
      batch.set(ref, changes, { merge: true });
    }

    await batch.commit();
    return { ok: true };
  }

  init();
  w.Backend = {
    isEnabled: () => enabled,
    readProducts,
    upsertProducts,
    persistPatches,
  };
})(window);

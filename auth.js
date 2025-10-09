(function (w) {
  // 1) Configura tu proyecto Firebase (USANDO TU CONFIG REAL)
  const firebaseConfig = {
    apiKey: "AIzaSyBZ_c3SkiHfmEq3DcCHaV-LsqVM3MTrY2g",
    authDomain: "albaranes-747a7.firebaseapp.com",
    projectId: "albaranes-747a7",
    storageBucket: "albaranes-747a7.firebasestorage.app",
    messagingSenderId: "334306476369",
    appId: "1:334306476369:web:37b08b0c83f98ef4835370",
    measurementId: "G-K08QBQ6WGP"
  };

  let app, auth;
  try {
    app = w.firebase.apps?.length
      ? w.firebase.app()
      : w.firebase.initializeApp(firebaseConfig);
    auth = w.firebase.auth();
    
    // ✅ Mantener sesión persistente (localStorage)
    try {
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      console.log("[Auth] Persistencia establecida en LOCAL");
    } catch (e) {
      console.warn("No se pudo establecer persistencia local:", e);
    }
  } catch (e) {
    console.error("Firebase init error:", e);
    // Fallback: deja visible tu app si falla Firebase (modo sin login)
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelector(".wrap")?.setAttribute("style", "display:block;");
      document.getElementById("authGate")?.setAttribute("style", "display:none;");
    });
    return;
  }

  // 2) Referencias DOM
  let WRAP, GATE, FORM, EMAIL, PASS, MSG, BTN_CREATE, BTN_GOOGLE;

  function qs(id) { return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", () => {
    WRAP = document.querySelector(".wrap");
    GATE = qs("authGate");
    FORM = qs("authForm");
    EMAIL = qs("authEmail");
    PASS = qs("authPass");
    MSG = qs("authMsg");
    BTN_CREATE = qs("authCreate");
    BTN_GOOGLE = qs("authGoogle");

    // Gate inicial: ocultar app hasta saber estado
    if (WRAP) WRAP.style.display = "none";
    if (GATE) GATE.style.display = "block";

    // 3) Listener de estado: muestra app si hay usuario
    auth.onAuthStateChanged((user) => {
      if (user) {
        if (GATE) GATE.style.display = "none";
        if (WRAP) WRAP.style.display = "grid"; // respeta tu layout
      } else {
        if (WRAP) WRAP.style.display = "none";
        if (GATE) GATE.style.display = "block";
      }
    });

    // 4) Login (email/password)
    if (FORM) {
      FORM.addEventListener("submit", async (e) => {
        e.preventDefault();
        MSG.textContent = "Accediendo...";
        MSG.className = "status";
        try {
          const email = (EMAIL?.value || "").trim();
          const pass = (PASS?.value || "").trim();
          if (!email || !pass) throw new Error("Email y contraseña requeridos");
          await auth.signInWithEmailAndPassword(email, pass);
          MSG.textContent = "✅ Acceso correcto";
          MSG.className = "status ok";
        } catch (err) {
          console.error(err);
          MSG.textContent = "❌ " + (err?.message || "No se pudo iniciar sesión");
          MSG.className = "status err";
        }
      });
    }

    // 5) Crear cuenta (email/password)
    if (BTN_CREATE) {
      BTN_CREATE.addEventListener("click", async () => {
        MSG.textContent = "Creando cuenta...";
        MSG.className = "status";
        try {
          const email = (EMAIL?.value || "").trim();
          const pass = (PASS?.value || "").trim();
          if (!email || !pass) throw new Error("Email y contraseña requeridos");
          await auth.createUserWithEmailAndPassword(email, pass);
          MSG.textContent = "✅ Cuenta creada";
          MSG.className = "status ok";
        } catch (err) {
          console.error(err);
          MSG.textContent = "❌ " + (err?.message || "No se pudo crear la cuenta");
          MSG.className = "status err";
        }
      });
    }

    // 6) Google Sign-In (opcional; activa el proveedor en Firebase)
    if (BTN_GOOGLE) {
      BTN_GOOGLE.addEventListener("click", async () => {
        try {
          const provider = new w.firebase.auth.GoogleAuthProvider();
          await auth.signInWithPopup(provider);
        } catch (err) {
          console.error(err);
          MSG.textContent = "❌ " + (err?.message || "No se pudo usar Google");
          MSG.className = "status err";
        }
      });
    }

    // 7) Logout opcional: window.logout = () => auth.signOut();
  });
})(window);

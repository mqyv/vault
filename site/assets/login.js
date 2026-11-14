/* Vault — page de connexion par clé.
   La forme de la clé est vérifiée ici, puis le service de licences dit si elle est bonne. L'appel se fait sans appareil :
   le service s'arrête avant de lier la clé à quoi que ce soit, il répond seulement où elle en est. */
(() => {
  const KEY_FORMAT = /^VAULT(?:-[A-Z0-9]{6}){4}$/;
  const CHECK_URL = "https://zjppxtnfohjvsjfqioqh.supabase.co/rest/v1/rpc/vault_licence_check";
  const PUBLIC_KEY = "sb_publishable_um7nFUOFF1T2qbzVsfQaow_SzIjrW9k"; // clé publique du service, faite pour être dans une page web
  const submit = document.querySelector('#form button[type="submit"]');

  /** Où en est la clé : "valid", "not_claimed", "revoked", "expired", "unknown", ou "offline" si le service ne répond pas. */
  async function checkKey(key) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(CHECK_URL, {
        method: "POST",
        headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ licence_key: key, device: "" }),
        signal: ctrl.signal
      });
      if (!res.ok) return "offline";
      const data = await res.json();
      // sans appareil, une clé active et activée s'arrête juste avant la liaison : c'est la réponse d'une bonne clé
      if (data && data.reason === "no_device") return "valid";
      return (data && data.reason) || "unknown";
    } catch {
      return "offline";
    } finally {
      clearTimeout(timer);
    }
  }
  const form = document.getElementById("form");
  const field = document.getElementById("field");
  const input = document.getElementById("key");
  const status = document.getElementById("status");
  const nav = document.getElementById("nav");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function show(kind, text) {
    status.hidden = false;
    status.innerHTML = "";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.innerHTML = "<i></i>" + (kind === "error" ? "Erreur" : kind === "info" ? "À activer" : "Valide");
    const msg = document.createElement("span");
    msg.textContent = text;
    status.append(badge, msg);
    field.classList.toggle("has-error", kind === "error");
    input.setAttribute("aria-invalid", kind === "error" ? "true" : "false");
  }
  function clear() {
    status.hidden = true;
    status.textContent = "";
    field.classList.remove("has-error");
    input.removeAttribute("aria-invalid");
  }

  // sans GSAP, le formulaire marche quand même, le robot reste simplement immobile
  const robot = window.gsap && window.createRobot ? window.createRobot(document.getElementById("robot")) : null;

  input.addEventListener("focus", () => robot && robot.lookAt(form));
  input.addEventListener("blur", () => robot && robot.release());
  input.addEventListener("input", () => {
    clear();
    if (robot && (robot.state === "happy")) robot.rest();
  });

  const MESSAGES = {
    valid: ["ok", "Clé reconnue. Bienvenue dans Vault."],
    not_claimed: ["info", "Ta clé est bonne, mais pas encore activée : tape /claim avec elle sur le serveur Discord."],
    revoked: ["error", "Cette clé a été retirée."],
    expired: ["error", "Ton accès est terminé. Tu peux en redemander un sur le serveur Discord."],
    unknown: ["error", "Cette clé n'est pas valide. Vérifie-la et réessaie."],
    offline: ["error", "Le service de clés ne répond pas. Réessaie dans un instant."]
  };

  let checking = false;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (checking) return;
    const key = input.value.trim().toUpperCase();
    if (!key) {
      show("error", "Entre ta clé pour continuer.");
      if (robot) robot.error();
      input.focus();
      return;
    }
    if (!KEY_FORMAT.test(key)) {
      show("error", MESSAGES.unknown[1]);
      if (robot) robot.error();
      input.focus();
      return;
    }

    checking = true;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Vérification…";
    const result = await checkKey(key);
    checking = false;
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    submit.textContent = "Entrer dans Vault";

    const [kind, text] = MESSAGES[result] || MESSAGES.unknown;
    show(kind, text);
    if (!robot) return;
    if (kind === "ok" || kind === "info") robot.success();
    else if (result === "offline") robot.rest(); // ce n'est pas la faute de la personne : le robot ne se fâche pas
    else robot.error();
  });

  /* ---------- entrée en scène ---------- */
  if (!window.gsap || reduce) return;
  gsap.from(nav, { yPercent: -180, opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.1 });
  gsap.from(".login .blob-wrap", { opacity: 0, scale: 0.7, duration: 2, stagger: 0.2, ease: "power2.out" });
  gsap.from("#robot", { y: 60, opacity: 0, duration: 1.1, ease: "power3.out", delay: 0.2 });
  gsap.from(".panel", { y: 40, opacity: 0, duration: 1, ease: "power3.out", delay: 0.35 });
  gsap.from(".panel > *", { y: 16, opacity: 0, duration: 0.8, stagger: 0.07, ease: "power3.out", delay: 0.5 });
  document.querySelectorAll(".blob").forEach(b => {
    gsap.to(b, {
      x: () => gsap.utils.random(-70, 70), y: () => gsap.utils.random(-50, 50), scale: () => gsap.utils.random(0.9, 1.15),
      duration: () => gsap.utils.random(9, 14), repeat: -1, yoyo: true, repeatRefresh: true, ease: "sine.inOut"
    });
  });
})();

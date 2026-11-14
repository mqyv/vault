/* Vault — le robot de la page de connexion.
   Il suit la souris, regarde le formulaire, se fâche sur une erreur, se réjouit sur une bonne clé,
   saute quand on clique dessus et tombe KO si on clique 6 fois en 2 secondes. */
(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function createRobot(svg) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const D = s => (reduce ? 0.001 : s); // en mouvement réduit, les changements d'état sont instantanés
    const $ = s => svg.querySelector(s);
    const el = {
      float: $("#float"), fall: $("#fall"), bot: $("#bot"), head: $("#head"), face: $("#face"),
      armL: $("#armL"), armR: $("#armR"), shackle: $("#shackle"), halo: $("#halo"),
      shadowLoop: $("#shadow-loop"), shadow: $("#shadow"), blush: $("#blush"),
      eyes: { normal: $("#eyes-normal"), angry: $("#eyes-angry"), happy: $("#eyes-happy"), x: $("#eyes-x") },
      mouth: { neutral: $("#mouth-neutral"), smile: $("#mouth-smile"), frown: $("#mouth-frown"), o: $("#mouth-o") }
    };

    // points de pivot, en coordonnées du dessin
    gsap.set(el.armL, { svgOrigin: "116 242" });
    gsap.set(el.armR, { svgOrigin: "284 242" });
    gsap.set(el.head, { svgOrigin: "200 204" });
    gsap.set(el.bot, { svgOrigin: "200 376" });
    gsap.set(el.fall, { svgOrigin: "252 376" });
    gsap.set([el.shadow, el.shadowLoop], { svgOrigin: "200 414" });
    gsap.set(el.shackle, { svgOrigin: "210 267" });

    /* ---------- visage ---------- */
    function face(eyes = "normal", mouth = "neutral", blush = 0) {
      Object.entries(el.eyes).forEach(([k, n]) => gsap.set(n, { autoAlpha: k === eyes ? 1 : 0 }));
      Object.entries(el.mouth).forEach(([k, n]) => gsap.set(n, { autoAlpha: k === mouth ? 1 : 0 }));
      gsap.to(el.blush, { opacity: blush, duration: D(0.25), overwrite: true });
      current.eyes = eyes;
    }
    const current = { eyes: "normal" };

    /* ---------- regard ---------- */
    const qx = gsap.quickTo(el.face, "x", { duration: D(0.35), ease: "power3" });
    const qy = gsap.quickTo(el.face, "y", { duration: D(0.35), ease: "power3" });
    const qr = gsap.quickTo(el.head, "rotation", { duration: D(0.5), ease: "power3" });
    const qhx = gsap.quickTo(el.head, "x", { duration: D(0.5), ease: "power3" });
    function aim(dx, dy) { qx(dx * 10); qy(dy * 6); qr(dx * 6); qhx(dx * 4); }

    let fixedTarget = null; // un élément à regarder (le formulaire), ou null pour suivre la souris
    function directionTo(x, y, spanX, spanY) {
      const r = el.head.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return [clamp((x - cx) / spanX, -1, 1), clamp((y - cy) / spanY, -1, 1)];
    }
    function lookAtElement(target) {
      const r = target.getBoundingClientRect();
      const [dx, dy] = directionTo(r.left + r.width / 2, r.top + r.height / 2, window.innerWidth * 0.22, window.innerHeight * 0.3);
      aim(dx, dy);
    }
    window.addEventListener("pointermove", e => {
      if (fixedTarget || state === "ko") return;
      const [dx, dy] = directionTo(e.clientX, e.clientY, window.innerWidth * 0.4, window.innerHeight * 0.4);
      aim(dx, dy);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (!fixedTarget && state !== "ko") aim(0, 0); });

    /* ---------- vie de tous les jours : flotter, respirer, cligner ---------- */
    if (!reduce) {
      gsap.to(el.float, { y: -12, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(el.shadowLoop, { scaleX: 0.86, opacity: 0.6, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(el.halo, { scale: 1.6, opacity: 0, duration: 1.6, ease: "power1.out", repeat: -1, svgOrigin: "200 38" });
      const blink = () => {
        if (state === "idle" && current.eyes === "normal") {
          gsap.to(el.eyes.normal, { scaleY: 0.08, svgOrigin: "200 135", duration: 0.07, yoyo: true, repeat: 1, ease: "power1.in" });
        }
        gsap.delayedCall(gsap.utils.random(2.4, 5.2), blink);
      };
      gsap.delayedCall(2, blink);
    }

    /* ---------- états ---------- */
    let state = "idle"; // idle | busy | happy | ko
    let tl = null;

    function rest(instant = false) {
      if (tl) { tl.kill(); tl = null; }
      const t = instant ? 0 : D(0.35);
      gsap.to(el.bot, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: t, ease: "power2.out", overwrite: true });
      gsap.to(el.fall, { rotation: 0, x: 0, duration: t, overwrite: true });
      gsap.to([el.armL, el.armR], { rotation: 0, duration: t, ease: "back.out(1.6)", overwrite: true });
      gsap.to(el.shackle, { y: 0, rotation: 0, duration: t, overwrite: true });
      gsap.to(el.shadow, { scaleX: 1, x: 0, opacity: 1, duration: t, overwrite: true });
      face("normal", "neutral", 0);
      state = "idle";
    }

    function jump() {
      if (state === "ko") return;
      rest(true);
      state = "busy";
      face("happy", "smile", 0.85);
      tl = gsap.timeline({ onComplete: () => rest() });
      tl.to(el.bot, { scaleY: 0.86, scaleX: 1.1, duration: D(0.12), ease: "power2.out" })
        .to(el.armL, { rotation: 150, duration: D(0.2), ease: "power2.out" }, "<")
        .to(el.armR, { rotation: -150, duration: D(0.2), ease: "power2.out" }, "<")
        .to(el.bot, { y: -96, scaleY: 1.06, scaleX: 0.95, duration: D(0.3), ease: "power2.out" })
        .to(el.shadow, { scaleX: 0.55, opacity: 0.4, duration: D(0.3), ease: "power2.out" }, "<")
        .to(el.bot, { y: 0, scaleY: 1, scaleX: 1, duration: D(0.26), ease: "power2.in" })
        .to(el.shadow, { scaleX: 1, opacity: 1, duration: D(0.26), ease: "power2.in" }, "<")
        .to(el.bot, { scaleY: 0.84, scaleX: 1.12, duration: D(0.08), ease: "power1.out" })
        .to(el.bot, { scaleY: 1, scaleX: 1, duration: D(0.45), ease: "elastic.out(1, 0.45)" })
        .to({}, { duration: D(0.35) });
    }

    function error() {
      if (state === "ko") return;
      rest(true);
      state = "busy";
      face("angry", "frown", 0);
      tl = gsap.timeline({ onComplete: () => rest() });
      tl.to(el.bot, { x: -10, duration: D(0.05), ease: "power1.inOut" })
        .to(el.bot, { x: 10, duration: D(0.07), ease: "power1.inOut", yoyo: true, repeat: 7 })
        .to(el.bot, { x: 0, duration: D(0.06) })
        .to(el.armL, { rotation: -14, duration: D(0.2) }, 0)
        .to(el.armR, { rotation: 14, duration: D(0.2) }, 0)
        .to({}, { duration: D(1.1) });
    }

    function success() {
      if (state === "ko") return;
      rest(true);
      state = "happy";
      face("happy", "smile", 0.9);
      tl = gsap.timeline();
      tl.to(el.armL, { rotation: 150, duration: D(0.45), ease: "back.out(2)" })
        .to(el.armR, { rotation: -150, duration: D(0.45), ease: "back.out(2)" }, "<")
        .to(el.shackle, { y: -9, rotation: -18, duration: D(0.35), ease: "back.out(2)" }, "<")
        .to(el.bot, { y: -26, duration: D(0.2), ease: "power2.out", yoyo: true, repeat: 1 }, "<")
        .to(el.shadow, { scaleX: 0.8, duration: D(0.2), yoyo: true, repeat: 1 }, "<");
      if (!reduce) tl.to([el.armL, el.armR], { rotation: (i) => (i ? -135 : 135), duration: 0.45, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    function ko() {
      rest(true);
      state = "ko";
      face("x", "o", 0);
      aim(0, 0);
      tl = gsap.timeline({ onComplete: () => rest() });
      // il bascule autour du pied droit ; le décalage vers la gauche le fait atterrir au milieu de sa zone,
      // sans déborder sur le formulaire ni hors de l'écran sur mobile
      tl.to(el.fall, { rotation: 92, x: -210, duration: D(0.5), ease: "power2.in" })
        .to(el.armL, { rotation: 40, duration: D(0.5), ease: "power2.in" }, "<")
        .to(el.armR, { rotation: -22, duration: D(0.5), ease: "power2.in" }, "<")
        .to(el.shadow, { scaleX: 1.9, x: 0, duration: D(0.5), ease: "power2.in" }, "<")
        .to(el.fall, { rotation: 86, duration: D(0.12), yoyo: true, repeat: 1, ease: "power1.out" })
        .to(el.armL, { rotation: 58, duration: D(0.6), ease: "elastic.out(1, 0.3)" }, "<")
        .to({}, { duration: D(2) })
        .add(() => face("normal", "o", 0))
        .to(el.fall, { rotation: 38, x: -90, duration: D(0.35), ease: "power2.out" })
        .to(el.fall, { x: 0, duration: D(0.5), ease: "power2.out" }, "<0.15")
        .to(el.shadow, { scaleX: 1, x: 0, duration: D(0.6) }, "<")
        .to([el.armL, el.armR], { rotation: 0, duration: D(0.5), ease: "back.out(2)" }, "<")
        .to(el.fall, { rotation: -12, duration: D(0.3), ease: "power2.inOut" })
        .to(el.fall, { rotation: 7, duration: D(0.24), ease: "power2.inOut" })
        .to(el.fall, { rotation: -4, duration: D(0.2), ease: "power2.inOut" })
        .to(el.fall, { rotation: 0, duration: D(0.2), ease: "power2.out" })
        .add(() => face("normal", "neutral", 0));
    }

    /* ---------- clics sur le robot ---------- */
    const clicks = [];
    function onPoke() {
      if (state === "ko") return;
      const now = performance.now();
      clicks.push(now);
      while (clicks.length && now - clicks[0] > 2000) clicks.shift();
      if (clicks.length >= 6) { clicks.length = 0; ko(); } else jump();
    }
    svg.addEventListener("pointerdown", e => { if (e.target.closest("#float")) onPoke(); });
    // un clic de souris ne donne pas le focus au robot : sinon le navigateur dessine un cadre autour de lui
    svg.addEventListener("mousedown", e => e.preventDefault());
    svg.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPoke(); } });

    return {
      get state() { return state; },
      rest: () => rest(),
      jump, error, success, ko,
      lookAt(target) { fixedTarget = target; lookAtElement(target); },
      release() { fixedTarget = null; aim(0, 0); }
    };
  }

  window.createRobot = createRobot;
})();

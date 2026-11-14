/* Vault — animations de la page d'accueil (GSAP + ScrollTrigger). */
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const intro = document.querySelector(".intro");
  const endIntro = () => { if (intro) intro.remove(); };
  const nav = document.getElementById("nav");

  // la barre de navigation devient plus opaque dès qu'on descend
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // sans GSAP, ou avec « mouvement réduit », la page reste complète et lisible
  const rows = Array.from(document.querySelectorAll(".row"));
  const selector = document.querySelector(".selector");
  const sw = r => ({ track: r.querySelector(".switch"), knob: r.querySelector(".knob") });
  const isOn = i => i % 3 !== 2; // quelques interrupteurs restent éteints, comme dans une vraie liste
  const placeSelector = r => { selector.style.transform = `translateY(${r.offsetTop}px)`; selector.style.height = r.offsetHeight + "px"; };
  const staticShowcase = () => {
    if (!rows.length || !selector) return;
    placeSelector(rows[0]);
    rows.forEach((r, i) => { if (i < 2) { const { track, knob } = sw(r); track.style.background = "#e6e6e6"; knob.style.transform = "translateX(16px)"; knob.style.background = "#454647"; } });
  };

  if (reduce || !window.gsap || !window.ScrollTrigger) {
    endIntro();
    staticShowcase();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: "power3.out" });

  // découpe un titre en mots masqués, pour les faire monter un par un
  function splitWords(el) {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.innerHTML = text.split(/\s+/).map(w => `<span class="w" aria-hidden="true"><span class="wi">${w}</span></span>`).join(" ");
    return Array.from(el.querySelectorAll(".wi"));
  }

  /* ---------- état de départ ---------- */
  const heroWords = splitWords(document.querySelector(".hero-title"));
  gsap.set(heroWords, { yPercent: 118 });
  gsap.set([".hero-lead", ".hero-actions .btn", ".scroll-hint"], { opacity: 0, y: 24 });
  gsap.set(nav, { yPercent: -180, opacity: 0 });
  gsap.set(".hero .blob-wrap", { opacity: 0, scale: 0.7 });

  /* ---------- animation d'entrée ---------- */
  const logo = intro && intro.querySelector("svg");
  const paths = intro ? Array.from(intro.querySelectorAll("path")) : [];
  paths.forEach(p => { const len = p.getTotalLength(); gsap.set(p, { strokeDasharray: len, strokeDashoffset: len }); });

  const tl = gsap.timeline({ onComplete: () => { endIntro(); ScrollTrigger.refresh(); } });
  tl.to(paths, { strokeDashoffset: 0, duration: 0.9, stagger: 0.18, ease: "power2.inOut" })
    .to(logo, { scale: 1.18, duration: 0.5, ease: "power2.in" }, "+=0.05")
    .to(intro, { opacity: 0, duration: 0.7, ease: "power2.inOut" }, "-=0.15")
    .to(".hero .blob-wrap", { opacity: 1, scale: 1, duration: 2.2, stagger: 0.18, ease: "power2.out" }, "<")
    .to(nav, { yPercent: 0, opacity: 1, duration: 0.9 }, "<0.1")
    .to(heroWords, { yPercent: 0, duration: 1.1, stagger: 0.09, ease: "power4.out" }, "<0.1")
    .to(".hero-lead", { opacity: 1, y: 0, duration: 0.9 }, "<0.45")
    .to(".hero-actions .btn", { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }, "<0.15")
    .to(".scroll-hint", { opacity: 1, y: 0, duration: 0.8 }, "<0.2");

  /* ---------- formes floues : elles dérivent doucement, et suivent le défilement ---------- */
  document.querySelectorAll(".blob").forEach(b => {
    gsap.to(b, {
      x: () => gsap.utils.random(-80, 80), y: () => gsap.utils.random(-60, 60), scale: () => gsap.utils.random(0.9, 1.15),
      duration: () => gsap.utils.random(9, 14), repeat: -1, yoyo: true, repeatRefresh: true, ease: "sine.inOut"
    });
  });
  const hero = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
  gsap.to(".hero .b1", { yPercent: -28, ease: "none", scrollTrigger: hero });
  gsap.to(".hero .b2", { yPercent: 34, xPercent: -10, ease: "none", scrollTrigger: hero });
  gsap.to(".hero .b3", { yPercent: -14, xPercent: 12, ease: "none", scrollTrigger: hero });
  gsap.to(".hero-inner", { y: -90, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "68% top", scrub: true } });
  gsap.to(".scroll-hint", { opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "18% top", scrub: true } });

  /* ---------- titres et textes qui se révèlent ---------- */
  document.querySelectorAll(".split").forEach(h => {
    const words = splitWords(h);
    gsap.set(words, { yPercent: 118 });
    ScrollTrigger.create({ trigger: h, start: "top 86%", once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1, stagger: 0.06, ease: "power4.out" }) });
  });
  document.querySelectorAll(".reveal-up").forEach(el => {
    gsap.set(el, { opacity: 0, y: 28 });
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.9 }) });
  });

  /* ---------- fenêtre d'appli : la sélection descend ligne par ligne en suivant le défilement ---------- */
  const mm = gsap.matchMedia();
  if (rows.length && selector) {
    gsap.set(selector, { y: () => rows[0].offsetTop, height: () => rows[0].offsetHeight, opacity: 0 });

    mm.add("(min-width: 1001px)", () => {
      const steps = rows.length;
      const st = gsap.timeline({
        scrollTrigger: { trigger: ".showcase", start: "top top", end: () => "+=" + (steps * 170 + 260), pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true }
      });
      st.fromTo(".window", { y: 90, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "power2.out" })
        .to(selector, { opacity: 1, duration: 0.3 }, ">-0.2");
      rows.forEach((r, i) => {
        const { track, knob } = sw(r);
        if (i > 0) st.to(selector, { y: () => r.offsetTop, height: () => r.offsetHeight, duration: 0.6, ease: "power2.inOut" }, ">0.12");
        if (isOn(i)) {
          st.to(track, { backgroundColor: "#e6e6e6", duration: 0.3 }, i === 0 ? ">0.1" : "<0.35");
          st.to(knob, { x: 16, backgroundColor: "#454647", duration: 0.3 }, "<");
        }
      });
      st.to({}, { duration: 0.5 });
      return () => { gsap.set([".window", selector], { clearProps: "all" }); };
    });

    mm.add("(max-width: 1000px)", () => {
      gsap.set(selector, { opacity: 1 });
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.9, paused: true });
      rows.forEach((r, i) => {
        const { track, knob } = sw(r);
        loop.to(selector, { y: () => r.offsetTop, height: () => r.offsetHeight, duration: 0.5, ease: "power2.inOut" }, i * 0.9);
        if (isOn(i)) {
          loop.to(track, { backgroundColor: "#e6e6e6", duration: 0.3 }, i * 0.9 + 0.3);
          loop.to(knob, { x: 16, backgroundColor: "#454647", duration: 0.3 }, i * 0.9 + 0.3);
        }
      });
      loop.set(rows.map(r => sw(r).track), { backgroundColor: "#2f3031" });
      loop.set(rows.map(r => sw(r).knob), { x: 0, backgroundColor: "#9c9c9d" });
      const t = ScrollTrigger.create({ trigger: ".window", start: "top 88%", end: "bottom 8%", onEnter: () => loop.play(), onEnterBack: () => loop.play(), onLeave: () => loop.pause(), onLeaveBack: () => loop.pause() });
      return () => { t.kill(); loop.kill(); };
    });
  }

  /* ---------- les 4 cartes ---------- */
  gsap.set(".card", { opacity: 0, y: 56 });
  ScrollTrigger.batch(".card", {
    start: "top 90%",
    once: true,
    onEnter: batch => gsap.to(batch, { opacity: 1, y: 0, duration: 1, stagger: 0.12, clearProps: "transform,opacity" })
  });

  /* ---------- appel à l'action ---------- */
  gsap.fromTo(".cta .blob-wrap", { scale: 0.6, opacity: 0.2 }, { scale: 1.1, opacity: 1, ease: "none", scrollTrigger: { trigger: ".cta", start: "top bottom", end: "center center", scrub: true } });

  // les polices changent la hauteur des lignes : on recalcule les positions une fois chargées
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();

(() => {
  "use strict";
  const intro = document.getElementById("aiIntro");
  if (!intro) return;

  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let finished = false;
  let timer = 0;
  document.body.classList.add("ai-intro-active");

  function finishIntro() {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    intro.classList.add("is-exiting");
    intro.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ai-intro-active");
    window.setTimeout(() => intro.remove(), 620);
  }

  const skipButton = intro.querySelector("[data-ai-intro-skip]");
  if (skipButton) skipButton.addEventListener("click", finishIntro);
  intro.addEventListener("click", finishIntro);
  document.addEventListener("keydown", (event) => {
    if (!finished && event.key === "Escape") finishIntro();
  });

  timer = window.setTimeout(finishIntro, reduceMotion ? 420 : 2820);
})();
/* Keep the app shell fitted to the actually visible browser viewport.
   visualViewport tracks mobile browser chrome and the on-screen keyboard. */
(() => {
  const root = document.documentElement;
  let frame = 0;
  const viewport = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      const height = vv && Number.isFinite(vv.height) ? vv.height : window.innerHeight;
      const top = vv && Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
      if (height > 0) root.style.setProperty('--app-height', Math.round(height * 100) / 100 + 'px');
      root.style.setProperty('--app-viewport-top', Math.max(0, Math.round(top * 100) / 100) + 'px');
    });
  };
  viewport();
  window.addEventListener('resize', viewport, { passive: true });
  window.addEventListener('orientationchange', viewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', viewport, { passive: true });
    window.visualViewport.addEventListener('scroll', viewport, { passive: true });
  }
})();

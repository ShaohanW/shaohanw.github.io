(() => {
  const root = document.documentElement;
  const project = root.dataset.page === "project";
  if (project && new URLSearchParams(location.search).get("view") === "minimal") {
    root.dataset.view = "minimal";
  }
  const minimal = root.dataset.view === "minimal";
  const localFile = location.protocol === "file:";
  const destinations = [];

  for (const link of document.querySelectorAll("a[href]")) {
    if (link.hasAttribute("data-edition")) {
      if (link.dataset.edition === root.dataset.view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    const href = minimal && link.dataset.minimalHref ? link.dataset.minimalHref : link.getAttribute("href");
    if (!/^[\w-]+\.html(?:[?#]|$)/i.test(href)) continue;
    const file = href.split(/[?#]/, 1)[0];
    destinations.push({link, file, url: new URL(href, location.href)});
  }

  function updateLinks() {
    for (const {link, file, url} of destinations) {
      if (link.hasAttribute("data-edition")) {
        url.hash = location.hash;
        if (!project && (url.hash === "#work" || url.hash === "#projects")) {
          url.hash = link.dataset.edition === "minimal" ? "projects" : "work";
        }
      }
      // Browsers may isolate localStorage for each individual file.
      if (localFile) {
        url.searchParams.set("lang", root.lang === "zh-CN" ? "zh" : "en");
        url.searchParams.set("palette", root.dataset.palette || "starlight");
      }
      link.setAttribute("href", file + url.search + url.hash);
    }
  }

  updateLinks();
  window.addEventListener("hashchange", updateLinks);
  document.addEventListener("portfolio-preferences", updateLinks);
})();

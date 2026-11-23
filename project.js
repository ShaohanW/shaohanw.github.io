const siteRoot = document.documentElement;
const toggle = document.getElementById("lang-toggle");
const localQuery = new URLSearchParams(location.protocol === "file:" ? location.search : "");

function storedPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

toggle.insertAdjacentHTML("beforebegin", `
  <label class="palette-control">
    <span class="palette-dot" aria-hidden="true"></span>
    <span class="palette-label" data-en="Color palette" data-zh="配色">Color palette</span>
    <select id="palette-select">
      <option value="starlight" data-en="Starlight" data-zh="星光色">Starlight</option>
      <option value="midnight" data-en="Midnight" data-zh="午夜色">Midnight</option>
      <option value="sage" data-en="Sage green" data-zh="鼠尾草绿">Sage green</option>
    </select>
  </label>`);

const paletteSelect = document.getElementById("palette-select");

function setPalette(value) {
  const palette = ["midnight", "sage"].includes(value) ? value : "starlight";
  siteRoot.dataset.palette = palette;
  paletteSelect.value = palette;
  storePreference("portfolio-palette", palette);
  document.dispatchEvent(new Event("portfolio-preferences"));
}

function setLanguage(value) {
  const language = value === "zh" || value === "zh-CN" ? "zh" : "en";
  siteRoot.lang = language === "zh" ? "zh-CN" : "en";
  for (const element of document.querySelectorAll("[data-en][data-zh]")) {
    element.textContent = element.dataset[language];
  }
  toggle.textContent = language === "en" ? "中文" : "EN";
  toggle.setAttribute("aria-label", language === "en" ? "切换为中文" : "Switch to English");
  storePreference("lang", language);
  document.dispatchEvent(new Event("portfolio-preferences"));
}

const minimalHome = siteRoot.dataset.view === "minimal";
const defaultLanguage = minimalHome && /^zh/i.test(navigator.language) ? "zh" : "en";
setLanguage(localQuery.get("lang") || storedPreference("lang") || storedPreference("sw-minimal-language") || defaultLanguage);
setPalette(localQuery.get("palette") || storedPreference("portfolio-palette") || storedPreference("sw-minimal-theme"));

toggle.addEventListener("click", () => setLanguage(siteRoot.lang === "en" ? "zh" : "en"));
paletteSelect.addEventListener("change", () => setPalette(paletteSelect.value));

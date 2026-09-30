const toggle = document.getElementById('lang-toggle');
let language = 'en';
try { language = localStorage.getItem('lang') === 'zh' ? 'zh' : 'en'; } catch {}
function setLanguage(next) {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-en][data-zh]').forEach(element => {
    element.textContent = element.dataset[next];
  });
  toggle.textContent = next === 'en' ? '中文' : 'EN';
  toggle.setAttribute('aria-label', next === 'en' ? '切换为中文' : 'Switch to English');
  try { localStorage.setItem('lang', next); } catch {}
}
toggle.addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en'));
setLanguage(language);

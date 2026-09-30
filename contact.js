document.querySelectorAll('[data-contact]').forEach(link => {
  link.addEventListener('click', event => {
    if (link.dataset.revealed) return;
    event.preventDefault();
    const address = atob(link.dataset.contact);
    link.href = 'mailto:' + address;
    link.textContent = address + ' ↗';
    link.dataset.revealed = 'true';
    delete link.dataset.en;
    delete link.dataset.zh;
  });
});

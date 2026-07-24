document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('[data-ext-tab]');
  const panes = document.querySelectorAll('.tab-pane');

  function switchTab(tabId) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.extTab === tabId));
    panes.forEach(p => {
      const match = p.id === `ext-tab-${tabId}`;
      p.classList.toggle('active', match);
      p.style.display = match ? 'flex' : 'none';
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.extTab));
  });

  const installLink = document.querySelector('a[href="#ext-tab-install"]');
  if (installLink) {
    installLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('install');
    });
  }
});

/* Reef Search - Download Page (No Preview) */

(function () {
  'use strict';

  const downloadBtn = document.getElementById('downloadBtn');

  function init() {
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        window.open('https://reef.js.org/extension', '_blank');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
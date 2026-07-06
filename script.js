(function () {
  var kbdHint = document.getElementById('kbdHint');
  kbdHint.textContent = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘K' : 'Ctrl K';

  document.getElementById('trigger').addEventListener('click', function () {
    if (window.Reef) window.Reef.open();
  });

  document.getElementById('viewCode').addEventListener('click', function () {
    document.querySelector('.code-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('copyBtn').addEventListener('click', function () {
    var text = '<script src="dist/reef.min.js"><\/script>';
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('copyBtn');
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
    });
  });

  // Depth gauge: renders scroll position as a diving depth (0m surface -> reef floor)
  var fill = document.getElementById('gaugeFill');
  var marker = document.getElementById('gaugeMarker');
  var label = document.getElementById('gaugeLabel');
  var maxDepth = 42;

  var zones = [
    { at: 0, name: 'surface' },
    { at: 0.12, name: 'reef flat' },
    { at: 0.45, name: 'drop-off' },
    { at: 0.8, name: 'reef floor' }
  ];

  function zoneName(progress) {
    var current = zones[0].name;
    for (var i = 0; i < zones.length; i++) {
      if (progress >= zones[i].at) current = zones[i].name;
    }
    return current;
  }

  function updateGauge() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    var progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    var depth = Math.round(progress * maxDepth);

    fill.style.height = (progress * 100) + '%';
    marker.style.top = (progress * 100) + '%';
    label.textContent = depth + 'm · ' + zoneName(progress);
  }

  window.addEventListener('scroll', updateGauge, { passive: true });
  window.addEventListener('resize', updateGauge);
  updateGauge();
})();
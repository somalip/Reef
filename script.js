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
    var text = '<script src="reef.min.js"><\/script>';
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('copyBtn');
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
    });
  });

  document.getElementById('downloadBtn').addEventListener('click', () => {
      fetch('dist/reef.min.js')
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'reef.min.js';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(err => console.error('Download failed:', err));
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

/* Comparison matrix — Reef vs every tool in the parity plan */
(function () {
  var dims = [
    { key: 'type', label: 'Type' },
    { key: 'backend', label: 'Backend required' },
    { key: 'cost', label: 'Cost' },
    { key: 'privacy', label: 'Query privacy' },
    { key: 'dom', label: 'Live DOM extraction' },
    { key: 'fuzzy', label: 'Typo tolerance' },
    { key: 'indexed', label: 'Indexed (no full scan)' },
    { key: 'domsync', label: 'Live DOM sync' },
    { key: 'types', label: 'Semantic record types' },
    { key: 'bm25', label: 'BM25 / TF-IDF' },
    { key: 'suggest', label: 'Autocomplete / suggest' },
    { key: 'stem', label: 'Stemming + diacritics' },
    { key: 'facet', label: 'Faceted filtering' },
    { key: 'worker', label: 'Web Worker offload' },
    { key: 'serialize', label: 'Serialization / shards' }
  ];

  function c(t, s) { return { t: t, s: s }; }

  var tools = {
    'Reef': {
      pinned: true,
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Stays local', 'g'),
      dom: c('Yes — live DOM', 'g'),
      fuzzy: c('Yes (indexed)', 'g'),
      indexed: c('Yes (inverted)', 'g'),
      domsync: c('Planned', 'm'),
      types: c('Yes — 7 types', 'g'),
      bm25: c('Yes (option)', 'g'),
      suggest: c('Yes', 'g'),
      stem: c('Yes (opt-in)', 'g'),
      facet: c('Yes', 'g'),
      worker: c('Planned', 'm'),
      serialize: c('Yes', 'g')
    },
    'Fuse.js': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No — generic data', 'b'),
      fuzzy: c('Yes (Bitap)', 'g'),
      indexed: c('No — full scan', 'b'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('No', 'b'),
      suggest: c('No', 'b'),
      stem: c('No', 'b'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('Yes', 'g')
    },
    'MiniSearch': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes (inverted)', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('Yes', 'g'),
      stem: c('Yes', 'g'),
      facet: c('Manual', 'm'),
      worker: c('No', 'b'),
      serialize: c('Yes', 'g')
    },
    'uFuzzy': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes (staged)', 'g'),
      indexed: c('No — full scan', 'b'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('No', 'b'),
      suggest: c('No', 'b'),
      stem: c('No', 'b'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('No', 'b')
    },
    'FlexSearch': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('Partial', 'm'),
      stem: c('Yes', 'g'),
      facet: c('No', 'b'),
      worker: c('Yes', 'g'),
      serialize: c('Yes', 'g')
    },
    'Lunr.js': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes (~)', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('No', 'b'),
      stem: c('Yes', 'g'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('Yes', 'g')
    },
    'Elasticlunr.js': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes (BM25)', 'g'),
      suggest: c('No', 'b'),
      stem: c('Yes', 'g'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('Yes', 'g')
    },
    'fuzzysort': {
      type: c('Client-side lib', 'g'),
      backend: c('None', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('No (cached scan)', 'b'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('No', 'b'),
      suggest: c('No', 'b'),
      stem: c('No', 'b'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('No', 'b')
    },
    'Orama': {
      type: c('Client-side / node', 'g'),
      backend: c('None (in-browser)', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local', 'g'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('Typed schema', 'm'),
      bm25: c('Yes', 'g'),
      suggest: c('Partial', 'm'),
      stem: c('Yes (plugin)', 'g'),
      facet: c('Yes', 'g'),
      worker: c('Yes (wasm)', 'g'),
      serialize: c('Yes', 'g')
    },
    'Pagefind': {
      type: c('Static (build-time)', 'm'),
      backend: c('None (static)', 'g'),
      cost: c('Free · MIT', 'g'),
      privacy: c('Local shards', 'g'),
      dom: c('No (prebuilt)', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes (shards)', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Partial', 'm'),
      suggest: c('Partial', 'm'),
      stem: c('Yes', 'g'),
      facet: c('Yes', 'g'),
      worker: c('Yes (wasm)', 'g'),
      serialize: c('Yes (shards)', 'g')
    },
    'Algolia': {
      type: c('Hosted service', 'b'),
      backend: c('Required', 'b'),
      cost: c('Paid (free tier)', 'm'),
      privacy: c('Leaves browser', 'b'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('Yes', 'g'),
      stem: c('Yes', 'g'),
      facet: c('Yes', 'g'),
      worker: c('n/a', 'm'),
      serialize: c('No (backend)', 'b')
    },
    'Meilisearch': {
      type: c('Self-host / cloud', 'm'),
      backend: c('Required', 'm'),
      cost: c('Free self-host', 'g'),
      privacy: c('To your server', 'm'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('Yes', 'g'),
      stem: c('Yes', 'g'),
      facet: c('Yes', 'g'),
      worker: c('n/a', 'm'),
      serialize: c('No (backend)', 'b')
    },
    'Elasticsearch/OpenSearch': {
      type: c('Self-hosted engine', 'm'),
      backend: c('Required', 'b'),
      cost: c('Free (Apache)', 'g'),
      privacy: c('To your server', 'm'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('Yes', 'g'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('Yes', 'g'),
      suggest: c('Yes', 'g'),
      stem: c('Yes', 'g'),
      facet: c('Yes', 'g'),
      worker: c('n/a', 'm'),
      serialize: c('No (backend)', 'b')
    },
    'Fuse Cloud': {
      type: c('Hosted service', 'b'),
      backend: c('Required', 'b'),
      cost: c('Paid', 'b'),
      privacy: c('Leaves browser', 'b'),
      dom: c('No', 'b'),
      fuzzy: c('Yes', 'g'),
      indexed: c('No — full scan', 'b'),
      domsync: c('No', 'b'),
      types: c('No', 'b'),
      bm25: c('No', 'b'),
      suggest: c('No', 'b'),
      stem: c('No', 'b'),
      facet: c('No', 'b'),
      worker: c('No', 'b'),
      serialize: c('Yes', 'g')
    }
  };

var order = ['Reef', 'Fuse.js', 'MiniSearch', 'uFuzzy', 'FlexSearch', 'Lunr.js', 'Elasticlunr.js', 'fuzzysort', 'Orama', 'Pagefind', 'Algolia', 'Meilisearch', 'Elasticsearch/OpenSearch', 'Fuse Cloud'];
   var defaults = ['Reef', 'Fuse.js', 'MiniSearch', 'Orama'];
  var selected = {};

  var chipsEl = document.getElementById('compareChips');
  var headEl = document.getElementById('compareHead');
  var bodyEl = document.getElementById('compareBody');
  if (!chipsEl || !headEl || !bodyEl) return;

  defaults.forEach(function (n) { selected[n] = true; });

  function activeTools() {
    return order.filter(function (n) { return selected[n]; });
  }

  function renderChips() {
    chipsEl.innerHTML = '';
    order.forEach(function (name) {
      var t = tools[name];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (t.pinned ? ' reef' : '') + (selected[name] ? ' active' : '');
      btn.textContent = name;
      if (!t.pinned) {
        btn.addEventListener('click', function () {
          selected[name] = !selected[name];
          renderChips();
          renderMatrix();
        });
      }
      chipsEl.appendChild(btn);
    });
  }

  function renderMatrix() {
    var cols = activeTools();
    headEl.innerHTML = '';
    var hr = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'dim';
    corner.textContent = 'Capability';
    hr.appendChild(corner);
    cols.forEach(function (name) {
      var th = document.createElement('th');
      th.className = name === 'Reef' ? 'col-reef' : '';
      th.textContent = name;
      hr.appendChild(th);
    });
    headEl.appendChild(hr);

    bodyEl.innerHTML = '';
    dims.forEach(function (d) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.className = 'dim';
      td.textContent = d.label;
      tr.appendChild(td);
      cols.forEach(function (name) {
        var cell = tools[name][d.key];
        var ctd = document.createElement('td');
        ctd.className = (name === 'Reef' ? 'col-reef ' : '') + 'cell-' + cell.s;
        ctd.textContent = cell.t;
        tr.appendChild(ctd);
      });
      bodyEl.appendChild(tr);
    });
  }

  document.getElementById('compareAll').addEventListener('click', function () {
    order.forEach(function (n) { selected[n] = true; });
    renderChips();
    renderMatrix();
  });
  document.getElementById('compareNone').addEventListener('click', function () {
    order.forEach(function (n) { if (!tools[n].pinned) selected[n] = false; });
    renderChips();
    renderMatrix();
  });

  renderChips();
  renderMatrix();
})();
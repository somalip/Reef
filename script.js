(function () {
  'use strict';

  /* ── ⌘K vs Ctrl K label ────────────────────────────────── */
  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  var modKey = isMac ? '⌘' : 'Ctrl';
  document.getElementById('kbdMod').textContent = modKey;
  document.querySelectorAll('.mod-k').forEach(function (el) {
    el.textContent = isMac ? '⌘K' : 'Ctrl K';
  });

  /* ── Matrix canvas background ───────────────────────────── */
  (function initMatrix() {
    var canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d', { alpha: true });

    var CHARS = '░▒▓┼╋╬●◆▲▼◐◑◒◓▸▹◂◃⌾⊕⊗∙·:.'.split('');
    var COLORS = ['#43d9c8', '#ff8562'];
    var FONT_SIZE = 16;
    var FPS = 30;
    var INTERVAL = 1000 / FPS;

    var width, height, cols, rows, cells;
    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;
    var raf, lastTime = 0;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / FONT_SIZE);
      rows = Math.ceil(height / FONT_SIZE);
      cells = buildCells();
    }

    function buildCells() {
      var arr = [];
      for (var i = 0; i < cols * rows; i++) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        arr.push({
          x: col * FONT_SIZE,
          y: row * FONT_SIZE,
          char: CHARS[Math.floor(Math.random() * CHARS.length)],
          color: COLORS[Math.random() > 0.85 ? 1 : 0],
          phase: Math.random() * Math.PI * 2,
          speed: 0.01 + Math.random() * 0.02,
          baseOpacity: 0.01 + Math.random() * 0.05,
          charPhase: Math.random() * Math.PI
        });
      }
      return arr;
    }

    function draw(time) {
      raf = requestAnimationFrame(draw);
      if (time - lastTime < INTERVAL) return;
      lastTime = time;

      ctx.clearRect(0, 0, width, height);
      ctx.font = FONT_SIZE + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      var cx = FONT_SIZE / 2;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        c.phase += c.speed;
        c.charPhase += c.speed * 0.5;
        if (c.charPhase > Math.PI) {
          c.charPhase = 0;
          if (Math.random() > 0.9) c.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        var dx = mouseX - (c.x + cx);
        var dy = mouseY - (c.y + cx);
        var dist = Math.sqrt(dx * dx + dy * dy);

        var opacity = c.baseOpacity + Math.sin(c.phase) * c.baseOpacity * 0.5;
        var driftX = 0, driftY = 0;

        if (dist < 260) {
          var factor = (260 - dist) / 260;
          opacity = Math.max(opacity, 0.16 * factor);
          driftX = -dx * 0.03 * factor;
          driftY = -dy * 0.03 * factor;
          if (Math.random() > 0.95) c.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        if (opacity > 0.008) {
          ctx.fillStyle = c.color;
          ctx.globalAlpha = opacity;
          ctx.fillText(c.char, c.x + cx + driftX, c.y + cx + driftY);
        }
      }
      ctx.globalAlpha = 1;
    }

    resize();
    raf = requestAnimationFrame(draw);

    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    }, { passive: true });
  })();

  /* ── Depth gauge ────────────────────────────────────────── */
  (function initGauge() {
    var fill   = document.getElementById('gaugeFill');
    var marker = document.getElementById('gaugeMarker');
    var badge  = document.getElementById('gaugeDepthBadge');
    if (!fill) return;

    var MAX_DEPTH = 42;
    var ZONES = [
      { at: 0,    name: 'surface'   },
      { at: 0.12, name: 'reef flat' },
      { at: 0.45, name: 'drop-off'  },
      { at: 0.8,  name: 'reef floor'}
    ];

    function getZone(p) {
      var zone = ZONES[0].name;
      for (var i = 0; i < ZONES.length; i++) {
        if (p >= ZONES[i].at) zone = ZONES[i].name;
      }
      return zone;
    }

    function update() {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      var p = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      var depth = Math.round(p * MAX_DEPTH);

      fill.style.height = (p * 100) + '%';
      marker.style.top = (p * 100) + '%';
      badge.style.top  = (p * 100) + '%';
      badge.textContent = depth + 'm · ' + getZone(p);
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  })();

  /* ── "View install" scroll ──────────────────────────────── */
  var viewBtn = document.getElementById('viewInstallBtn');
  if (viewBtn) {
    viewBtn.addEventListener('click', function () {
      var el = document.getElementById('install');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ── Copy button ────────────────────────────────────────── */
  var copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = '<script src="dist/reef.min.js" data-sitemap="sitemap.xml"><\/script>';
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 2000);
      });
    });
  }

  /* ── Clear old cache to force re-indexing ───────────── */
  (function clearOldCache() {
    var clearCache = function() {
      try {
        var request = indexedDB.deleteDatabase('reef-index');
        request.onsuccess = function() {
          console.log('[reef] old cache cleared');
        };
      } catch (e) {
        console.log('[reef] cache clear failed (may not exist):', e);
      }
    };
    clearCache();
  })();

  /* ── Search trigger ──────────────────────────────────────── */
  var searchTrigger = document.getElementById('searchTrigger');
  if (searchTrigger) {
    searchTrigger.addEventListener('click', function () {
      if (typeof window.Reef !== 'undefined') {
        window.Reef.open();
      }
    });
    searchTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof window.Reef !== 'undefined') {
          window.Reef.open();
        }
      }
    });
  }

  /* ── Compare matrix ─────────────────────────────────────── */
  (function initCompare() {
    var chipBar     = document.getElementById('chipBar');
    var compareHead = document.getElementById('compareHead');
    var compareBody = document.getElementById('compareBody');
    if (!chipBar || !compareHead || !compareBody) return;

    function c(text, score) { return { text: text, score: score }; }
    // score: 'g' = good (teal), 'b' = bad (coral), 'm' = middle (neutral)

    var dims = [
      { key: 'type',      label: 'Type'                  },
      { key: 'backend',   label: 'Backend required'       },
      { key: 'cost',      label: 'Cost'                   },
      { key: 'privacy',   label: 'Query privacy'          },
      { key: 'dom',       label: 'Live DOM extraction'    },
      { key: 'fuzzy',     label: 'Typo tolerance'         },
      { key: 'indexed',   label: 'Indexed (no full scan)' },
      { key: 'domsync',   label: 'Live DOM sync'          },
      { key: 'types',     label: 'Semantic record types'  },
      { key: 'bm25',      label: 'BM25 / TF-IDF'         },
      { key: 'suggest',   label: 'Autocomplete / suggest' },
      { key: 'stem',      label: 'Stemming + diacritics'  },
      { key: 'facet',     label: 'Faceted filtering'      },
      { key: 'worker',    label: 'Web Worker offload'     },
      { key: 'serialize', label: 'Serialization / shards' }
    ];

    var tools = {
      'Reef': {
        pinned: true,
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Stays local',     'g'),
        dom:       c('Yes — live DOM',  'g'),
        fuzzy:     c('Yes (indexed)',   'g'),
        indexed:   c('Yes (inverted)',  'g'),
        domsync:   c('Planned',         'm'),
        types:     c('Yes — 7 types',   'g'),
        bm25:      c('Yes (option)',    'g'),
        suggest:   c('Yes',             'g'),
        stem:      c('Yes (opt-in)',    'g'),
        facet:     c('Yes',             'g'),
        worker:    c('Planned',         'm'),
        serialize: c('Yes',             'g')
      },
      'Fuse.js': {
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Local',           'g'),
        dom:       c('No — generic data','b'),
        fuzzy:     c('Yes (Bitap)',     'g'),
        indexed:   c('No — full scan',  'b'),
        domsync:   c('No',              'b'),
        types:     c('No',              'b'),
        bm25:      c('No',              'b'),
        suggest:   c('No',              'b'),
        stem:      c('No',              'b'),
        facet:     c('No',              'b'),
        worker:    c('No',              'b'),
        serialize: c('Yes',             'g')
      },
      'MiniSearch': {
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Local',           'g'),
        dom:       c('No',              'b'),
        fuzzy:     c('Yes',             'g'),
        indexed:   c('Yes (inverted)',  'g'),
        domsync:   c('No',              'b'),
        types:     c('No',              'b'),
        bm25:      c('Yes',             'g'),
        suggest:   c('Yes',             'g'),
        stem:      c('Yes',             'g'),
        facet:     c('Manual',          'm'),
        worker:    c('No',              'b'),
        serialize: c('Yes',             'g')
      },
      'uFuzzy': {
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Local',           'g'),
        dom:       c('No',              'b'),
        fuzzy:     c('Yes (staged)',    'g'),
        indexed:   c('No — full scan',  'b'),
        domsync:   c('No',              'b'),
        types:     c('No',              'b'),
        bm25:      c('No',              'b'),
        suggest:   c('No',              'b'),
        stem:      c('No',              'b'),
        facet:     c('No',              'b'),
        worker:    c('No',              'b'),
        serialize: c('No',              'b')
      },
      'FlexSearch': {
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Local',           'g'),
        dom:       c('No',              'b'),
        fuzzy:     c('Yes',             'g'),
        indexed:   c('Yes',             'g'),
        domsync:   c('No',              'b'),
        types:     c('No',              'b'),
        bm25:      c('Yes',             'g'),
        suggest:   c('Partial',         'm'),
        stem:      c('Yes',             'g'),
        facet:     c('No',              'b'),
        worker:    c('Yes',             'g'),
        serialize: c('Yes',             'g')
      },
      'Lunr.js': {
        type:      c('Client-side lib', 'g'),
        backend:   c('None',            'g'),
        cost:      c('Free · MIT',      'g'),
        privacy:   c('Local',           'g'),
        dom:       c('No',              'b'),
        fuzzy:     c('Yes (~)',         'g'),
        indexed:   c('Yes',             'g'),
        domsync:   c('No',              'b'),
        types:     c('No',              'b'),
        bm25:      c('Yes',             'g'),
        suggest:   c('No',              'b'),
        stem:      c('Yes',             'g'),
        facet:     c('No',              'b'),
        worker:    c('No',              'b'),
        serialize: c('Yes',             'g')
      },
      'Orama': {
        type:      c('Client-side / node','g'),
        backend:   c('None (in-browser)','g'),
        cost:      c('Free · MIT',       'g'),
        privacy:   c('Local',            'g'),
        dom:       c('No',               'b'),
        fuzzy:     c('Yes',              'g'),
        indexed:   c('Yes',              'g'),
        domsync:   c('No',               'b'),
        types:     c('Typed schema',     'm'),
        bm25:      c('Yes',              'g'),
        suggest:   c('Partial',          'm'),
        stem:      c('Yes (plugin)',     'g'),
        facet:     c('Yes',              'g'),
        worker:    c('Yes (wasm)',       'g'),
        serialize: c('Yes',              'g')
      },
      'Pagefind': {
        type:      c('Static (build-time)','m'),
        backend:   c('None (static)',    'g'),
        cost:      c('Free · MIT',       'g'),
        privacy:   c('Local shards',     'g'),
        dom:       c('No (prebuilt)',     'b'),
        fuzzy:     c('Yes',              'g'),
        indexed:   c('Yes (shards)',     'g'),
        domsync:   c('No',               'b'),
        types:     c('No',               'b'),
        bm25:      c('Partial',          'm'),
        suggest:   c('Partial',          'm'),
        stem:      c('Yes',              'g'),
        facet:     c('Yes',              'g'),
        worker:    c('Yes (wasm)',       'g'),
        serialize: c('Yes (shards)',     'g')
      },
      'Algolia': {
        type:      c('Hosted service',   'b'),
        backend:   c('Required',         'b'),
        cost:      c('Paid (free tier)', 'm'),
        privacy:   c('Leaves browser',  'b'),
        dom:       c('No',               'b'),
        fuzzy:     c('Yes',              'g'),
        indexed:   c('Yes',              'g'),
        domsync:   c('No',               'b'),
        types:     c('No',               'b'),
        bm25:      c('Yes',              'g'),
        suggest:   c('Yes',              'g'),
        stem:      c('Yes',              'g'),
        facet:     c('Yes',              'g'),
        worker:    c('n/a',              'm'),
        serialize: c('No (backend)',     'b')
      },
      'Meilisearch': {
        type:      c('Self-host / cloud','m'),
        backend:   c('Required',         'm'),
        cost:      c('Free self-host',   'g'),
        privacy:   c('To your server',  'm'),
        dom:       c('No',               'b'),
        fuzzy:     c('Yes',              'g'),
        indexed:   c('Yes',              'g'),
        domsync:   c('No',               'b'),
        types:     c('No',               'b'),
        bm25:      c('Yes',              'g'),
        suggest:   c('Yes',              'g'),
        stem:      c('Yes',              'g'),
        facet:     c('Yes',              'g'),
        worker:    c('n/a',              'm'),
        serialize: c('No (backend)',     'b')
      },
      'Elasticsearch': {
        type:      c('Self-hosted engine','m'),
        backend:   c('Required',          'b'),
        cost:      c('Free (Apache)',     'g'),
        privacy:   c('To your server',   'm'),
        dom:       c('No',                'b'),
        fuzzy:     c('Yes',               'g'),
        indexed:   c('Yes',               'g'),
        domsync:   c('No',                'b'),
        types:     c('No',                'b'),
        bm25:      c('Yes',               'g'),
        suggest:   c('Yes',               'g'),
        stem:      c('Yes',               'g'),
        facet:     c('Yes',               'g'),
        worker:    c('n/a',               'm'),
        serialize: c('No (backend)',      'b')
      },
      'Fuse Cloud': {
        type:      c('Hosted service',   'b'),
        backend:   c('Required',         'b'),
        cost:      c('Paid',             'b'),
        privacy:   c('Leaves browser',  'b'),
        dom:       c('No',               'b'),
        fuzzy:     c('Yes',              'g'),
        indexed:   c('No — full scan',  'b'),
        domsync:   c('No',               'b'),
        types:     c('No',               'b'),
        bm25:      c('No',               'b'),
        suggest:   c('No',               'b'),
        stem:      c('No',               'b'),
        facet:     c('No',               'b'),
        worker:    c('No',               'b'),
        serialize: c('Yes',              'g')
      }
    };

    var order = ['Reef','Fuse.js','MiniSearch','uFuzzy','FlexSearch','Lunr.js','Orama','Pagefind','Algolia','Meilisearch','Elasticsearch','Fuse Cloud'];
    var defaults = { 'Reef': true, 'Fuse.js': true, 'MiniSearch': true, 'Orama': true };
    var selected = Object.assign({}, defaults);

    function badgeClass(score, reef) {
      if (reef) return 'badge badge-reef';
      if (score === 'g') return 'badge badge-teal';
      if (score === 'b') return 'badge badge-coral';
      return 'badge badge-neutral';
    }

    function renderChips() {
      chipBar.innerHTML = '';
      order.forEach(function (name) {
        var tool = tools[name];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name;
        var cls = 'chip';
        if (tool.pinned) cls += ' pinned';
        else if (selected[name]) cls += ' active';
        btn.className = cls;
        if (!tool.pinned) {
          btn.addEventListener('click', function () {
            selected[name] = !selected[name];
            renderChips();
            renderMatrix();
          });
        }
        chipBar.appendChild(btn);
      });
    }

    function renderMatrix() {
      var activeCols = order.filter(function (n) { return selected[n]; });

      // Header
      compareHead.innerHTML = '';
      var hr = document.createElement('tr');
      var corner = document.createElement('th');
      corner.className = 'col-feature';
      corner.textContent = 'Capability';
      hr.appendChild(corner);
      activeCols.forEach(function (name) {
        var th = document.createElement('th');
        th.textContent = name;
        th.className = name === 'Reef' ? 'col-reef' : '';
        hr.appendChild(th);
      });
      compareHead.appendChild(hr);

      // Body
      compareBody.innerHTML = '';
      dims.forEach(function (dim) {
        var tr = document.createElement('tr');
        var td0 = document.createElement('td');
        td0.className = 'col-feature';
        td0.textContent = dim.label;
        tr.appendChild(td0);
        activeCols.forEach(function (name) {
          var cell = tools[name][dim.key];
          var td = document.createElement('td');
          var span = document.createElement('span');
          span.className = badgeClass(cell.score, name === 'Reef');
          span.textContent = cell.text;
          td.appendChild(span);
          tr.appendChild(td);
        });
        compareBody.appendChild(tr);
      });
    }

    renderChips();
    renderMatrix();
  })();

})();

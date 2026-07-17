function showDemoMessage() {
  document.getElementById('actionOutput').innerHTML = '<div class="log-entry">Demo button clicked at ' + new Date().toLocaleTimeString() + '</div>';
}

function updateHotkey() {
  const input = document.getElementById('hotkeyInput').value;
  window.Reef.setHotkey(input);
  document.getElementById('hotkeyOutput').textContent = 'Hotkey updated to: ' + window.Reef.getHotkey();
}

function openSearch() {
  window.Reef.open();
  document.getElementById('programOutput').textContent = 'Search modal opened';
}

function closeSearch() {
  window.Reef.close();
  document.getElementById('programOutput').textContent = 'Search modal closed';
}

function openWithQueryDemo() {
  window.Reef.openWithQuery('installation');
  document.getElementById('programOutput').textContent = 'Search opened with query: installation';
}

function showIndexCount() {
  const index = window.Reef.getIndex();
  document.getElementById('programOutput').innerHTML = 'Total indexed records: ' + index.length + '<br/>Types: ' +
    [...new Set(index.map(r => r.type))].join(', ');
}

function setLightTheme() {
  window.Reef.setColorScheme({
    primary: '#ff8562',
    secondary: '#ffab8c',
    background: 'rgba(255,255,255,0.8)',
    text: '#111111',
    border: '#cccccc',
    radius: 8
  });
  window.Reef.setMode('opaque');
  document.getElementById('styleOutput').textContent = 'Mode: opaque (light theme)';
}

function setDarkTheme() {
  window.Reef.setColorScheme({
    primary: '#43d9c8',
    secondary: '#ff8562',
    background: 'rgba(0,0,0,0.7)',
    text: '#f0f0f0',
    border: '#555555',
    radius: 12
  });
  document.getElementById('styleOutput').textContent = 'Theme: dark';
}

function setOpaqueMode() {
  window.Reef.setMode('opaque');
  document.getElementById('styleOutput').textContent = 'Mode: opaque';
}

function setHighContrast() {
  window.Reef.setMode('high-contrast');
  document.getElementById('styleOutput').textContent = 'Mode: high-contrast';
}

function setCustomColors() {
  window.Reef.setColorScheme({
    primary: '#ff6b6b',
    secondary: '#4ecdc4',
    background: 'rgba(30,30,40,0.9)',
    text: '#ffffff',
    border: '#ff6b6b',
    radius: 20
  });
  document.getElementById('styleOutput').textContent = 'Custom colors applied';
}

function resetStyles() {
  window.Reef.setColorScheme({
    primary: '#43d9c8',
    secondary: '#ff8562',
    background: 'rgba(20,30,28,0.65)',
    text: '#edebe6',
    border: 'rgba(67,217,200,0.25)',
    radius: 16
  });
  window.Reef.setMode('regular');
  document.getElementById('styleOutput').textContent = 'Mode: regular (default)';
}

function showFacets() {
  const counts = window.Reef.facets ? window.Reef.facets() : {};
  document.getElementById('facetOutput').innerHTML =
    '<div class="log-entry">Facets: ' + JSON.stringify(counts) + '</div>';
}

function filterActions() {
  const index = window.Reef.getIndex();
  const filtered = index.filter(r => r.type === 'action');
  document.getElementById('facetOutput').innerHTML =
    '<div class="log-entry">Found ' + filtered.length + ' actions</div>';
}

function filterSections() {
  const index = window.Reef.getIndex();
  const filtered = index.filter(r => r.type === 'section');
  document.getElementById('facetOutput').innerHTML =
    '<div class="log-entry">Found ' + filtered.length + ' sections</div>';
}

function searchClassic() {
  const results = window.Reef.search('search', 10);
  document.getElementById('scoringOutput').innerHTML =
    '<div class="log-entry">Classic results: ' + results.length + ' matches</div>';
}

function searchBM25() {
  const results = window.Reef.searchSections ?
    window.Reef.searchSections('search', { scoringAlgorithm: 'bm25', includeScore: true }) :
    [];
  const top3 = results.slice(0, 3).map(r => r.record.headingText + ' (score: ' + r.score.toFixed(3) + ')').join('<br/>');
  document.getElementById('scoringOutput').innerHTML =
    '<div class="log-entry">' + top3 + '</div>';
}

function trackQuery() {
  const input = document.getElementById('trackQueryInput').value;
  if (input) {
    window.Reef.trackQuery(input);
    document.getElementById('analyticsOutput').innerHTML =
      '<div class="log-entry">Tracked: ' + input + '</div>';
  }
}

function showPopular() {
  const popular = window.Reef.getPopularQueries ? window.Reef.getPopularQueries(5) : [];
  document.getElementById('analyticsOutput').innerHTML =
    '<div class="log-entry">Popular: ' + popular.map(p => p.query + ' (' + p.count + ')').join(', ') + '</div>';
}

const suggestInput = document.getElementById('suggestInput');
suggestInput?.addEventListener('input', () => {
  if (window.Reef.suggest) {
    const results = window.Reef.suggest(suggestInput.value, 5);
    document.getElementById('suggestOutput').textContent = results.join(', ');
  }
});

window.Reef.onselect(function(result) {
  document.getElementById('callbackOutput').innerHTML =
    '<div class="log-entry"><strong>Result Type:</strong> ' + result.type + '<br/>' +
    '<strong>Heading:</strong> ' + result.headingText + '<br/>' +
    '<strong>URL:</strong> ' + result.url + '</div>';
});
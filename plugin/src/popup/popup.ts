/**
 * @file Popup logic for Reef for Browsers.
 * Communicates with background worker to search current page index,
 * renders grouped search results, and triggers execution.
 */

import type { IndexRecord } from '../../src/types.js';

let activeTabId: number | null = null;
let currentFilter: string = 'all';
let currentQuery: string = '';
let currentResults: IndexRecord[] = [];

document.addEventListener('DOMContentLoaded', async () => {
  // ─── THEME ───
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const { theme } = await chrome.storage.local.get(['theme']);
    document.body.setAttribute('data-theme', theme || 'light');
  }

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const clearBtn = document.getElementById('btn-clear') as HTMLButtonElement;
  const optionsBtn = document.getElementById('btn-options') as HTMLButtonElement;
  const filterTabs = document.getElementById('filter-tabs') as HTMLDivElement;
  const resultsContainer = document.getElementById('results-container') as HTMLDivElement;
  const manifestBadge = document.getElementById('manifest-badge') as HTMLSpanElement;
  const statsLabel = document.getElementById('stats-label') as HTMLSpanElement;

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    activeTabId = tab.id;
    await performSearch();
  } else {
    resultsContainer.innerHTML = '<div class="empty-state">No active tab accessible.</div>';
  }

  searchInput.addEventListener('input', () => {
    currentQuery = searchInput.value;
    clearBtn.classList.toggle('hidden', !currentQuery);
    performSearch();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentQuery = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    performSearch();
  });

  filterTabs.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');
      currentFilter = target.dataset.type || 'all';
      renderResults();
    }
  });

  async function performSearch() {
    if (!activeTabId) return;

    resultsContainer.innerHTML = '<div class="loading-state">Searching page...</div>';

    chrome.runtime.sendMessage(
      {
        type: 'SEARCH_CURRENT_TAB',
        tabId: activeTabId,
        query: currentQuery,
      },
      (response) => {
        if (!response || !response.success) {
          resultsContainer.innerHTML = `<div class="empty-state">Failed to index page. ${response?.error || ''}</div>`;
          return;
        }

        if (response.manifest?.version) {
          manifestBadge.textContent = 'Agent-Ready Site';
          manifestBadge.classList.add('authoritative');
        } else {
          manifestBadge.textContent = 'Dynamic Extract';
          manifestBadge.classList.remove('authoritative');
        }

        currentResults = response.results || [];
        renderResults();
      }
    );
  }

  function renderResults() {
    let filtered = currentResults;
    if (currentFilter !== 'all') {
      filtered = currentResults.filter(r => r.type === currentFilter);
    }

    statsLabel.textContent = `${filtered.length} items found`;

    if (filtered.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state">No matching records found.</div>';
      return;
    }

    resultsContainer.innerHTML = '';
    filtered.forEach(record => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const topRow = document.createElement('div');
      topRow.className = 'card-top';

      const title = document.createElement('span');
      title.className = 'card-title';
      title.textContent = record.headingText || record.label || record.url;

      const typePill = document.createElement('span');
      typePill.className = `type-pill ${record.type}`;
      typePill.textContent = record.type;

      topRow.appendChild(title);
      topRow.appendChild(typePill);
      card.appendChild(topRow);

      if (record.bodyText) {
        const snippet = document.createElement('div');
        snippet.className = 'card-snippet';
        snippet.textContent = record.bodyText;
        card.appendChild(snippet);
      }

      const actionsRow = document.createElement('div');
      actionsRow.className = 'card-actions';

      const runBtn = document.createElement('button');
      runBtn.className = `run-btn ${record.destructive ? 'destructive' : ''}`;
      
      if (record.type === 'action' || record.type === 'link') {
        runBtn.textContent = record.destructive ? '⚠️ Run (Confirm)' : 'Execute';
      } else if (record.type === 'field') {
        runBtn.textContent = 'Fill Field';
      } else {
        runBtn.textContent = 'View';
      }

      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        executeAction(record);
      });

      actionsRow.appendChild(runBtn);
      card.appendChild(actionsRow);

      card.addEventListener('click', () => {
        // Highlight element on page
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, {
            type: 'HIGHLIGHT_RECORD',
            record,
          });
        }
      });

      resultsContainer.appendChild(card);
    });
  }

  function executeAction(record: IndexRecord) {
    if (!activeTabId) return;

    let valueToType: string | undefined;
    if (record.type === 'field') {
      const input = prompt(`Enter value for field "${record.headingText || record.label || 'Input'}":`, record.value || '');
      if (input === null) return; // User cancelled
      valueToType = input;
    }

    chrome.runtime.sendMessage({
      type: 'EXECUTE_TAB_ACTION',
      tabId: activeTabId,
      record,
      actionType: record.type === 'field' ? 'type' : 'click',
      value: valueToType,
    }, (res) => {
      if (res && res.success) {
        window.close(); // Close popup after execution
      } else {
        alert(`Action failed: ${res?.error || 'Unknown error'}`);
      }
    });
  }
});

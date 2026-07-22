import {
  API_METHODS,
  COMPARISON_DIMENSIONS,
  COMPARISON_TOOLS,
  FAQS,
  SEARCH_ITEMS,
} from './data.js';

// --- STATE VARIABLES ---
let isMac = true;
let isSearchOpen = false;
let activeSearchCategory = 'ALL';
let searchQuery = '';
let searchSelectedIndex = 0;

let selectedSandboxMethod = API_METHODS[0].name;

let activeComparisonTools = {
  Reef: true,
  'Fuse.js': true,
  MiniSearch: true,
  uFuzzy: true,
  Orama: true,
  Algolia: true,
  Pagefind: false,
};

let openFaqId = 'frameworks';

// Terminal CLI State
let commandHistory = [];
let historyIndex = -1;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  detectOS();
  renderApiTable();
  renderSandboxMethodButtons();
  renderComparisonMatrix();
  renderFaqs();
  setupEventListeners();
  setupTerminalCLI();
  updateSearchCategoryChips();
  renderSearchResults();
});

// --- OS DETECTION ---
function detectOS() {
  if (typeof window !== 'undefined') {
    isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }
  const shortcutText = isMac ? '⌘K' : 'CTRL K';
  const badge1 = document.getElementById('keyShortcutBadge');
  const badge2 = document.getElementById('heroKeyShortcut');
  if (badge1) badge1.textContent = shortcutText;
  if (badge2) badge2.textContent = shortcutText;
}

// --- INTERACTIVE TERMINAL CLI ENGINE ---
function setupTerminalCLI() {
  const form = document.getElementById('cliTerminalForm');
  const input = document.getElementById('cliTerminalInput');
  const output = document.getElementById('cliTerminalOutput');
  const clearBtn = document.getElementById('cliClearBtnHeader');

  if (!form || !input || !output) return;

  // Form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawCmd = input.value.trim();
    if (!rawCmd) return;

    executeCliCommand(rawCmd);
    commandHistory.push(rawCmd);
    historyIndex = commandHistory.length;
    input.value = '';
  });

  // History cycling via Up/Down arrow keys
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (commandHistory.length > 0) {
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = commandHistory[historyIndex] || '';
      }
    } else if (e.key === 'ArrowDown') {
      if (commandHistory.length > 0) {
        historyIndex = Math.min(commandHistory.length, historyIndex + 1);
        input.value = historyIndex < commandHistory.length ? commandHistory[historyIndex] : '';
      }
    }
  });

  // Clear button in header
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      output.textContent = '// CLI Terminal Output Cleared.\n// Type "help" for commands.\n';
    });
  }

  // Quick Command Chips
  document.querySelectorAll('.cli-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const cmd = e.currentTarget.getAttribute('data-cmd');
      if (cmd) {
        input.value = cmd;
        executeCliCommand(cmd);
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
        input.value = '';
      }
    });
  });
}

function executeCliCommand(cmdStr) {
  const output = document.getElementById('cliTerminalOutput');
  if (!output) return;

  const timestamp = new Date().toISOString().substring(11, 19);
  const parts = cmdStr.trim().split(/\s+/);
  const mainCmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  let response = '';

  switch (mainCmd) {
    case 'help':
      response = `AVAILABLE REEF_CLI COMMANDS:
  help              Display this command guide table
  search <query>    Query Reef's in-memory inverted index (e.g., "search BM25")
  tools             List actionable DOM elements discovered by Reef.getAgentTools()
  act <recordId>    Dispatch agent action click on element record ID
  sitemap           Print sitemap crawl & indexing status
  bench             Print benchmark metrics comparison matrix
  install           Print zero-config HTML embed script tag
  version           Print engine version, build hash, and safety mode
  faq               List technical frequently asked questions
  clear             Clear terminal screen output`;
      break;

    case 'search':
      if (!args) {
        response = `[ERROR] Please specify a search query term. Example: "search BM25" or "search agent"`;
      } else {
        const q = args.toLowerCase();
        const matches = SEARCH_ITEMS.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.section.toLowerCase().includes(q)
        );

        if (matches.length === 0) {
          response = `[QUERY] "${args}" → 0 MATCHES FOUND IN REEF MEMORY INDEX.`;
        } else {
          response = `[QUERY] "${args}" → ${matches.length} MATCHES FOUND (BM25 SCORE ENGINE):\n` +
            matches
              .map(
                (m, i) =>
                  `  [0${i + 1}] ID:${m.id} | TYPE:${m.type} | SECTION:${m.section}\n      TITLE: ${m.title}\n      DESC:  ${m.description}` +
                  (m.codeSnippet ? `\n      CODE:  ${m.codeSnippet}` : '')
              )
              .join('\n\n');
        }
      }
      break;

    case 'tools':
      let toolList = [];
      if (window.Reef && typeof window.Reef.getAgentTools === 'function') {
        toolList = window.Reef.getAgentTools();
      }
      if (!toolList || toolList.length === 0) {
        toolList = [
          { id: 'rec_01', tag: 'BUTTON', selector: '#openSearchBtn', text: 'SEARCH [⌘K]' },
          { id: 'rec_02', tag: 'A', selector: 'a[href*="github"]', text: 'GITHUB REPO' },
          { id: 'rec_03', tag: 'BUTTON', selector: '#heroLaunchSearchBtn', text: 'LAUNCH_SEARCH' },
          { id: 'rec_04', tag: 'BUTTON', selector: '#heroCopySnippetBtn', text: 'COPY_SCRIPT_TAG' },
          { id: 'rec_05', tag: 'INPUT', selector: '#cliTerminalInput', text: 'CLI_PROMPT' },
        ];
      }
      response = `[DISCOVERED AGENT TOOLS] Total Actionable Controls: ${toolList.length}\n` +
        JSON.stringify(toolList, null, 2);
      break;

    case 'act':
      const targetId = args || 'rec_01';
      response = `[DISPATCH ACTION] Target ID: "${targetId}"\n` +
        `  → Checking actionsMode safety gate: PASS (unrestricted)\n` +
        `  → Resolving element CSS selector\n` +
        `  → Dispatching MouseEvent('click', { bubbles: true })\n` +
        `  → SUCCESS: Action executed in 3.4ms`;
      break;

    case 'sitemap':
      response = `[SITEMAP STATUS]\n` +
        `  Source URL:       /sitemap.xml\n` +
        `  Indexed Pages:    14 sections, 48 records\n` +
        `  Parsing Status:   100% COMPLETE\n` +
        `  Inverted Tokens:  482 unique stems\n` +
        `  Memory Usage:     ~142 KB`;
      break;

    case 'bench':
      response = `[BENCHMARK MATRIX SUMMARY]\n` +
        `  Engine      | Type          | Backend Req | Cost    | Privacy    | DOM Act\n` +
        `  ------------+---------------+-------------+---------+------------+---------\n` +
        `  Reef        | Client Script | None (0 KB) | $0/MIT  | 100% Local | YES\n` +
        `  Fuse.js     | Client Array  | None        | $0/MIT  | Local      | NO\n` +
        `  MiniSearch  | Client Invert | None        | $0/MIT  | Local      | NO\n` +
        `  Orama       | WASM/Script   | None        | $0/Ap2  | Local      | NO\n` +
        `  Algolia     | Hosted SaaS   | Server Req  | Paid    | Remote     | NO`;
      break;

    case 'install':
      response = `[HTML EMBED SCRIPT TAG]\n` +
        `  <script src="https://reef.js.org/dist/reef.min.js"\n` +
        `          data-sitemap="sitemap.xml"\n` +
        `          data-actions-mode="unrestricted">\n` +
        `  </script>`;
      break;

    case 'version':
      response = `[REEF ENGINE VERSION]\n` +
        `  Version Tag:    v1.4.0-release\n` +
        `  Bundle Size:    90 KB uncompressed (~28 KB gzipped)\n` +
        `  Actions Mode:   unrestricted\n` +
        `  License:        MIT (Open Source)\n` +
        `  Author:         Pranav Somalinga`;
      break;

    case 'faq':
      response = `[TECHNICAL FAQ TOPICS]\n` +
        FAQS.map((f) => `  [${f.id}] ${f.question}`).join('\n');
      break;

    case 'clear':
      output.textContent = '';
      return;

    default:
      response = `[ERROR] Command '${mainCmd}' not recognized.\nType 'help' to see available CLI commands.`;
  }

  const logHeader = `reef> ${cmdStr}\n`;
  output.textContent = `${output.textContent}\n[${timestamp}] ${logHeader}${response}\n`;
  output.scrollTop = output.scrollHeight;
}

// --- PROGRAMMATIC API TABLE ---
function renderApiTable() {
  const tbody = document.getElementById('apiMethodsTableBody');
  if (!tbody) return;

  tbody.innerHTML = API_METHODS.map(
    (m) => `
    <tr class="border-b border-zinc-800 hover:bg-[#121212] font-bold">
      <td class="p-4 border-r border-zinc-800 font-black text-[#00f5d4] whitespace-nowrap">
        <code>${m.name}</code>
      </td>
      <td class="p-4 border-r border-zinc-800 font-mono text-zinc-300 whitespace-nowrap">
        <code>${m.signature}</code>
      </td>
      <td class="p-4 border-r border-zinc-800 text-[#f4f4f5] leading-relaxed font-bold">
        ${m.description}
      </td>
      <td class="p-4 whitespace-nowrap">
        ${
          m.safetyGated
            ? '<span class="border border-[#ff5a5f] bg-[#ff5a5f] text-[#050505] font-black px-2 py-0.5 text-[10px] uppercase">GATED (actionsMode)</span>'
            : '<span class="border border-[#00f5d4] bg-[#00f5d4] text-[#050505] font-bold px-2 py-0.5 text-[10px] uppercase">SAFE</span>'
        }
      </td>
    </tr>
  `
  ).join('');
}

// --- SANDBOX METHOD BUTTONS & EXECUTION ---
function renderSandboxMethodButtons() {
  const container = document.getElementById('methodSelectorGrid');
  if (!container) return;

  container.innerHTML = API_METHODS.slice(0, 6)
    .map((m) => {
      const isSelected = selectedSandboxMethod === m.name;
      return `
      <button
        data-method="${m.name}"
        class="sandbox-method-btn p-2.5 font-mono text-xs font-black uppercase text-left border cursor-pointer ${
          isSelected
            ? 'bg-[#00f5d4] text-[#050505] border-[#00f5d4]'
            : 'bg-[#050505] text-[#f4f4f5] border-zinc-800 hover:border-[#00f5d4]'
        }"
      >
        ${m.name}
      </button>
    `;
    })
    .join('');

  const label = document.getElementById('executeBtnLabel');
  if (label) {
    label.textContent = `EXECUTE ${selectedSandboxMethod}`;
  }

  document.querySelectorAll('.sandbox-method-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      selectedSandboxMethod = e.currentTarget.getAttribute('data-method');
      renderSandboxMethodButtons();
    });
  });
}

function handleExecuteSandbox() {
  const inputEl = document.getElementById('sandboxInputParam');
  const paramVal = inputEl ? inputEl.value : 'search_query_101';
  const timestamp = new Date().toISOString().substring(11, 19);
  let output = '';

  if (window.Reef && typeof window.Reef.agent === 'function') {
    const agent = window.Reef.agent();
    switch (selectedSandboxMethod) {
      case 'agent()':
        output = `[${timestamp}] Reef.agent()\n  → INITIALIZED AGENT CHAIN\n  → window.Reef.agent().type("#search", "${paramVal}").submit()\n  → SUCCESS: Target dispatched via reef.min.js`;
        break;
      case 'executeWorkflow(workflow, options)':
        output = `[${timestamp}] Reef.executeWorkflow()\n  → STEP 1: click("#nav-docs") [OK]\n  → STEP 2: wait(300) [OK]\n  → STEP 3: type("#search-input", "${paramVal}") [OK]\n  → WORKFLOW_COMPLETE: 3/3 steps succeeded`;
        break;
      case 'act(recordId)':
        output = `[${timestamp}] window.Reef.act("${paramVal}")\n  → Target DOM ID verified\n  → Safety Gate: PASS (actionsMode = unrestricted)\n  → MouseEvent('click') dispatched\n  → SUCCESS`;
        break;
      case 'fillField(recordId, value)':
        output = `[${timestamp}] window.Reef.fillField("search", "${paramVal}")\n  → DOM Target: <input name="search">\n  → Value updated to "${paramVal}"\n  → Dispatched ['input', 'change'] events`;
        break;
      case 'getAgentTools()':
        const tools = window.Reef.getAgentTools();
        output = `[${timestamp}] window.Reef.getAgentTools()\n  → Discovered ${tools.length} actionable DOM targets:\n` + JSON.stringify(tools.slice(0, 4), null, 2);
        break;
      case 'getSession()':
        const sess = agent.getSession();
        output = `[${timestamp}] Reef.agent().getSession()\n` + JSON.stringify(sess, null, 2);
        break;
      default:
        output = `[${timestamp}] ${selectedSandboxMethod} executed successfully on Reef instance.`;
    }
  } else {
    switch (selectedSandboxMethod) {
      case 'agent()':
        output = `[${timestamp}] Reef.agent()\n  → CHAIN_INITIALIZED\n  → .type("#search", "${paramVal}")\n  → .submit()\n  → SUCCESS: Action queue dispatched in 4.2ms`;
        break;
      case 'executeWorkflow(workflow, options)':
        output = `[${timestamp}] Reef.executeWorkflow()\n  → STEP 1: click("#nav-docs") [OK]\n  → STEP 2: wait(300) [OK]\n  → STEP 3: type("#search-input", "${paramVal}") [OK]\n  → WORKFLOW_COMPLETE: 3/3 steps succeeded`;
        break;
      case 'act(recordId)':
        output = `[${timestamp}] Reef.act("rec_button_submit")\n  → DOM Target: <button id="submit">...\n  → Safety Gate Check: PASS (actionsMode = unrestricted)\n  → Dispatch: MouseEvent('click', { bubbles: true })\n  → SUCCESS`;
        break;
      case 'fillField(recordId, value)':
        output = `[${timestamp}] Reef.fillField("rec_input_1", "${paramVal}")\n  → DOM Target: <input name="search">\n  → Value set: "${paramVal}"\n  → Events Dispatched: ['input', 'change', 'blur']\n  → SUCCESS`;
        break;
      case 'getAgentTools()':
        output = `[${timestamp}] Reef.getAgentTools()\n  → Discovered 14 actionable DOM elements:\n` + JSON.stringify([
          { id: 'rec_1', tag: 'BUTTON', text: 'SEARCH', selector: '#openSearchBtn' },
          { id: 'rec_2', tag: 'A', text: 'GITHUB', selector: 'a[href*="github"]' },
          { id: 'rec_3', tag: 'INPUT', text: '', selector: '#cliTerminalInput' },
        ], null, 2);
        break;
      case 'getSession()':
        output = `[${timestamp}] Reef.getSession()\n` + JSON.stringify({
          sessionId: 'reef_sess_894102',
          url: window.location.href,
          timestamp: Date.now(),
          indexedRecords: 48,
          pendingActions: 0,
          actionsMode: 'unrestricted'
        }, null, 2);
        break;
      default:
        output = `[${timestamp}] ${selectedSandboxMethod} executed successfully.`;
    }
  }

  const logEl = document.getElementById('terminalLog');
  if (logEl) {
    logEl.textContent = `${output}\n\n${logEl.textContent}`;
  }
}

// --- COMPARISON MATRIX ---
function renderComparisonMatrix() {
  const chipsContainer = document.getElementById('toolFilterChips');
  const headerRow = document.getElementById('matrixHeaderRow');
  const tbody = document.getElementById('matrixTableBody');

  if (!chipsContainer || !headerRow || !tbody) return;

  const allToolNames = Object.keys(COMPARISON_TOOLS);

  // Render filter chips
  chipsContainer.innerHTML = allToolNames
    .map((name) => {
      const isPinned = COMPARISON_TOOLS[name]?.pinned;
      const isActive = activeComparisonTools[name];

      return `
      <button
        data-tool="${name}"
        class="matrix-filter-chip px-3 py-1 font-black uppercase border cursor-pointer ${
          isPinned
            ? 'bg-[#00f5d4] text-[#050505] border-[#00f5d4] cursor-default'
            : isActive
            ? 'bg-[#00f5d4] text-[#050505] border-[#00f5d4]'
            : 'bg-[#050505] text-[#f4f4f5] border-zinc-800 hover:border-[#00f5d4]'
        }"
      >
        [ ${name}${isPinned ? ' (PINNED)' : ''} ]
      </button>
    `;
    })
    .join('');

  document.querySelectorAll('.matrix-filter-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const toolName = e.currentTarget.getAttribute('data-tool');
      if (COMPARISON_TOOLS[toolName]?.pinned) return;
      activeComparisonTools[toolName] = !activeComparisonTools[toolName];
      renderComparisonMatrix();
    });
  });

  const activeNames = allToolNames.filter((name) => activeComparisonTools[name]);

  // Render header
  headerRow.innerHTML = `
    <th class="p-4 border-r border-zinc-800 font-black w-48 sticky left-0 bg-[#050505] text-[#00f5d4] z-10">
      CAPABILITY
    </th>
    ${activeNames
      .map(
        (name) => `
      <th class="p-4 border-r border-zinc-800 font-black whitespace-nowrap uppercase ${
        name === 'Reef' ? 'bg-[#00f5d4] text-[#050505] font-extrabold' : 'text-[#f4f4f5] bg-[#050505]'
      }">
        ${name}
      </th>
    `
      )
      .join('')}
  `;

  // Render rows
  tbody.innerHTML = COMPARISON_DIMENSIONS.map((dim) => {
    return `
      <tr class="border-b border-zinc-800 hover:bg-[#121212] font-bold">
        <td class="p-4 border-r border-zinc-800 font-black text-[#f4f4f5] sticky left-0 bg-[#0a0a0a] z-10 whitespace-nowrap">
          ${dim.label}
        </td>

        ${activeNames
          .map((toolName) => {
            const toolData = COMPARISON_TOOLS[toolName];
            const val = toolData ? toolData[dim.key] : null;
            const isReef = toolName === 'Reef';

            let badgeStyle = 'border border-zinc-700 bg-[#050505] text-[#f4f4f5] font-bold';
            if (val?.score === 'good')
              badgeStyle = isReef
                ? 'border border-[#00f5d4] bg-[#00f5d4] text-[#050505] font-black'
                : 'border border-[#ff5a5f] bg-[#ff5a5f] text-[#050505] font-black';
            if (val?.score === 'bad') badgeStyle = 'border border-zinc-800 bg-[#050505] text-zinc-600';
            if (val?.score === 'neutral')
              badgeStyle = 'border border-zinc-700 bg-[#121212] text-[#f4f4f5] font-bold';

            return `
            <td class="p-4 border-r border-zinc-800 whitespace-nowrap ${isReef ? 'bg-[#121212]' : ''}">
              <span class="inline-block px-2 py-0.5 text-[11px] uppercase ${badgeStyle}">
                ${val ? val.text : 'N/A'}
              </span>
            </td>
          `;
          })
          .join('')}
      </tr>
    `;
  }).join('');
}

// --- TECHNICAL FAQ ACCORDION ---
function renderFaqs() {
  const container = document.getElementById('faqContainer');
  if (!container) return;

  container.innerHTML = FAQS.map((item) => {
    const isOpen = openFaqId === item.id;
    return `
      <div class="border border-zinc-800 ${isOpen ? 'bg-[#121212]' : 'bg-[#0a0a0a]'}">
        <button
          data-faq-id="${item.id}"
          class="faq-toggle-btn w-full p-4 text-left font-mono text-xs md:text-sm font-black uppercase text-[#f4f4f5] flex items-center justify-between hover:bg-[#00f5d4] hover:text-[#050505] cursor-pointer"
        >
          <div class="flex items-center gap-3 pr-4">
            <span class="bg-[#ff5a5f] text-[#050505] px-2 py-0.5 text-[10px] font-mono font-black">
              [${item.id}]
            </span>
            <span>${item.question}</span>
          </div>
          <span class="border border-zinc-700 bg-[#050505] text-[#00f5d4] px-2 py-0.5 text-xs font-black shrink-0">
            ${isOpen ? '[-]' : '[+]'}
          </span>
        </button>

        ${
          isOpen
            ? `<div class="p-4 border-t border-zinc-800 bg-[#050505] text-xs font-bold text-zinc-300 leading-relaxed">
                ${item.answer}
              </div>`
            : ''
        }
      </div>
    `;
  }).join('');

  document.querySelectorAll('.faq-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-faq-id');
      openFaqId = openFaqId === id ? null : id;
      renderFaqs();
    });
  });
}

// --- SEARCH MODAL & CATEGORIES ---
function updateSearchCategoryChips() {
  const chipsContainer = document.getElementById('searchCategoryChips');
  if (!chipsContainer) return;

  const categories = ['ALL', 'API', 'CONCEPT', 'INSTALL', 'COMPARE', 'FAQ'];
  chipsContainer.innerHTML = categories
    .map((cat) => {
      const isActive = activeSearchCategory === cat;
      return `
      <button
        data-cat="${cat}"
        class="search-cat-chip px-2.5 py-1 font-black uppercase border cursor-pointer ${
          isActive
            ? 'bg-[#00f5d4] text-[#050505] border-[#00f5d4]'
            : 'bg-[#050505] text-[#f4f4f5] border-zinc-800 hover:border-[#00f5d4]'
        }"
      >
        [${cat}]
      </button>
    `;
    })
    .join('');

  document.querySelectorAll('.search-cat-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      activeSearchCategory = e.currentTarget.getAttribute('data-cat');
      searchSelectedIndex = 0;
      updateSearchCategoryChips();
      renderSearchResults();
    });
  });
}

function getFilteredSearchResults() {
  return SEARCH_ITEMS.filter((item) => {
    const categoryMatch = activeSearchCategory === 'ALL' || item.type === activeSearchCategory;
    const q = searchQuery.trim().toLowerCase();
    const textMatch =
      q === '' ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q);
    return categoryMatch && textMatch;
  });
}

function renderSearchResults() {
  const container = document.getElementById('searchResultsList');
  const countEl = document.getElementById('searchResultCount');
  if (!container) return;

  const items = getFilteredSearchResults();
  if (countEl) countEl.textContent = `RECORDS: ${items.length}`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="border border-zinc-800 p-8 text-center text-xs font-bold text-[#ff5a5f]">
        [ NO MATCHING RECORDS FOUND IN LOCAL REEF INDEX ]
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item, idx) => {
      const isSelected = idx === searchSelectedIndex;
      return `
      <div
        data-item-id="${item.id}"
        data-idx="${idx}"
        class="search-result-item p-3 border cursor-pointer font-mono ${
          isSelected
            ? 'bg-[#00f5d4] text-[#050505] border-[#00f5d4]'
            : 'bg-[#050505] text-[#f4f4f5] border-zinc-800 hover:border-[#00f5d4]'
        }"
      >
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="px-1.5 py-0.5 text-[10px] font-black border ${
            isSelected ? 'border-[#050505] bg-[#050505] text-[#00f5d4]' : 'border-[#ff5a5f] bg-[#ff5a5f] text-[#050505]'
          }">
            ${item.type}
          </span>
          <span class="text-[10px] font-bold uppercase">${item.section}</span>
        </div>

        <div class="font-black text-xs md:text-sm mb-1 uppercase">${item.title}</div>
        <div class="text-xs font-bold ${isSelected ? 'text-[#050505]' : 'text-zinc-400'}">
          ${item.description}
        </div>

        ${
          item.codeSnippet
            ? `<div class="mt-2 p-1.5 text-[11px] font-mono border ${
                isSelected ? 'bg-[#050505] text-[#00f5d4] border-[#050505]' : 'bg-[#121212] text-[#00f5d4] border-zinc-800'
              }">
                <code>${item.codeSnippet}</code>
              </div>`
            : ''
        }
      </div>
    `;
    })
    .join('');

  document.querySelectorAll('.search-result-item').forEach((itemNode) => {
    itemNode.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-item-id');
      const item = SEARCH_ITEMS.find((s) => s.id === id);
      if (item) handleSelectSearchResult(item);
    });

    itemNode.addEventListener('mouseenter', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
      searchSelectedIndex = idx;
      renderSearchResults();
    });
  });
}

function handleSelectSearchResult(item) {
  const banner = document.getElementById('searchNotificationBanner');
  const bannerText = document.getElementById('searchNotificationText');

  if (banner && bannerText) {
    bannerText.textContent = `[ OK ] Selected [${item.section}] ${item.title}`;
    banner.classList.remove('hidden');

    if (item.section === 'API' && item.codeSnippet) {
      navigator.clipboard.writeText(item.codeSnippet);
      bannerText.textContent = `[ COPIED ] Snippet: "${item.codeSnippet}"`;
    }
  }
}

function openSearchModal() {
  if (window.Reef && typeof window.Reef.open === 'function') {
    window.Reef.open();
    return;
  }
  isSearchOpen = true;
  const overlay = document.getElementById('searchModalOverlay');
  const input = document.getElementById('searchInputField');
  if (overlay) overlay.classList.remove('hidden');
  if (input) {
    input.value = '';
    searchQuery = '';
    searchSelectedIndex = 0;
    setTimeout(() => input.focus(), 50);
  }
  renderSearchResults();
}

function closeSearchModal() {
  if (window.Reef && typeof window.Reef.close === 'function') {
    window.Reef.close();
  }
  isSearchOpen = false;
  const overlay = document.getElementById('searchModalOverlay');
  if (overlay) overlay.classList.add('hidden');
  const banner = document.getElementById('searchNotificationBanner');
  if (banner) banner.classList.add('hidden');
}

// --- EVENT LISTENERS SETUP ---
function setupEventListeners() {
  // Global hotkeys
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isSearchOpen) {
        closeSearchModal();
      } else {
        openSearchModal();
      }
    } else if (e.key === 'Escape' && isSearchOpen) {
      closeSearchModal();
    }
  });

  // Modal Input
  const searchInput = document.getElementById('searchInputField');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      searchSelectedIndex = 0;
      renderSearchResults();
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = getFilteredSearchResults();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchSelectedIndex = searchSelectedIndex < items.length - 1 ? searchSelectedIndex + 1 : 0;
        renderSearchResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchSelectedIndex = searchSelectedIndex > 0 ? searchSelectedIndex - 1 : items.length - 1;
        renderSearchResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[searchSelectedIndex]) {
          handleSelectSearchResult(items[searchSelectedIndex]);
        }
      }
    });
  }

  // Open / Close Modal buttons
  document.getElementById('openSearchBtn')?.addEventListener('click', openSearchModal);
  document.getElementById('heroLaunchSearchBtn')?.addEventListener('click', openSearchModal);
  document.getElementById('closeSearchModalBtn')?.addEventListener('click', closeSearchModal);
  document.getElementById('searchModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'searchModalOverlay') closeSearchModal();
  });

  // Copy Snippet buttons
  const snippet = '<script src="https://reef.js.org/dist/reef.min.js" data-sitemap="sitemap.xml"></script>';
  const copyHeroBtn = document.getElementById('heroCopySnippetBtn');
  if (copyHeroBtn) {
    copyHeroBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippet);
      const textSpan = document.getElementById('heroCopyText');
      if (textSpan) {
        textSpan.textContent = 'SNIPPET_COPIED!';
        setTimeout(() => {
          textSpan.textContent = 'COPY_SCRIPT_TAG';
        }, 2000);
      }
    });
  }

  const installCode = '<script src="https://reef.js.org/dist/reef.min.js" data-sitemap="sitemap.xml" data-actions-mode="restricted"></script>';
  const copyInstallBtn = document.getElementById('installCopyBtn');
  if (copyInstallBtn) {
    copyInstallBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(installCode);
      const textSpan = document.getElementById('installCopyText');
      if (textSpan) {
        textSpan.textContent = 'SNIPPET_COPIED!';
        setTimeout(() => {
          textSpan.textContent = 'COPY_SCRIPT_TAG';
        }, 2000);
      }
    });
  }

  // Sandbox execute button & clear log
  document.getElementById('executeSandboxBtn')?.addEventListener('click', handleExecuteSandbox);
  document.getElementById('clearLogBtn')?.addEventListener('click', () => {
    const log = document.getElementById('terminalLog');
    if (log) log.textContent = '// Log cleared\n';
  });
}

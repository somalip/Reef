window.Reef.setOnReady(() => setOutput('chainOutput', '<span class="status-indicator active"></span>Reef initialized! Ready for agentic operations.'));

function setOutput(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setStatus(id, state, text) {
  setOutput(id, `<span class="status-indicator ${state}"></span>${text}`);
}

function log(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML += html;
}

function highlight(el, ms = 500) {
  if (!el) return;
  el.classList.add('active-highlight');
  setTimeout(() => el.classList.remove('active-highlight'), ms);
}

async function runChainDemo() {
  const out = document.getElementById('chainOutput');
  setStatus('chainOutput', 'running', 'Starting chainable demo...');

  const agent = window.Reef.agent();
  for (const id of ['chainTarget1', 'chainTarget2', 'chainAlertBtn']) {
    log('chainOutput', `<div class="log-entry">Click ${id}</div>`);
    const btn = document.getElementById(id);
    highlight(btn);
    await agent.click(`#${id}`);
    log('chainOutput', `<div class="log-entry success">OK Clicked ${id}</div>`);
  }

  log('chainOutput', '<div class="log-entry success">OK Chain completed successfully</div>');
  setStatus('chainOutput', 'active', 'Chain completed successfully.');
}

async function runWorkflowDemo() {
  setStatus('workflowOutput', 'running', 'Running workflow with 3 steps...');

  const workflow = [
    { action: 'type', selector: '#wfEmail', value: 'agent@reef.js.org' },
    { action: 'type', selector: '#wfUsername', value: 'reef-agent-user' },
    { action: 'wait', timeout: 200 }
  ];

  await window.Reef.executeWorkflow(workflow, {
    onStepStart: (step, i) => log('workflowOutput', `<div class="log-entry">Step ${i + 1}: ${step.action}${step.selector ? ' on ' + step.selector : ''}</div>`),
    onStepComplete: (step, i) => {
      const field = step.selector ? document.querySelector(step.selector) : null;
      if (field) highlight(field, 400);
      log('workflowOutput', `<div class="log-entry success">OK Step ${i + 1} completed</div>`);
    }
  });

  log('workflowOutput', '<div class="log-entry success">OK Workflow completed successfully!</div>');
  log('workflowOutput', `<div class="log-entry">Values: Email=${document.getElementById('wfEmail')?.value}, Username=${document.getElementById('wfUsername')?.value}</div>`);
  setStatus('workflowOutput', 'active', 'Workflow completed successfully.');
}

async function runWorkflowWithRetries() {
  setStatus('workflowOutput', 'running', 'Running workflow with retries (maxRetries: 2)...');

  await window.Reef.executeWorkflow([
    { action: 'type', selector: '#wfEmail', value: 'retry-test@reef.js.org' },
    { action: 'wait', timeout: 500 },
    { action: 'type', selector: '#wfUsername', value: 'retry-user' }
  ], {
    maxRetries: 2,
    retryDelay: 100,
    onStepStart: (step, i) => log('workflowOutput', `<div class="log-entry">Step ${i + 1}: ${step.action}</div>`),
    onStepComplete: (step, i) => log('workflowOutput', `<div class="log-entry success">OK Step ${i + 1} completed</div>`),
    onStepError: (step, i, error) => log('workflowOutput', `<div class="log-entry error">ERROR Step ${i + 1}: ${error.message}</div>`)
  });

  log('workflowOutput', '<div class="log-entry success">OK Workflow with retries completed!</div>');
  setStatus('workflowOutput', 'active', 'Workflow completed successfully.');
}

async function runActDemo(buttonId) {
  const out = document.getElementById('actOutput');
  const btn = document.getElementById(buttonId);
  setStatus('actOutput', 'running', `Running act("${buttonId}")...`);

  highlight(btn, 600);
  await window.Reef.act(buttonId);

  log('actOutput', '<div class="log-entry success">OK Action executed successfully</div>');
  log('actOutput', `<div class="log-entry">Button #${buttonId} was clicked</div>`);
  if (buttonId === 'actDemo1') log('actOutput', '<div class="log-entry">-> Action 1 result: Success!</div>');
  if (buttonId === 'actDemo2') log('actOutput', '<div class="log-entry">-> Action 2 result: Processed!</div>');
  setStatus('actOutput', 'active', 'Action completed successfully.');
}

async function runFillFieldDemo(fieldId) {
  const values = {
    wfEmail: 'agent@reef.js.org',
    wfUsername: 'agent-user-123',
    wfMessage: 'This text was filled by Reef.fillField()'
  };

  const field = document.getElementById(fieldId);
  setStatus('fillFieldOutput', 'running', `Filling #${fieldId}...`);

  if (field) {
    field.focus();
    highlight(field, 300);
  }

  await window.Reef.fillField(fieldId, values[fieldId]);
  log('fillFieldOutput', '<div class="log-entry success">OK Field filled successfully</div>');
  log('fillFieldOutput', `<div class="log-entry">Value: "${values[fieldId]}"</div>`);
  setStatus('fillFieldOutput', 'active', 'Field filled successfully.');
}

async function runGetAgentToolsDemo() {
  setStatus('toolsOutput', 'running', 'Fetching tools...');

  const tools = await window.Reef.getAgentTools();
  setOutput('toolsOutput', `<div class="log-entry">Found ${tools.length} tools:</div>` + tools.slice(0, 10).map(t => `<div class="log-entry">- ${t.type}: ${t.name || t.id}${t.selector ? ' (' + t.selector + ')' : ''}</div>`).join('') + '<div class="log-entry success">OK Tools retrieved!</div>');
  setStatus('toolsOutput', 'active', 'Tools retrieved successfully.');
}

async function runFindActionableDemo() {
  setStatus('toolsOutput', 'running', 'Searching for "chain"...');

  const result = await window.Reef.agent().findActionable('chain');
  if (result) {
    log('toolsOutput', `<div class="log-entry success">OK Found: ${result.id || result.selector || 'unknown'}</div>`);
    log('toolsOutput', `<div class="log-entry">Selector: ${result.selector || 'N/A'}</div>`);
  } else {
    log('toolsOutput', '<div class="log-entry">No actionable element found for "chain"</div>');
  }

  setStatus('toolsOutput', 'active', 'Search completed.');
}

async function runGetSessionDemo() {
  setStatus('sessionOutput', 'running', 'Fetching session...');

  const session = window.Reef.agent().getSession();
  const now = new Date();
  setOutput('sessionOutput',
    `<div class="log-entry">Session ID: ${session.id}</div>` +
    `<div class="log-entry">URL: ${session.url}</div>` +
    `<div class="log-entry">Timestamp: ${now.toLocaleTimeString()}</div>` +
    `<div class="log-entry success">OK Session retrieved!</div>`
  );
  setStatus('sessionOutput', 'active', 'Session retrieved successfully.');
}

async function runNavigateDemo(url) {
  setStatus('navOutput', 'running', 'Navigating to index.html...');
  log('navOutput', '<div class="log-entry">Note: Navigation disabled in demo for safety</div>');
  log('navOutput', `<div class="log-entry">In production, this would call: Reef.agent().navigate("${url}")</div>`);
  log('navOutput', '<div class="log-entry success">OK Navigation would complete!</div>');
  setStatus('navOutput', 'active', 'Navigation demo complete.');
}

async function runBackDemo() {
  setStatus('navOutput', 'running', 'Calling back()...');
  log('navOutput', '<div class="log-entry">Note: Navigation disabled in demo</div>');
  log('navOutput', '<div class="log-entry">In production, this would call: Reef.agent().back()</div>');
  log('navOutput', '<div class="log-entry success">OK Back completed!</div>');
  setStatus('navOutput', 'active', 'Back demo complete.');
}

async function runWaitDemo() {
  const start = Date.now();
  setStatus('navOutput', 'running', 'Waiting 1 second...');
  await window.Reef.agent().wait(1000);
  log('navOutput', `<div class="log-entry success">OK Wait completed after ${((Date.now() - start) / 1000).toFixed(2)} seconds!</div>`);
  setStatus('navOutput', 'active', 'Wait completed.');
}

async function runExtractDemo() {
  setStatus('extractOutput', 'running', 'Extracting content...');
  const content = await window.Reef.agent().extract('#extractTarget');
  log('extractOutput', `<div class="log-entry success">OK Extracted: "${content}"</div>`);
  setStatus('extractOutput', 'active', 'Extraction completed.');
}

document.getElementById('chainAlertBtn').addEventListener('click', () => {
  const out = document.getElementById('chainOutput');
  if (!out.innerHTML.includes('chainAlertBtn')) {
    log('chainOutput', `<div class="log-entry success">-> Alert displayed at ${new Date().toLocaleTimeString()}</div>`);
  }
});

document.getElementById('actDestructive').addEventListener('click', () => {
  setOutput('actOutput',
    '<div class="log-entry error">WARNING: Destructive action triggered</div>' +
    '<div class="log-entry">In production, this would be blocked when actionsMode="navigate-only"</div>'
  );
});
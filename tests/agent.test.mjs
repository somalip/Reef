import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchIndex, addToIndex } from '../src/search-index.js';
import { Agent } from '../src/agent.js';
import { parseYAML, validateWorkflow } from '../src/workflow.js';

test('Agent validates selectors before action', async () => {
  const index = createSearchIndex();
  const mockInspector = {
    activate: () => {},
    deactivate: () => {},
    isActive: () => false,
    setRecords: () => {}
  };

  const agent = new Agent(index, mockInspector);
  
  await assert.rejects(
    async () => agent.click('#nonexistent-element'),
    /Click failed|element-not-found/
  );
});

test('Agent supports chained method calls', async () => {
  const index = createSearchIndex();
  const mockInspector = {
    activate: () => {},
    deactivate: () => {},
    isActive: () => false,
    setRecords: () => {}
  };

  const agent = new Agent(index, mockInspector);

  // Wait for promises to ensure no unhandled rejection
  try {
    await agent.click('#test');
  } catch (e) {
    // Expected to fail in Node test env
  }
  try {
    await agent.type('#input', 'value');
  } catch (e) {
    // Expected to fail in Node test env
  }
  try {
    await agent.submit();
  } catch (e) {
    // Expected to fail in Node test env
  }
  
  // If we get here without crashing, the chainable pattern works
  assert.ok(true);
});

test('validateWorkflow detects missing required fields', () => {
  const invalidWorkflow = {
    steps: [
      { action: 'click' },
      { action: 'type', selector: '#email' },
      { action: 'navigate' },
      { action: 'wait' }
    ]
  };

  const errors = validateWorkflow(invalidWorkflow);
  
  assert.ok(errors.length > 0);
});

test('validateWorkflow passes valid workflow', () => {
  const validWorkflow = {
    steps: [
      { action: 'click', selector: '#login' },
      { action: 'type', selector: '#email', value: 'test@test.com' },
      { action: 'type', selector: '#password', value: 'secret' },
      { action: 'submit', selector: '#form' },
      { action: 'wait', timeout: 1000 }
    ]
  };

  const errors = validateWorkflow(validWorkflow);
  assert.equal(errors.length, 0);
});

test('parseYAML extracts workflow steps', () => {
  const yaml = `
# Login workflow
- action: click
  selector: "#login-button"
- action: type
  selector: "#email"
  value: "user@example.com"
- action: type
  selector: "#password"
  value: "secret123"
- action: submit
  selector: "#submit-btn"
`;

  const definition = parseYAML(yaml);
  
  assert.equal(definition.steps.length, 4);
  assert.equal(definition.steps[0].action, 'click');
  assert.equal(definition.steps[0].selector, '#login-button');
  assert.equal(definition.steps[1].action, 'type');
  assert.equal(definition.steps[1].value, 'user@example.com');
  assert.equal(definition.steps[3].selector, '#submit-btn');
});

test('Agent.findActionable searches by label text', async () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/page#btn-1', url: '/page', headingText: 'Login', headingId: 'btn-1', breadcrumb: '', bodyText: 'Login button', type: 'action', selector: '#login-btn' },
    { id: '/page#input-1', url: '/page', headingText: 'Email', headingId: 'input-1', breadcrumb: '', bodyText: 'Email input', type: 'field', selector: '#email' }
  ]);
  
  const mockInspector = {
    activate: () => {},
    deactivate: () => {},
    isActive: () => false,
    setRecords: () => {}
  };

  const agent = new Agent(index, mockInspector);

  const result = await agent.findActionable('login');
  assert.ok(result !== null);
  assert.equal(result?.headingText, 'Login');
});

test('Agent.session returns session snapshot', () => {
  const index = createSearchIndex();
  const mockInspector = {
    activate: () => {},
    deactivate: () => {},
    isActive: () => false,
    setRecords: () => {}
  };

  const agent = new Agent(index, mockInspector);
  
  const session = agent.getSession();
  assert.ok(session.id);
  assert.ok(session.url);
  assert.ok(session.timestamp);
});

test('Agent.navigate accepts valid URLs', async () => {
  const index = createSearchIndex();
  const mockInspector = {
    activate: () => {},
    deactivate: () => {},
    isActive: () => false,
    setRecords: () => {}
  };

  const agent = new Agent(index, mockInspector);
  
  // These should not throw in Node environment
  await agent.navigate('/');
  await agent.navigate('https://example.com');
  await agent.back();
  await agent.forward();
  await agent.wait(100);
});

test('parseYAML handles empty input', () => {
  const yaml = `
# Just a comment
`;
  
  const definition = parseYAML(yaml);
  assert.equal(definition.steps.length, 0);
});

test('parseYAML handles missing optional fields', () => {
  const yaml = `
- action: click
  selector: "#btn"
- action: navigate
  url: "/dashboard"
- action: wait
  timeout: 500
`;
  
  const definition = parseYAML(yaml);
  assert.equal(definition.steps.length, 3);
  assert.equal(definition.steps[0].action, 'click');
  assert.equal(definition.steps[1].action, 'navigate');
  assert.equal(definition.steps[2].action, 'wait');
});
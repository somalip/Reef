import type { AgentToolDefinition } from './types.js';
import type { Agent } from './agent.js';

export const agentTools: AgentToolDefinition[] = [
  { name: 'observe', description: 'List currently visible actionable elements.', inputSchema: { type: 'object', properties: {} } },
  { name: 'click', description: 'Click an indexed selector or action record.', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
  { name: 'type', description: 'Type into a field.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } },
  { name: 'navigate', description: 'Navigate to a URL or SPA route.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'extractText', description: 'Extract text or value from a selector.', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
  { name: 'waitForStable', description: 'Wait for the DOM to become quiet.', inputSchema: { type: 'object', properties: { quietMs: { type: 'number' }, timeout: { type: 'number' } } } },
  { name: 'back', description: 'Go back one history entry.', inputSchema: { type: 'object', properties: {} } },
];

export function createAgentTools(agent: Agent) {
  return {
    observe: (args?: any) => agent.observe(args),
    click: async (args: any) => { await agent.click(args.selector); return agent.getLastActionResult(); },
    type: async (args: any) => { await agent.type(args.selector, args.value); return agent.getLastActionResult(); },
    navigate: async (args: any) => { await agent.navigate(args.url); return { success: true, changed: true, url: typeof window !== 'undefined' ? window.location.href : args.url }; },
    extractText: (args: any) => agent.extract(args.selector),
    waitForStable: async (args?: any) => { await agent.waitForStable(args); return { success: true }; },
    back: async () => { await agent.back(); return { success: true }; },
  };
}

import type { WorkflowStep } from '../types.js';
export type WorkflowTemplateName = 'login' | 'search' | 'form-filling';
const templates: Record<WorkflowTemplateName, WorkflowStep[]> = { login: [{ action:'type', selector:'[name="username"]', value:'{{username}}' }, { action:'type', selector:'[name="password"]', value:'{{password}}' }, { action:'submit', selector:'form' }], search: [{ action:'type', selector:'input[type="search"]', value:'{{query}}' }, { action:'submit', selector:'form' }], 'form-filling': [{ action:'type', selector:'{{selector}}', value:'{{value}}' }, { action:'submit', selector:'form' }] };
export function listWorkflowTemplates(): WorkflowTemplateName[] { return Object.keys(templates) as WorkflowTemplateName[]; }
export function getWorkflowTemplate(name: WorkflowTemplateName, values: Record<string,string> = {}): WorkflowStep[] { return templates[name].map(step => Object.fromEntries(Object.entries(step).map(([k,v]) => [k, typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? v) : v])) as WorkflowStep); }
export function exportWorkflow(steps: WorkflowStep[]): string { return JSON.stringify({ version: 1, steps }, null, 2); }
export function recordWorkflow(steps: WorkflowStep[]): { add(step: WorkflowStep): void; stop(): WorkflowStep[] } { return { add: step => steps.push(step), stop: () => steps.slice() }; }

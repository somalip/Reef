import type { WorkflowStep } from '../types.js';
export type ActionCondition = (context: Record<string, unknown>) => boolean | Promise<boolean>;
export interface ConditionalStep { when: ActionCondition; then: WorkflowStep[]; otherwise?: WorkflowStep[]; }
export async function composeActions(...actions: Array<WorkflowStep[] | ((context: Record<string,unknown>) => WorkflowStep[] | Promise<WorkflowStep[]>)>): Promise<WorkflowStep[]> { const context: Record<string,unknown> = {}; const out: WorkflowStep[] = []; for (const action of actions) out.push(...(typeof action === 'function' ? await action(context) : action)); return out; }
export async function conditionalActions(condition: ActionCondition, thenSteps: WorkflowStep[], otherwise: WorkflowStep[] = [], context: Record<string,unknown> = {}): Promise<WorkflowStep[]> { return await condition(context) ? thenSteps : otherwise; }
export function repeatActions(steps: WorkflowStep[], times: number): WorkflowStep[] { return Array.from({ length: Math.max(0, times) }, () => steps).flat(); }

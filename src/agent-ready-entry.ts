import { initAgentReady } from './agent-ready.js';

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAgentReady(), { once: true });
  else initAgentReady();
}

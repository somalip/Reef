export function parseYAML(yaml) {
    const lines = yaml.split('\n');
    const def = { steps: [] };
    let currentStep = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed)
            continue;
        if (trimmed.startsWith('- action:')) {
            // Save previous step if exists
            if (currentStep) {
                def.steps.push(currentStep);
            }
            const actionMatch = trimmed.match(/- action:\s*(\w+)/);
            currentStep = { action: actionMatch ? actionMatch[1] : 'click' };
        }
        else if (currentStep) {
            if (trimmed.includes('selector:')) {
                const selectorMatch = trimmed.match(/selector:\s*"?([^"\n]+)"?/);
                if (selectorMatch)
                    currentStep.selector = selectorMatch[1].trim();
            }
            else if (trimmed.includes('value:')) {
                const valueMatch = trimmed.match(/value:\s*"?([^"\n]+)"?/);
                if (valueMatch)
                    currentStep.value = valueMatch[1].trim();
            }
            else if (trimmed.includes('url:')) {
                const urlMatch = trimmed.match(/url:\s*"?([^"\n]+)"?/);
                if (urlMatch)
                    currentStep.url = urlMatch[1].trim();
            }
            else if (trimmed.includes('timeout:')) {
                const timeoutMatch = trimmed.match(/timeout:\s*(\d+)/);
                if (timeoutMatch)
                    currentStep.timeout = parseInt(timeoutMatch[1], 10);
            }
        }
    }
    // Push the last step
    if (currentStep) {
        def.steps.push(currentStep);
    }
    return def;
}
export function validateWorkflow(def) {
    const errors = [];
    if (!def.steps || !Array.isArray(def.steps)) {
        errors.push('Workflow must have a "steps" array');
        return errors;
    }
    for (let i = 0; i < def.steps.length; i++) {
        const step = def.steps[i];
        if (!step.action) {
            errors.push(`Step ${i + 1}: missing "action"`);
            continue;
        }
        const requiresSelector = ['click', 'type', 'submit', 'extract'];
        if (requiresSelector.includes(step.action)) {
            if (!step.selector && !step.recordId) {
                errors.push(`Step ${i + 1} (${step.action}): missing "selector" or "recordId"`);
            }
        }
        if (step.action === 'type' && !step.value) {
            errors.push(`Step ${i + 1} (${step.action}): missing "value"`);
        }
        if (step.action === 'navigate' && !step.url) {
            errors.push(`Step ${i + 1} (${step.action}): missing "url"`);
        }
        if (step.action === 'wait' && !step.timeout && step.timeout !== 0) {
            errors.push(`Step ${i + 1} (${step.action}): missing "timeout"`);
        }
    }
    return errors;
}
export async function executeWorkflow(definition, agent) {
    const steps = Array.isArray(definition) ? definition : definition.steps;
    const options = Array.isArray(definition) ? {} : definition.options || {};
    const validated = validateWorkflow({ steps });
    if (validated.length > 0) {
        throw new Error(`Invalid workflow: ${validated.join('; ')}`);
    }
    await agent.executeWorkflow(steps, options);
}

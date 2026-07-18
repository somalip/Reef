export class Agent {
    constructor(index, inspector, actionsMode = 'execute') {
        this.index = index;
        this.inspector = inspector;
        this.actionsMode = actionsMode;
    }
    async click(selector) {
        const resolved = await this.resolveSelector(selector);
        if (!resolved.success) {
            throw new Error(resolved.reason || 'Click failed');
        }
        const element = resolved.element;
        if (element && typeof MouseEvent !== 'undefined') {
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: typeof window !== 'undefined' ? window : undefined,
            });
            element.dispatchEvent(clickEvent);
        }
        return this;
    }
    async type(selector, value) {
        const resolved = await this.resolveSelector(selector);
        if (!resolved.success) {
            throw new Error(resolved.reason || 'Type failed');
        }
        const element = resolved.element;
        if (element && ('value' in element)) {
            const descriptor = Object.getOwnPropertyDescriptor(element, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(element, value);
            }
            else {
                element.value = value;
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return this;
    }
    async submit(selector) {
        let element = null;
        if (selector) {
            const resolved = await this.resolveSelector(selector);
            if (resolved.success && resolved.element) {
                element = resolved.element;
            }
        }
        else if (typeof document !== 'undefined') {
            element = document.querySelector('form') || document.querySelector('button[type="submit"]') ||
                document.querySelector('input[type="submit"]');
        }
        if (element) {
            if (element instanceof HTMLFormElement) {
                element.dispatchEvent(new Event('submit', { bubbles: true }));
            }
            else {
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: typeof window !== 'undefined' ? window : undefined,
                });
                element.dispatchEvent(clickEvent);
            }
        }
        return this;
    }
    async navigate(url) {
        if ((url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) && typeof window !== 'undefined') {
            window.location.href = url;
        }
        return this;
    }
    async back() {
        if (typeof window !== 'undefined') {
            window.history.back();
        }
        return this;
    }
    async forward() {
        if (typeof window !== 'undefined') {
            window.history.forward();
        }
        return this;
    }
    async wait(timeout = 1000) {
        await new Promise(resolve => setTimeout(resolve, timeout));
        return this;
    }
    async extract(selector) {
        const resolved = await this.resolveSelector(selector);
        if (!resolved.success) {
            throw new Error(resolved.reason || 'Extract failed');
        }
        const element = resolved.element;
        if (!element) {
            throw new Error('Element not found');
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return element.value;
        }
        return element.textContent?.trim() || '';
    }
    async resolveSelector(selector) {
        let element = null;
        if (typeof selector === 'string') {
            element = typeof document !== 'undefined' ? document.querySelector(selector) : null;
        }
        else if (selector) {
            const record = this.index.allSections.find(r => r.id === selector.id);
            if (record?.selector && typeof document !== 'undefined') {
                element = document.querySelector(record.selector);
            }
        }
        if (!element) {
            return { success: false, reason: 'element-not-found' };
        }
        return { success: true, element };
    }
    async findActionable(text) {
        const results = this.index.allSections.filter(r => r.type === 'action' || r.type === 'field');
        const normalized = text.toLowerCase().trim();
        for (const record of results) {
            if (record.headingText.toLowerCase().includes(normalized) ||
                record.label?.toLowerCase().includes(normalized)) {
                return record;
            }
        }
        return null;
    }
    async executeWorkflow(steps, options) {
        const maxRetries = options?.maxRetries ?? 0;
        const retryDelay = options?.retryDelay ?? 500;
        const stopOnError = options?.stopOnError ?? true;
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            options?.onStepStart?.(step, i);
            let attempt = 0;
            let success = false;
            while (attempt <= maxRetries && !success) {
                try {
                    switch (step.action) {
                        case 'click':
                            if (step.selector) {
                                await this.click(step.selector);
                            }
                            else if (step.recordId) {
                                const record = this.index.allSections.find(r => r.id === step.recordId);
                                if (record)
                                    await this.click(record);
                            }
                            success = true;
                            break;
                        case 'type':
                            if (step.selector) {
                                await this.type(step.selector, step.value || '');
                            }
                            else if (step.recordId) {
                                const record = this.index.allSections.find(r => r.id === step.recordId);
                                if (record)
                                    await this.type(record, step.value || '');
                            }
                            success = true;
                            break;
                        case 'type':
                            if (step.selector) {
                                await this.type(step.selector, step.value || '');
                            }
                            else if (step.recordId) {
                                const record = this.index.allSections.find(r => r.id === step.recordId);
                                if (record)
                                    await this.type(record, step.value || '');
                            }
                            success = true;
                            break;
                        case 'navigate':
                            if (step.url) {
                                await this.navigate(step.url);
                                await this.waitForNavigation();
                            }
                            success = true;
                            break;
                        case 'extract':
                            success = true;
                            break;
                        case 'submit':
                            await this.submit(step.selector);
                            success = true;
                            break;
                        case 'back':
                            await this.back();
                            success = true;
                            break;
                        case 'forward':
                            await this.forward();
                            success = true;
                            break;
                        case 'wait':
                            if (step.timeout) {
                                await this.wait(step.timeout);
                            }
                            success = true;
                            break;
                    }
                    options?.onStepComplete?.(step, i, success);
                }
                catch (error) {
                    attempt++;
                    if (attempt > maxRetries) {
                        options?.onStepError?.(step, i, error);
                        if (stopOnError) {
                            throw error;
                        }
                    }
                    else {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }
        }
    }
    async waitForNavigation() {
        await new Promise(resolve => {
            if (typeof document !== 'undefined') {
                const checkReady = () => {
                    if (document.readyState === 'complete') {
                        resolve();
                    }
                    else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            }
            else {
                resolve();
            }
        });
    }
    getSession() {
        return {
            id: this.generateSessionId(),
            url: typeof window !== 'undefined' ? window.location.href : 'about:blank',
            timestamp: Date.now(),
            cookies: this.getCookies(),
            localStorage: this.getLocalStorageSnapshot(),
        };
    }
    generateSessionId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
    getCookies() {
        const cookies = {};
        if (typeof document !== 'undefined') {
            document.cookie.split(';').forEach(cookie => {
                const [name, value] = cookie.trim().split('=');
                if (name)
                    cookies[name] = value || '';
            });
        }
        return cookies;
    }
    getLocalStorageSnapshot() {
        const storage = {};
        try {
            if (typeof localStorage !== 'undefined') {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        storage[key] = localStorage.getItem(key) || '';
                    }
                }
            }
        }
        catch (e) {
            // localStorage may not be available
        }
        return storage;
    }
}

/**
 * Reef Documentation - Interactive JavaScript
 * Handles code copying, syntax highlighting, navigation, and interactive demos
 */

// ========================================
// Copy Code Functionality
// ========================================
function copyCode(button) {
    const pre = button.parentElement.querySelector('pre');
    if (!pre) return;

    const code = pre.textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        button.classList.add('copied');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        
        setTimeout(() => {
            button.classList.remove('copied');
            button.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy code:', err);
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        button.classList.add('copied');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        
        setTimeout(() => {
            button.classList.remove('copied');
            button.textContent = originalText;
        }, 2000);
    });
}

// ========================================
// Syntax Highlighting
// ========================================
function highlightCode() {
    const codeBlocks = document.querySelectorAll('.code-block code');
    
    codeBlocks.forEach(block => {
        const text = block.textContent;
        if (!text) return;

        const pre = block.parentElement;
        const language = pre.classList.contains('language-javascript') ? 'javascript' :
                       pre.classList.contains('language-typescript') ? 'typescript' :
                       pre.classList.contains('language-html') ? 'html' :
                       pre.classList.contains('language-json') ? 'json' :
                       pre.classList.contains('language-bash') ? 'bash' :
                       pre.classList.contains('language-mermaid') ? 'mermaid' :
                       pre.classList.contains('language-text') ? 'text' :
                       'text';

        const highlighted = applySyntaxHighlighting(text, language);
        block.innerHTML = highlighted;
    });
}

function applySyntaxHighlighting(text, language) {
    if (language === 'mermaid' || language === 'text') {
        return escapeHtml(text);
    }

    if (language === 'html') {
        return highlightHtml(text);
    }

    if (language === 'json') {
        return highlightJson(text);
    }

    if (language === 'bash') {
        return highlightBash(text);
    }

    return highlightJavaScript(text);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightHtml(text) {
    let result = text.replace(/&lt;(\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, '&lt;<span class="tag">$1$2</span>');
    
    result = result.replace(/([a-zA-Z-]+)=/g, '<span class="attr">$1</span>=');
    
    result = result.replace(/="([^"]*)"/g, '="<span class="string">$1</span>"');
    result = result.replace(/='([^']*)'/g, "='<span class='string'>$1</span>'");
    
    result = result.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
    
    return result;
}

function highlightJson(text) {
    let result = text;
    
    result = result.replace(/"([^"]+)":/g, '<span class="attr">"$1"</span>:');
    
    result = result.replace(/:\s*"([^"]+)"/g, ': <span class="string">"$1</span>');
    
    result = result.replace(/(\b\d+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b\d+\.\d+\b)/g, '<span class="number">$1</span>');
    
    result = result.replace(/(\btrue\b|\bfalse\b|\bnull\b)/g, '<span class="keyword">$1</span>');
    
    result = result.replace(/[{}\[\]]/g, '<span class="punctuation">$&</span>');
    result = result.replace(/:/g, '<span class="punctuation">:</span>');
    result = result.replace(/,\s*/g, '<span class="punctuation">,</span> ');
    
    return result;
}

function highlightBash(text) {
    let result = text.replace(/(\b[np]m\b|\bnpm\b|\bgit\b|\bnode\b|\bnpm\b)/g, '<span class="function">$1</span>');
    
    result = result.replace(/(\-[a-zA-Z\-]+)/g, '<span class="keyword">$1</span>');
    
    result = result.replace(/(\b[a-zA-Z0-9_\-]+\.js\b|\b[a-zA-Z0-9_\-]+\.ts\b|\b[a-zA-Z0-9_\-]+\.json\b)/g, '<span class="string">$1</span>');
    
    result = result.replace(/(#.*)/g, '<span class="comment">$1</span>');
    
    return result;
}

function highlightJavaScript(text) {
    const keywords = [
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
        'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
        'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
        'await', 'async', 'let', 'static', 'get', 'set', 'from'
    ];
    
    let result = text;
    
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    result = result.replace(keywordRegex, '<span class="keyword">$1</span>');
    
    result = result.replace(/(\b[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, '<span class="function">$1</span>(');
    
    result = result.replace(/("[^"]*")/g, '<span class="string">$1</span>');
    result = result.replace(/('(\\.'|[^'])*')/g, '<span class="string">$1</span>');
    
    result = result.replace(/(`(\\\`|[^`])*`)/g, '<span class="string">$1</span>');
    
    result = result.replace(/(\b\d+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b0x[0-9a-fA-F]+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b\d+\.\d+\b)/g, '<span class="number">$1</span>');
    
    result = result.replace(/(\/\/[^\n]*)/g, '<span class="comment">$1</span>');
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>');
    
    result = result.replace(/([+\-*/%=<>!&|^~?:])/g, '<span class="punctuation">$1</span>');
    
    result = result.replace(/([{}[\]();:.,])/g, '<span class="punctuation">$1</span>');
    
    result = result.replace(/\bthis\b/g, '<span class="keyword">this</span>');
    
    result = result.replace(/(\btrue\b|\bfalse\b|\bnull\b|\bundefined\b)/g, '<span class="keyword">$1</span>');
    
    return result;
}

// ========================================
// Smooth Scroll Navigation
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    highlightCode();

    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                updateActiveNavLink(targetId);
                
                // Close mobile sidebar if open
                if (sidebar && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                    sidebarOverlay.classList.remove('active');
                }
            }
        });
    });

    // Update active nav link on scroll
    window.addEventListener('scroll', debounce(() => {
        const sections = document.querySelectorAll('.section');
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        
        let currentSection = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            const sectionHeight = section.offsetHeight;
            const scrollPosition = window.scrollY;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                currentSection = section.getAttribute('id');
            }
        });

        if (currentSection) {
            updateActiveNavLink(`#${currentSection}`);
        }
    }, 100));

    function updateActiveNavLink(targetId) {
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === targetId) {
                link.classList.add('active');
            }
        });
    }
});

// ========================================
// Utility Functions
// ========================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        console.log('Search shortcut pressed');
    }
});

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('loaded');
    initializeDemos();
    initializeReefDemos();
    if (document.getElementById('demo-cache-table-body')) {
        renderCacheSimTable();
    }
});

// ========================================
// Interactive Demo Functionality
// ========================================
function initializeDemos() {
    const demoContainers = document.querySelectorAll('.demo-container');
    demoContainers.forEach(container => {
        // Initialize demo functionality
    });
}

// ========================================
// Reef Library Demo Integration
// ========================================
function initializeReefDemos() {
    // Wait for Reef to be available or load it
    if (typeof window.Reef !== 'undefined') {
        setupReefDemoCallbacks();
    } else {
        // Load the Reef library from dist
        const script = document.createElement('script');
        script.src = 'reef.min.js';
        script.onload = () => {
            if (typeof window.Reef !== 'undefined') {
                setupReefDemoCallbacks();
            }
        };
        document.head.appendChild(script);
    }
}

function setupReefDemoCallbacks() {
    // Reef demo functionality is now available
    console.log('Reef demos initialized');
}

// ========================================
// Reef Demo Functions - Comprehensive Feature Demos
// ========================================
function demoSearch(query) {
    const result = document.getElementById('demo-search-result');
    if (!result) return;
    
    const mockResults = [
        { type: 'section', headingText: 'Installation Guide', url: '#installation', score: 0.95 },
        { type: 'action', headingText: 'Run Tests', url: '#test', score: 0.87 },
        { type: 'field', headingText: 'Email Field', url: '#email', score: 0.72 }
    ];
    
    const filtered = mockResults.filter(r => 
        r.headingText.toLowerCase().includes(query.toLowerCase()) ||
        r.type.includes(query.toLowerCase())
    );
    
    const html = filtered.length > 0 
        ? filtered.map(r => `<div class="demo-result-item"><span class="type-${r.type}">${r.type}</span>: ${r.headingText} (score: ${(r.score * 100).toFixed(0)}%)</div>`)
        : `<div class="demo-result-item">No results for "${query}" - showing mock results</div>`;
    
    result.innerHTML = `<h4>Search Results for "${query}":</h4>${html}`;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 5000);
}

function demoAgentAction(action) {
    const result = document.getElementById('demo-agent-result');
    const cursor = document.getElementById('agent-mock-cursor');
    const emailInput = document.getElementById('mock-email-input');
    const passwordInput = document.getElementById('mock-password-input');
    const loginBtn = document.getElementById('mock-login-btn');
    const browserContent = document.getElementById('mock-browser-content');
    const browserUrl = document.getElementById('mock-browser-url');
    
    if (!result) return;
    
    const actions = {
        'click': { desc: 'Clicking element #mock-login-btn', success: true },
        'type': { desc: 'Typing "hello@example.com" into #email field', success: true },
        'submit': { desc: 'Submitting form', success: true },
        'navigate': { desc: 'Navigating to /dashboard', success: true },
        'extract': { desc: 'Extracting page metadata & action targets', success: true }
    };
    
    const act = actions[action] || { desc: `Agent action: ${action}`, success: true };
    
    // Reset visual state if we are doing fresh actions
    if (action === 'navigate') {
        if (browserUrl) browserUrl.innerText = 'https://reef-demo.local/login';
        if (browserContent) {
            browserContent.innerHTML = `
                <div id="mock-login-form" style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 250px; margin: 0 auto; width: 100%;">
                    <input type="text" id="mock-email-input" placeholder="Enter email..." disabled style="padding: 0.375rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; font-size: 0.8125rem; width: 100%;">
                    <input type="password" id="mock-password-input" placeholder="Enter password..." disabled style="padding: 0.375rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; font-size: 0.8125rem; width: 100%;">
                    <button id="mock-login-btn" style="padding: 0.375rem; background: var(--primary-color); color: var(--background-color); border: none; border-radius: 4px; font-size: 0.8125rem; cursor: pointer; transition: var(--transition); font-weight: 500;">Sign In</button>
                </div>
            `;
        }
    }

    // Perform animations
    if (cursor) {
        if (action === 'type') {
            // Move cursor to email input
            cursor.style.top = '60px';
            cursor.style.left = '100px';
            
            setTimeout(() => {
                const email = document.getElementById('mock-email-input');
                if (email) {
                    email.style.borderColor = 'var(--primary-color)';
                    // Simulate typing text
                    let text = 'hello@example.com';
                    let current = '';
                    let i = 0;
                    const typeInterval = setInterval(() => {
                        current += text[i];
                        email.value = current;
                        i++;
                        if (i >= text.length) {
                            clearInterval(typeInterval);
                            email.style.borderColor = 'var(--border-color)';
                        }
                    }, 50);
                }
            }, 600);
        } else if (action === 'click') {
            // Move cursor to login btn
            cursor.style.top = '110px';
            cursor.style.left = '160px';
            
            setTimeout(() => {
                const btn = document.getElementById('mock-login-btn');
                if (btn) {
                    btn.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        btn.style.transform = 'none';
                        // Add click ripple effect
                        const ripple = document.createElement('span');
                        ripple.style.cssText = `
                            position: absolute;
                            width: 20px;
                            height: 20px;
                            background: rgba(16, 185, 129, 0.4);
                            border-radius: 50%;
                            top: 110px;
                            left: 160px;
                            transform: translate(-50%, -50%) scale(1);
                            animation: demo-ripple 0.6s ease-out;
                            pointer-events: none;
                        `;
                        // add animation keyframes if not present
                        if (!document.getElementById('demo-ripple-style')) {
                            const styleNode = document.createElement('style');
                            styleNode.id = 'demo-ripple-style';
                            styleNode.textContent = `
                                @keyframes demo-ripple {
                                    to { transform: translate(-50%, -50%) scale(3); opacity: 0; }
                                }
                            `;
                            document.head.appendChild(styleNode);
                        }
                        const container = document.getElementById('agent-mock-browser');
                        if (container) container.appendChild(ripple);
                        setTimeout(() => ripple.remove(), 600);
                    }, 100);
                }
            }, 600);
        } else if (action === 'submit') {
            // Move cursor to login btn and trigger submit effect
            cursor.style.top = '110px';
            cursor.style.left = '160px';
            setTimeout(() => {
                if (browserContent) {
                    browserContent.innerHTML = `
                        <div style="text-align: center; color: var(--primary-color); font-weight: 500;">
                            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">✓</div>
                            Form Submitted Successfully!
                        </div>
                    `;
                }
            }, 600);
        } else if (action === 'navigate') {
            cursor.style.top = '20px';
            cursor.style.left = '200px';
            setTimeout(() => {
                if (browserUrl) browserUrl.innerText = 'https://reef-demo.local/dashboard';
                if (browserContent) {
                    browserContent.innerHTML = `
                        <div style="padding: 0.5rem; animation: fadeInUp 0.3s forwards;">
                            <h4 style="margin-bottom: 0.5rem; color: var(--text-color);">Dashboard</h4>
                            <p style="font-size: 0.75rem; color: var(--text-muted);">Welcome to your Reef dashboard mockup! The agent navigated page context successfully.</p>
                        </div>
                    `;
                }
            }, 600);
        } else if (action === 'extract') {
            cursor.style.top = '80px';
            cursor.style.left = '120px';
            setTimeout(() => {
                const target = document.getElementById('mock-login-form');
                if (target) {
                    target.style.outline = '2px solid var(--primary-color)';
                    target.style.background = 'rgba(16, 185, 129, 0.05)';
                    setTimeout(() => {
                        target.style.outline = 'none';
                        target.style.background = 'transparent';
                    }, 2000);
                }
            }, 600);
        }
    }

    result.innerHTML = `<div class="demo-result-item success">✓ ${act.desc}</div>`;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 4000);
}

function demoReefSearch(query) {
    const result = document.getElementById('demo-reef-search-result');
    if (!result) return;
    
    const mockIndex = [
        { id: 'doc-1', type: 'section', headingText: 'Getting Started', url: '/docs/getting-started', score: 0.95 },
        { id: 'doc-2', type: 'section', headingText: 'Installation', url: '/docs/installation', score: 0.92 },
        { id: 'action-1', type: 'action', headingText: 'Run Tests', selector: '#test-btn', url: window.location.href, score: 0.88 },
        { id: 'field-1', type: 'field', headingText: 'Email Input', selector: '#email', url: window.location.href, score: 0.75 }
    ];
    
    const results = mockIndex.filter(r => r.headingText.toLowerCase().includes(query.toLowerCase()));
    
    const html = results.map(r => `
        <div class="demo-result-item">
            <span class="result-badge ${r.type}">${r.type}</span>
            <span class="result-heading">${r.headingText}</span>
            ${r.selector ? `<span class="result-selector">selector: ${r.selector}</span>` : ''}
        </div>
    `).join('');
    
    result.innerHTML = `Found ${results.length} result(s) for "${query}":${html}`;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 5000);
}

function demoReefAct(recordId) {
    const result = document.getElementById('demo-reef-act-result');
    if (!result) return;
    
    const mockActions = {
        'action-1': { success: true, message: 'Action executed successfully' },
        'field-1': { success: true, message: 'Field focused and selected' },
        'section-1': { success: true, message: 'Scrolled to section' }
    };
    
    const act = mockActions[recordId] || { success: false, message: `Action ${recordId} not found` };
    
    result.innerHTML = `<div class="demo-result-item ${act.success ? 'success' : 'error'}">${act.message}</div>`;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 4000);
}

function demoReefAgent() {
    const result = document.getElementById('demo-reef-agent-result');
    const cursor = document.getElementById('workflow-mock-cursor');
    const emailInput = document.getElementById('workflow-email-input');
    const passwordInput = document.getElementById('workflow-password-input');
    const loginBtn = document.getElementById('workflow-login-btn');
    const browserContent = document.getElementById('workflow-browser-content');
    const browserUrl = document.getElementById('workflow-browser-url');
    
    if (!result) return;
    
    // Reset view
    if (browserUrl) browserUrl.innerText = 'https://reef-demo.local/login';
    if (browserContent) {
        browserContent.innerHTML = `
            <div id="workflow-login-form" style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 250px; margin: 0 auto; width: 100%;">
                <input type="text" id="workflow-email-input" placeholder="Enter email..." disabled style="padding: 0.375rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; font-size: 0.8125rem; width: 100%;">
                <input type="password" id="workflow-password-input" placeholder="Enter password..." disabled style="padding: 0.375rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; font-size: 0.8125rem; width: 100%;">
                <button id="workflow-login-btn" style="padding: 0.375rem; background: var(--primary-color); color: var(--background-color); border: none; border-radius: 4px; font-size: 0.8125rem; cursor: pointer; transition: var(--transition); font-weight: 500;">Sign In</button>
            </div>
        `;
    }
    if (cursor) {
        cursor.style.top = '20px';
        cursor.style.left = '20px';
    }
    
    result.innerHTML = `<h4>Agent Workflow:</h4><div id="workflow-log-container"></div>`;
    result.style.display = 'block';
    
    const logContainer = document.getElementById('workflow-log-container');
    const addLog = (action, selector, status) => {
        const item = document.createElement('div');
        item.className = 'demo-result-item';
        item.innerHTML = `<span class="step-status ${status}">${status}</span> ${action}${selector ? ` on ${selector}` : ''}`;
        logContainer.appendChild(item);
    };

    // Step 1: Type Email
    setTimeout(() => {
        if (cursor) {
            cursor.style.top = '60px';
            cursor.style.left = '100px';
        }
        setTimeout(() => {
            const email = document.getElementById('workflow-email-input');
            if (email) {
                email.style.borderColor = 'var(--primary-color)';
                let text = 'developer@reef-ai.org';
                let current = '';
                let i = 0;
                const interval = setInterval(() => {
                    current += text[i];
                    email.value = current;
                    i++;
                    if (i >= text.length) {
                        clearInterval(interval);
                        email.style.borderColor = 'var(--border-color)';
                        addLog('type', '#email', 'completed');
                    }
                }, 50);
            }
        }, 600);
    }, 500);

    // Step 2: Type Password
    setTimeout(() => {
        if (cursor) {
            cursor.style.top = '90px';
            cursor.style.left = '100px';
        }
        setTimeout(() => {
            const password = document.getElementById('workflow-password-input');
            if (password) {
                password.style.borderColor = 'var(--primary-color)';
                let text = '••••••••••••';
                let current = '';
                let i = 0;
                const interval = setInterval(() => {
                    current += text[i];
                    password.value = current;
                    i++;
                    if (i >= text.length) {
                        clearInterval(interval);
                        password.style.borderColor = 'var(--border-color)';
                        addLog('type', '#password', 'completed');
                    }
                }, 50);
            }
        }, 600);
    }, 2500);

    // Step 3: Click Login Button
    setTimeout(() => {
        if (cursor) {
            cursor.style.top = '120px';
            cursor.style.left = '160px';
        }
        setTimeout(() => {
            const btn = document.getElementById('workflow-login-btn');
            if (btn) {
                btn.style.transform = 'scale(0.95)';
                addLog('click', '#login', 'completed');
                setTimeout(() => {
                    btn.style.transform = 'none';
                }, 150);
            }
        }, 600);
    }, 4500);

    // Step 4: Submit Form
    setTimeout(() => {
        const content = document.getElementById('workflow-browser-content');
        if (content) {
            content.innerHTML = `
                <div style="text-align: center; color: var(--primary-color); font-weight: 500; animation: fadeInUp 0.4s;">
                    <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">✓</div>
                    Welcome! Authenticated via Reef agent.
                </div>
            `;
            addLog('submit', '', 'completed');
        }
    }, 5500);

    setTimeout(() => {
        result.style.display = 'none';
    }, 9500);
}

function demoCache() {
    const result = document.getElementById('demo-cache-result');
    if (!result) return;
    
    const cacheData = {
        entries: 42,
        size: '1.2 MB',
        ttl: '7 days',
        lastUpdated: new Date().toISOString()
    };
    
    result.innerHTML = `
        <div class="demo-result-item success">
            <strong>Cache Status:</strong><br>
            Entries: ${cacheData.entries}<br>
            Size: ${cacheData.size}<br>
            TTL: ${cacheData.ttl}<br>
            Last Updated: ${cacheData.lastUpdated}
        </div>
    `;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 5000);
}

function demoIndexing() {
    const result = document.getElementById('demo-indexing-result');
    if (!result) return;
    
    const stats = {
        pages: 127,
        sections: 842,
        actions: 156,
        fields: 89,
        links: 234,
        files: 12,
        media: 67
    };
    
    result.innerHTML = `
        <div class="demo-result-item success">
            <strong>Indexing Statistics:</strong><br>
            Pages Crawled: ${stats.pages}<br>
            Sections Found: ${stats.sections}<br>
            Actions: ${stats.actions}<br>
            Fields: ${stats.fields}<br>
            Links: ${stats.links}<br>
            Files: ${stats.files}<br>
            Media: ${stats.media}
        </div>
    `;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 5000);
}

function demoWorker() {
    const result = document.getElementById('demo-worker-result');
    if (!result) return;
    
    result.innerHTML = `
        <div class="demo-result-item">
            <strong>Worker Communication:</strong><br>
            ✓ Main thread connected<br>
            ✓ Worker initialized<br>
            ✓ Message passing active<br>
            <em>Offloading parsing to background thread...</em>
        </div>
    `;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 4000);
}

function demoUI() {
    const result = document.getElementById('demo-ui-result');
    if (!result) return;
    
    result.innerHTML = `
        <div class="demo-result-item success">
            <strong>UI Features:</strong><br>
            ✓ Shadow DOM isolation<br>
            ✓ Focus trapping<br>
            ✓ ARIA support<br>
            ✓ Category tabs<br>
            ✓ Settings panel
        </div>
    `;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 4000);
}

function demoConfig() {
    const result = document.getElementById('demo-config-result');
    if (!result) return;
    
    const config = {
        sitemap: '/sitemap.xml',
        maxPages: 500,
        actionsMode: 'navigate-only',
        hotkey: 'ctrlk,cmdk',
        mode: 'opaque',
        theme: 'auto',
        headless: false
    };
    
    result.innerHTML = `
        <div class="demo-result-item">
            <strong>Current Configuration:</strong><br>
            ${Object.entries(config).map(([k, v]) => `<span class="config-item"><span class="config-key">${k}:</span> <span class="config-value">${v}</span></span>`).join('<br>')}
        </div>
    `;
    result.style.display = 'block';
    
    setTimeout(() => {
        result.style.display = 'none';
    }, 5000);
}

// ========================================
// Search Functionality (for documentation search)
// ========================================
let searchIndex = [];

function buildSearchIndex() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        const title = section.querySelector('.section-title')?.textContent || '';
        const content = section.textContent;
        const id = section.getAttribute('id');
        
        searchIndex.push({
            id: id,
            title: title,
            content: content.toLowerCase(),
            element: section
        });
    });
}

function searchDocumentation(query) {
    const results = [];
    const normalizedQuery = query.toLowerCase();
    
    searchIndex.forEach(item => {
        if (item.content.includes(normalizedQuery) || 
            item.title.toLowerCase().includes(normalizedQuery)) {
            results.push(item);
        }
    });
    
    return results;
}

document.addEventListener('DOMContentLoaded', buildSearchIndex);

// ========================================
// Toast Notifications
// ========================================
function showToast(message, duration = 3000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--primary-color);
        color: var(--background-color);
        padding: 12px 20px;
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: var(--shadow-md);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}


// ========================================
// New Interactive Demos
// ========================================
function runInteractiveSearch() {
    const input = document.getElementById('demo-search-input');
    const list = document.getElementById('demo-search-results-list');
    if (!input || !list) return;
    const query = input.value.trim().toLowerCase();
    if (!query) {
        list.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center;">Enter a query above to search the mock DOM index</div>`;
        return;
    }
    const mockIndex = [
        { type: 'section', title: 'Getting Started - Overview', selector: 'main > section#overview', snippet: 'Reef is a client-side library that enables AI agents to search...' },
        { type: 'section', title: 'Getting Started - Installation', selector: 'main > section#installation', snippet: 'Add Reef to your site with a single script tag...' },
        { type: 'action', title: 'Submit Form Button', selector: '#login-form button[type="submit"]', snippet: 'Triggers action execution on form submission.' },
        { type: 'field', title: 'Email Address Input', selector: 'input#email-address', snippet: 'A text field expecting email inputs.' },
        { type: 'link', title: 'Main Documentation Link', selector: 'a.nav-link[href="index.html"]', snippet: 'Navigates to index.html overview page.' },
        { type: 'media', title: 'Architecture Schema Image', selector: 'img.architecture-diagram-img', snippet: 'Visual layout representing module relationships.' }
    ];
    const filtered = mockIndex.filter(item => 
        item.title.toLowerCase().includes(query) || 
        item.type.toLowerCase().includes(query) ||
        item.snippet.toLowerCase().includes(query)
    );
    if (filtered.length === 0) {
        list.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 0.5rem;">No mock results found for "${query}"</div>`;
        return;
    }
    list.innerHTML = filtered.map(item => `
        <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-light); transition: var(--transition);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong style="color: var(--primary-color);">${item.title}</strong>
                <span style="font-size: 0.75rem; background: var(--background-light); padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-transform: uppercase;">${item.type}</span>
            </div>
            <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">selector: ${item.selector}</div>
            <div style="font-size: 0.8125rem; color: var(--text-muted);">${item.snippet}</div>
        </div>
    `).join('');
}

function runInteractiveAction() {
    const type = document.getElementById('demo-action-type').value;
    const selector = document.getElementById('demo-action-selector').value.trim() || '#element';
    const val = document.getElementById('demo-action-value').value.trim();
    const logs = document.getElementById('demo-action-logs');
    if (!logs) return;
    logs.innerHTML = '';
    
    const appendLog = (msg, isSuccess = false) => {
        const div = document.createElement('div');
        div.style.padding = '0.25rem 0';
        div.style.color = isSuccess ? 'var(--primary-color)' : 'var(--text-color)';
        div.innerHTML = msg;
        logs.appendChild(div);
        logs.scrollTop = logs.scrollHeight;
    };

    appendLog(`[1/3] Searching DOM for element matching "${selector}"...`);
    setTimeout(() => {
        appendLog(`[2/3] Element found! Executing "${type}" action...`);
        setTimeout(() => {
            if (type === 'type') {
                appendLog(`[3/3] Success: Filled value "${val || 'hello'}" into "${selector}".`, true);
            } else if (type === 'click') {
                appendLog(`[3/3] Success: Triggered click event on "${selector}".`, true);
            } else if (type === 'submit') {
                appendLog(`[3/3] Success: Dispatched submit event on form "${selector}".`, true);
            } else {
                appendLog(`[3/3] Success: Navigated frame to "${selector}".`, true);
            }
        }, 1000);
    }, 1000);
}

function updateMockUI(prop, val) {
    const hud = document.getElementById('mock-hud');
    const inputContainer = document.getElementById('mock-hud-input-container');
    const prompt = document.getElementById('mock-hud-prompt');
    const activeTab = document.getElementById('mock-hud-active-tab');
    const badges = [
        document.getElementById('mock-hud-item-badge-1'),
        document.getElementById('mock-hud-item-badge-2')
    ];
    const items = [
        document.getElementById('mock-hud-item-1'),
        document.getElementById('mock-hud-item-2')
    ];

    if (!hud) return;

    if (prop === 'theme') {
        if (val === 'light') {
            hud.style.background = '#ffffff';
            hud.style.color = '#171717';
            if (inputContainer) inputContainer.style.borderBottomColor = '#e5e7eb';
            items.forEach(item => {
                if (item) item.style.background = '#f9fafb';
            });
        } else {
            hud.style.background = '#0a0a0a';
            hud.style.color = '#f5f5f5';
            if (inputContainer) inputContainer.style.borderBottomColor = '#262626';
            items.forEach(item => {
                if (item) item.style.background = '#171717';
            });
        }
    } else if (prop === 'accent') {
        const color = val === 'green' ? '#10b981' : '#737373';
        if (prompt) prompt.style.color = color;
        if (activeTab) activeTab.style.background = color;
        badges.forEach(badge => {
            if (badge) badge.style.color = color;
        });
    } else if (prop === 'size') {
        const padding = val === 'compact' ? '0.5rem' : '1.25rem';
        hud.style.padding = padding;
    }
}

let mockCache = [
    { key: 'reef-sitemap-index', val: '{"url":"/","indexed":true}', expires: '6d 23h' },
    { key: 'reef-last-query', val: '"getting started"', expires: '23h 59m' }
];

function renderCacheSimTable() {
    const tbody = document.getElementById('demo-cache-table-body');
    if (!tbody) return;
    if (mockCache.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-style: italic;">Cache is empty</td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = mockCache.map((item, index) => `
        <tr style="border-bottom: 1px solid var(--border-light);">
            <td style="padding: 0.5rem; font-family: var(--font-mono); font-weight: bold; color: var(--primary-color);">${item.key}</td>
            <td style="padding: 0.5rem; font-family: var(--font-mono); color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.val}</td>
            <td style="padding: 0.5rem; text-align: right; color: var(--text-subtle);">${item.expires}</td>
        </tr>
    `).join('');
}

function saveCacheSimItem() {
    const keyInput = document.getElementById('demo-cache-key');
    const valInput = document.getElementById('demo-cache-val');
    const consoleDiv = document.getElementById('demo-cache-console');
    if (!keyInput || !valInput || !consoleDiv) return;
    const key = keyInput.value.trim();
    const val = valInput.value.trim();
    if (!key || !val) {
        consoleDiv.innerHTML = `<span style="color: red;">Error: Key and Value cannot be empty.</span>`;
        return;
    }
    const existingIndex = mockCache.findIndex(item => item.key === key);
    if (existingIndex !== -1) {
        mockCache[existingIndex].val = val;
        consoleDiv.innerHTML = `✓ Updated item with key: <strong>${key}</strong> in IndexedDB.`;
    } else {
        mockCache.push({ key, val, expires: '7d 0h' });
        consoleDiv.innerHTML = `✓ Stored new item with key: <strong>${key}</strong> in IndexedDB.`;
    }
    keyInput.value = '';
    valInput.value = '';
    renderCacheSimTable();
}

function getCacheSimItem() {
    const keyInput = document.getElementById('demo-cache-key');
    const consoleDiv = document.getElementById('demo-cache-console');
    if (!keyInput || !consoleDiv) return;
    const key = keyInput.value.trim();
    if (!key) {
        consoleDiv.innerHTML = `<span style="color: red;">Error: Enter a Key to retrieve.</span>`;
        return;
    }
    const found = mockCache.find(item => item.key === key);
    if (found) {
        consoleDiv.innerHTML = `✓ Retrieve success! Value for <strong>${key}</strong>: <code>${found.val}</code>`;
    } else {
        consoleDiv.innerHTML = `<span style="color: red;">Cache miss: Key "${key}" not found in IndexedDB.</span>`;
    }
}

function deleteCacheSimItem() {
    const keyInput = document.getElementById('demo-cache-key');
    const consoleDiv = document.getElementById('demo-cache-console');
    if (!keyInput || !consoleDiv) return;
    const key = keyInput.value.trim();
    if (!key) {
        consoleDiv.innerHTML = `<span style="color: red;">Error: Enter a Key to delete.</span>`;
        return;
    }
    const index = mockCache.findIndex(item => item.key === key);
    if (index !== -1) {
        mockCache.splice(index, 1);
        consoleDiv.innerHTML = `✓ Evicted item with key: <strong>${key}</strong> from database.`;
        renderCacheSimTable();
    } else {
        consoleDiv.innerHTML = `<span style="color: red;">Delete failed: Key "${key}" not found.</span>`;
    }
}

function clearCacheSim() {
    const consoleDiv = document.getElementById('demo-cache-console');
    mockCache = [];
    if (consoleDiv) consoleDiv.innerHTML = `✓ Database cleared. All Object Stores truncated.`;
    renderCacheSimTable();
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ========================================
// Export for module usage
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        copyCode,
        highlightCode,
        searchDocumentation,
        showToast,
        runDemo,
        demoSearch,
        demoAgentAction,
        demoReefSearch,
        demoReefAct,
        demoReefAgent,
        demoCache,
        demoIndexing,
        demoWorker,
        demoUI,
        demoConfig
    };
}
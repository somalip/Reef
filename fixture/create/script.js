/**
 * Reef Documentation - Interactive JavaScript
 * Handles code copying, syntax highlighting, and navigation
 */

// ========================================
// Copy Code Functionality
// ========================================
function copyCode(button) {
    const pre = button.parentElement.querySelector('pre');
    if (!pre) return;

    const code = pre.textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        // Show copied feedback
        button.classList.add('copied');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        
        setTimeout(() => {
            button.classList.remove('copied');
            button.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy code:', err);
        // Fallback for older browsers
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

        // Determine language from parent class
        const pre = block.parentElement;
        const language = pre.classList.contains('language-javascript') ? 'javascript' :
                       pre.classList.contains('language-typescript') ? 'typescript' :
                       pre.classList.contains('language-html') ? 'html' :
                       pre.classList.contains('language-json') ? 'json' :
                       pre.classList.contains('language-bash') ? 'bash' :
                       pre.classList.contains('language-mermaid') ? 'mermaid' :
                       pre.classList.contains('language-text') ? 'text' :
                       'text';

        // Apply highlighting based on language
        const highlighted = applySyntaxHighlighting(text, language);
        block.innerHTML = highlighted;
    });
}

function applySyntaxHighlighting(text, language) {
    if (language === 'mermaid' || language === 'text') {
        return escapeHtml(text);
    }

    // HTML highlighting
    if (language === 'html') {
        return highlightHtml(text);
    }

    // JSON highlighting
    if (language === 'json') {
        return highlightJson(text);
    }

    // Bash highlighting
    if (language === 'bash') {
        return highlightBash(text);
    }

    // JavaScript/TypeScript highlighting
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
    // Tags
    let result = text.replace(/&lt;(\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, '&lt;<span class="tag">$1$2</span>');
    
    // Attributes
    result = result.replace(/([a-zA-Z-]+)=/g, '<span class="attr">$1</span>=');
    
    // Strings (values)
    result = result.replace(/="([^"]*)"/g, '="<span class="string">$1</span>"');
    result = result.replace(/='([^']*)'/g, "='<span class='string'>$1</span>'");
    
    // Comments
    result = result.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
    
    return result;
}

function highlightJson(text) {
    let result = text;
    
    // Keys
    result = result.replace(/"([^"]+)":/g, '<span class="attr">"$1"</span>:');
    
    // String values
    result = result.replace(/:\s*"([^"]+)"/g, ': <span class="string">"$1"</span>');
    
    // Numbers
    result = result.replace(/(\b\d+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b\d+\.\d+\b)/g, '<span class="number">$1</span>');
    
    // Booleans and null
    result = result.replace(/(\btrue\b|\bfalse\b|\bnull\b)/g, '<span class="keyword">$1</span>');
    
    // Brackets
    result = result.replace(/[{}\[\]]/g, '<span class="punctuation">$&</span>');
    result = result.replace(/:/g, '<span class="punctuation">:</span>');
    result = result.replace(/,\s*/g, '<span class="punctuation">,</span> ');
    
    return result;
}

function highlightBash(text) {
    // Commands
    let result = text.replace(/(\b[np]m\b|\bnpm\b|\bgit\b|\bnode\b|\bnpm\b)/g, '<span class="function">$1</span>');
    
    // Flags
    result = result.replace(/(\-[a-zA-Z\-]+)/g, '<span class="keyword">$1</span>');
    
    // Paths
    result = result.replace(/(\b[a-zA-Z0-9_\-]+\.js\b|\b[a-zA-Z0-9_\-]+\.ts\b|\b[a-zA-Z0-9_\-]+\.json\b)/g, '<span class="string">$1</span>');
    
    // Comments
    result = result.replace(/(#.*)/g, '<span class="comment">$1</span>');
    
    return result;
}

function highlightJavaScript(text) {
    // Keywords
    const keywords = [
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
        'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
        'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
        'await', 'async', 'let', 'static', 'get', 'set', 'from'
    ];
    
    let result = text;
    
    // Keywords
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    result = result.replace(keywordRegex, '<span class="keyword">$1</span>');
    
    // Functions and methods
    result = result.replace(/(\b[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, '<span class="function">$1</span>(');
    
    // Strings (single and double quotes)
    result = result.replace(/("[^"]*")/g, '<span class="string">$1</span>');
    result = result.replace(/('(\\.'|[^'])*')/g, '<span class="string">$1</span>');
    
    // Template literals
    result = result.replace(/(`(\\`|[^`])*`)/g, '<span class="string">$1</span>');
    
    // Numbers
    result = result.replace(/(\b\d+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b0x[0-9a-fA-F]+\b)/g, '<span class="number">$1</span>');
    result = result.replace(/(\b\d+\.\d+\b)/g, '<span class="number">$1</span>');
    
    // Comments
    result = result.replace(/(\/\/[^\n]*)/g, '<span class="comment">$1</span>');
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>');
    
    // Operators
    result = result.replace(/([+\-*/%=<>!&|^~?:])/g, '<span class="punctuation">$1</span>');
    
    // Punctuation
    result = result.replace(/([{}[\]();:.,])/g, '<span class="punctuation">$1</span>');
    
    // this keyword
    result = result.replace(/\bthis\b/g, '<span class="keyword">this</span>');
    
    // true, false, null, undefined
    result = result.replace(/(\btrue\b|\bfalse\b|\bnull\b|\bundefined\b)/g, '<span class="keyword">$1</span>');
    
    return result;
}

// ========================================
// Smooth Scroll Navigation
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Highlight code blocks
    highlightCode();

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

                // Update active nav link
                updateActiveNavLink(targetId);
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

    // Scroll spy for sidebar
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
    // Cmd/Ctrl + K to open search (demo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // Could open a search modal here
        console.log('Search shortcut pressed');
    }
});

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Add loaded class for animations
    document.body.classList.add('loaded');
    
    // Initialize any interactive demos
    initializeDemos();
});

// ========================================
// Demo Initialization
// ========================================
function initializeDemos() {
    // Add any interactive demo functionality here
    // For example, live code editors, interactive examples, etc.
    
    // Check for demo containers
    const demoContainers = document.querySelectorAll('.demo-container');
    demoContainers.forEach(container => {
        // Initialize demo functionality
    });
}

// ========================================
// Search Functionality (for documentation search)
// ========================================
let searchIndex = [];

function buildSearchIndex() {
    // Build a simple search index for the documentation
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

// Build index on page load
document.addEventListener('DOMContentLoaded', buildSearchIndex);

// ========================================
// Toast Notifications
// ========================================
function showToast(message, duration = 3000) {
    // Remove existing toasts
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

// Add animation styles
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
// Mobile Menu Toggle (if needed)
// ========================================
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        copyCode,
        highlightCode,
        searchDocumentation,
        showToast
    };
}

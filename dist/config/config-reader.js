/**
 * @file Configuration reading and application from script attributes.
 * Parses data attributes and builds configuration objects for the search.
 */
export class ConfigReader {
    static readConfig() {
        const script = document.currentScript;
        const dataset = script?.dataset ?? {};
        let tokenizePipeline = undefined;
        if (dataset.stemming === 'true' || dataset.stopwords === 'true' || dataset.diacritics === 'true') {
            const pipeline = [];
            if (dataset.stopwords === 'true') {
                const stopWords = new Set([
                    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
                    'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
                ]);
                pipeline.push((token) => stopWords.has(token) ? null : token);
            }
            if (dataset.diacritics === 'true') {
                pipeline.push((token) => token.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
            }
            if (dataset.stemming === 'true') {
                pipeline.push((token) => {
                    if (token.length <= 2)
                        return token;
                    if (/ing$/.test(token))
                        return token.slice(0, -3);
                    if (/ed$/.test(token))
                        return token.slice(0, -2);
                    if (/es$/.test(token) && token.length > 3)
                        return token.slice(0, -2);
                    if (/s$/.test(token) && token.length > 3)
                        return token.slice(0, -1);
                    return token;
                });
            }
            tokenizePipeline = pipeline.length > 0 ? pipeline : undefined;
        }
        let synonyms = undefined;
        if (dataset.synonyms) {
            try {
                synonyms = JSON.parse(dataset.synonyms);
            }
            catch {
                console.warn('[reef] Invalid synonyms JSON in data-synonyms attribute');
            }
        }
        return {
            sitemap: dataset.sitemap ?? '/sitemap.xml',
            maxPages: Number(dataset.maxPages ?? 500),
            scope: dataset.scope,
            indexActions: dataset.indexActions !== 'false',
            indexMedia: dataset.indexMedia !== 'false',
            indexStructuredData: dataset.indexStructuredData !== 'false',
            indexHidden: dataset.indexHidden !== 'false',
            fileExtensions: dataset.fileExtensions,
            excludeAction: dataset.excludeAction,
            actionsMode: dataset.actionsMode || 'execute',
            primaryColor: dataset.primaryColor,
            secondaryColor: dataset.secondaryColor,
            backgroundColor: dataset.backgroundColor,
            textColor: dataset.textColor,
            borderColor: dataset.borderColor,
            radius: dataset.radius ? Number(dataset.radius) : 24,
            theme: dataset.theme,
            fontFamily: dataset.fontFamily,
            mode: dataset.mode ? dataset.mode : 'opaque',
            hotkey: dataset.hotkey,
            placeholder: dataset.placeholder,
            headless: dataset.headless === 'true',
            onReady: undefined,
            tokenizePipeline,
            synonyms,
            prebuiltIndexUrl: dataset.prebuiltIndexUrl,
            useWorkerIndexing: dataset.useWorkerIndexing === 'true',
            ttl: dataset.ttl ? Number(dataset.ttl) : undefined,
        };
    }
}
export class ConfigApplier {
    static applyConfigToUI(host, config) {
        const cfg = config;
        host.style.setProperty('--primary-color', cfg.primaryColor ?? '#66d9c8');
        host.style.setProperty('--secondary-color', cfg.secondaryColor ?? '#ff8562');
        host.style.setProperty('--background-color', cfg.backgroundColor ?? 'rgba(20,30,28,0.88)');
        host.style.setProperty('--text-color', cfg.textColor ?? '#edebe6');
        host.style.setProperty('--border-color', cfg.borderColor ?? 'rgba(255,255,255,0.1)');
        host.style.setProperty('--radius', cfg.radius?.toString() ?? '24');
        host.style.setProperty('--font-family', cfg.fontFamily ?? 'Inter, system-ui, sans-serif');
        host.classList.remove('mode-regular', 'mode-opaque', 'mode-high-contrast');
        switch ((cfg.mode ?? 'opaque')) {
            case 'opaque':
                host.classList.add('mode-opaque');
                break;
            case 'high-contrast':
                host.classList.add('mode-high-contrast');
                break;
            default:
                host.classList.add('mode-regular');
        }
    }
}

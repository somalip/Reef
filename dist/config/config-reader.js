/**
 * @file Configuration reading and application from script attributes.
 * Parses data attributes and builds configuration objects for the search.
 */
export class ConfigReader {
    static setConfig(config) {
        this.pendingConfig = config;
    }
    static readConfig() {
        if (this.pendingConfig) {
            const config = this.pendingConfig;
            this.pendingConfig = null;
            return this.mergeWithDefaults(config);
        }
        if (typeof document === 'undefined') {
            return this.getDefaultConfig();
        }
        const script = document.currentScript;
        const dataset = script?.dataset;
        if (!dataset) {
            return this.getDefaultConfig();
        }
        const datasetRecord = {};
        for (const key in dataset) {
            const value = dataset[key];
            if (value !== undefined) {
                datasetRecord[key] = value;
            }
        }
        return this.parseDataset(datasetRecord);
    }
    static getDefaultConfig() {
        return {
            sitemap: '/sitemap.xml',
            maxPages: 500,
            scope: undefined,
            indexActions: true,
            indexMedia: true,
            indexStructuredData: true,
            indexHidden: true,
            fileExtensions: undefined,
            excludeAction: undefined,
            actionsMode: 'execute',
            primaryColor: undefined,
            secondaryColor: undefined,
            backgroundColor: undefined,
            textColor: undefined,
            borderColor: undefined,
            radius: 24,
            theme: undefined,
            fontFamily: undefined,
            mode: 'opaque',
            hotkey: undefined,
            placeholder: undefined,
            headless: false,
            onReady: undefined,
            tokenizePipeline: undefined,
            synonyms: undefined,
            prebuiltIndexUrl: undefined,
            useWorkerIndexing: false,
            ttl: undefined,
        };
    }
    static parseDataset(dataset) {
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
    static mergeWithDefaults(overrides) {
        return {
            sitemap: overrides.sitemap ?? '/sitemap.xml',
            maxPages: overrides.maxPages ?? 500,
            scope: overrides.scope,
            indexActions: overrides.indexActions ?? true,
            indexMedia: overrides.indexMedia ?? true,
            indexStructuredData: overrides.indexStructuredData ?? true,
            indexHidden: overrides.indexHidden ?? true,
            fileExtensions: overrides.fileExtensions,
            excludeAction: overrides.excludeAction,
            actionsMode: overrides.actionsMode ?? 'execute',
            primaryColor: overrides.primaryColor,
            secondaryColor: overrides.secondaryColor,
            backgroundColor: overrides.backgroundColor,
            textColor: overrides.textColor,
            borderColor: overrides.borderColor,
            radius: overrides.radius ?? 24,
            theme: overrides.theme,
            fontFamily: overrides.fontFamily,
            mode: overrides.mode ?? 'opaque',
            hotkey: overrides.hotkey,
            placeholder: overrides.placeholder,
            headless: overrides.headless ?? false,
            onReady: overrides.onReady,
            tokenizePipeline: overrides.tokenizePipeline,
            synonyms: overrides.synonyms,
            prebuiltIndexUrl: overrides.prebuiltIndexUrl,
            useWorkerIndexing: overrides.useWorkerIndexing ?? false,
            ttl: overrides.ttl,
        };
    }
}
ConfigReader.pendingConfig = null;
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

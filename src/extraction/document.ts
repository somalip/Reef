export interface DocumentText { text: string; title?: string; type: string; }
export async function extractDocument(input: Blob | ArrayBuffer | string, type = 'text/plain'): Promise<DocumentText> { if (typeof input === 'string') return { text: input, type }; if (type === 'text/plain') return { text: await new Blob([input]).text(), type }; return { text: '', type }; }
export function isDocumentUrl(url: string): boolean { return /\.(pdf|docx?|xlsx?|pptx?)($|\?)/i.test(url); }

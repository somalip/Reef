export interface OCRResult { text: string; confidence?: number; }
export type OCRProvider = (image: Blob | string) => Promise<OCRResult>;
export async function extractImageText(image: Blob | string, provider?: OCRProvider): Promise<OCRResult> { if (provider) return provider(image); return { text: '', confidence: 0 }; }
export function imageAltText(alt: string | null | undefined, ocr: OCRResult): string { return alt?.trim() || ocr.text.trim(); }

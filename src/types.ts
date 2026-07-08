/**
 * @file Shared type definitions for Reef search library.
 * Contains interfaces for section documents, index records, and configuration options.
 */

export interface SectionDocument {
  id: string;
  url: string;
  headingText: string;
  headingId: string;
  breadcrumb: string;
  bodyText: string;
}

export interface IndexRecord extends SectionDocument {
  type: 'section' | 'action' | 'field' | 'link' | 'file' | 'media' | 'structured';
  selector?: string;
  destructive?: boolean;
  label?: string;
  value?: string;
  transcript?: string;
  structuredData?: any;
}

export interface ReefConfig {
  sitemap?: string;
  maxPages?: number;
  scope?: string;
  indexActions?: boolean;
  indexMedia?: boolean;
  indexStructuredData?: boolean;
  indexHidden?: boolean;
  fileExtensions?: string;
  excludeAction?: string;
  actionsMode?: 'execute' | 'navigate-only';
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  radius?: number;
  theme?: 'light' | 'dark' | 'auto';
  fontFamily?: string;
  mode?: 'regular' | 'opaque' | 'high-contrast';
  hotkey?: string;
  placeholder?: string;
  headless?: boolean;
  onReady?: (data: { index: IndexRecord[] }) => void;
}
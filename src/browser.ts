/**
 * @file Browser entry point.
 * Instantiates ReefSearch and exposes it globally as `window.Reef`.
 */

import { ReefSearch } from './reef';

const reef = new ReefSearch();
(window as Window & { Reef?: ReefSearch }).Reef = reef;
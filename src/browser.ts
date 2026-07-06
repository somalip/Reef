import { ReefSearch } from './reef';

const reef = new ReefSearch();
(window as Window & { Reef?: ReefSearch }).Reef = reef;
// M4e fonts: self-hosted (SIL OFL 1.1), latin subset only; bundled into dist/assets, no external URL.
// M13d: words use the iPhone system font; Barlow Condensed stays for big numbers, timers, Start, tabs.
import '@fontsource/barlow-condensed/latin-700.css';
import { mountApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');
mountApp(root);

import { appTitle } from './core/appInfo';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

const title = document.createElement('h1');
title.className = 'app-title';
title.textContent = appTitle();

const tagline = document.createElement('p');
tagline.className = 'app-tagline';
tagline.textContent = 'Stay on the set.';

root.replaceChildren(title, tagline);

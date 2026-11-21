import { createIcons, icons } from 'lucide';

export function renderIcons(root = document) {
  createIcons({ icons, nameAttr: 'data-lucide', root });
}

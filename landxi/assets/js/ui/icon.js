export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="${base()}assets/icons.svg#i-${name}"></use></svg>`;
}
function base() { return document.documentElement.dataset.base || ''; }

export function ytURL(q: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}

export function rulesURL(name: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(name + ' board game rules PDF');
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

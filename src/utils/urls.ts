export function ytURL(q: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}

export function rulesURL(name: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(name + ' board game rules PDF');
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Amazon buy link: the exact product when an ASIN is known, else a search. */
export function amazonURL(name: string, asin?: string): string {
  if (asin) return 'https://www.amazon.com/dp/' + asin;
  return 'https://www.amazon.com/s?k=' + encodeURIComponent(name + ' board game');
}

/** Third-party Amazon price history (new and used) with free price-drop alerts. */
export function priceTrackerURL(asin: string): string {
  return 'https://camelcamelcamel.com/product/' + asin;
}

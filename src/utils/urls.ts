export function ytURL(q: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}

export function rulesURL(name: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(name + ' board game rules PDF');
}

/** Amazon buy link: a search for the game. */
export function amazonURL(name: string): string {
  return 'https://www.amazon.com/s?k=' + encodeURIComponent(name + ' board game');
}

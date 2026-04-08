import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import WordCheckerPage from '../components/WordCheckerPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <WordCheckerPage />
    </MemoryRouter>
  );
}

describe('WordCheckerPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Word Checker')).toBeInTheDocument();
  });

  it('renders the Bananagrams game name', () => {
    renderPage();
    expect(screen.getByText('Bananagrams')).toBeInTheDocument();
  });

  it('renders the back link to home', () => {
    renderPage();
    const backLink = screen.getByText(/Back to The Game Room/);
    expect(backLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('renders the Bananagrams box art', () => {
    renderPage();
    const img = screen.getByAltText('Bananagrams box art');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/bananagrams.webp');
  });

  it('renders the word checker input', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeInTheDocument();
  });

  it('renders the check button', () => {
    renderPage();
    expect(screen.getByText('Check')).toBeInTheDocument();
  });
});

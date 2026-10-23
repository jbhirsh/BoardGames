import { describe, it, expect } from 'vitest';
import { planMarks } from '../utils/pdfMarks';
import { pageText, type Match } from '../utils/pdfSearch';

// "Place the outbreaks marker on the track": items start at 0, 10, 19 and 26.
const runs = [{ str: 'Place the ' }, { str: 'outbreaks' }, { str: ' marker' }, { str: ' on the track' }];
const page = pageText(runs);

const hit = (from: number, to: number) => ({ from, to, className: 'pdf-hit', isCurrent: false });
const now = (from: number, to: number) => ({ from, to, className: 'pdf-hit pdf-hit--current', isCurrent: true });
const cite = (from: number, to: number) => ({ from, to, className: 'pdf-hit pdf-hit--cited', isCurrent: false });

describe('planMarks', () => {
  it('marks nothing with no matches and no passage', () => {
    expect(planMarks(page, runs, [], null, null).size).toBe(0);
  });

  it('marks a match inside one item as a hit', () => {
    expect(planMarks(page, runs, [[10, 19]], null, null)).toEqual(new Map([[1, [hit(0, 9)]]]));
  });

  it('marks the current match stronger, and only that one', () => {
    const current: Match = [10, 19];
    const marks = planMarks(page, runs, [[0, 5], current], current, null);
    expect(marks).toEqual(
      new Map([
        [0, [hit(0, 5)]],
        [1, [now(0, 9)]],
      ]),
    );
  });

  it('knows the current match by identity, not by its offsets', () => {
    const marks = planMarks(page, runs, [[10, 19]], [10, 19], null);
    expect(marks.get(1)).toEqual([hit(0, 9)]);
  });

  it('splits a match across the items it spans, every piece current', () => {
    const current: Match = [6, 22];
    expect(planMarks(page, runs, [current], current, null)).toEqual(
      new Map([
        [0, [now(6, 10)]],
        [1, [now(0, 9)]],
        [2, [now(0, 3)]],
      ]),
    );
  });

  it("lists an item's marks in text order whatever order the matches come in", () => {
    expect(
      planMarks(
        page,
        runs,
        [
          [30, 33],
          [26, 29],
        ],
        null,
        null,
      ).get(3),
    ).toEqual([hit(0, 3), hit(4, 7)]);
  });

  it('keeps the items in the order the matches reach them, the current match first when it comes first', () => {
    const current: Match = [26, 29];
    const marks = planMarks(page, runs, [current, [0, 5]], current, [10, 19]);
    expect([...marks.keys()]).toEqual([3, 0, 1]);
  });

  it('marks a cited passage with no matches as cited, across its items', () => {
    expect(planMarks(page, runs, [], null, [6, 22])).toEqual(
      new Map([
        [0, [cite(6, 10)]],
        [1, [cite(0, 9)]],
        [2, [cite(0, 3)]],
      ]),
    );
  });

  it('leaves a match inside the passage marked as a match, citing the gaps around it', () => {
    expect(planMarks(page, runs, [[12, 15]], null, [10, 19]).get(1)).toEqual([cite(0, 2), hit(2, 5), cite(5, 9)]);
  });

  it('keeps the current match current inside the passage', () => {
    const current: Match = [12, 15];
    expect(planMarks(page, runs, [current], current, [10, 19]).get(1)).toEqual([cite(0, 2), now(2, 5), cite(5, 9)]);
  });

  it('cites the gaps between several matches inside the passage', () => {
    expect(
      planMarks(
        page,
        runs,
        [
          [16, 18],
          [11, 13],
        ],
        null,
        [10, 19],
      ).get(1),
    ).toEqual([cite(0, 1), hit(1, 3), cite(3, 6), hit(6, 8), cite(8, 9)]);
  });

  it('cites nothing where a match covers the whole passage', () => {
    expect(planMarks(page, runs, [[10, 19]], null, [12, 15]).get(1)).toEqual([hit(0, 9)]);
  });

  it('cites only the part of the passage a match overlapping its edge leaves', () => {
    expect(planMarks(page, runs, [[8, 13]], null, [10, 19]).get(1)).toEqual([hit(0, 3), cite(3, 9)]);
    expect(planMarks(page, runs, [[16, 22]], null, [10, 19]).get(1)).toEqual([cite(0, 6), hit(6, 9)]);
  });

  it('leaves alone a match in an item the passage does not reach', () => {
    expect(planMarks(page, runs, [[0, 5]], null, [10, 19])).toEqual(
      new Map([
        [0, [hit(0, 5)]],
        [1, [cite(0, 9)]],
      ]),
    );
  });
});

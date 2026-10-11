import { describe, expect, it } from 'vitest';
import { areaOf, parseResults, searchUrl } from './mdn.js';

describe('searchUrl', () => {
  it('asks the search API for the query', () => {
    expect(searchUrl(' array map ')).toBe(
      'https://developer.mozilla.org/api/v1/search?q=array+map&locale=en-US&size=20',
    );
  });
});

describe('areaOf', () => {
  it('names the sections a page sits in', () => {
    expect(areaOf('/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map')).toBe(
      'JavaScript › Reference › Global Objects › Array',
    );
    expect(areaOf('/en-US/docs/Web/CSS/flex')).toBe('CSS');
    expect(areaOf('/en-US/docs/Learn_web_development/Core/CSS_layout/Flexbox')).toBe('Learn › Core › CSS layout');
  });
});

describe('parseResults', () => {
  it('reads documents from the API response', () => {
    const json = {
      documents: [
        {
          mdn_url: '/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
          title: 'Array.prototype.map()',
          summary: 'The <code>map()</code> method of Array instances creates a new array&#x27;s values.',
        },
        { title: 'No URL' },
        null,
      ],
      metadata: {},
      suggestions: [],
    };
    expect(parseResults(json)).toEqual([
      {
        title: 'Array.prototype.map()',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
        summary: "The map() method of Array instances creates a new array's values.",
        area: 'JavaScript › Reference › Global Objects › Array',
      },
    ]);
  });

  it('copes with an unexpected response', () => {
    expect(parseResults(null)).toEqual([]);
    expect(parseResults({ error: 'nope' })).toEqual([]);
  });
});

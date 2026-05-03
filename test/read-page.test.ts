import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tokenLen, type ExtractedPage } from '../src/tools/page-extract.js';
import { routeReadPage } from '../src/tools/read-page.js';

function makePage(opts: { sections: { heading: string; level: number; bodyChars: number }[] }): ExtractedPage {
  const parts: string[] = [];
  for (const s of opts.sections) {
    parts.push(`${'#'.repeat(s.level)} ${s.heading}`);
    parts.push('lorem ipsum dolor sit amet '.repeat(Math.max(1, Math.ceil(s.bodyChars / 28))));
  }
  const markdown = parts.join('\n\n');
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    markdown,
    tokenCount: tokenLen(markdown),
    headings: opts.sections.map(s => ({ text: s.heading, level: s.level })),
    source: 'fetch',
  };
}

describe('routeReadPage', () => {
  it('returns full content when page fits and no selectors', () => {
    const page = makePage({ sections: [{ heading: 'Intro', level: 1, bodyChars: 200 }] });
    const r = routeReadPage(page, {}, 5000);
    assert.equal(r.mode, 'full');
    assert.match(r.text, /Intro/);
  });

  it('automatically returns outline when oversized and no selectors', () => {
    const page = makePage({
      sections: [
        { heading: 'Intro', level: 1, bodyChars: 100 },
        { heading: 'History', level: 2, bodyChars: 100 },
        { heading: 'Demographics', level: 2, bodyChars: 100 },
      ],
    });
    const budget = 50;
    const r = routeReadPage(page, {}, budget);
    assert.equal(r.mode, 'outline');
    if (r.mode !== 'outline') return;
    assert.match(r.text, /Outline:/);
    assert.match(r.text, /Intro/);
    assert.match(r.text, /History/);
    assert.match(r.text, /Demographics/);
    assert.equal(r.headings, 3);
  });

  it('returns selected sections when given heading paths', () => {
    const page = makePage({
      sections: [
        { heading: 'Intro', level: 1, bodyChars: 100 },
        { heading: 'History', level: 2, bodyChars: 200 },
        { heading: 'Demographics', level: 2, bodyChars: 200 },
      ],
    });
    const r = routeReadPage(page, { sections: ['History'] }, 5000);
    assert.equal(r.mode, 'sections');
    if (r.mode !== 'sections') return;
    assert.match(r.text, /History/);
    assert.ok(!/Demographics/.test(r.text));
  });

  it('falls back to full when filter matches nothing but page fits', () => {
    const page = makePage({ sections: [{ heading: 'Only', level: 1, bodyChars: 100 }] });
    const r = routeReadPage(page, { query: 'nothing-matches' }, 5000);
    assert.equal(r.mode, 'full');
  });

  it('returns outline when filter matches nothing and page is oversized', () => {
    const page = makePage({
      sections: [
        { heading: 'Alpha', level: 1, bodyChars: 200 },
        { heading: 'Beta', level: 2, bodyChars: 200 },
      ],
    });
    const r = routeReadPage(page, { query: 'no-match' }, 50);
    assert.equal(r.mode, 'outline');
  });
});

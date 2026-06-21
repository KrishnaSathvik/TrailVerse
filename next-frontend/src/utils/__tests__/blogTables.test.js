import { describe, expect, it } from 'vitest';
import { enhanceBlogTables, enhanceBlogTablesInHtml, getBlogTableHeaders } from '../blogTables';

function buildTable({ withHead = true, tipTap = false, columnCount = 3 } = {}) {
  const root = document.createElement('div');
  const table = document.createElement('table');
  const labels = ['Season', 'Dates', 'Temp', 'Crowds', 'Best For'].slice(0, columnCount);
  const values = ['Winter', 'Dec–Feb', '40s°F', 'Low', 'Photos'].slice(0, columnCount);

  if (withHead && !tipTap) {
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    labels.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
  }

  const tbody = document.createElement('tbody');

  if (withHead && tipTap) {
    const headRow = document.createElement('tr');
    labels.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    tbody.appendChild(headRow);
  }

  const bodyRow = document.createElement('tr');
  values.forEach((value) => {
    const td = document.createElement('td');
    td.textContent = value;
    bodyRow.appendChild(td);
  });
  tbody.appendChild(bodyRow);
  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}

describe('getBlogTableHeaders', () => {
  it('reads TipTap header row from tbody th cells', () => {
    const root = buildTable({ tipTap: true });
    const table = root.querySelector('table');
    const { headers, headerRow } = getBlogTableHeaders(table);

    expect(headers).toEqual(['Season', 'Dates', 'Temp']);
    expect(headerRow).toBe(table.querySelector('tbody tr'));
  });
});

describe('enhanceBlogTables', () => {
  it('uses sticky scroll for 3+ column comparison tables', () => {
    const root = buildTable();
    enhanceBlogTables(root);

    const table = root.querySelector('table');
    const wrap = root.querySelector('.blog-table-wrap--sticky');
    expect(wrap).toBeTruthy();
    expect(table.classList.contains('blog-table-sticky')).toBe(true);
  });

  it('supports TipTap tables without thead', () => {
    const root = buildTable({ tipTap: true, columnCount: 4 });
    enhanceBlogTables(root);

    const table = root.querySelector('table');
    expect(table.classList.contains('blog-table-sticky')).toBe(true);
    expect(root.querySelector('.blog-table-header-row')).toBeTruthy();
  });

  it('uses plain scroll for two-column tables', () => {
    const root = buildTable({ columnCount: 2 });
    enhanceBlogTables(root);

    const table = root.querySelector('table');
    expect(table.classList.contains('blog-table-scroll')).toBe(true);
    expect(root.querySelector('.blog-table-wrap--sticky')).toBeNull();
  });

  it('falls back to scroll layout when header row is missing', () => {
    const root = buildTable({ withHead: false });
    enhanceBlogTables(root);

    const table = root.querySelector('table');
    expect(table.classList.contains('blog-table-scroll')).toBe(true);
  });

  it('enhances raw TipTap HTML strings', () => {
    const html =
      '<table><tbody><tr><th><p>Season</p></th><th><p>Dates</p></th><th><p>Temp</p></th></tr>' +
      '<tr><td><p>Winter</p></td><td><p>Dec–Feb</p></td><td><p>40s°F</p></td></tr></tbody></table>';
    const result = enhanceBlogTablesInHtml(html);

    expect(result).toContain('blog-table-wrap--sticky');
    expect(result).toContain('blog-table-sticky');
    expect(result).toContain('blog-table-header-row');
  });
});

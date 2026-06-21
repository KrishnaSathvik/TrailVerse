function normalizeHeaderText(cell) {
  return cell.textContent.replace(/\s+/g, ' ').trim();
}

/**
 * TipTap emits header cells in the first tbody row (<th>), not in <thead>.
 */
export function getBlogTableHeaders(table) {
  const theadHeaders = [...table.querySelectorAll('thead th')].map(normalizeHeaderText);
  if (theadHeaders.length > 0) {
    return { headers: theadHeaders, headerRow: null };
  }

  const firstRow = table.querySelector('tr');
  if (!firstRow) {
    return { headers: [], headerRow: null };
  }

  const thCells = firstRow.querySelectorAll('th');
  if (thCells.length === 0) {
    return { headers: [], headerRow: null };
  }

  return {
    headers: [...thCells].map(normalizeHeaderText),
    headerRow: firstRow,
  };
}

function wrapBlogTable(table, { sticky = false } = {}) {
  if (table.parentElement?.classList.contains('blog-table-wrap')) {
    return table.parentElement;
  }

  const wrap = document.createElement('div');
  wrap.className = sticky ? 'blog-table-wrap blog-table-wrap--sticky' : 'blog-table-wrap';
  table.parentNode.insertBefore(wrap, table);
  wrap.appendChild(table);
  return wrap;
}

/**
 * Wraps blog tables for mobile-friendly reading.
 * Comparison tables (3+ columns): horizontal scroll + sticky first column.
 * Small tables: scroll wrapper only.
 */
export function enhanceBlogTables(container) {
  if (!container?.querySelectorAll) {
    return;
  }

  container.querySelectorAll('table').forEach((table) => {
    if (table.dataset.enhanced === 'true') {
      return;
    }

    const { headers, headerRow } = getBlogTableHeaders(table);

    if (headers.length < 2) {
      wrapBlogTable(table);
      table.classList.add('blog-table-scroll');
      table.dataset.enhanced = 'true';
      return;
    }

    if (headerRow) {
      headerRow.classList.add('blog-table-header-row');
    }

    const useStickyFirstColumn = headers.length >= 3;
    wrapBlogTable(table, { sticky: useStickyFirstColumn });
    table.classList.add(useStickyFirstColumn ? 'blog-table-sticky' : 'blog-table-scroll');
    table.dataset.enhanced = 'true';
  });
}

export function enhanceBlogTablesInHtml(html = '') {
  if (!html || typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  enhanceBlogTables(doc.body);
  return doc.body.innerHTML;
}

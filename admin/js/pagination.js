function renderArticlePagination() {
  const container = document.getElementById('article-pagination');
  container.replaceChildren();
  const pages = articlePagination.total_pages || articlePagination.totalPages || Math.ceil((articlePagination.total || 0) / 10) || 1;
  for (const [label, page, disabled] of [['上一页', articlePage - 1, articlePage <= 1], ['下一页', articlePage + 1, articlePage >= pages]]) {
    const button = document.createElement('button');
    button.className = 'btn';
    button.textContent = label;
    button.disabled = disabled;
    button.onclick = () => loadArticles(page).catch(error => alert(error.message));
    container.append(button);
  }
  container.append(document.createTextNode(`第 ${articlePage} / ${pages} 页，共 ${articlePagination.total ?? articles.length} 篇`));
}

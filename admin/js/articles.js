    // 文章管理
    let articlePage = 1;
    let articlePagination = {};
    async function loadArticles(page = articlePage) {
      articlePage = page;
      const res = await adminFetch(`/api/articles?page=${articlePage}&per_page=10`, { headers: getAuthHeaders() });
      const data = await res.json();
      articles = data.data || data.articles || (Array.isArray(data) ? data : []);
      articlePagination = data.pagination || { page: 1, totalPages: 1, total: articles.length };
      renderArticlePagination();
      renderArticles();
      loadCategoriesForSelect();
    }

    function renderArticles() {
      const tbody = document.getElementById('articles-table');
      const emptyState = document.getElementById('articles-empty');
      
      if (articles.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      tbody.innerHTML = articles.map(article => {
        const statusTag = article.status === 'published' 
          ? '<span class="tag" style="background: #10b981; color: white;">已发布</span>'
          : '<span class="tag tag-gray">草稿</span>';
        return `
        <tr>
          <td><strong>${escapeHtml(article.title)}</strong></td>
          <td>${statusTag}</td>
          <td><span class="tag">${escapeHtml(article.category || '未分类')}</span></td>
          <td>${(article.tags || []).map(t => `<span class="tag tag-gray">${escapeHtml(t)}</span>`).join(' ')}</td>
          <td style="color: #64748b;">${escapeHtml(article.publishDate || '-')}</td>
          <td class="actions">
            <button class="btn btn-sm btn-secondary" data-action="editArticle" data-id="${escapeHtml(article.id)}">编辑</button>
            <button class="btn btn-sm btn-danger" data-action="deleteArticle" data-id="${escapeHtml(article.id)}">删除</button>
          </td>
        </tr>
        `;
      }).join('');
    }

    async function showArticleEditor(id = null) {
      currentEditId = id;
      if (id) {
        try {
          const res = await adminFetch(`/api/articles/by-id/${id}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const article = await res.json();
            await loadCategoriesForSelect();
            document.getElementById('article-category').value = article.category || '';
            document.getElementById('article-title').value = article.title || '';
            document.getElementById('article-slug').value = article.slug || '';
            document.getElementById('article-tags').value = (article.tags || []).join(', ');
            document.getElementById('article-content').value = article.content || '';
            document.getElementById('article-author').value = article.author || '';
            document.getElementById('article-status').value = article.status || 'published';
          }
        } catch (e) {
          console.error('获取文章详情失败:', e);
        }
      } else {
        document.getElementById('article-title').value = '';
        document.getElementById('article-slug').value = '';
        document.getElementById('article-tags').value = '';
        document.getElementById('article-content').value = '';
        document.getElementById('article-author').value = settings.author || '';
        document.getElementById('article-status').value = 'draft';
      }
      document.getElementById('article-editor').classList.add('active');
      bindUploadHandlers();
      bindDraftAutosave();
    }

    function closeArticleEditor() {
      document.getElementById('article-editor').classList.remove('active');
      clearDraft(currentEditId);
      currentEditId = null;
    }

    function editArticle(id) {
      showArticleEditor(id);
    }

    // 文章暂存功能
    let draftTimer = null;
    function bindDraftAutosave() {
      const contentEl = document.getElementById('article-content');
      const titleEl = document.getElementById('article-title');
      if (!contentEl) return;

      const draftKey = currentEditId ? `article-draft-${currentEditId}` : 'article-draft-new';

      // 检查是否有暂存内容
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.content && draft.content !== contentEl.value) {
            if (confirm('发现未保存的暂存内容，是否恢复？')) {
              contentEl.value = draft.content || '';
              if (draft.title) titleEl.value = draft.title;
              if (draft.tags) document.getElementById('article-tags').value = draft.tags;
              if (draft.author) document.getElementById('article-author').value = draft.author;
              if (draft.status) document.getElementById('article-status').value = draft.status;
            }
          }
        } catch (e) {}
      }

      // 自动暂存（防抖 1 秒）
      const autoSave = () => {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
          const draft = {
            title: titleEl.value,
            content: contentEl.value,
            tags: document.getElementById('article-tags').value,
            author: document.getElementById('article-author').value,
            status: document.getElementById('article-status').value,
            timestamp: Date.now()
          };
          localStorage.setItem(draftKey, JSON.stringify(draft));
        }, 1000);
      };

      contentEl.removeEventListener('input', autoSave);
      contentEl.addEventListener('input', autoSave);
      titleEl.removeEventListener('input', autoSave);
      titleEl.addEventListener('input', autoSave);
    }

    function clearDraft(id) {
      localStorage.removeItem(id ? `article-draft-${id}` : 'article-draft-new');
    }

    async function saveArticle(status) {
      const articleStatus = status || document.getElementById('article-status').value || 'draft';
      const article = {
        title: document.getElementById('article-title').value,
        slug: document.getElementById('article-slug').value,
        category: document.getElementById('article-category').value,
        tags: document.getElementById('article-tags').value.split(',').map(t => t.trim()).filter(t => t),
        content: document.getElementById('article-content').value,
        excerpt: document.getElementById('article-content').value.substring(0, settings.excerpt) + '...',
        status: articleStatus,
        publishDate: articleStatus === 'published' ? new Date().toISOString().split('T')[0] : null,
        updateDate: new Date().toISOString().split('T')[0],
        author: document.getElementById('article-author').value || settings.author
      };

      const url = currentEditId ? `/api/articles/${currentEditId}` : '/api/articles';
      const method = currentEditId ? 'PUT' : 'POST';

      await adminFetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(article)
      });

      closeArticleEditor();
      loadArticles();
      loadStats();
    }

    async function deleteArticle(id) {
      if (confirm('确定删除这篇文章？')) {
        await adminFetch(`/api/articles/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        clearDraft(id);
        loadArticles();
        loadStats();
      }
    }


    // 分类管理
    async function loadCategories() {
      const res = await adminFetch('/api/categories', { headers: getAuthHeaders() });
      const data = await res.json();
      categories = data.categories || data || [];
      renderCategories();
    }

    function renderCategories() {
      const tbody = document.getElementById('categories-table');
      const emptyState = document.getElementById('categories-empty');
      
      if (categories.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      tbody.innerHTML = categories.map(category => `
        <tr>
          <td><strong>${escapeHtml(category.name)}</strong></td>
          <td><span class="tag tag-gray">${escapeHtml(category.slug || '-')}</span></td>
          <td style="color: #94a3b8;">${escapeHtml(category.description || '-')}</td>
          <td><span class="tag">${escapeHtml(category.count || 0)}</span></td>
          <td class="actions">
            <button class="btn btn-sm btn-secondary" data-action="editCategory" data-id="${escapeHtml(category.id)}">编辑</button>
            <button class="btn btn-sm btn-danger" data-action="deleteCategory" data-id="${escapeHtml(category.id)}">删除</button>
          </td>
        </tr>
      `).join('');
    }

    function showCategoryModal(id = null) {
      currentEditId = id;
      if (id) {
        const category = categories.find(c => String(c.id) === String(id));
        if (category) {
          document.getElementById('category-name').value = category.name || '';
          document.getElementById('category-slug').value = category.slug || '';
          document.getElementById('category-description').value = category.description || '';
        }
        document.getElementById('category-modal-title').textContent = '编辑分类';
      } else {
        document.getElementById('category-name').value = '';
        document.getElementById('category-slug').value = '';
        document.getElementById('category-description').value = '';
        document.getElementById('category-modal-title').textContent = '新建分类';
      }
      showModal('category-modal');
    }

    function editCategory(id) {
      showCategoryModal(id);
    }

    async function saveCategory() {
      const category = {
        name: document.getElementById('category-name').value,
        slug: document.getElementById('category-slug').value,
        description: document.getElementById('category-description').value
      };

      const url = currentEditId ? `/api/categories/${currentEditId}` : '/api/categories';
      const method = currentEditId ? 'PUT' : 'POST';

      await adminFetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(category)
      });

      closeModal('category-modal');
      loadCategories();
      loadStats();
    }

    async function deleteCategory(id) {
      if (confirm('确定删除这个分类？')) {
        await adminFetch(`/api/categories/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        loadCategories();
        loadStats();
      }
    }

    // 标签管理
    async function loadTags() {
      const res = await adminFetch('/api/tags', { headers: getAuthHeaders() });
      const data = await res.json();
      tags = data.tags || data || [];
      renderTags();
    }

    function renderTags() {
      const tbody = document.getElementById('tags-table');
      const emptyState = document.getElementById('tags-empty');
      
      if (tags.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      tbody.innerHTML = tags.map(tag => `
        <tr>
          <td><strong>${escapeHtml(tag.name)}</strong></td>
          <td><span class="tag tag-gray">${escapeHtml(tag.slug || '-')}</span></td>
          <td style="color: #94a3b8;">${escapeHtml(tag.description || '-')}</td>
          <td><span class="tag">${escapeHtml(tag.count || 0)}</span></td>
          <td class="actions">
            <button class="btn btn-sm btn-secondary" data-action="editTag" data-id="${escapeHtml(tag.id)}">编辑</button>
            <button class="btn btn-sm btn-danger" data-action="deleteTag" data-id="${escapeHtml(tag.id)}">删除</button>
          </td>
        </tr>
      `).join('');
    }

    function showTagModal(id = null) {
      currentEditId = id;
      if (id) {
        const tag = tags.find(t => String(t.id) === String(id));
        if (tag) {
          document.getElementById('tag-name').value = tag.name || '';
          document.getElementById('tag-slug').value = tag.slug || '';
          document.getElementById('tag-description').value = tag.description || '';
        }
        document.getElementById('tag-modal-title').textContent = '编辑标签';
      } else {
        document.getElementById('tag-name').value = '';
        document.getElementById('tag-slug').value = '';
        document.getElementById('tag-description').value = '';
        document.getElementById('tag-modal-title').textContent = '新建标签';
      }
      showModal('tag-modal');
    }

    function editTag(id) {
      showTagModal(id);
    }

    async function saveTag() {
      const tag = {
        name: document.getElementById('tag-name').value,
        slug: document.getElementById('tag-slug').value,
        description: document.getElementById('tag-description').value
      };

      const url = currentEditId ? `/api/tags/${currentEditId}` : '/api/tags';
      const method = currentEditId ? 'PUT' : 'POST';

      await adminFetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(tag)
      });

      closeModal('tag-modal');
      loadTags();
      loadStats();
    }

    async function deleteTag(id) {
      if (confirm('确定删除这个标签？')) {
        await adminFetch(`/api/tags/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        loadTags();
        loadStats();
      }
    }

    // 加载分类到文章编辑器的选择框
    async function loadCategoriesForSelect() {
      if (categories.length === 0) {
        const res = await adminFetch('/api/categories', { headers: getAuthHeaders() });
        const data = await res.json();
        categories = data.categories || data || [];
      }
      const select = document.getElementById('article-category');
      select.innerHTML = '<option value="">选择分类</option>' + 
        categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    }


    // 加载统计数据
    async function loadStats() {
      try {
        const headers = getAuthHeaders();
        const [articlesRes, categoriesRes, tagsRes, viewsRes] = await Promise.all([
          fetch('/api/articles', { headers }),
          fetch('/api/categories', { headers }),
          fetch('/api/tags', { headers }),
          fetch('/api/stats/views', { headers })
        ]);

        const articlesData = await articlesRes.json();
        const categoriesData = await categoriesRes.json();
        const tagsData = await tagsRes.json();
        const viewsData = await viewsRes.json();

        const articlesList = Array.isArray(articlesData) ? articlesData : (articlesData.data || articlesData.articles || []);
        const categoriesList = Array.isArray(categoriesData) ? categoriesData : (categoriesData.categories || []);
        const tagsList = Array.isArray(tagsData) ? tagsData : (tagsData.tags || []);
        document.getElementById('stat-articles').textContent = articlesData.pagination?.total ?? articlesList.length;
        document.getElementById('stat-categories').textContent = categoriesList.length;
        document.getElementById('stat-tags').textContent = tagsList.length;
        document.getElementById('stat-views').textContent = viewsData.views || 0;
      } catch (e) {
        console.log('统计数据加载失败');
      }
    }

    // 导航切换
    function showSection(sectionId, event) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById(sectionId).classList.add('active');
      event?.target.closest('.nav-item')?.classList.add('active');

      if (sectionId === 'articles') loadArticles();
      if (sectionId === 'categories') loadCategories();
      if (sectionId === 'tags') loadTags();
    }

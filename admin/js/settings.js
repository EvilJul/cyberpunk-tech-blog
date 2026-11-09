    // 加载设置
    async function loadSettings() {
      try {
        const res = await adminFetch('/api/settings', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.settings || data) {
          settings = { ...settings, ...(data.settings || data) };
          applySettings();

          // 加载主题配置
          if ((data.settings || data).theme) {
            loadThemeToUI((data.settings || data).theme);
          }
        }
      } catch (e) {
        console.log('使用默认设置');
      }
    }

    // 应用设置到UI
    function applySettings() {
      document.getElementById('setting-title').value = settings.title;
      document.getElementById('setting-description').value = settings.description;
      document.getElementById('setting-excerpt').value = settings.excerpt;
      document.getElementById('setting-perpage').value = settings.perpage;
      document.getElementById('setting-sidebar').value = settings.sidebar;
      document.getElementById('setting-author').value = settings.author;
      document.getElementById('setting-bio').value = settings.bio;
      document.getElementById('setting-github').value = settings.github;
      document.getElementById('setting-email').value = settings.email;

      // 显示头像预览
      const avatarPreview = document.getElementById('avatar-preview');
      if (settings.avatar) {
        avatarPreview.src = settings.avatar;
        avatarPreview.style.display = 'block';
      } else {
        avatarPreview.style.display = 'none';
      }

      // 开关状态
      document.getElementById('toggle-grid').classList.toggle('active', settings.grid);
      document.getElementById('toggle-footer').classList.toggle('active', settings.footer);

      // 颜色选择
      document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === settings.color);
      });
    }

    // 切换开关
    function toggleSetting(key) {
      const toggle = document.getElementById(`toggle-${key}`);
      toggle.classList.toggle('active');
      settings[key] = toggle.classList.contains('active');
    }

    // 设置颜色
    function setColor(color) {
      settings.color = color;
      document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === color);
      });
    }

    // 保存设置
    async function saveSettings() {
      settings.title = document.getElementById('setting-title').value;
      settings.description = document.getElementById('setting-description').value;
      settings.excerpt = parseInt(document.getElementById('setting-excerpt').value);
      settings.perpage = parseInt(document.getElementById('setting-perpage').value);
      settings.sidebar = document.getElementById('setting-sidebar').value;
      settings.author = document.getElementById('setting-author').value;
      // settings.avatar 在上传时已经设置，不需要从输入框读取
      settings.bio = document.getElementById('setting-bio').value;
      settings.github = document.getElementById('setting-github').value;
      settings.email = document.getElementById('setting-email').value;

      // 保存主题配置
      settings.theme = readThemeFromUI();

      try {
        await adminFetch('/api/settings', {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(settings)
        });
        showSaveStatus('已保存');
      } catch (e) {
        showSaveStatus('保存失败', true);
      }
    }

    // 显示保存状态
    function showSaveStatus(msg, isError = false) {
      const statusEl = document.getElementById('save-status');
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.style.color = isError ? '#ef4444' : '#10b981';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
      }
    }

    // 自动保存（防抖）
    let autoSaveTimer = null;
    function autoSave() {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        saveSettings();
      }, 500);
    }

    // 为所有设置输入框绑定自动保存事件
    function bindAutoSave() {
      const inputs = [
        'setting-title', 'setting-description', 'setting-excerpt', 'setting-perpage',
        'setting-sidebar', 'setting-author', 'setting-bio', 'setting-github', 'setting-email'
      ];
      inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', autoSave);
          el.addEventListener('change', autoSave);
        }
      });

      // 开关类设置
      ['toggle-grid', 'toggle-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', autoSave);
      });

      // 颜色选择
      document.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', autoSave);
      });

      // 主题配置：字体和圆角输入框
      const themeInputs = [
        'theme-name', 'theme-font-heading', 'theme-font-body', 'theme-font-code',
        'theme-radius-sm', 'theme-radius-md', 'theme-radius-lg', 'theme-radius-xl'
      ];
      themeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', autoSave);
          el.addEventListener('change', autoSave);
        }
      });
    }

    let currentTheme = {
      name: '暗金赛博朋克',
      preset: 'cyberpunk',
      background: { image: '', size: 'cover', position: 'center', repeat: 'no-repeat', overlay: 0.7 },
      colors: {},
      fonts: {},
      effects: {},
      borderRadius: {}
    };

    // 预设主题
    const themePresets = {
      cyberpunk: {
        name: '暗金赛博朋克',
        preset: 'cyberpunk',
        background: { image: '', size: 'cover', position: 'center', repeat: 'no-repeat', overlay: 0.7 },
        colors: {
          background: '#0a0a0f', surface: '#141837', surfaceLight: '#202648', border: '#2a2a3a',
          primary: '#6366f1', primaryLight: '#818cf8', primaryDark: '#4f46e5',
          secondary: '#8b5cf6', secondaryLight: '#a78bfa',
          accent: '#C4612F', accentLight: '#A94E22',
          textPrimary: '#ffffff', textSecondary: '#a0aec0', textMuted: '#5C635D',
          success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6'
        },
        fonts: { heading: 'Fraunces, serif', body: 'Inter, sans-serif', code: 'Fira Code, monospace' },
        effects: { pixelSnow: true, sideRays: true, splashCursor: true, gridOverlay: true, glassEffect: true, animations: true },
        borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '1rem', xl: '1.5rem' }
      },
      minimal: {
        name: '极简白',
        preset: 'minimal',
        background: { image: '', size: 'cover', position: 'center', repeat: 'no-repeat', overlay: 0.9 },
        colors: {
          background: '#ffffff', surface: '#f8f9fa', surfaceLight: '#e9ecef', border: '#dee2e6',
          primary: '#000000', primaryLight: '#333333', primaryDark: '#000000',
          secondary: '#6c757d', secondaryLight: '#868e96',
          accent: '#0066cc', accentLight: '#3399ff',
          textPrimary: '#212529', textSecondary: '#495057', textMuted: '#6c757d',
          success: '#28a745', warning: '#ffc107', error: '#dc3545', info: '#17a2b8'
        },
        fonts: { heading: 'Inter, sans-serif', body: 'Inter, sans-serif', code: 'Fira Code, monospace' },
        effects: { pixelSnow: false, sideRays: false, splashCursor: false, gridOverlay: false, glassEffect: false, animations: true },
        borderRadius: { sm: '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem' }
      },
      dark: {
        name: '暗色',
        preset: 'dark',
        background: { image: '', size: 'cover', position: 'center', repeat: 'no-repeat', overlay: 0.8 },
        colors: {
          background: '#1a1a1a', surface: '#2d2d2d', surfaceLight: '#3d3d3d', border: '#404040',
          primary: '#60a5fa', primaryLight: '#93c5fd', primaryDark: '#3b82f6',
          secondary: '#a78bfa', secondaryLight: '#c4b5fd',
          accent: '#f59e0b', accentLight: '#fbbf24',
          textPrimary: '#f5f5f5', textSecondary: '#d4d4d4', textMuted: '#a3a3a3',
          success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
        },
        fonts: { heading: 'Inter, sans-serif', body: 'Inter, sans-serif', code: 'Fira Code, monospace' },
        effects: { pixelSnow: false, sideRays: false, splashCursor: true, gridOverlay: false, glassEffect: true, animations: true },
        borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' }
      }
    };

    // 加载主题配置到 UI
    function loadThemeToUI(theme) {
      currentTheme = JSON.parse(JSON.stringify(theme));

      // 主题名称
      document.getElementById('theme-name').value = theme.name || '';
      document.getElementById('theme-name-status').textContent = theme.preset === 'custom' ? '(自定义)' : '';

      // 背景图片
      if (theme.background) {
        document.getElementById('theme-bg-image').value = theme.background.image || '';
        document.getElementById('theme-bg-size').value = theme.background.size || 'cover';
        document.getElementById('theme-bg-position').value = theme.background.position || 'center';
        document.getElementById('theme-bg-overlay').value = theme.background.overlay || 0.7;
        document.getElementById('theme-bg-overlay-val').textContent = theme.background.overlay || 0.7;

        const bgPreview = document.getElementById('theme-bg-preview');
        const bgPlaceholder = document.getElementById('theme-bg-placeholder');
        const imageDimensions = document.getElementById('image-dimensions');

        if (theme.background.image) {
          bgPreview.style.display = 'block';
          bgPlaceholder.style.display = 'none';
          bgPreview.style.backgroundImage = `url(${theme.background.image})`;
          bgPreview.style.backgroundSize = theme.background.size || 'cover';
          bgPreview.style.backgroundPosition = theme.background.position || 'center';
          bgPreview.style.backgroundRepeat = 'no-repeat';

          // 加载图片获取实际尺寸
          const img = new Image();
          img.onload = function() {
            const sizeKB = Math.round(this.naturalWidth * this.naturalHeight * 3 / 1024);
            imageDimensions.textContent = `原始尺寸: ${this.naturalWidth} × ${this.naturalHeight} px (~${sizeKB} KB)`;
          };
          img.onerror = function() {
            imageDimensions.textContent = '图片加载失败';
          };
          img.src = theme.background.image;

          // 创建或更新遮罩层
          let overlay = bgPreview.querySelector('.preview-overlay');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'preview-overlay';
            overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0f; pointer-events: none; z-index: 1;';
            bgPreview.insertBefore(overlay, bgPreview.firstChild);
          }
          overlay.style.opacity = theme.background.overlay || 0.7;

          // 确保标签在最上层
          const labels = bgPreview.querySelectorAll('div:not(.preview-overlay)');
          labels.forEach(label => label.style.zIndex = '2');
        } else {
          bgPreview.style.display = 'none';
          bgPlaceholder.style.display = 'flex';
          imageDimensions.textContent = '';
        }
      }

      // 颜色
      Object.entries(theme.colors).forEach(([key, value]) => {
        const colorInput = document.getElementById(`theme-color-${key}`);
        const hexInput = document.getElementById(`theme-color-${key}-hex`);
        if (colorInput) colorInput.value = value;
        if (hexInput) hexInput.value = value;
      });

      // 字体
      document.getElementById('theme-font-heading').value = theme.fonts.heading || '';
      document.getElementById('theme-font-body').value = theme.fonts.body || '';
      document.getElementById('theme-font-code').value = theme.fonts.code || '';

      // 特效
      Object.entries(theme.effects).forEach(([key, value]) => {
        const checkbox = document.getElementById(`theme-effect-${key}`);
        if (checkbox) checkbox.checked = value;
      });

      // 圆角
      document.getElementById('theme-radius-sm').value = theme.borderRadius.sm || '';
      document.getElementById('theme-radius-md').value = theme.borderRadius.md || '';
      document.getElementById('theme-radius-lg').value = theme.borderRadius.lg || '';
      document.getElementById('theme-radius-xl').value = theme.borderRadius.xl || '';

      updateThemePreview();
    }

    // 从 UI 读取主题配置
    function readThemeFromUI() {
      const theme = { ...currentTheme };

      // 主题名称
      theme.name = document.getElementById('theme-name').value || '未命名主题';

      // 背景图片
      theme.background = {
        image: document.getElementById('theme-bg-image').value,
        size: document.getElementById('theme-bg-size').value,
        position: document.getElementById('theme-bg-position').value,
        repeat: 'no-repeat',
        overlay: parseFloat(document.getElementById('theme-bg-overlay').value)
      };

      // 字体
      theme.fonts = {
        heading: document.getElementById('theme-font-heading').value,
        body: document.getElementById('theme-font-body').value,
        code: document.getElementById('theme-font-code').value
      };

      // 圆角
      theme.borderRadius = {
        sm: document.getElementById('theme-radius-sm').value,
        md: document.getElementById('theme-radius-md').value,
        lg: document.getElementById('theme-radius-lg').value,
        xl: document.getElementById('theme-radius-xl').value
      };

      return theme;
    }

    // 更新颜色（修改预设主题时自动保存为自定义主题）
    function updateThemeColor(key, value) {
      // 如果当前是预设主题，自动转换为自定义主题
      if (currentTheme.preset !== 'custom') {
        currentTheme.preset = 'custom';
        document.getElementById('theme-name-status').textContent = '(自定义)';
      }
      currentTheme.colors[key] = value;
      document.getElementById(`theme-color-${key}-hex`).value = value;
      updateThemePreview();
      autoSave();
    }

    function updateThemeColorFromHex(key, value) {
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        // 如果当前是预设主题，自动转换为自定义主题
        if (currentTheme.preset !== 'custom') {
          currentTheme.preset = 'custom';
          document.getElementById('theme-name-status').textContent = '(自定义)';
        }
        currentTheme.colors[key] = value;
        document.getElementById(`theme-color-${key}`).value = value;
        updateThemePreview();
        autoSave();
      }
    }

    // 更新特效
    function updateThemeEffect(key, value) {
      currentTheme.effects[key] = value;
      updateThemePreview();
      autoSave();
    }

    // 更新背景图片
    function updateThemeBg() {
      currentTheme.background = {
        image: document.getElementById('theme-bg-image').value,
        size: document.getElementById('theme-bg-size').value,
        position: document.getElementById('theme-bg-position').value,
        repeat: 'no-repeat',
        overlay: parseFloat(document.getElementById('theme-bg-overlay').value)
      };

      const bgPreview = document.getElementById('theme-bg-preview');
      const bgPlaceholder = document.getElementById('theme-bg-placeholder');
      const imageDimensions = document.getElementById('image-dimensions');

      if (currentTheme.background.image) {
        bgPreview.style.display = 'block';
        bgPlaceholder.style.display = 'none';
        bgPreview.style.backgroundImage = `url(${currentTheme.background.image})`;
        bgPreview.style.backgroundSize = currentTheme.background.size;
        bgPreview.style.backgroundPosition = currentTheme.background.position;
        bgPreview.style.backgroundRepeat = 'no-repeat';

        // 加载图片获取实际尺寸
        const img = new Image();
        img.onload = function() {
          const sizeKB = Math.round(this.naturalWidth * this.naturalHeight * 3 / 1024);
          imageDimensions.textContent = `原始尺寸: ${this.naturalWidth} × ${this.naturalHeight} px (~${sizeKB} KB)`;
        };
        img.onerror = function() {
          imageDimensions.textContent = '图片加载失败';
        };
        img.src = currentTheme.background.image;

        // 更新遮罩层
        let overlay = bgPreview.querySelector('.preview-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'preview-overlay';
          overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #0a0a0f; pointer-events: none; z-index: 1;';
          bgPreview.insertBefore(overlay, bgPreview.firstChild);
        }
        overlay.style.opacity = currentTheme.background.overlay;

        // 确保标签在最上层
        const labels = bgPreview.querySelectorAll('div:not(.preview-overlay)');
        labels.forEach(label => label.style.zIndex = '2');
      } else {
        bgPreview.style.display = 'none';
        bgPlaceholder.style.display = 'flex';
        imageDimensions.textContent = '';
      }
      autoSave();
    }

    // 上传背景图片
    async function handleBgImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const url = await uploadImage(file, false, 'background');
        document.getElementById('theme-bg-image').value = url;
        updateThemeBg();
      } catch (e) {
        alert('上传失败：' + e.message);
      }
      event.target.value = '';
    }

    // 应用预设
    function applyPreset(presetId) {
      const preset = themePresets[presetId];
      if (preset) {
        loadThemeToUI(preset);
      }
    }

    // 更新预览
    function updateThemePreview() {
      const preview = document.getElementById('theme-preview');
      const c = currentTheme.colors;
      const r = currentTheme.borderRadius;
      const f = currentTheme.fonts;

      preview.style.background = c.background;
      preview.style.borderColor = c.border;
      preview.style.color = c.textPrimary;

      // 更新预览中的子元素
      const avatar = preview.querySelector('div > div:first-child');
      if (avatar) {
        avatar.style.background = c.primary;
        avatar.style.color = c.textPrimary;
      }
      const title = preview.querySelector('div > div:last-child > div:first-child');
      if (title) title.style.color = c.textPrimary;
      const desc = preview.querySelector('div > div:last-child > div:last-child');
      if (desc) desc.style.color = c.textSecondary;
      const btn1 = preview.querySelector('button:first-child');
      if (btn1) {
        btn1.style.background = c.primary;
        btn1.style.color = c.textPrimary;
        btn1.style.borderRadius = r.md;
      }
      const btn2 = preview.querySelector('button:nth-child(2)');
      if (btn2) {
        btn2.style.color = c.textSecondary;
        btn2.style.borderColor = c.border;
        btn2.style.borderRadius = r.md;
      }
      const badge1 = preview.querySelector('span:first-of-type');
      if (badge1) {
        badge1.style.background = c.success;
        badge1.style.borderRadius = r.sm;
      }
      const badge2 = preview.querySelector('span:last-of-type');
      if (badge2) {
        badge2.style.background = c.error;
        badge2.style.borderRadius = r.sm;
      }
    }

    // 导出主题
    function exportTheme() {
      const theme = readThemeFromUI();
      const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `theme-${theme.name || 'custom'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // 导入主题
    function importTheme() {
      document.getElementById('theme-file-input').click();
    }

    function handleThemeFileImport(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);

          // 验证必要字段
          if (!imported.colors || !imported.fonts || !imported.effects || !imported.borderRadius) {
            alert('主题文件格式不完整，缺少必要的 colors/fonts/effects/borderRadius 字段');
            return;
          }

          // 合并默认值
          const merged = {
            name: imported.name || '导入的主题',
            preset: 'custom',
            background: { ...themePresets.cyberpunk.background, ...imported.background },
            colors: { ...themePresets.cyberpunk.colors, ...imported.colors },
            fonts: { ...themePresets.cyberpunk.fonts, ...imported.fonts },
            effects: { ...themePresets.cyberpunk.effects, ...imported.effects },
            borderRadius: { ...themePresets.cyberpunk.borderRadius, ...imported.borderRadius }
          };

          loadThemeToUI(merged);
          alert('主题导入成功！请点击保存按钮应用主题。');
        } catch (err) {
          alert('解析主题文件失败：' + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }

    // 在保存设置时包含主题
    const originalSaveSettings = saveSettings;
    saveSettings = async function() {
      const theme = readThemeFromUI();
      settings.theme = theme;
      return originalSaveSettings.call(this);
    };

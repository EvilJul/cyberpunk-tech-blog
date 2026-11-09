    // Markdown 辅助工具
    function insertMd(before, after) {
      const ta = document.getElementById('article-content');
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.substring(start, end);
      const replacement = before + (selected || '文本') + after;
      ta.value = ta.value.substring(0, start) + replacement + ta.value.substring(end);
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + (selected || '文本').length;
    }

    function insertLine(prefix) {
      const ta = document.getElementById('article-content');
      const start = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      ta.value = ta.value.substring(0, lineStart) + prefix + ta.value.substring(lineStart);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = lineStart + prefix.length;
    }

    function insertImage() {
      document.getElementById('image-file-input').click();
    }

    async function uploadImage(file, insertMarkdown = true, imageType = 'normal') {
      const formData = new FormData();
      formData.append('image', file);

      // 通过管理代理流式复用公共上传接口
      try {
        const res = await adminFetch(`/api/upload?type=${imageType}`, {
          method: 'POST',
          headers: {
            'Authorization': getAuthHeaders().Authorization
          },
          body: formData
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '上传失败');
        }

        const data = await res.json();
        if (data.url) {
          // 仅在需要时插入 Markdown 到编辑器（头像和背景上传不需要）
          if (insertMarkdown) {
            const ta = document.getElementById('article-content');
            if (ta) {
              const pos = ta.selectionStart;
              const md = `![${file.name}](${data.url})`;
              ta.value = ta.value.substring(0, pos) + md + ta.value.substring(pos);
              ta.selectionStart = ta.selectionEnd = pos + md.length;
              ta.focus();
            }
          }
          return data.url;
        }
        throw new Error('上传响应格式错误');
      } catch (e) {
        console.error('上传失败:', e);
        throw e;
      }
    }

    // 图片粘贴和拖拽上传绑定
    let pasteBound = false;
    function bindUploadHandlers() {
      if (pasteBound) return;
      pasteBound = true;

      const ta = document.getElementById('article-content');
      if (ta) {
        ta.addEventListener('paste', async (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (file) {
                await uploadImage(file);
              }
              return;
            }
          }
        });
      }

      const dropZone = document.getElementById('image-drop-zone');
      const fileInput = document.getElementById('image-file-input');
      if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
          dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', async (e) => {
          e.preventDefault();
          dropZone.classList.remove('dragover');
          const files = e.dataTransfer.files;
          for (const file of files) {
            if (file.type.startsWith('image/')) {
              await uploadImage(file);
            }
          }
        });
        fileInput.addEventListener('change', async (e) => {
          const files = e.target.files;
          for (const file of files) {
            if (file.type.startsWith('image/')) {
              await uploadImage(file);
            }
          }
          fileInput.value = '';
        });
      }
    }

    // 弹窗控制
    function showModal(modalId) {
      document.getElementById(modalId).classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
      currentEditId = null;
    }

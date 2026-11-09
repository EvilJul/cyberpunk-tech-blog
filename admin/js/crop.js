    /* ========== 头像裁剪 ========== */
    let cropImg = null;
    let cropArea = { x: 0, y: 0, size: 0 };
    let cropDragging = false;
    let cropDragStart = { x: 0, y: 0 };
    let cropZoom = 1;

    function openCropModal(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          cropImg = img;
          initCropCanvas();
          document.getElementById('crop-modal').style.display = 'flex';
          document.getElementById('crop-modal').style.alignItems = 'center';
          document.getElementById('crop-modal').style.justifyContent = 'center';
          document.getElementById('crop-zoom').value = 100;
          cropZoom = 1;
          document.getElementById('crop-zoom-val').textContent = '100%';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function initCropCanvas() {
      const canvas = document.getElementById('crop-canvas');
      const ctx = canvas.getContext('2d');
      const container = document.getElementById('crop-container');
      const maxDim = Math.min(440, window.innerWidth - 80, window.innerHeight - 300);

      let w = cropImg.naturalWidth;
      let h = cropImg.naturalHeight;
      const scale = Math.min(maxDim / w, maxDim / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      canvas.width = w;
      canvas.height = h;
      container.style.width = w + 'px';
      container.style.height = h + 'px';

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(cropImg, 0, 0, w, h);

      const size = Math.min(w, h);
      cropArea = { x: (w - size) / 2, y: (h - size) / 2, size: size, imgW: w, imgH: h, scale: scale };
      drawCropOverlay();
      updateCropPreview();
    }

    function drawCropOverlay() {
      const canvas = document.getElementById('crop-canvas');
      const { x, y, size, imgW, imgH } = cropArea;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, imgW, imgH);
      ctx.drawImage(cropImg, 0, 0, imgW, imgH);

      // 半透明遮罩
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, imgW, imgH);

      // 清除裁剪区域
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(cropImg, 0, 0, imgW, imgH);
      ctx.restore();

      // 裁剪边框
      ctx.strokeStyle = 'rgba(255,215,0,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 十字线
      ctx.strokeStyle = 'rgba(255,215,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.33, y + size / 2);
      ctx.lineTo(x + size * 0.67, y + size / 2);
      ctx.moveTo(x + size / 2, y + size * 0.33);
      ctx.lineTo(x + size / 2, y + size * 0.67);
      ctx.stroke();
    }

    function updateCropPreview() {
      const canvas = document.getElementById('crop-canvas');
      const { x, y, size, imgW, imgH, scale } = cropArea;
      const previewSize = 64;

      // 圆形预览
      const pc = document.getElementById('crop-preview-circle');
      const pctx = pc.getContext('2d');
      pctx.clearRect(0, 0, previewSize, previewSize);
      pctx.save();
      pctx.beginPath();
      pctx.arc(previewSize/2, previewSize/2, previewSize/2, 0, Math.PI*2);
      pctx.clip();
      const sx = x / scale, sy = y / scale, sSize = size / scale;
      pctx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, previewSize, previewSize);
      pctx.restore();

      // 方形预览
      const sc = document.getElementById('crop-preview-square');
      const sctx = sc.getContext('2d');
      sctx.clearRect(0, 0, previewSize, previewSize);
      sctx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, previewSize, previewSize);
    }

    // 拖动裁剪区域
    document.getElementById('crop-canvas').addEventListener('mousedown', (e) => {
      const rect = e.target.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x, y, size } = cropArea;
      if (mx >= x && mx <= x + size && my >= y && my <= y + size) {
        cropDragging = true;
        cropDragStart = { x: mx - x, y: my - y };
        e.target.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!cropDragging) return;
      const canvas = document.getElementById('crop-canvas');
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let nx = mx - cropDragStart.x;
      let ny = my - cropDragStart.y;
      nx = Math.max(0, Math.min(cropArea.imgW - cropArea.size, nx));
      ny = Math.max(0, Math.min(cropArea.imgH - cropArea.size, ny));
      cropArea.x = nx;
      cropArea.y = ny;
      drawCropOverlay();
      updateCropPreview();
    });

    document.addEventListener('mouseup', () => {
      if (cropDragging) {
        cropDragging = false;
        document.getElementById('crop-canvas').style.cursor = 'crosshair';
      }
    });

    // 缩放滑块
    document.getElementById('crop-zoom').addEventListener('input', (e) => {
      cropZoom = e.target.value / 100;
      document.getElementById('crop-zoom-val').textContent = e.target.value + '%';
      applyCropZoom();
    });

    function applyCropZoom() {
      const { imgW, imgH, scale } = cropArea;
      const baseSize = Math.min(imgW, imgH);
      let newSize = baseSize / cropZoom;
      newSize = Math.max(40, Math.min(baseSize, newSize));
      cropArea.size = newSize;
      cropArea.x = Math.max(0, Math.min(imgW - newSize, cropArea.x));
      cropArea.y = Math.max(0, Math.min(imgH - newSize, cropArea.y));
      drawCropOverlay();
      updateCropPreview();
    }

    function closeCropModal() {
      document.getElementById('crop-modal').style.display = 'none';
      cropImg = null;
      cropDragging = false;
    }

    async function confirmCrop() {
      if (!cropImg) return;
      const { x, y, size, imgW, imgH, scale } = cropArea;

      // 在原始分辨率上裁剪
      const sx = x / scale, sy = y / scale, sSize = size / scale;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = 512;
      outCanvas.height = 512;
      const ctx = outCanvas.getContext('2d');
      ctx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, 512, 512);

      outCanvas.toBlob(async (blob) => {
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        closeCropModal();

        const statusEl = document.getElementById('avatar-status');
        statusEl.textContent = '上传中...';
        statusEl.style.color = '#ffd700';

        try {
          const url = await uploadImage(file, false, 'avatar');
          settings.avatar = url;
          const preview = document.getElementById('avatar-preview');
          preview.src = url;
          preview.style.display = 'block';
          statusEl.textContent = '上传成功';
          statusEl.style.color = '#10b981';
          await saveSettings();
        } catch (error) {
          statusEl.textContent = '上传失败';
          statusEl.style.color = '#ef4444';
        }
      }, 'image/jpeg', 0.92);
    }

    /* ========== 主题配置 ========== */

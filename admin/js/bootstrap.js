async function initializeAdmin() {
  await Promise.all([loadSettings(), loadStats(), loadArticles()]);
}
document.addEventListener('DOMContentLoaded', async () => {
  bindAutoSave();
  document.getElementById('avatar-upload').addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) openCropModal(file);
    event.target.value = '';
  });
  document.getElementById('logout-button').onclick = () => requireLogin();
  document.getElementById('login-form').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || '登录失败');
      if (data.user?.role !== 'admin') throw new Error('需要管理员权限');
      sessionStorage.setItem('admin-token', data.token);
      document.getElementById('login-panel').hidden = true;
      event.target.reset();
      await initializeAdmin();
    } catch (error) { requireLogin(error.message); }
  };
  window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    alert(event.reason?.message || '操作失败');
  });
  if (sessionStorage.getItem('admin-token')) {
    try {
      await adminFetch('/api/auth/me', { headers: getAuthHeaders() });
      document.getElementById('login-panel').hidden = true;
      await initializeAdmin();
    } catch (error) { requireLogin(error.message); }
  }
});

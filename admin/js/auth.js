function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function getAuthHeaders() {
  return { Authorization: `Bearer ${sessionStorage.getItem('admin-token') || ''}`, 'Content-Type': 'application/json' };
}
function requireLogin(message = '') {
  sessionStorage.removeItem('admin-token');
  document.getElementById('login-panel').hidden = false;
  document.getElementById('login-error').textContent = message;
}
async function adminFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) requireLogin('登录已失效，请重新登录');
  if (!response.ok) {
    const data = await response.clone().json().catch(() => ({}));
    throw new Error(data.error || `请求失败 (${response.status})`);
  }
  return response;
}

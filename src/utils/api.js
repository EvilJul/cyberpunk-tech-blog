// Vite normalizes BASE_URL to include the deployment prefix and trailing slash.
export function apiUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
export function apiFetch(path, options) {
  return fetch(apiUrl(path), options)
}

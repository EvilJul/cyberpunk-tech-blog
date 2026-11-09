import { fork } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function startFixture(t, entry = 'server/index.js', extraEnv = {}) {
  const root = await mkdtemp(join(tmpdir(), 'bolg-test-'))
  const dist = join(root, 'dist')
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), '<!doctype html><html><head><title>old</title></head><body><div id="root"></div></body></html>')
  await writeFile(join(dist, 'assets', 'test-abcdefgh.js'), '/* asset */' + 'hello'.repeat(2000))
  const child = fork(entry, [], {
    env: { ...process.env, NODE_ENV: 'production', PUBLIC_HOST: '127.0.0.1', PUBLIC_PORT: '0', BLOG_DATA_DIR: root, BLOG_DIST_DIR: dist, JWT_SECRET: 'test-secret-123456789012345678901234567890', SITE_URL: 'https://blog.example', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 12000).unref() })
    }
    await rm(root, { recursive: true, force: true })
  })
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 15000)
    child.once('message', ({ port }) => { clearTimeout(timer); resolve(port) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)) })
  })
  return { root, child, base: `http://127.0.0.1:${port}`, output: () => output }
}

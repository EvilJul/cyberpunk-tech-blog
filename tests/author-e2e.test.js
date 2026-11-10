import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { startFixture } from './helpers/server.js'

// External fonts may be unavailable in CI; screenshots use the rendered fallback fonts.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
const runFile = promisify(execFile)
const repository = resolve(import.meta.dirname, '..')
const builtDist = resolve(
  process.env.AUTHOR_E2E_DIST_DIR || join(repository, 'dist'),
)
const artifacts = join(repository, 'test-results', 'author-workspace')
/** 轮询条件直至满足或报告验收失败。 */
async function until(check, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await delay(100)
  }
  assert.fail(message)
}

test(
  'actual backend author workflow: publish isolation, conflict, moderation, background and logout',
  { timeout: 150000 },
  /* 使用真实后端验收作者写作与管理主流程。 */ async (t) => {
    // Set isolation before any application import or process. No real data or .env paths are used.
    const username = 'author-e2e',
      password = 'Fixture-only-Strong-Password-2026'
    let browser, context, page
    const evidence = {
      mockedRequests: 0,
      isolatedDatabase: true,
      publishingEnabled: false,
      steps: [],
      requests: [],
      screenshots: [],
    }
    await mkdir(artifacts, { recursive: true })
    const screenshot = /* 保存当前页面截图并登记证据。 */ async (name) => {
      const path = join(artifacts, `${name}.png`)
      await page.screenshot({ path, fullPage: true })
      evidence.screenshots.push(`${name}.png`)
    }
    try {
      await access(join(builtDist, 'index.html'))
      const fixture = await startFixture(t, 'server/index.js', {
        BLOG_DIST_DIR: builtDist,
        SESSION_COOKIE_SECURE: 'false',
        PUBLIC_ORIGIN: '',
        VITE_BASE_PATH: '/',
        PUBLISHING_API_ENABLED: 'false',
        NODE_ENV: 'test',
        BLOG_LOG_DIR: '',
        SITE_URL: '',
      })
      const origin = fixture.base,
        port = new URL(origin).port
      await runFile(
        process.execPath,
        ['scripts/init-admin.js', '--username', username, '--non-interactive'],
        {
          cwd: repository,
          env: {
            ...process.env,
            BLOG_DATA_DIR: fixture.root,
            BLOG_LOG_DIR: join(fixture.root, 'logs'),
            ADMIN_PASSWORD: password,
            NODE_ENV: 'test',
          },
          timeout: 20000,
        },
      )
      assert.ok(port > 0)
      assert.equal((await fetch(`${origin}/health`)).status, 200)
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      })
      page = await context.newPage()
      page.setDefaultTimeout(12000)
      const pageErrors = []
      context.on('page', /* 为新标签页收集运行时错误。 */ (tab) =>
        tab.on('pageerror', /* 记录新标签页的运行时错误。 */ (e) => pageErrors.push(e.message)),
      )
      page.on('pageerror', /* 记录作者页面的运行时错误。 */ (e) => pageErrors.push(e.message))
      context.on('response', /* 登记真实接口请求与版本响应。 */ (response) => {
        const url = new URL(response.url())
        if (url.pathname.startsWith('/api/'))
          evidence.requests.push({
            method: response.request().method(),
            path: url.pathname,
            status: response.status(),
            etag: response.headers().etag || null,
          })
      })
      page.on('dialog', /* 接受验收流程中的确认对话框。 */ (dialog) => dialog.accept())
      const api = /* 请求真实接口并校验成功响应。 */ async (path) => {
        const response = await context.request.get(`${origin}${path}`)
        assert.equal(response.status(), 200, path)
        return response.json()
      }
      const save = /* 保存指定标签页草稿并校验预期状态。 */ async (
        tab = page,
        status = tab.url().endsWith('/new') ? 201 : 200,
      ) => {
        const response = tab.waitForResponse(
          /* 匹配创建草稿或更新工作副本的响应。 */ (r) =>
            /\/api\/studio\/articles(?:\/[^/]+\/draft)?$/.test(
              new URL(r.url()).pathname,
            ) && ['POST', 'PUT'].includes(r.request().method()),
        )
        await tab.getByRole('button', { name: '保存草稿', exact: true }).click()
        const r = await response
        assert.equal(r.status(), status, await r.text())
        return r.json()
      }
      const publish = /* 发布当前草稿并等待成功提示。 */ async () => {
        const response = page.waitForResponse(
          /* 匹配真实发布操作的响应。 */ (r) =>
            new URL(r.url()).pathname.endsWith('/publish') &&
            r.request().method() === 'POST',
        )
        await page.getByRole('button', { name: '发布', exact: true }).click()
        const r = await response
        assert.equal(r.status(), 200, await r.text())
        await page.getByText('发布成功', { exact: true }).waitFor()
        return r.json()
      }

      await page.goto(`${origin}/`)
      await page.getByRole('link', { name: '登录', exact: true }).click()
      await page.getByLabel('用户名').fill(username)
      await page.getByLabel('密码', { exact: true }).fill(password)
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await page.getByRole('link', { name: '写文章', exact: true }).waitFor()
      assert.equal((await api('/api/session/me')).user.username, username)
      await screenshot('01-home-author-shortcuts')
      await page.getByRole('link', { name: '工作台', exact: true }).click()
      await page
        .getByRole('navigation', { name: '作者工作区' })
        .getByRole('link', { name: '分类', exact: true })
        .click()
      await page.waitForURL('**/studio/categories')
      await page.getByRole('heading', { name: '分类管理', exact: true }).waitFor()
      await page.getByLabel('名称', { exact: true }).fill('验收分类')
      await page.getByRole('button', { name: '新增分类', exact: true }).click()
      await page.getByText('操作成功', { exact: true }).waitFor()
      await page.getByRole('link', { name: '新建文章', exact: true }).click()
      await page.getByRole('heading', { name: '新建文章', exact: true }).waitFor()
      await page
        .getByLabel('标题', { exact: true })
        .fill('真实后端作者验收文章')
      await page
        .getByLabel('文章地址', { exact: true })
        .fill('author-e2e-workflow')
      await page.getByLabel('作者', { exact: true }).fill(username)
      await page
        .getByLabel('Markdown 正文')
        .fill('# 第一版\n\n公开内容第一版，仅在发布时可见。')
      const editor = page.getByLabel('Markdown 正文')
      await editor.evaluate(/* 将正文光标移到开头以验证工具栏插入。 */ (node) => node.setSelectionRange(0, 0))
      await page.getByRole('button', { name: '加粗', exact: true }).click()
      assert.ok((await editor.inputValue()).startsWith('**粗体**'))
      await editor.fill('# 第一版\n\n公开内容第一版，仅在发布时可见。')
      await page.getByLabel('分类', { exact: true }).fill('验收分类')
      assert.equal(
        await page
          .locator('#studio-categories option[value="验收分类"]')
          .count(),
        1,
      )
      await page.getByLabel('标签（逗号分隔）').fill('标签甲, 标签乙,')
      const sharp = (await import('sharp')).default
      const image = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: '#284c60',
        },
      })
        .png()
        .toBuffer()
      const files = [1, 2].map(/* 生成多图上传使用的文件描述。 */ (n) => ({
        name: `writing-${n}.png`,
        mimeType: 'image/png',
        buffer: image,
      }))
      await page.getByLabel('插入图片（上传后可公开访问）').setInputFiles(files)
      const countImages = /* 等待正文中的已插入图片达到预期数量。 */ async (count) =>
        until(
          /* 读取正文并判断图片数量。 */ async () =>
            ((await editor.inputValue()).match(/!\[图片\]/g) || []).length ===
            count,
          `expected ${count} inserted images`,
        )
      await countImages(2)
      // Dispatch native clipboard/drop events containing actual image bytes; no route interception.
      for (const [event, expected] of [
        ['paste', 3],
        ['drop', 4],
      ]) {
        await editor.evaluate(
          /* 派发含真实图片字节的粘贴或拖放事件。 */ (node, { event, bytes }) => {
            const transfer = new DataTransfer()
            transfer.items.add(
              new File([new Uint8Array(bytes)], `${event}.png`, {
                type: 'image/png',
              }),
            )
            node.dispatchEvent(
              event === 'paste'
                ? new ClipboardEvent('paste', {
                    clipboardData: transfer,
                    bubbles: true,
                    cancelable: true,
                  })
                : new DragEvent('drop', {
                    dataTransfer: transfer,
                    bubbles: true,
                    cancelable: true,
                  }),
            )
          },
          { event, bytes: [...image] },
        )
        await countImages(expected)
      }
      const beforeFailure = await editor.inputValue()
      await page
        .getByLabel('插入图片（上传后可公开访问）')
        .setInputFiles({
          name: 'broken.png',
          mimeType: 'image/png',
          buffer: Buffer.from('not-an-image'),
        })
      await page.getByRole('alert').filter({ hasText: '上传失败' }).waitFor()
      assert.equal(await editor.inputValue(), beforeFailure)
      const draft = await save()
      assert.deepEqual(draft.tags, ['标签甲', '标签乙'])
      evidence.steps.push(
        'existing category chooser; Markdown bold toolbar; trailing tag separator normalization; multi-image upload, image paste/drop; invalid image keeps text',
      )
      assert.equal(draft.status, 'draft')
      assert.equal(draft.author, username)
      await page.waitForURL(`**/studio/editor/${draft.id}`)
      await page.getByRole('heading', { name: '编辑文章' }).waitFor()
      assert.equal(
        (
          await context.request.get(`${origin}/api/articles/${draft.slug}`)
        ).status(),
        404,
      )
      await screenshot('02-saved-private-draft')
      const first = await publish()
      const publicFirst = await api(`/api/articles/${first.slug}`)
      assert.equal(publicFirst.content, first.content)
      assert.equal(publicFirst.author, username)
      evidence.steps.push(
        'login with seeded admin; create private draft; publish first snapshot',
      )
      const reader = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      })
      const publicPage = await reader.newPage()
      await publicPage.goto(`${origin}/article/${first.slug}`)
      await publicPage
        .getByText('公开内容第一版，仅在发布时可见。', { exact: true })
        .waitFor()
      await publicPage.screenshot({
        path: join(artifacts, '03-public-first-snapshot.png'),
        fullPage: true,
      })
      evidence.screenshots.push('03-public-first-snapshot.png')

      // Both tabs read the same real revision; one advances it, the other must get 412.
      const stale = await context.newPage()
      stale.on('dialog', /* 接受旧标签页中的确认对话框。 */ (dialog) => dialog.accept())
      await stale.goto(`${origin}/studio/editor/${draft.id}`)
      await stale.getByRole('heading', { name: '编辑文章' }).waitFor()
      await stale.getByLabel('Markdown 正文').fill('旧标签页未保存输入必须保留')
      await page
        .getByLabel('标题', { exact: true })
        .fill('真实后端作者验收文章第二版')
      await page
        .getByLabel('Markdown 正文')
        .fill('# 第二版\n\n工作副本第二版，保存不等于发布。')
      await page.getByLabel('标签（逗号分隔）').fill('')
      const secondDraft = await save()
      assert.deepEqual(secondDraft.tags, [])
      assert.ok(secondDraft.revision > first.revision)
      const unchanged = await api(`/api/articles/${first.slug}`)
      for (const field of ['title', 'content', 'slug', 'publish_date'])
        assert.deepEqual(
          unchanged[field],
          publicFirst[field],
          `draft must not change public ${field}`,
        )
      await save(stale, 412)
      await stale.getByRole('alert').filter({ hasText: '冲突' }).waitFor()
      assert.equal(
        await stale.getByLabel('Markdown 正文').inputValue(),
        '旧标签页未保存输入必须保留',
      )
      await stale.screenshot({
        path: join(artifacts, '04-real-revision-conflict.png'),
        fullPage: true,
      })
      evidence.screenshots.push('04-real-revision-conflict.png')
      await stale.close()
      const republished = await publish()
      assert.equal(
        (await api(`/api/articles/${republished.slug}`)).content,
        secondDraft.content,
      )
      await publicPage.reload()
      await publicPage
        .getByText('工作副本第二版，保存不等于发布。', { exact: true })
        .waitFor()
      evidence.steps.push(
        'save second working copy leaves public title/content/slug/date unchanged; stale tab gets 412 and keeps text; republish promotes second snapshot',
      )

      await page.getByRole('link', { name: '文章', exact: true }).click()
      await page.getByLabel('搜索文章', { exact: true }).fill('第二版')
      const searched = page.waitForResponse(
        /* 匹配带指定搜索词的文章列表响应。 */ (r) =>
          new URL(r.url()).pathname === '/api/studio/articles' &&
          new URL(r.url()).searchParams.get('search') === '第二版',
      )
      await page.getByRole('button', { name: '搜索', exact: true }).click()
      const searchResult = await (await searched).json()
      assert.equal(searchResult.data.length, 1)
      assert.equal(searchResult.data[0].id, draft.id)
      await page.getByText(/分类：\s*验收分类/).waitFor()
      await page.getByText(/发布时间：/).waitFor()
      await screenshot('09-article-search-metadata')
      evidence.steps.push(
        'real title search and category/tag/date list context; cleared tags saved as empty array',
      )

      await publicPage.getByLabel('昵称', { exact: true }).fill('真实访客')
      await publicPage
        .getByLabel('邮箱（不公开）', { exact: true })
        .fill('visitor@example.invalid')
      await publicPage
        .getByLabel('评论内容', { exact: true })
        .fill('这是一条真实待审核评论。')
      await publicPage.getByRole('button', { name: '发表评论' }).click()
      await publicPage
        .getByText('评论已提交，审核通过后公开显示。', { exact: true })
        .waitFor()
      assert.equal(
        (
          await (
            await reader.request.get(`${origin}/api/comments/${draft.id}`)
          ).json()
        ).length,
        0,
      )
      await page.getByRole('link', { name: '评论', exact: true }).click()
      await page.getByRole('heading', { name: '评论审核' }).waitFor()
      const comment = page
        .locator('article')
        .filter({ hasText: '这是一条真实待审核评论。' })
      await comment.getByRole('button', { name: '通过', exact: true }).click()
      await until(
        /* 等待审核通过的评论公开可读。 */ async () =>
          (
            await (
              await reader.request.get(`${origin}/api/comments/${draft.id}`)
            ).json()
          ).length === 1,
        'approved comment must be public',
      )
      await page.getByLabel('审核状态').selectOption('approved')
      await page
        .locator('article')
        .filter({ hasText: '这是一条真实待审核评论。' })
        .waitFor()
      await screenshot('05-comment-approved')
      await publicPage.reload()
      await publicPage
        .getByText('这是一条真实待审核评论。', { exact: true })
        .waitFor()
      const comments = await (
        await reader.request.get(`${origin}/api/comments/${draft.id}`)
      ).json()
      assert.equal(Object.hasOwn(comments[0], 'email'), false)
      evidence.steps.push(
        'anonymous comment stays pending/private; browser moderation approves it; public response omits email',
      )

      await page.getByRole('link', { name: '外观', exact: true }).click()
      await page.getByRole('heading', { name: '外观主题' }).waitFor()
      // Generate a deterministic local image, then use the actual browser upload endpoint.
      await page
        .getByLabel('上传背景', { exact: true })
        .setInputFiles({
          name: 'author-fixture-background.png',
          mimeType: 'image/png',
          buffer: image,
        })
      await page.getByText('图片已上传，请保存设置', { exact: true }).waitFor()
      const background = await page
        .getByLabel('背景图片地址', { exact: true })
        .inputValue()
      assert.match(background, /\/uploads\//)
      const savedSettings = page.waitForResponse(
        /* 匹配外观设置的保存响应。 */ (r) =>
          new URL(r.url()).pathname === '/api/studio/settings' &&
          r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: '保存设置', exact: true }).click()
      assert.equal((await savedSettings).status(), 200)
      await page.getByText('操作成功', { exact: true }).waitFor()
      await screenshot('06-appearance-saved')
      const settings = await api('/api/settings')
      assert.equal(settings.settings.theme.background.image, background)
      assert.equal(
        (await context.request.get(`${origin}${background}`)).status(),
        200,
      )
      await publicPage.reload()
      await until(
        /* 轮询读者页面背景是否已更新。 */ () =>
          publicPage.evaluate(
            /* 判断正文伪元素是否应用保存的背景地址。 */ (path) =>
              getComputedStyle(
                document.body,
                '::before',
              ).backgroundImage.includes(path),
            background,
          ),
        'saved background must be applied to public body',
      )
      await publicPage.screenshot({
        path: join(artifacts, '07-public-saved-background.png'),
        fullPage: true,
      })
      evidence.screenshots.push('07-public-saved-background.png')
      evidence.steps.push(
        'actual image upload; appearance settings persisted; public page reload applies saved local background',
      )

      await page.getByRole('button', { name: '退出登录', exact: true }).click()
      await page.getByRole('heading', { name: '作者登录' }).waitFor()
      const anonymous = await context.request.get(`${origin}/api/session/me`)
      assert.equal(anonymous.status(), 200)
      assert.equal((await anonymous.json()).user, null)
      assert.equal(
        (await context.request.get(`${origin}/api/studio/articles`)).status(),
        401,
      )
      await screenshot('08-logout-session-revoked')
      evidence.steps.push('logout revokes session and studio API access')
      assert.deepEqual(pageErrors, [], 'browser runtime errors')
      assert.ok(evidence.requests.some(/* 确认记录中存在真实版本冲突响应。 */ (r) => r.status === 412))
      evidence.passed = true
      await reader.close()
      t.diagnostic(`Actual backend workflow passed; screenshots: ${artifacts}`)
    } catch (error) {
      evidence.passed = false
      evidence.failure = error.message
      if (page && !page.isClosed()) await screenshot('failure').catch(/* 忽略失败截图错误以保留原始验收异常。 */ () => {})
      throw error
    } finally {
      await writeFile(
        join(artifacts, 'evidence.json'),
        JSON.stringify(evidence, null, 2),
      )
      await browser?.close()
    }
  },
)

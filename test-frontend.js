// 赛博朋克技术博客 - 前端测试脚本
// Frontend Testing Script for Cyberpunk Tech Blog

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:9098';
const TEST_RESULTS = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
  const statusSymbol = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '⚠';
  const statusColor = status === 'passed' ? 'green' : status === 'failed' ? 'red' : 'yellow';

  log(`${statusSymbol} ${name}`, statusColor);
  if (details) {
    console.log(`  ${details}`);
  }

  TEST_RESULTS.tests.push({ name, status, details });
  if (status === 'passed') TEST_RESULTS.passed++;
  else if (status === 'failed') TEST_RESULTS.failed++;
  else TEST_RESULTS.warnings++;
}

async function runTests() {
  log('\n================================================', 'blue');
  log('🧪 赛博朋克技术博客前端测试', 'blue');
  log('   Cyberpunk Tech Blog Frontend Testing', 'blue');
  log('================================================\n', 'blue');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // 收集控制台消息
  const consoleMessages = { errors: [], warnings: [], logs: [] };
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();

    if (type === 'error') {
      consoleMessages.errors.push(text);
    } else if (type === 'warning') {
      consoleMessages.warnings.push(text);
    } else {
      consoleMessages.logs.push(text);
    }
  });

  // 收集网络错误
  const networkErrors = [];
  page.on('response', response => {
    if (!response.ok() && response.status() !== 304) {
      networkErrors.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  try {
    log('================================================', 'blue');
    log('📋 测试 1: 页面加载测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 1.1: 首页加载
    console.log('测试 1.1: 首页加载...');
    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    const title = await page.title();
    logTest(
      '首页加载',
      'passed',
      `标题: "${title}", 加载时间: ${loadTime}ms`
    );

    // 测试 1.2: 页面加载性能
    console.log('\n测试 1.2: 页面加载性能...');
    if (loadTime < 3000) {
      logTest('页面加载性能', 'passed', `${loadTime}ms (优秀)`);
    } else if (loadTime < 5000) {
      logTest('页面加载性能', 'warning', `${loadTime}ms (一般)`);
    } else {
      logTest('页面加载性能', 'failed', `${loadTime}ms (慢)`);
    }

    // 等待页面完全渲染
    await page.waitForTimeout(2000);

    log('\n================================================', 'blue');
    log('🎨 测试 2: WebGL 背景组件测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 2.1: Canvas 元素
    console.log('测试 2.1: 检查 Canvas 元素...');
    const canvasCount = await page.locator('canvas').count();
    if (canvasCount >= 1) {
      logTest('Canvas 元素存在', 'passed', `找到 ${canvasCount} 个 canvas 元素`);
    } else {
      logTest('Canvas 元素存在', 'failed', '未找到 canvas 元素');
    }

    // 测试 2.2: WebGL 上下文
    console.log('\n测试 2.2: 检查 WebGL 上下文...');
    const hasWebGL = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      return gl !== null;
    });

    if (hasWebGL) {
      logTest('WebGL 上下文', 'passed', 'WebGL 初始化成功');
    } else {
      logTest('WebGL 上下文', 'warning', 'WebGL 可能未启用');
    }

    log('\n================================================', 'blue');
    log('🧭 测试 3: 导航栏测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 3.1: Header 存在
    console.log('测试 3.1: 检查导航栏...');
    const headerExists = await page.locator('header').count() > 0;
    if (headerExists) {
      logTest('导航栏存在', 'passed', 'Header 元素已找到');
    } else {
      logTest('导航栏存在', 'failed', '未找到 Header 元素');
    }

    // 测试 3.2: 导航链接
    console.log('\n测试 3.2: 检查导航链接...');
    const navLinks = await page.locator('header a, nav a').count();
    if (navLinks > 0) {
      logTest('导航链接', 'passed', `找到 ${navLinks} 个导航链接`);
    } else {
      logTest('导航链接', 'warning', '未找到导航链接');
    }

    log('\n================================================', 'blue');
    log('📝 测试 4: 内容区域测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 4.1: 主要内容区域
    console.log('测试 4.1: 检查主内容区域...');
    const mainContent = await page.locator('main, [role="main"], .main-content, .container').count();
    if (mainContent > 0) {
      logTest('主内容区域', 'passed', `找到 ${mainContent} 个主要容器`);
    } else {
      logTest('主内容区域', 'warning', '未找到明确的主内容区域');
    }

    // 测试 4.2: 文章相关元素
    console.log('\n测试 4.2: 检查文章元素...');
    const articleElements = await page.locator('article, [class*="article"], [class*="post"]').count();
    logTest('文章元素', articleElements > 0 ? 'passed' : 'warning', `找到 ${articleElements} 个文章相关元素`);

    // 测试 4.3: 图片加载
    console.log('\n测试 4.3: 检查图片加载...');
    const images = await page.locator('img').count();
    const brokenImages = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      let broken = 0;
      imgs.forEach(img => {
        if (!img.complete || img.naturalWidth === 0) {
          broken++;
        }
      });
      return broken;
    });

    if (images === 0) {
      logTest('图片加载', 'warning', '页面没有图片');
    } else if (brokenImages === 0) {
      logTest('图片加载', 'passed', `${images} 张图片全部加载成功`);
    } else {
      logTest('图片加载', 'failed', `${brokenImages}/${images} 张图片加载失败`);
    }

    log('\n================================================', 'blue');
    log('📊 测试 5: 侧边栏和组件测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 5.1: 侧边栏
    console.log('测试 5.1: 检查侧边栏...');
    const sidebar = await page.locator('aside, [class*="sidebar"], [class*="side-bar"]').count();
    logTest('侧边栏', sidebar > 0 ? 'passed' : 'warning', `找到 ${sidebar} 个侧边栏元素`);

    // 测试 5.2: 按钮和交互元素
    console.log('\n测试 5.2: 检查交互元素...');
    const buttons = await page.locator('button, [role="button"]').count();
    const links = await page.locator('a').count();
    logTest('交互元素', 'passed', `按钮: ${buttons}, 链接: ${links}`);

    log('\n================================================', 'blue');
    log('🎯 测试 6: 响应式布局测试', 'blue');
    log('================================================\n', 'blue');

    // 测试 6.1: 移动端视图
    console.log('测试 6.1: 测试移动端视图...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    const mobileScreenshot = path.join(__dirname, 'test-screenshot-mobile.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: false });
    logTest('移动端视图', 'passed', `截图已保存: ${mobileScreenshot}`);

    // 测试 6.2: 平板视图
    console.log('\n测试 6.2: 测试平板视图...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);

    const tabletScreenshot = path.join(__dirname, 'test-screenshot-tablet.png');
    await page.screenshot({ path: tabletScreenshot, fullPage: false });
    logTest('平板视图', 'passed', `截图已保存: ${tabletScreenshot}`);

    // 恢复桌面视图
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);

    log('\n================================================', 'blue');
    log('⚠️  测试 7: 控制台错误检查', 'blue');
    log('================================================\n', 'blue');

    console.log('测试 7.1: 控制台错误...');
    if (consoleMessages.errors.length === 0) {
      logTest('控制台错误', 'passed', '没有控制台错误');
    } else {
      const errorPreview = consoleMessages.errors.slice(0, 3).join('\n  ');
      logTest('控制台错误', 'warning', `${consoleMessages.errors.length} 个错误\n  ${errorPreview}`);
    }

    console.log('\n测试 7.2: 网络请求...');
    if (networkErrors.length === 0) {
      logTest('网络请求', 'passed', '所有请求成功');
    } else {
      const errorPreview = networkErrors.slice(0, 3).map(e => `${e.status}: ${e.url}`).join('\n  ');
      logTest('网络请求', 'warning', `${networkErrors.length} 个失败请求\n  ${errorPreview}`);
    }

    log('\n================================================', 'blue');
    log('📸 测试 8: 截图保存', 'blue');
    log('================================================\n', 'blue');

    // 完整页面截图
    console.log('测试 8.1: 保存完整页面截图...');
    const fullScreenshot = path.join(__dirname, 'test-screenshot-full.png');
    await page.screenshot({ path: fullScreenshot, fullPage: true });
    logTest('完整页面截图', 'passed', `已保存: ${fullScreenshot}`);

    // 首屏截图
    console.log('\n测试 8.2: 保存首屏截图...');
    const viewportScreenshot = path.join(__dirname, 'test-screenshot-viewport.png');
    await page.screenshot({ path: viewportScreenshot, fullPage: false });
    logTest('首屏截图', 'passed', `已保存: ${viewportScreenshot}`);

    log('\n================================================', 'blue');
    log('🔍 测试 9: 可访问性基础检查', 'blue');
    log('================================================\n', 'blue');

    // 测试 9.1: 页面语言
    console.log('测试 9.1: 检查页面语言属性...');
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    if (htmlLang) {
      logTest('页面语言', 'passed', `lang="${htmlLang}"`);
    } else {
      logTest('页面语言', 'warning', '未设置 lang 属性');
    }

    // 测试 9.2: Alt 文本
    console.log('\n测试 9.2: 检查图片 alt 属性...');
    const imgStats = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      const total = imgs.length;
      let withAlt = 0;
      imgs.forEach(img => {
        if (img.alt) withAlt++;
      });
      return { total, withAlt };
    });

    if (imgStats.total === 0) {
      logTest('图片 Alt 属性', 'warning', '页面没有图片');
    } else if (imgStats.withAlt === imgStats.total) {
      logTest('图片 Alt 属性', 'passed', `所有图片都有 alt 属性 (${imgStats.total}/${imgStats.total})`);
    } else {
      logTest('图片 Alt 属性', 'warning', `${imgStats.withAlt}/${imgStats.total} 张图片有 alt 属性`);
    }

    // 测试 9.3: 标题层级
    console.log('\n测试 9.3: 检查标题层级...');
    const headings = await page.evaluate(() => {
      const h1Count = document.querySelectorAll('h1').length;
      const h2Count = document.querySelectorAll('h2').length;
      const h3Count = document.querySelectorAll('h3').length;
      return { h1: h1Count, h2: h2Count, h3: h3Count };
    });

    if (headings.h1 === 0) {
      logTest('标题层级', 'warning', '页面没有 h1 标题');
    } else if (headings.h1 === 1) {
      logTest('标题层级', 'passed', `H1: ${headings.h1}, H2: ${headings.h2}, H3: ${headings.h3}`);
    } else {
      logTest('标题层级', 'warning', `多个 H1 标题 (${headings.h1})`);
    }

    log('\n================================================', 'blue');
    log('⚡ 测试 10: 性能指标', 'blue');
    log('================================================\n', 'blue');

    // 测试 10.1: 性能指标
    console.log('测试 10.1: 收集性能指标...');
    const performanceMetrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation')[0];
      if (perfData) {
        return {
          dns: Math.round(perfData.domainLookupEnd - perfData.domainLookupStart),
          tcp: Math.round(perfData.connectEnd - perfData.connectStart),
          ttfb: Math.round(perfData.responseStart - perfData.requestStart),
          domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart),
          domInteractive: Math.round(perfData.domInteractive - perfData.fetchStart),
          loadComplete: Math.round(perfData.loadEventEnd - perfData.fetchStart)
        };
      }
      return null;
    });

    if (performanceMetrics) {
      logTest('性能指标', 'passed',
        `DNS: ${performanceMetrics.dns}ms, ` +
        `TCP: ${performanceMetrics.tcp}ms, ` +
        `TTFB: ${performanceMetrics.ttfb}ms, ` +
        `DOM Interactive: ${performanceMetrics.domInteractive}ms, ` +
        `Load: ${performanceMetrics.loadComplete}ms`
      );
    } else {
      logTest('性能指标', 'warning', '无法获取性能数据');
    }

  } catch (error) {
    logTest('测试执行', 'failed', `错误: ${error.message}`);
    console.error('测试错误详情:', error);
  } finally {
    await browser.close();
  }

  // 生成测试报告
  generateReport();
}

function generateReport() {
  log('\n================================================', 'blue');
  log('📊 测试总结 (Test Summary)', 'blue');
  log('================================================\n', 'blue');

  const total = TEST_RESULTS.passed + TEST_RESULTS.failed + TEST_RESULTS.warnings;

  console.log(`总测试数 (Total Tests): ${total}`);
  log(`通过 (Passed): ${TEST_RESULTS.passed}`, 'green');
  log(`警告 (Warnings): ${TEST_RESULTS.warnings}`, 'yellow');
  log(`失败 (Failed): ${TEST_RESULTS.failed}`, 'red');

  const passRate = ((TEST_RESULTS.passed / total) * 100).toFixed(1);
  console.log(`\n通过率 (Pass Rate): ${passRate}%`);

  if (TEST_RESULTS.failed === 0) {
    log('\n🎉 所有关键测试通过！', 'green');
  } else {
    log('\n⚠️  部分测试失败，请检查详情', 'yellow');
  }

  // 保存 JSON 报告
  const reportPath = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(TEST_RESULTS, null, 2));
  log(`\n测试报告已保存: ${reportPath}`, 'blue');
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});

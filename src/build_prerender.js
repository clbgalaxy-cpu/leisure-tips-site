// Version 34 — Bước 2: build cây trang tĩnh thật (prerender) cho SEO.
//
// Vì sao cần file này: SPA chỉ có 1 file HTML, mọi nội dung (tiêu đề/mô tả/nội dung từng Trải
// nghiệm-Địa điểm-Local) đều do JS dựng SAU khi trang tải — Google có thể đọc được (chạy JS) nhưng
// chậm/không chắc index hết, còn Facebook/Zalo/Instagram share preview thì KHÔNG chạy JS nên luôn
// thấy trang trống. Script này dùng chính Playwright (trình duyệt thật, headless) mở app, gọi lại
// đúng các hàm render có sẵn của app (KHÔNG viết lại logic hiển thị ở nơi khác — tránh 2 nơi có thể
// lệch nhau), rồi chụp lại DOM đã dựng xong thành 1 file index.html tĩnh cho từng URL thật — Google
// và Facebook đọc thấy nội dung đầy đủ ngay lập tức, không cần chờ JS.
//
// Nguồn dữ liệu: script để app tự chạy loadLiveData() như bình thường (gọi Supabase thật bằng đúng
// anon key public đã có sẵn trong chính trang) — nếu mạng chặn (vd sandbox build cục bộ) app tự rơi về
// dữ liệu demo có sẵn, vẫn build ra được để kiểm tra cơ chế. Trên GitHub Actions (mạng đầy đủ), bước
// này sẽ luôn lấy được dữ liệu thật mới nhất từ Supabase.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Version 34: chạy được cả ở máy dev lẫn trong GitHub Actions.
// build_standalone.js đã chạy trước bước này và ghi index.html/404.html/.nojekyll thẳng vào gốc repo
// (../ so với file này) — script này đọc lại đúng index.html đó, rồi ghi các trang con tĩnh vào cùng
// gốc repo luôn (không dùng thư mục tạm riêng), để bước "git add" sau cùng của workflow gom đủ 1 lượt.
const REPO_ROOT = path.join(__dirname, '..');
const SRC_HTML = path.join(REPO_ROOT, 'index.html');
const OUT_DIR = REPO_ROOT;
const SITE_ORIGIN = 'https://leisure.tips';
// Đặt biến môi trường PW_CHROME_PATH nếu cần chỉ thẳng 1 bản Chromium đã cài sẵn (vd chạy trong sandbox
// dev không có mạng để `playwright install` tải về); để trống thì dùng bản Playwright tự quản lý — đúng
// cách chạy trên GitHub Actions sau khi `npx playwright install --with-deps chromium`.
const CHROME_PATH = process.env.PW_CHROME_PATH || undefined;

function slugifyNode(s){
  var str = (s || 'item').toString().toLowerCase().replace(/đ/g, 'd');
  str = str.normalize('NFD').replace(/[̀-ͯ]/g, '');
  str = str.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return str || 'item';
}

function escAttr(s){
  return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// title/description/canonical trong DOM đã được chính app tự set đúng (applyPageMeta(), Version 34)
// ngay khi openExperience()/openPlace()/go() chạy — hàm này chỉ THÊM phần OG/Twitter/JSON-LD mà
// applyPageMeta() không set (để giữ code trong app nhẹ, phần SEO nặng nằm ở build script này).
function injectHead(html, opts){
  var block = ''
    + '<meta property="og:type" content="website">\n'
    + '<meta property="og:site_name" content="Leisure.tips">\n'
    + '<meta property="og:title" content="' + escAttr(opts.title) + '">\n'
    + '<meta property="og:description" content="' + escAttr(opts.description) + '">\n'
    + '<meta property="og:url" content="' + escAttr(opts.canonical) + '">\n'
    + (opts.image ? '<meta property="og:image" content="' + escAttr(opts.image) + '">\n' : '')
    + '<meta name="twitter:card" content="' + (opts.image ? 'summary_large_image' : 'summary') + '">\n'
    + '<meta name="twitter:title" content="' + escAttr(opts.title) + '">\n'
    + '<meta name="twitter:description" content="' + escAttr(opts.description) + '">\n'
    + (opts.jsonLd ? ('<script type="application/ld+json">' + JSON.stringify(opts.jsonLd) + '</script>\n') : '');
  if(html.indexOf('</head>') === -1) throw new Error('Không tìm thấy </head> để chèn thẻ SEO');
  return html.replace('</head>', block + '</head>');
}

function writePage(urlPath, html){
  var rel = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  var dir = rel ? path.join(OUT_DIR, rel) : OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

async function main(){
  if(!fs.existsSync(SRC_HTML)) throw new Error('Chưa có ' + SRC_HTML + ' — chạy node build_standalone.js trước.');

  // Xoá sạch các thư mục trang con tĩnh build ở lượt trước (không đụng vào index.html/404.html/.nojekyll/
  // CNAME/README.md/src/ đã có sẵn ở gốc repo) — để không để sót trang cũ khi 1 Trải nghiệm/Địa điểm/Local
  // bị xoá hoặc đổi tên id.
  ['trai-nghiem', 'dia-diem', 'local'].forEach(function(d){
    fs.rmSync(path.join(REPO_ROOT, d), { recursive: true, force: true });
  });

  const generated = []; // {path, changefreq, priority}
  const warnings = [];

  const browser = await chromium.launch(CHROME_PATH ? { executablePath: CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', function(e){ warnings.push('pageerror: ' + e.message); });

  await page.goto('file://' + SRC_HTML);

  // Đợi 1 lượt loadLiveData() xong (thành công hay rơi về demo đều tính) trước khi build bất kỳ trang nào,
  // để mọi trang trong 1 lần build đều dùng cùng 1 bộ dữ liệu nhất quán.
  const gotLive = await page.evaluate(function(){
    return new Promise(function(resolve){
      var done = false;
      window.addEventListener('leisure:data-ready', function once(e){
        if(done) return; done = true;
        window.removeEventListener('leisure:data-ready', once);
        resolve(e.detail && e.detail.live);
      });
      setTimeout(function(){ if(!done){ done = true; resolve(false); } }, 8000);
    });
  });
  console.log(gotLive ? '✓ Đang build bằng DỮ LIỆU THẬT từ Supabase.' : '⚠ Không lấy được dữ liệu thật (mạng bị chặn hoặc chưa cấu hình) — build bằng DỮ LIỆU DEMO trong code. Trên GitHub Actions bước này sẽ luôn dùng dữ liệu thật.');

  // ---------- Trang chủ ----------
  // index.html/404.html/.nojekyll đã được build_standalone.js ghi thẳng vào gốc repo ở bước trước —
  // trang chủ đã có sẵn title/meta description/OG tĩnh trong template, không cần chụp lại qua trình duyệt.
  generated.push({ path: '/', changefreq: 'daily', priority: '1.0' });

  // ---------- Trải nghiệm ----------
  const expIds = await page.evaluate(function(){ return window.__prerender.publishedExperienceIds(); });
  console.log('Trải nghiệm:', expIds.length, expIds);
  for(const id of expIds){
    const r = await page.evaluate(function(id){
      window.__prerender.openExperience(id);
      var x = window.__prerender.getExperience(id);
      return {
        title: document.title,
        rawTitle: x ? x.title : id,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        image: x ? (x.image || null) : null,
        place: x ? x.place : '',
        html: document.documentElement.outerHTML
      };
    }, id);
    const jsonLd = {
      '@context': 'https://schema.org', '@type': 'TouristAttraction',
      name: r.rawTitle, description: r.description, url: r.canonical,
      address: { '@type': 'PostalAddress', addressLocality: r.place, addressCountry: 'VN' }
    };
    if(r.image) jsonLd.image = r.image;
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: r.image, jsonLd: jsonLd });
    writePage('/trai-nghiem/' + id + '/', html);
    generated.push({ path: '/trai-nghiem/' + id + '/', changefreq: 'weekly', priority: '0.8' });
  }

  // ---------- Địa điểm: trang danh sách + từng trang chi tiết ----------
  await page.click('[data-nav="places"]');
  {
    const r = await page.evaluate(function(){
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        html: document.documentElement.outerHTML
      };
    });
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: null, jsonLd: null });
    writePage('/dia-diem/', html);
    generated.push({ path: '/dia-diem/', changefreq: 'weekly', priority: '0.7' });
  }

  const placeIds = await page.evaluate(function(){ return window.__prerender.publishedPlaceIds(); });
  console.log('Địa điểm:', placeIds.length, placeIds);
  for(const id of placeIds){
    const r = await page.evaluate(function(id){
      window.__prerender.openPlace(id);
      var p = window.__prerender.getPlace(id);
      return {
        title: document.title,
        rawTitle: p ? p.name : id,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        image: p ? (p.imageUrl || null) : null,
        html: document.documentElement.outerHTML
      };
    }, id);
    const jsonLd = {
      '@context': 'https://schema.org', '@type': 'TouristDestination',
      name: r.rawTitle, description: r.description, url: r.canonical,
      address: { '@type': 'PostalAddress', addressLocality: r.rawTitle, addressCountry: 'VN' }
    };
    if(r.image) jsonLd.image = r.image;
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: r.image, jsonLd: jsonLd });
    writePage('/dia-diem/' + id + '/', html);
    generated.push({ path: '/dia-diem/' + id + '/', changefreq: 'weekly', priority: '0.7' });
  }

  // ---------- Local: trang "theo địa phương" (destinations) + từng hồ sơ + Local lọc theo tỉnh ----------
  await page.click('[data-nav="destinations"]');
  {
    const r = await page.evaluate(function(){
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        html: document.documentElement.outerHTML
      };
    });
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: null, jsonLd: null });
    writePage('/local/', html);
    generated.push({ path: '/local/', changefreq: 'weekly', priority: '0.7' });
  }

  const localIds = await page.evaluate(function(){ return window.__prerender.publishedLocalIds(); });
  console.log('Local:', localIds.length, localIds);
  for(const id of localIds){
    const r = await page.evaluate(function(id){
      window.__prerender.openLocalProfile(id);
      var l = window.__prerender.getLocal(id);
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        image: l ? (l.photo || null) : null,
        html: document.documentElement.outerHTML
      };
    }, id);
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: r.image, jsonLd: null });
    writePage('/local/ho-so/' + id + '/', html);
    generated.push({ path: '/local/ho-so/' + id + '/', changefreq: 'weekly', priority: '0.6' });
  }

  const destNames = await page.evaluate(function(){ return window.__prerender.destinationPlaceNames(); });
  console.log('Điểm đến (Local theo địa phương):', destNames.length, destNames);
  for(const name of destNames){
    const r = await page.evaluate(function(name){
      window.__prerender.openLocalsListByPlace(name);
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        html: document.documentElement.outerHTML
      };
    }, name);
    const slug = slugifyNode(name);
    const html = injectHead(r.html, { title: r.title, description: r.description, canonical: r.canonical, image: null, jsonLd: null });
    writePage('/local/tai/' + slug + '/', html);
    generated.push({ path: '/local/tai/' + slug + '/', changefreq: 'weekly', priority: '0.6' });
  }

  await browser.close();

  // ---------- sitemap.xml + robots.txt ----------
  const urlsXml = generated.map(function(g){
    return '  <url>\n    <loc>' + SITE_ORIGIN + g.path + '</loc>\n    <changefreq>' + g.changefreq + '</changefreq>\n    <priority>' + g.priority + '</priority>\n  </url>';
  }).join('\n');
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urlsXml + '\n</urlset>\n';
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap);

  const robots = 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE_ORIGIN + '/sitemap.xml\n';
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), robots);

  console.log('\nXONG. Tổng số trang tĩnh đã build:', generated.length, '→', OUT_DIR);
  if(warnings.length){ console.warn('\nCẢNH BÁO trong lúc build:\n' + warnings.join('\n')); }
}

main().catch(function(err){ console.error('LỖI BUILD PRERENDER:', err); process.exit(1); });

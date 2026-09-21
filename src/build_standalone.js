// Đóng gói file fragment (dùng để publish qua Artifact tool, Artifact tự thêm khung
// doctype/head/meta viewport riêng) thành 1 file HTML độc lập, hợp lệ để deploy thẳng
// lên GitHub Pages (leisure.tips) — nơi KHÔNG có ai bọc thêm head/meta viewport giúp cả.
// Thiếu <meta name="viewport"> là lý do trình duyệt mobile mặc định coi trang là
// "trang desktop rộng ~980px" rồi tự thu nhỏ lại vừa màn hình — đúng triệu chứng
// "trên mobile hiển thị giống laptop, chữ bé khó đọc" mà Sơn báo (Version 26).
//
// Version 34: chạy được cả ở máy dev lẫn trong GitHub Actions — mọi đường dẫn đều tương đối
// theo vị trí file này (src/), ghi thẳng ra gốc repo (../) để build_prerender.js chạy tiếp sau đó.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'leisure-tips-prototype.html');
const OUT = path.join(__dirname, '..', 'index.html');

const src = fs.readFileSync(SRC, 'utf8');
const marker = '</style>';
const idx = src.indexOf(marker);
if (idx === -1) throw new Error('Không tìm thấy </style> để tách head/body');

const headInner = src.slice(0, idx + marker.length);
const bodyInner = src.slice(idx + marker.length);

const out = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F5F2">
${headInner}
</head>
<body>
${bodyInner}
</body>
</html>
`;

fs.writeFileSync(OUT, out);
console.log('WROTE', OUT, out.length, 'bytes (source was', src.length, 'bytes)');

// Version 34: 404.html cho GitHub Pages — dùng nguyên bộ app (cùng script). Với URL thật, GitHub Pages
// tự trả đúng mã 404 (đúng chuẩn SEO) cho path không có file tĩnh tương ứng; nhưng app vẫn tự boot bình
// thường trong đó — nếu path đó thật ra là 1 id hợp lệ vừa được thêm (site tĩnh build chưa kịp cập nhật),
// parsePathToState() + loadLiveData() vẫn tự "hồi sinh" đúng nội dung; nếu không, app rơi về trang chủ.
const NOT_FOUND_OUT = path.join(__dirname, '..', '404.html');
fs.writeFileSync(NOT_FOUND_OUT, out);
console.log('WROTE', NOT_FOUND_OUT, out.length, 'bytes');

const NOJEKYLL_OUT = path.join(__dirname, '..', '.nojekyll');
fs.writeFileSync(NOJEKYLL_OUT, '');
console.log('WROTE', NOJEKYLL_OUT, '(rỗng — tắt xử lý Jekyll mặc định của GitHub Pages)');

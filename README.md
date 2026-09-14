# leisure.tips — site tĩnh (GitHub Pages)

File `index.html` là bản site đầy đủ (đồng bộ với Artifact Version 15). File `CNAME` giữ tên miền tuỳ chỉnh cho GitHub Pages.

## Deploy nhanh
1. Tạo repo mới trên GitHub (public), đặt tên tuỳ ý (vd: `leisure-tips`).
2. Trong thư mục này chạy:
   ```
   git remote add origin git@github.com:<username>/<repo>.git
   git branch -M main
   git push -u origin main
   ```
3. Vào Settings → Pages của repo → Source chọn nhánh `main`, thư mục `/ (root)`.
4. Ở khung "Custom domain" điền `leisure.tips` → Save (GitHub tự tạo/commit lại file CNAME).
5. Sau khi DNS đã trỏ đúng (xem bên dưới), tick "Enforce HTTPS".

## DNS cần trỏ ở nơi mua domain leisure.tips
| Loại | Host | Giá trị |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `<username>.github.io` |

DNS lan truyền có thể mất vài phút đến vài giờ.

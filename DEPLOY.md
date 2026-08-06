# 🚀 快速部署指南

## 方式一：GitHub + Cloudflare Pages 自动部署（推荐）

### Step 1: 推送到 GitHub

```bash
# 进入项目目录
cd favicon-steganography

# 添加远程仓库（替换为你的 GitHub 仓库地址）
git remote add origin https://github.com/zhx-111111/favicon-steganography.git

# 推送到 main 分支
git push -u origin main
```

> 如果仓库已有内容需要覆盖：
> ```bash
> git push --force -u origin main
> ```

### Step 2: 连接 Cloudflare Pages

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Pages**
3. 点击 **Create a project**
4. 选择 **Connect to Git**
5. 授权 GitHub → 选择 `favicon-steganography` 仓库
6. 构建设置：
   - **Framework preset**: `None`
   - **Build command**: *(留空)*
   - **Build output directory**: `/`
   - **Root directory**: *(留空)*
7. 点击 **Save and Deploy**

### Step 3: 验证部署

- 等待约 30 秒，Cloudflare 会分配一个 `*.pages.dev` 域名
- 访问该域名，确认页面正常加载
- 测试编码/解码功能

### Step 4: 自定义域名（可选）

1. 在 Cloudflare Pages 项目设置 → **Custom domains**
2. 添加你的域名（需先在 Cloudflare 管理 DNS）
3. 按提示添加 CNAME 记录
4. 等待 SSL 证书自动签发（通常 1-5 分钟）

---

## 方式二：手动上传到 Cloudflare Pages

如果不想用 Git 集成：

1. 将项目打包为 zip：
   ```bash
   cd favicon-steganography
   zip -r ../favicon-steganography.zip . -x ".*"
   ```

2. 在 Cloudflare Pages 选择 **Upload assets**
3. 上传 zip 文件
4. 输出目录设为根目录 `/`

---

## 方式三：本地预览

无需任何构建工具，直接打开即可：

```bash
# Python 3
cd favicon-steganography
python3 -m http.server 8080

# 或使用 Node.js
npx serve favicon-steganography -p 8080
```

访问 `http://localhost:8080`

---

## 🔧 常见问题

| 问题 | 解决方案 |
|------|----------|
| 推送被拒绝 | 用 `git push --force` 或先 `git pull --rebase` |
| Cloudflare 构建失败 | 确认 Build command 留空，Output dir 为 `/` |
| 图片下载不工作 | 检查浏览器是否阻止了弹出窗口 |
| 微信中无法保存 | 点击保存后会打开新页面，长按图片 → 保存到相册 |
| 大图处理超时 | 超过 8MB 的图片建议先压缩到 4000×3000 以内 |

---

## 📝 更新部署

每次修改代码后：

```bash
git add .
git commit -m "描述你的修改"
git push
```

Cloudflare Pages 会**自动检测 push 并重新部署**，通常 30 秒内生效。

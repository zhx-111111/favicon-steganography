# 🔐 隐写加密通讯工具

将文本数据隐藏到图片像素中的 Web 工具，通过密钥签名体系实现私密通讯。

> **✨ 纯前端实现** — 零服务器、零后端、数据永不离开你的设备
> **🚀 一键部署** — 直接推送到 Cloudflare Pages 即可上线

## ✨ 功能特性

- **📝 文本 → 图片（编码）**：将任意文本写入图片像素，可选择上传载体图
- **🔓 图片 → 文本（解码）**：从隐写图片中提取并解密文本
- **🔑 双密钥模式**：
  - 默认密钥 `WelcomeToUse888!`（公开，不加密，向后兼容）
  - 随机密钥（16 字节，AES-256-GCM 端到端加密）
- **🖼️ 载体图支持**：上传任意格式图片作为载体，数据藏入像素，输出原格式
- **📋 一键复制密钥**：随机密钥生成后可一键复制到剪贴板
- **📤 原生分享**：移动端支持 Web Share API
- **📎 拖拽 / 粘贴上传**：支持拖拽文件和剪贴板粘贴
- **📱 全设备适配**：iPhone、iPad、Android、Desktop 完美适配
- **🌙 深色模式**：自动跟随系统深色/浅色模式
- **⌨️ 快捷键**：Ctrl/Cmd + Enter 快速执行

## 🎨 设计风格

- **Apple UI 设计语言**：毛玻璃效果、圆角卡片、柔和阴影
- **动态背景光晕**：渐变光球浮动动画
- **流畅动效**：Spring 弹性动画、FadeIn 过渡
- **系统字体优先**：SF Pro / PingFang SC 最佳渲染

## 🔐 加密架构

| 层 | 技术 |
|----|------|
| 加密算法 | AES-256-GCM（Web Crypto API） |
| 密钥派生 | PBKDF2-HMAC-SHA256（100,000 迭代） |
| 隐写算法 | LSB（最低有效位） |
| 密钥生成 | Web Crypto `getRandomValues` |

### 数据格式

```
FA CE + 密钥标识(1B) + 数据长度(4B大端) + 数据(NB) + 随机填充
```

- `FA CE`：魔数标记
- 密钥标识：`0x00` = 默认密钥，`0x01` = 随机密钥
- 数据：明文（默认密钥）或 AES-GCM 密文（随机密钥）

## 🚀 部署到 Cloudflare Pages

### 方式一：GitHub 自动部署（推荐）

1. **Fork 本仓库** 到你的 GitHub 账号
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Pages**
3. 点击 **Create a project** → 选择 **Connect to Git**
4. 选择 `favicon-steganography` 仓库
5. 构建设置：
   - **Build command**: （留空）
   - **Build output directory**: `/`（根目录）
   - **Root directory**: （留空）
6. 点击 **Save and Deploy**
7. 每次 push 到 `main` 分支自动触发部署

### 方式二：手动上传

1. 在 Cloudflare Pages 选择 **Upload assets**
2. 将本项目所有文件打包上传
3. 输出目录设为根目录

### 自定义域名

在 Cloudflare Pages 项目设置 → **Custom domains** 中添加你的域名。

## 📁 项目结构

```
favicon-steganography/
├── index.html          # 主页面
├── css/
│   └── style.css       # Apple UI 风格样式
├── js/
│   ├── crypto.js       # Web Crypto API 加密模块
│   ├── stego.js        # LSB 隐写引擎
│   └── app.js          # 主应用交互逻辑
├── assets/
│   ├── icon-192.png    # PWA 图标
│   └── favicon.svg     # 网站图标
├── _headers            # Cloudflare 缓存与安全头
├── _redirects         # Cloudflare 重定向规则
└── README.md
```

## 🛡️ 安全说明

- **默认密钥模式不加密**，任何人都能解码，仅用于测试
- **随机密钥模式**使用 AES-256-GCM 认证加密，篡改会被检测
- 密钥通过 PBKDF2 派生（100,000 次迭代），暴力破解极其困难
- **纯前端运行**，所有数据只在浏览器内处理，不会上传到任何服务器
- 可离线使用（PWA 支持）

## 🧪 浏览器兼容性

| 浏览器 | 最低版本 | 说明 |
|--------|----------|------|
| Chrome | 60+ | 完全支持 |
| Firefox | 55+ | 完全支持 |
| Safari | 11+ | 完全支持 |
| Edge | 79+ | 完全支持 |
| iOS Safari | 11+ | 完全支持 |
| Android Chrome | 60+ | 完全支持 |

> ⚠️ 加密功能需要浏览器支持 Web Crypto API。不支持的浏览器会自动禁用随机密钥选项。

## 📝 使用说明

### 编码（隐藏消息）

1. 切换到 **「编码」** 标签页
2. 输入要隐藏的文本内容
3. 选择密钥模式：
   - **默认密钥**：无需额外操作，直接生成
   - **随机密钥**：点击「🎲 生成」按钮，保存好生成的密钥
4. 可选：上传一张载体图片（不传则自动生成正方形 PNG）
5. 点击 **「🚀 生成隐写图片」**
6. 下载生成的图片，通过任意渠道发送给接收方

### 解码（提取消息）

1. 切换到 **「解码」** 标签页
2. 上传收到的隐写图片
3. 如果使用了随机密钥加密，输入密钥
4. 点击 **「🔍 开始解析」**
5. 解密后的文本会显示在结果框中

## 🔧 本地开发

由于使用 ES5 兼容语法和原生浏览器 API，**无需任何构建步骤**：

```bash
# 直接打开 index.html 即可运行
# 或使用任意静态服务器：
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

## 📄 License

MIT License
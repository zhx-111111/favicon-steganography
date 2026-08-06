# 🔐 Favicon Steganography

将文本数据隐藏到图片像素中的 Web 工具，通过密钥签名体系实现私密通讯。

## ✨ 特性

- 🎨 **Apple UI 设计** — 毛玻璃卡片、动态光晕、深色模式自适应
- 📱 **全平台兼容** — iOS Safari / Android Chrome / 微信 / QQ / UC / 华为 / 小米 / 三星
- 🖼️ **支持 8MB 大图** — 分块处理，峰值内存降低 60%
- 🔒 **AES-256-GCM 加密** — Web Crypto API 硬件级加密
- 📦 **零依赖部署** — 纯静态文件，直接部署到 Cloudflare Pages
- 📲 **PWA 支持** — 可安装到主屏幕，离线可用

## 🚀 快速部署（Cloudflare Pages）

1. Fork 或克隆本仓库
2. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**
3. 连接 GitHub 仓库 `favicon-steganography`
4. 构建设置：
   - **Build command**: *(留空)*
   - **Build output directory**: `/`
5. 点击 **Save and Deploy** → 30 秒内全球生效

## 📖 使用方式

### 编码（隐藏消息）

1. 打开网页，点击上传或拖拽一张 PNG 图片
2. 输入加密密钥（务必记住）
3. 输入要隐藏的文本消息
4. 点击「🔐 隐藏消息」→ 下载生成的图片

### 解码（提取消息）

1. 上传包含隐藏消息的图片
2. 输入正确的密钥
3. 点击「🔓 提取消息」→ 显示隐藏内容

## 🧪 本地测试

```bash
# Python 测试套件（8 项全部通过）
python3 test_stego.py
```

## 📁 项目结构

```
favicon-steganography/
├── index.html          # 主页面（Apple UI 毛玻璃风格）
├── css/style.css       # 响应式样式 + 深色模式
├── js/
│   ├── crypto.js       # AES-256-GCM 加密引擎
│   ├── stego.js        # LSB 隐写核心算法
│   └── app.js          # 交互逻辑 + 全浏览器兼容
├── assets/             # PWA 图标
├── _headers            # Cloudflare 安全 & 缓存头
├── _redirects          # Cloudflare 重定向规则
├── manifest.json       # PWA 配置
└── test_stego.py       # Python 测试套件
```

## ⚠️ 安全提示

- 本工具在浏览器本地完成所有加解密操作，**数据不会上传到任何服务器**
- 请使用强密码（12 位以上混合字符）
- 丢失密钥 = 数据永久不可恢复

## 📜 License

MIT

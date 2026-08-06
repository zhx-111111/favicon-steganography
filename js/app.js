/**
 * ============================================
 *  app.js — 主应用交互逻辑
 *  Tab 切换 / 文件上传 / 编码解码 / Toast / 分享
 *  ✅ 全平台兼容：iOS Safari / Android Chrome / Desktop
 * ============================================
 */

(function () {
    'use strict';

    // ===== DOM 快捷查询 =====
    var $ = function (id) { return document.getElementById(id); };

    // ===== 特性检测 =====
    var ua = navigator.userAgent || '';
    var features = {
        webCrypto: !!(window.crypto && window.crypto.subtle),
        clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
        share: !!(navigator.share && navigator.canShare),
        touch: !!(('ontouchstart' in window) || (navigator.maxTouchPoints > 0)),
        webp: false, // 动态检测
        backdropFilter: CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')),
        // 浏览器环境检测
        isWeChat: /MicroMessenger/i.test(ua),
        isMiniProgram: /miniProgram|miniprogram/i.test(ua),
        isQQ: /QQ\//i.test(ua) || /MQQBrowser/i.test(ua),
        isUC: /UCBrowser/i.test(ua),
        isBaiduBrowser: /Baidu/i.test(ua) && /Browser/i.test(ua),
        isMiuiBrowser: /MiuiBrowser/i.test(ua),
        isHuaweiBrowser: /HuaweiBrowser/i.test(ua) || /HONOR/i.test(ua),
        isOppoBrowser: /OppoBrowser/i.test(ua),
        isVivoBrowser: /VivoBrowser/i.test(ua),
        isSamsung: /SamsungBrowser/i.test(ua),
        isAndroid: /Android/i.test(ua),
        isIOS: /iPhone|iPad|iPod/i.test(ua),
        // 微信中 a 标签 download 属性可能失效
        downloadAttrWorks: !(/MicroMessenger/i.test(ua)) || (function(){
            // 微信 7.0+ 支持 download
            var match = ua.match(/MicroMessenger\/(\d+)\.(\d+)/i);
            if (match) return parseInt(match[1]) >= 7;
            return true;
        })()
    };

    // 浏览器名称（用于日志/提示）
    var browserName = 'Unknown';
    if (features.isWeChat) browserName = '微信';
    else if (features.isQQ) browserName = 'QQ浏览器';
    else if (features.isUC) browserName = 'UC浏览器';
    else if (features.isMiuiBrowser) browserName = '小米浏览器';
    else if (features.isHuaweiBrowser) browserName = '华为浏览器';
    else if (features.isOppoBrowser) browserName = 'OPPO浏览器';
    else if (features.isVivoBrowser) browserName = 'Vivo浏览器';
    else if (features.isSamsung) browserName = '三星浏览器';
    else if (features.isIOS) browserName = 'Safari';
    else if (features.isAndroid) browserName = 'Chrome';
    else browserName = '桌面浏览器';

    console.info('[App] 运行环境: ' + browserName + ' | UA: ' + ua.substring(0, 80));

    // 检测 WebP 支持
    (function detectWebP() {
        var img = new Image();
        img.onload = function () { features.webp = true; };
        img.onerror = function () { features.webp = false; };
        img.src = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
    })();

    // ===== 状态 =====
    var carrierImageFile = null;
    var decodeImageFile = null;
    var generatedBlob = null;
    var generatedObjectURL = null;

    // ===== DOM 引用 =====
    var tabBtns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.panel');

    // 编码
    var encodeText = $('encode-text');
    var charCount = $('char-count');
    var charMax = $('char-max');
    var capacityHint = $('capacity-hint');
    var keyModeRadios = document.querySelectorAll('input[name="key-mode"]');
    var randomKeyArea = $('random-key-area');
    var randomKeyValue = $('random-key-value');
    var btnGenerateKey = $('btn-generate-key');
    var btnCopyKey = $('btn-copy-key');
    var carrierUpload = $('carrier-upload');
    var carrierFile = $('carrier-file');
    var carrierPreview = $('carrier-preview');
    var carrierThumb = $('carrier-thumb');
    var carrierPlaceholder = $('carrier-placeholder');
    var btnRemoveCarrier = $('btn-remove-carrier');
    var capacityInfo = $('capacity-info');
    var capacityValue = $('capacity-value');
    var btnEncode = $('btn-encode');
    var encodeResult = $('encode-result');
    var resultPreview = $('result-preview');
    var resultHint = $('result-hint');
    var resultInfo = $('result-info');
    var btnDownload = $('btn-download');
    var btnShare = $('btn-share');
    var encodeError = $('encode-error');

    // 解码
    var decodeUpload = $('decode-upload');
    var decodeFile = $('decode-file');
    var decodePreview = $('decode-preview');
    var decodeThumb = $('decode-thumb');
    var decodePlaceholder = $('decode-placeholder');
    var btnRemoveDecode = $('btn-remove-decode');
    var decodeKey = $('decode-key');
    var btnDecode = $('btn-decode');
    var decodeResult = $('decode-result');
    var decodedText = $('decoded-text');
    var btnCopyText = $('btn-copy-text');
    var decodeError = $('decode-error');

    // Loading
    var loadingOverlay = $('loading-overlay');
    var loadingText = $('loading-text');

    // ===== Toast 提示系统 =====
    var toastContainer = $('toast-container');
    var activeToasts = [];

    function showToast(msg, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.setAttribute('role', 'alert');

        var icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = '<span aria-hidden="true">' + icon + '</span><span></span>';
        toast.querySelector('span:last-child').textContent = msg;

        toastContainer.appendChild(toast);
        activeToasts.push(toast);

        // 自动移除
        setTimeout(function () {
            toast.classList.add('removing');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                activeToasts = activeToasts.filter(function (t) { return t !== toast; });
            }, 300);
        }, 2800);
    }

    // ===== 复制到剪贴板（多级降级方案） =====
    function copyToClipboard(text) {
        return new Promise(function (resolve, reject) {
            // 方法1: 现代 Clipboard API
            if (features.clipboard) {
                navigator.clipboard.writeText(text).then(function () {
                    resolve();
                }).catch(function () {
                    // 降级到方法2
                    legacyCopy(text) ? resolve() : reject(new Error('复制失败'));
                });
                return;
            }

            // 方法2: document.execCommand (安卓旧版 WebView)
            if (legacyCopy(text)) {
                resolve();
            } else {
                // 方法3: 安卓 WebView 特殊处理
                try {
                    if (window.Android && window.Android.copyToClipboard) {
                        window.Android.copyToClipboard(text);
                        resolve();
                    } else {
                        reject(new Error('复制失败'));
                    }
                } catch (e) {
                    reject(new Error('复制失败'));
                }
            }
        });
    }

    function legacyCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            ta.style.opacity = '0';
            ta.setAttribute('readonly', '');
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length); // 兼容 iOS
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    // ===== Loading 遮罩 =====
    function showLoading(text) {
        loadingText.textContent = text || '处理中...';
        loadingOverlay.hidden = false;
        // 防止背景滚动（安卓需要额外处理）
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
    }

    function hideLoading() {
        loadingOverlay.hidden = true;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
    }

    // ===== Tab 切换 =====
    tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            tabBtns.forEach(function (b) {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            panels.forEach(function (p) {
                p.classList.remove('active');
                p.hidden = true;
            });

            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            var panel = $('panel-' + btn.dataset.tab);
            if (panel) {
                panel.classList.add('active');
                panel.hidden = false;
            }
        });
    });

    // ===== 字符计数 & 容量预估 =====
    encodeText.addEventListener('input', function () {
        var len = encodeText.value.length;
        charCount.textContent = len;

        var estimatedBytes = new TextEncoder().encode(encodeText.value).length;
        var mode = getKeyMode();

        if (mode === 'random') {
            var encryptedBytes = Math.ceil((estimatedBytes + 44) * 4 / 3);
            capacityHint.textContent = '加密后约 ' + encryptedBytes + ' 字节';
        } else {
            capacityHint.textContent = '约 ' + estimatedBytes + ' 字节';
        }
    });

    // ===== 密钥模式切换 =====
    keyModeRadios.forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (getKeyMode() === 'random') {
                randomKeyArea.hidden = false;
                encodeText.dispatchEvent(new Event('input'));
            } else {
                randomKeyArea.hidden = true;
                encodeText.dispatchEvent(new Event('input'));
            }
        });
    });

    function getKeyMode() {
        var checked = document.querySelector('input[name="key-mode"]:checked');
        return checked ? checked.value : 'default';
    }

    // ===== 生成随机密钥 =====
    btnGenerateKey.addEventListener('click', async function () {
        try {
            var key = StegoCrypto.generateRandomKey(16);
            randomKeyValue.value = key;
            showToast('🎲 随机密钥已生成', 'success');
            encodeText.dispatchEvent(new Event('input'));
        } catch (e) {
            showToast('密钥生成失败', 'error');
        }
    });

    // ===== 复制密钥 =====
    btnCopyKey.addEventListener('click', function () {
        if (!randomKeyValue.value) {
            showToast('请先生成密钥', 'error');
            return;
        }
        copyToClipboard(randomKeyValue.value).then(function () {
            showToast('✅ 密钥已复制', 'success');
        }).catch(function () {
            showToast('复制失败', 'error');
        });
    });

    // ===== 文件上传通用处理 =====
    function handleFileSelect(file, type) {
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            showToast('请选择有效的图片文件', 'error');
            return;
        }

        // 文件大小检查 (最大 50MB，支持 8MB+ 手机照片)
        if (file.size > 50 * 1024 * 1024) {
            showToast('图片过大，请选择 50MB 以下的文件', 'error');
            return;
        }
        // 大图提示
        if (file.size > 5 * 1024 * 1024) {
            showToast('📸 大图 ' + (file.size / 1048576).toFixed(1) + 'MB，处理可能需要 10-30 秒', 'info');
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            if (type === 'carrier') {
                carrierImageFile = file;
                carrierThumb.src = e.target.result;
                carrierPreview.hidden = false;
                carrierPlaceholder.style.display = 'none';
                updateCapacityInfo(file);
            } else {
                decodeImageFile = file;
                decodeThumb.src = e.target.result;
                decodePreview.hidden = false;
                decodePlaceholder.style.display = 'none';
            }
        };
        reader.onerror = function () {
            showToast('文件读取失败', 'error');
        };
        reader.readAsDataURL(file);
    }

    // ===== 载体图容量估算 =====
    function updateCapacityInfo(file) {
        var img = new Image();
        img.onload = function () {
            var w = img.naturalWidth;
            var h = img.naturalHeight;
            var totalBits = w * h * 3;
            var totalBytes = Math.floor(totalBits / 8);
            var usableBytes = totalBytes - 7;
            var mb = (usableBytes / 1048576).toFixed(2);
            var kb = Math.floor(usableBytes / 1024);
            var charCount = Math.floor(usableBytes / 3); // UTF-8 中文字符约3字节
            var displaySize = usableBytes > 1048576
                ? '约 ' + mb + ' MB'
                : '约 ' + kb + ' KB';
            capacityValue.innerHTML = w + '×' + h + ' → ' + displaySize +
                ' <small style="color:var(--text-tertiary)">(可藏 ' +
                charCount.toLocaleString() + ' 中文字)</small>';
            capacityInfo.hidden = false;
            URL.revokeObjectURL(img.src);
        };
        img.onerror = function () {
            showToast('无法读取图片尺寸', 'error');
        };
        img.src = URL.createObjectURL(file);
    }

    // ===== 点击上传（移动端需要额外处理） =====
    carrierUpload.addEventListener('click', function (e) {
        // 防止触摸事件重复触发
        if (e.detail === 0) return; // 触屏点击
        carrierFile.click();
    });
    decodeUpload.addEventListener('click', function (e) {
        if (e.detail === 0) return;
        decodeFile.click();
    });

    carrierFile.addEventListener('change', function (e) {
        var f = e.target.files[0]; if (f) handleFileSelect(f, 'carrier');
    });
    decodeFile.addEventListener('change', function (e) {
        var f = e.target.files[0]; if (f) handleFileSelect(f, 'decode');
    });

    // ===== 移除文件 =====
    btnRemoveCarrier.addEventListener('click', function (e) {
        e.stopPropagation();
        carrierImageFile = null;
        carrierFile.value = '';
        carrierPreview.hidden = true;
        carrierPlaceholder.style.display = '';
        capacityInfo.hidden = true;
    });

    btnRemoveDecode.addEventListener('click', function (e) {
        e.stopPropagation();
        decodeImageFile = null;
        decodeFile.value = '';
        decodePreview.hidden = true;
        decodePlaceholder.style.display = '';
    });

    // ===== 拖拽上传（桌面端） =====
    function setupDragDrop(zone, fileInput, type) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (evt) {
            zone.addEventListener(evt, function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        zone.addEventListener('dragover', function () {
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', function (e) {
            if (e.target === zone) zone.classList.remove('dragover');
        });
        zone.addEventListener('drop', function (e) {
            zone.classList.remove('dragover');
            var files = e.dataTransfer.files;
            if (files.length > 0) {
                // 安卓 Chrome 拖拽兼容性
                try {
                    fileInput.files = files;
                } catch (err) {
                    // 某些安卓浏览器不支持直接赋值 files
                }
                handleFileSelect(files[0], type);
            }
        });

        // 键盘可访问
        zone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
    }

    if (!features.touch) {
        setupDragDrop(carrierUpload, carrierFile, 'carrier');
        setupDragDrop(decodeUpload, decodeFile, 'decode');
    }

    // ===== 粘贴上传 =====
    document.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.startsWith('image/')) {
                var file = items[i].getAsFile();
                var activePanel = document.querySelector('.panel.active').id;
                if (activePanel === 'panel-encode') {
                    try { carrierFile.files = e.clipboardData.files; } catch (err) {}
                    handleFileSelect(file, 'carrier');
                    showToast('📋 已从剪贴板粘贴图片', 'success');
                } else {
                    try { decodeFile.files = e.clipboardData.files; } catch (err) {}
                    handleFileSelect(file, 'decode');
                    showToast('📋 已从剪贴板粘贴图片', 'success');
                }
                break;
            }
        }
    });

    // ===== 编码提交 =====
    btnEncode.addEventListener('click', async function () {
        var text = encodeText.value.trim();
        if (!text) {
            showToast('请输入要隐藏的文本', 'error');
            encodeText.focus();
            return;
        }

        var mode = getKeyMode();
        var key = randomKeyValue.value.trim();

        if (mode === 'random' && !key) {
            showToast('请先生成随机密钥', 'error');
            return;
        }

        // 大图警告
        if (carrierImageFile && carrierImageFile.size > 5 * 1024 * 1024) {
            showToast('📸 大图处理中，请耐心等待...', 'info');
        }

        // 清理之前的结果
        encodeResult.hidden = true;
        encodeError.hidden = true;
        if (generatedObjectURL) {
            URL.revokeObjectURL(generatedObjectURL);
            generatedObjectURL = null;
        }

        // UI 状态
        btnEncode.disabled = true;
        btnEncode.querySelector('.btn-text').textContent = '⏳ 生成中...';
        showLoading(carrierImageFile && carrierImageFile.size > 3 * 1024 * 1024
            ? '正在处理大图，可能需要 10-30 秒...'
            : '正在编码并生成图片...');

        try {
            var result = await StegoEngine.encode(text, mode, key, carrierImageFile);

            generatedBlob = result.blob;
            generatedObjectURL = URL.createObjectURL(generatedBlob);

            // 预览
            resultPreview.src = generatedObjectURL;
            encodeResult.hidden = false;

            // ===== 下载链接（多策略兼容） =====
            var ext = 'png';
            var fmt = result.info.outputFormat || 'image/png';
            if (fmt.includes('jpeg')) ext = 'jpg';
            else if (fmt.includes('webp')) ext = 'webp';
            else if (!features.webp && fmt.includes('webp')) ext = 'png';

            var filename = 'stego_' + Date.now() + '.' + ext;

            // 策略1: a 标签 download（微信7+/Chrome/Safari/Firefox）
            btnDownload.href = generatedObjectURL;
            btnDownload.download = filename;

            // 微信中 download 属性可能不生效，需要特殊处理
            if (features.isWeChat && !features.downloadAttrWorks) {
                btnDownload.removeAttribute('download');
                btnDownload.target = '_blank';
            } else {
                btnDownload.setAttribute('download', filename);
                btnDownload.removeAttribute('target');
            }

            // 微信浏览器额外提示
            if (features.isWeChat) {
                resultHint.textContent = '💡 微信中：点击"保存图片"→ 右上角"在浏览器打开"可保存到相册';
                // 显示微信保存提示卡片
                var wechatTip = document.getElementById('wechat-save-tip');
                if (wechatTip) wechatTip.hidden = false;
                // 给 body 加 class 启用微信优化
                document.body.classList.add('wechat-env');
            } else {
                var wechatTip2 = document.getElementById('wechat-save-tip');
                if (wechatTip2) wechatTip2.hidden = true;
                if (result.info.mode === 'generated') {
                    resultHint.textContent = '↑ 上方为放大预览，实际图片可能很小（几个像素），可正常下载使用';
                } else {
                    resultHint.textContent = '↑ 隐写数据已嵌入原图，视觉上无变化，点击保存即可';
                }
            }

            // Share API（Android Chrome/Edge/iOS Safari 15+）
            if (features.share && !features.isWeChat) {
                btnShare.hidden = false;
            } else {
                btnShare.hidden = true;
            }

            // 信息展示
            var modeText = mode === 'default'
                ? '🔓 默认密钥（明文隐写，不加密）'
                : '🔐 随机密钥（AES-256-GCM 加密）';

            var infoHTML = '<strong>密钥模式：</strong>' + modeText + '<br>';
            infoHTML += '<strong>输出尺寸：</strong>' + result.info.dimensions + '<br>';
            infoHTML += '<strong>数据大小：</strong>' + result.info.payloadSize + ' 字节<br>';
            infoHTML += '<strong>输出格式：</strong>' + (result.info.outputFormat || 'image/png');
            infoHTML += '<br><strong>浏览器：</strong>' + browserName;

            if (mode === 'random' && result.usedKey) {
                infoHTML += '<br><strong>密钥：</strong><code>' + result.usedKey + '</code> ← 请妥善保存';
            }

            resultInfo.innerHTML = infoHTML;

            showToast('✅ 图片生成成功', 'success');

        } catch (e) {
            encodeError.textContent = '❌ ' + (e.message || '编码失败');
            encodeError.hidden = false;
            showToast('编码失败: ' + (e.message || ''), 'error');
        } finally {
            btnEncode.disabled = false;
            btnEncode.querySelector('.btn-text').textContent = '生成隐写图片';
            hideLoading();
        }
    });

    // ===== 保存图片（全浏览器兼容） =====
    // 支持：微信/QQ/UC/华为/小米/三星/Vivo/Oppo/Safari/Chrome/Firefox/Edge
    btnDownload.addEventListener('click', async function (e) {
        if (!generatedBlob) {
            showToast('没有可保存的图片', 'error');
            return;
        }

        var ext = 'png';
        var fmt = (generatedBlob.type || 'image/png');
        if (fmt.includes('jpeg')) ext = 'jpg';
        else if (fmt.includes('webp')) ext = 'webp';
        var filename = 'stego_' + Date.now() + '.' + ext;

        // ===== 策略1: 微信浏览器 =====
        if (features.isWeChat) {
            e.preventDefault();
            try {
                // 微信中 download 属性大概率失效
                // 方案A: 尝试直接打开新页面显示图片（微信可长按保存）
                var dataURL = await blobToDataURL(generatedBlob);
                openImageInNewPage(dataURL, filename);
                showToast('📸 图片已打开，长按可保存到相册', 'success');
            } catch (err) {
                // 方案B: 降级为传统下载
                forceDownload(generatedBlob, filename);
            }
            return;
        }

        // ===== 策略2: QQ 内置浏览器 =====
        if (features.isQQ) {
            e.preventDefault();
            try {
                var dataURL2 = await blobToDataURL(generatedBlob);
                openImageInNewPage(dataURL2, filename);
                showToast('📸 图片已打开，长按可保存', 'success');
            } catch (err) {
                forceDownload(generatedBlob, filename);
            }
            return;
        }

        // ===== 策略3: UC/百度等旧浏览器 =====
        if (features.isUC || features.isBaiduBrowser) {
            e.preventDefault();
            forceDownload(generatedBlob, filename);
            return;
        }

        // ===== 策略4: 现代浏览器（download 属性 + Share API） =====
        // a 标签的 download 属性会自动处理
        // 如果 download 失败，捕获并处理
        setTimeout(function () {
            // 检查下载是否触发（简单探测）
            if (features.share && generatedBlob) {
                // 可选：提供分享选项
            }
        }, 100);
    });

    // ===== Share 按钮（原生分享） =====
    btnShare.addEventListener('click', async function () {
        if (!generatedBlob) return;

        var ext = 'png';
        var fname = 'stego_' + Date.now() + '.' + ext;

        try {
            // 安卓 Chrome / iOS Safari 原生分享
            if (features.share) {
                var file = new File([generatedBlob], fname, { type: 'image/png' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: '隐写图片',
                        text: '这是一张包含隐藏消息的图片',
                        files: [file]
                    });
                    return;
                }
            }
            // 降级：触发下载
            btnDownload.click();
        } catch (e) {
            if (e.name !== 'AbortError') {
                btnDownload.click();
            }
        }
    });

    // ===== 工具函数：Blob → DataURL =====
    function blobToDataURL(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(blob);
        });
    }

    // ===== 工具函数：强制下载（兼容所有浏览器） =====
    function forceDownload(blob, filename) {
        try {
            // 方法1: a 标签 download
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            showToast('✅ 下载已开始', 'success');
        } catch (e) {
            // 方法2: location.href 兜底
            try {
                blobToDataURL(blob).then(function (dataURL) {
                    window.location.href = dataURL;
                });
            } catch (e2) {
                showToast('保存失败，请尝试长按图片保存', 'error');
            }
        }
    }

    // ===== 工具函数：新页面打开图片（微信/QQ 长按保存） =====
    function openImageInNewPage(dataURL, filename) {
        // 使用 Blob URL 在新窗口打开
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">' +
            '<title>长按保存图片</title>' +
            '<style>body{margin:0;display:flex;align-items:center;justify-content:center;' +
            'min-height:100vh;background:#000;flex-direction:column;font-family:sans-serif}' +
            'img{max-width:100%;max-height:90vh;object-fit:contain;box-shadow:0 4px 20px rgba(0,0,0,.5)}' +
            '.tip{color:#fff;font-size:15px;margin-top:16px;padding:0 20px;text-align:center;opacity:.8}' +
            '</style></head><body>' +
            '<img src="' + dataURL + '" alt="隐写图片">' +
            '<p class="tip">📸 长按上方图片 → 选择「保存到相册」</p>' +
            '</body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    // ===== 解码提交 =====
    btnDecode.addEventListener('click', async function () {
        if (!decodeImageFile) {
            showToast('请先上传隐写图片', 'error');
            return;
        }

        var key = decodeKey.value.trim();

        decodeResult.hidden = true;
        decodeError.hidden = true;

        btnDecode.disabled = true;
        btnDecode.querySelector('.btn-text').textContent = '⏳ 解析中...';
        showLoading('正在解码图片...');

        try {
            var result = await StegoEngine.decode(decodeImageFile, key || null);

            decodedText.value = result.text;
            decodeResult.hidden = false;

            showToast('✅ 解析成功', 'success');

        } catch (e) {
            var msg = e.message || '解码失败';
            if (e.errorType === 'wrong_key') {
                msg = '🔑 ' + msg + '，请检查密钥是否正确';
            } else if (e.errorType === 'magic_mismatch') {
                msg = '⚠️ ' + msg;
            } else if (e.errorType === 'corrupted') {
                msg = '💥 ' + msg;
            }
            decodeError.textContent = '❌ ' + msg;
            decodeError.hidden = false;
            showToast('解码失败', 'error');
        } finally {
            btnDecode.disabled = false;
            btnDecode.querySelector('.btn-text').textContent = '开始解析';
            hideLoading();
        }
    });

    // ===== 复制解码文本 =====
    btnCopyText.addEventListener('click', function () {
        if (!decodedText.value) {
            showToast('没有可复制的内容', 'error');
            return;
        }
        copyToClipboard(decodedText.value).then(function () {
            showToast('📋 文本已复制', 'success');
        }).catch(function () {
            showToast('复制失败', 'error');
        });
    });

    // ===== 键盘快捷键 =====
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            var activePanel = document.querySelector('.panel.active').id;
            if (activePanel === 'panel-encode') {
                btnEncode.click();
            } else {
                btnDecode.click();
            }
        }
    });

    // ===== 页面可见性变化（安卓后台回收处理） =====
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            // 页面进入后台，释放资源
            if (generatedObjectURL && !encodeResult.hidden) {
                // 保留 URL，用户可能回来下载
            }
        }
    });

    // ===== 页面卸载时清理 =====
    window.addEventListener('beforeunload', function () {
        if (generatedObjectURL) {
            URL.revokeObjectURL(generatedObjectURL);
        }
    });

    // ===== 安卓返回键处理 =====
    window.addEventListener('popstate', function (e) {
        // 如果 loading 还在显示，先关闭
        if (!loadingOverlay.hidden) {
            hideLoading();
        }
    });

    // ===== 防止安卓双击缩放 =====
    var lastTouchTime = 0;
    document.addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastTouchTime < 300) {
            e.preventDefault();
        }
        lastTouchTime = now;
    }, { passive: false });

    // ===== 初始化检测 =====
    function initChecks() {
        // Web Crypto API 检测
        if (!features.webCrypto) {
            showToast('当前浏览器不支持 Web Crypto API，加密功能不可用', 'error');
            var randomRadio = document.getElementById('key-random');
            if (randomRadio) {
                randomRadio.disabled = true;
                randomRadio.parentElement.style.opacity = '0.5';
            }
        }

        // 微信环境提示
        if (features.isWeChat) {
            console.info('[App] 微信浏览器环境 - 已启用兼容模式');
            // 延迟提示，不打扰首屏
            setTimeout(function () {
                showToast('💬 微信环境已适配 · 支持保存图片到相册', 'info');
            }, 1500);
        }

        // UC 浏览器提示
        if (features.isUC) {
            showToast('⚠️ 检测到 UC 浏览器，已启用兼容模式', 'info');
        }

        // 安卓 Chrome 版本检测
        var ua = navigator.userAgent.toLowerCase();
        var isAndroid = ua.indexOf('android') !== -1;
        var isChrome = ua.indexOf('chrome') !== -1;

        if (isAndroid && isChrome) {
            var androidVer = parseInt(ua.match(/android\s([0-9\.]+)/i)?.[1] || '0');
            if (androidVer > 0 && androidVer < 7) {
                showToast('建议使用 Chrome 60+ 获得最佳体验', 'info');
            }
        }

        // 设备内存提示
        if (navigator.deviceMemory && navigator.deviceMemory < 2) {
            console.info('[App] 低内存设备 (<2GB)，大图处理可能较慢');
        }

        // 不支持 backdrop-filter 的提示
        if (!features.backdropFilter) {
            console.info('[Info] backdrop-filter 不支持，已自动降级为纯色背景');
        }

        // 大图能力提示
        if (features.isWeChat) {
            console.info('[App] 微信中支持最大约 8MB 载体图（约 1200 万像素）');
        }
    }

    // 延迟执行初始化检测（不阻塞渲染）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChecks);
    } else {
        initChecks();
    }

})();

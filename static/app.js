/* ===== 隐写加密通讯工具 - 前端交互逻辑 ===== */

(function () {
    'use strict';

    // ===== DOM 引用 =====
    const $ = (id) => document.getElementById(id);

    // Tab 切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.panel');

    // 编码相关
    const encodeText = $('encode-text');
    const charCount = $('char-count');
    const keyModeRadios = document.querySelectorAll('input[name="key-mode"]');
    const randomKeyDisplay = $('random-key-display');
    const randomKeyValue = $('random-key-value');
    const btnGenerateKey = $('btn-generate-key');
    const btnCopyKey = $('btn-copy-key');
    const carrierUpload = $('carrier-upload');
    const carrierFile = $('carrier-file');
    const carrierPreview = $('carrier-preview');
    const carrierThumb = $('carrier-thumb');
    const btnRemoveCarrier = $('btn-remove-carrier');
    const btnEncode = $('btn-encode');
    const encodeResult = $('encode-result');
    const resultPreview = $('result-preview');
    const resultInfo = $('result-info');
    const btnDownload = $('btn-download');
    const encodeError = $('encode-error');

    // 解码相关
    const decodeUpload = $('decode-upload');
    const decodeFile = $('decode-file');
    const decodePreview = $('decode-preview');
    const decodeThumb = $('decode-thumb');
    const btnRemoveDecode = $('btn-remove-decode');
    const decodeKey = $('decode-key');
    const btnDecode = $('btn-decode');
    const decodeResult = $('decode-result');
    const decodedText = $('decoded-text');
    const btnCopyText = $('btn-copy-text');
    const decodeError = $('decode-error');

    // ===== 状态 =====
    let carrierImageData = null;   // 编码时的载体图 File
    let decodeImageData = null;    // 解码时的图片 File
    let generatedImageBlob = null; // 编码生成的图片 Blob

    // ===== Toast 提示 =====
    function showToast(msg, type = '') {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = 'toast';
        }, 2500);
    }

    // ===== 复制到剪贴板 =====
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('✅ 已复制到剪贴板', 'success');
        } catch (e) {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('✅ 已复制到剪贴板', 'success');
        }
    }

    // ===== Tab 切换 =====
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            $(`panel-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // ===== 字符计数 =====
    encodeText.addEventListener('input', () => {
        charCount.textContent = encodeText.value.length;
    });

    // ===== 密钥模式切换 =====
    keyModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = getKeyMode();
            if (mode === 'random') {
                randomKeyDisplay.style.display = 'block';
            } else {
                randomKeyDisplay.style.display = 'none';
            }
        });
    });

    function getKeyMode() {
        const checked = document.querySelector('input[name="key-mode"]:checked');
        return checked ? checked.value : 'default';
    }

    // ===== 生成随机密钥 =====
    btnGenerateKey.addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/generate-key');
            const data = await resp.json();
            if (data.success) {
                randomKeyValue.value = data.key;
                showToast('🎲 随机密钥已生成', 'success');
            }
        } catch (e) {
            showToast('生成密钥失败', 'error');
        }
    });

    // ===== 复制密钥 =====
    btnCopyKey.addEventListener('click', () => {
        if (randomKeyValue.value) {
            copyToClipboard(randomKeyValue.value);
        } else {
            showToast('请先生成密钥', 'error');
        }
    });

    // ===== 载体图上传（编码） =====
    carrierUpload.addEventListener('click', () => carrierFile.click());
    carrierFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        carrierImageData = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            carrierThumb.src = ev.target.result;
            carrierPreview.style.display = 'inline-block';
            carrierUpload.querySelector('.upload-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
    btnRemoveCarrier.addEventListener('click', (e) => {
        e.stopPropagation();
        carrierImageData = null;
        carrierFile.value = '';
        carrierPreview.style.display = 'none';
        carrierUpload.querySelector('.upload-placeholder').style.display = 'flex';
    });

    // ===== 解码图上传 =====
    decodeUpload.addEventListener('click', () => decodeFile.click());
    decodeFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        decodeImageData = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            decodeThumb.src = ev.target.result;
            decodePreview.style.display = 'inline-block';
            decodeUpload.querySelector('.upload-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
    btnRemoveDecode.addEventListener('click', (e) => {
        e.stopPropagation();
        decodeImageData = null;
        decodeFile.value = '';
        decodePreview.style.display = 'none';
        decodeUpload.querySelector('.upload-placeholder').style.display = 'flex';
    });

    // ===== 拖拽上传 =====
    function setupDragDrop(zone, fileInput, onFile) {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                fileInput.files = e.dataTransfer.files;
                onFile(file);
            }
        });
    }

    setupDragDrop(carrierUpload, carrierFile, (file) => {
        carrierImageData = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            carrierThumb.src = ev.target.result;
            carrierPreview.style.display = 'inline-block';
            carrierUpload.querySelector('.upload-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });

    setupDragDrop(decodeUpload, decodeFile, (file) => {
        decodeImageData = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            decodeThumb.src = ev.target.result;
            decodePreview.style.display = 'inline-block';
            decodeUpload.querySelector('.upload-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });

    // ===== 编码提交 =====
    btnEncode.addEventListener('click', async () => {
        const text = encodeText.value.trim();
        if (!text) {
            showToast('请输入要隐藏的文本', 'error');
            return;
        }

        const mode = getKeyMode();
        const key = randomKeyValue.value.trim();

        if (mode === 'random' && !key) {
            showToast('请先生成随机密钥', 'error');
            return;
        }

        // 构建 FormData
        const fd = new FormData();
        fd.append('text', text);
        fd.append('key_mode', mode);
        if (key) fd.append('key', key);
        if (carrierImageData) fd.append('carrier', carrierImageData);

        // UI 状态
        btnEncode.disabled = true;
        btnEncode.textContent = '⏳ 生成中...';
        encodeResult.style.display = 'none';
        encodeError.style.display = 'none';

        try {
            const resp = await fetch('/api/encode', {
                method: 'POST',
                body: fd,
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || '编码失败');
            }

            // 获取图片
            const blob = await resp.blob();
            generatedImageBlob = blob;
            const objectURL = URL.createObjectURL(blob);

            // 显示预览
            resultPreview.src = objectURL;
            encodeResult.style.display = 'block';

            // 下载链接
            btnDownload.href = objectURL;
            const ext = blob.type.includes('jpeg') ? 'jpg' :
                        blob.type.includes('png') ? 'png' :
                        blob.type.includes('webp') ? 'webp' : 'png';
            btnDownload.download = `stego_${Date.now()}.${ext}`;

            // 信息展示
            const modeText = mode === 'default' ? '默认密钥（公开/不加密）' : '随机密钥（AES-256-GCM 加密）';
            let infoHTML = `<strong>密钥模式：</strong>${modeText}<br>`;
            if (mode === 'random') {
                infoHTML += `<strong>密钥：</strong><code>${key}</code> ← 请妥善保存<br>`;
            }
            infoHTML += `<strong>输出格式：</strong>${blob.type}`;
            resultInfo.innerHTML = infoHTML;

            showToast('✅ 图片生成成功', 'success');

        } catch (e) {
            encodeError.textContent = `❌ ${e.message}`;
            encodeError.style.display = 'block';
        } finally {
            btnEncode.disabled = false;
            btnEncode.textContent = '🚀 生成隐写图片';
        }
    });

    // ===== 解码提交 =====
    btnDecode.addEventListener('click', async () => {
        if (!decodeImageData) {
            showToast('请先上传隐写图片', 'error');
            return;
        }

        const key = decodeKey.value.trim();
        const fd = new FormData();
        fd.append('image', decodeImageData);
        if (key) fd.append('key', key);

        // UI 状态
        btnDecode.disabled = true;
        btnDecode.textContent = '⏳ 解析中...';
        decodeResult.style.display = 'none';
        decodeError.style.display = 'none';

        try {
            const resp = await fetch('/api/decode', {
                method: 'POST',
                body: fd,
            });

            const data = await resp.json();

            if (!resp.ok || !data.success) {
                throw new Error(data.error || '解码失败');
            }

            // 成功
            decodedText.value = data.text;
            decodeResult.style.display = 'block';
            showToast('✅ 解析成功', 'success');

        } catch (e) {
            decodeError.textContent = `❌ ${e.message}`;
            decodeError.style.display = 'block';
        } finally {
            btnDecode.disabled = false;
            btnDecode.textContent = '🔍 开始解析';
        }
    });

    // ===== 复制解码文本 =====
    btnCopyText.addEventListener('click', () => {
        if (decodedText.value) {
            copyToClipboard(decodedText.value);
        }
    });

})();

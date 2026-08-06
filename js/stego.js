/**
 * ============================================
 *  stego.js — 纯前端隐写引擎
 *  LSB（最低有效位）像素隐写
 *  ✅ 全平台兼容：iOS / Android / Desktop
 *
 *  数据格式：FA CE + 密钥标识(1B) + 数据长度(4B大端) + 数据(NB) + 随机填充
 * ============================================
 */

(function (global) {
    'use strict';

    // ===== 常量 =====
    var MAGIC_HEADER = new Uint8Array([0xFA, 0xCE]);
    var KEY_ID_DEFAULT = 0x00;
    var KEY_ID_RANDOM  = 0x01;
    var LENGTH_HEADER_SIZE = 4;
    var HEADER_SIZE = MAGIC_HEADER.length + 1 + LENGTH_HEADER_SIZE; // 7 字节

    // ===== 特性检测 =====
    var supportsWebP = (function () {
        try {
            var c = document.createElement('canvas');
            c.width = c.height = 1;
            return c.toDataURL('image/webp').indexOf('image/webp') === 5;
        } catch (e) { return false; }
    })();

    var supportsJPEG = (function () {
        try {
            var c = document.createElement('canvas');
            c.width = c.height = 1;
            return c.toDataURL('image/jpeg').indexOf('image/jpeg') === 5;
        } catch (e) { return false; }
    })();

    /**
     * 安全获取 Canvas 2D 上下文
     * 安卓旧版 WebView 不支持 willReadFrequently
     */
    function safeGetContext(canvas) {
        var ctx = null;
        // 尝试 willReadFrequently（Chrome 94+）
        try {
            ctx = canvas.getContext('2d', { willReadFrequently: true });
        } catch (e) {
            try {
                ctx = canvas.getContext('2d');
            } catch (e2) {
                throw new Error('当前浏览器不支持 Canvas 2D');
            }
        }
        if (!ctx) {
            ctx = canvas.getContext('2d');
        }
        return ctx;
    }

    /**
     * 从 ImageBitmap/HTMLImageElement 获取像素数据
     * 支持 8MB+ 大图（最大 8192×8192 ≈ 67M 像素）
     * 自动适配设备内存
     */
    function imageToPixels(image) {
        var w = image.naturalWidth || image.width;
        var h = image.naturalHeight || image.height;

        // 根据设备内存动态调整最大尺寸
        // 8MB JPEG 典型尺寸 4032×3024 ≈ 1200万像素，完全在范围内
        var MAX_DIM = 8192;

        // 检测设备内存（Android Chrome 支持 navigator.deviceMemory）
        if (navigator.deviceMemory && navigator.deviceMemory < 4) {
            MAX_DIM = 4096; // 低内存设备限制
        }

        if (w > MAX_DIM || h > MAX_DIM) {
            var ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
            console.warn('[Stego] 图片过大，已缩放至 ' + w + 'x' + h);
        }

        // 8MB 图片解码后约 46MB (RGBA)，使用 OffscreenCanvas 优化（如支持）
        var canvas;
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(w, h);
            } else {
                canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
            }
        } catch (e) {
            canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
        }

        var ctx = safeGetContext(canvas);
        ctx.drawImage(image, 0, 0, w, h);

        // 分块读取像素数据，避免大图一次性分配内存过大
        var CHUNK_H = 2048; // 每次读取 2048 行
        var allPixels;

        if (h <= CHUNK_H) {
            // 小图一次性读取
            var imageData = ctx.getImageData(0, 0, w, h);
            allPixels = new Uint8ClampedArray(imageData.data);
        } else {
            // 大图分块读取并拼接
            console.info('[Stego] 大图分块读取: ' + w + 'x' + h);
            var totalLen = w * h * 4;
            allPixels = new Uint8ClampedArray(totalLen);
            var offset = 0;
            for (var y = 0; y < h; y += CHUNK_H) {
                var chunkH = Math.min(CHUNK_H, h - y);
                var chunkData = ctx.getImageData(0, y, w, chunkH);
                allPixels.set(chunkData.data, offset);
                offset += chunkData.data.length;
                // 释放块内存
                chunkData = null;
            }
        }

        return {
            pixels: allPixels,
            width: w,
            height: h,
            canvas: canvas,
            ctx: ctx
        };
    }

    /**
     * 将像素数据写回 Canvas 并导出为 Blob
     * 全浏览器兼容：微信/QQ/UC/华为/小米/三星/Vivo/Oppo 等
     * 大图优化：分块 putImageData 避免内存峰值
     */
    function pixelsToImageBlob(canvas, ctx, pixels, width, height, format) {
        // 检测微信浏览器（特殊处理）
        var ua = navigator.userAgent || '';
        var isWeChat = /MicroMessenger/i.test(ua);
        var isOldAndroid = /Android\s([0-9]+)/i.test(ua) && parseInt(RegExp.$1) < 7;
        var isLowMem = navigator.deviceMemory && navigator.deviceMemory < 2;

        // 强制 PNG 的场景：微信中 JPEG 可能有兼容性 bug
        var forcePNG = isWeChat || isOldAndroid || isLowMem;

        // 写入像素（大图分块写入）
        var CHUNK_H = 2048;
        if (height <= CHUNK_H) {
            var imgData = new ImageData(
                pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
                width,
                height
            );
            ctx.putImageData(imgData, 0, 0);
            imgData = null;
        } else {
            console.info('[Stego] 大图分块写入像素: ' + width + 'x' + height);
            for (var cy = 0; cy < height; cy += CHUNK_H) {
                var endY = Math.min(cy + CHUNK_H, height);
                var chunkPixels = pixels.subarray(cy * width * 4, endY * width * 4);
                var chunkImgData = new ImageData(chunkPixels, width, endY - cy);
                ctx.putImageData(chunkImgData, 0, cy);
                chunkImgData = null;
                chunkPixels = null;
            }
        }

        return new Promise(function (resolve, reject) {
            // 确定实际输出格式
            var outputFormat = 'image/png'; // 默认 PNG（所有浏览器100%兼容）
            if (!forcePNG) {
                if (format === 'image/jpeg' && supportsJPEG) {
                    outputFormat = 'image/jpeg';
                } else if (format === 'image/webp' && supportsWebP) {
                    outputFormat = 'image/webp';
                }
            } else if (format === 'image/jpeg' && supportsJPEG && !isWeChat) {
                // 非微信环境才用 JPEG
                outputFormat = 'image/jpeg';
            }

            var quality = outputFormat === 'image/jpeg' ? 0.92 : undefined;

            var attemptCount = 0;
            var attemptExport = function (fmt, q) {
                attemptCount++;
                try {
                    // 微信中 canvas.toBlob 可能失败，用 toDataURL 兜底
                    if (isWeChat && attemptCount === 1 && fmt !== 'image/png') {
                        // 微信优先用 PNG
                        fmt = 'image/png';
                        q = undefined;
                    }

                    canvas.toBlob(function (blob) {
                        if (blob && blob.size > 0) {
                            console.info('[Stego] 导出成功: ' + fmt + ', 大小: ' + (blob.size / 1024).toFixed(1) + 'KB');
                            resolve(blob);
                        } else if (attemptCount < 3) {
                            // 尝试 toDataURL 兜底
                            try {
                                console.warn('[Stego] toBlob 返回空，尝试 toDataURL 兜底');
                                var dataURL = canvas.toDataURL('image/png');
                                if (dataURL && dataURL.length > 100) {
                                    // 转换 dataURL → Blob
                                    var binary = atob(dataURL.split(',')[1]);
                                    var len = binary.length;
                                    var bytes = new Uint8Array(len);
                                    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                                    resolve(new Blob([bytes], { type: 'image/png' }));
                                    return;
                                }
                            } catch (e2) {}
                            // 降级到 PNG
                            console.warn('[Stego] ' + fmt + ' 导出失败，降级为 PNG');
                            attemptExport('image/png', undefined);
                        } else {
                            reject(new Error('图片生成失败，请尝试刷新页面后重试'));
                        }
                    }, fmt, q);
                } catch (e) {
                    if (fmt !== 'image/png' && attemptCount < 3) {
                        attemptExport('image/png', undefined);
                    } else {
                        reject(new Error('图片生成失败: ' + e.message));
                    }
                }
            };

            attemptExport(outputFormat, quality);
        });
    }

    /**
     * 计算能容纳 dataSize 字节的最小正方形边长
     */
    function calcMinSquareDimensions(dataSize) {
        var totalBits = (HEADER_SIZE + dataSize) * 8;
        var pixelCount = Math.ceil(totalBits / 3);
        return Math.ceil(Math.sqrt(pixelCount));
    }

    /**
     * 计算指定尺寸可存储的数据字节数（减去头部）
     */
    function capacityForDimensions(width, height) {
        var totalBits = width * height * 3;
        return Math.floor(totalBits / 8) - HEADER_SIZE;
    }

    // ===== LSB 写入 =====
    function lsbEmbed(pixels, dataBytes) {
        var bitIdx = 0;
        var byteIdx = 0;

        for (var i = 0; i < pixels.length && byteIdx < dataBytes.length; i += 4) {
            for (var c = 0; c < 3 && byteIdx < dataBytes.length; c++) {
                var bit = (dataBytes[byteIdx] >> (7 - bitIdx)) & 1;
                pixels[i + c] = (pixels[i + c] & 0xFE) | bit;
                bitIdx++;
                if (bitIdx === 8) {
                    bitIdx = 0;
                    byteIdx++;
                }
            }
        }

        if (byteIdx < dataBytes.length) {
            throw new Error('像素容量不足，无法嵌入全部数据');
        }
    }

    // ===== LSB 提取 =====
    function lsbExtract(pixels, byteCount) {
        var result = new Uint8Array(byteCount);
        var bitIdx = 0;
        var byteIdx = 0;
        var maxI = pixels.length - 2;

        for (var i = 0; i < maxI && byteIdx < byteCount; i += 4) {
            for (var c = 0; c < 3 && byteIdx < byteCount; c++) {
                var bit = pixels[i + c] & 1;
                result[byteIdx] |= (bit << (7 - bitIdx));
                bitIdx++;
                if (bitIdx === 8) {
                    bitIdx = 0;
                    byteIdx++;
                }
            }
        }

        return result;
    }

    // ===== 核心编码 =====
    async function encode(text, keyMode, passphrase, carrierFile) {
        // 1. 准备 payload
        var payload;
        var keyId;
        var usedKey = null;

        if (keyMode === 'random') {
            keyId = KEY_ID_RANDOM;
            usedKey = passphrase;
            var b64Ciphertext = await StegoCrypto.encryptText(text, passphrase);
            var binStr = atob(b64Ciphertext);
            payload = new Uint8Array(binStr.length);
            for (var i = 0; i < binStr.length; i++) {
                payload[i] = binStr.charCodeAt(i);
            }
        } else {
            keyId = KEY_ID_DEFAULT;
            // 检测 TextEncoder 支持
            if (typeof TextEncoder === 'undefined') {
                // 安卓旧版降级：手动 UTF-8 编码
                payload = utf8Encode(text);
            } else {
                payload = new TextEncoder().encode(text);
            }
        }

        // 2. 组装完整数据
        var lengthBytes = new Uint8Array(LENGTH_HEADER_SIZE);
        new DataView(lengthBytes.buffer).setUint32(0, payload.length, false);

        var fullData = new Uint8Array(HEADER_SIZE + payload.length);
        fullData.set(MAGIC_HEADER, 0);
        fullData[2] = keyId;
        fullData.set(lengthBytes, 3);
        fullData.set(payload, HEADER_SIZE);

        // 3. 写入像素
        var info = {};
        var blob;
        var format = 'image/png';

        if (carrierFile) {
            var carrierImg = await loadImageFromFile(carrierFile);
            var imgData = imageToPixels(carrierImg);
            var w = imgData.width;
            var h = imgData.height;
            var available = capacityForDimensions(w, h);

            if (fullData.length > available) {
                throw new Error(
                    '载体图容量不足。图片 ' + w + '×' + h +
                    ' 可存 ' + Math.floor(available / 1024) + 'KB，' +
                    '但数据需要 ' + Math.ceil(fullData.length / 1024) + 'KB。' +
                    '请使用更大的图片或缩短文本。'
                );
            }

            // 随机填充
            var totalPixels = w * h;
            var totalBytes = totalPixels * 3;
            var paddedData = new Uint8Array(totalBytes);
            paddedData.set(fullData);
            var randomFill = new Uint8Array(totalBytes - fullData.length);
            crypto.getRandomValues(randomFill);
            paddedData.set(randomFill, fullData.length);

            // 大图分块嵌入，避免单次内存峰值过高
            var CHUNK_H = 2048;
            if (h <= CHUNK_H) {
                lsbEmbed(imgData.pixels, paddedData);
            } else {
                console.info('[Stego] 大图分块 LSB 嵌入: ' + w + 'x' + h);
                var pixelView = imgData.pixels;
                var linesPerChunk = CHUNK_H;
                var chunkByteSize = w * linesPerChunk * 4; // RGBA stride
                for (var cy = 0; cy < h; cy += linesPerChunk) {
                    var endY = Math.min(cy + linesPerChunk, h);
                    var chunkPixels = pixelView.subarray(cy * w * 4, endY * w * 4);
                    var chunkDataStart = (cy * w * 3);
                    var chunkDataEnd = (endY * w * 3);
                    // 只嵌入本块对应的数据段
                    var chunkPadded = paddedData.subarray(
                        chunkDataStart,
                        Math.min(chunkDataEnd, paddedData.length)
                    );
                    lsbEmbed(chunkPixels, chunkPadded);
                    chunkPixels = null; // 释放引用
                }
            }

            // 释放 paddedData 节省内存
            paddedData = null;
            randomFill = null;

            // 确定输出格式（安卓兼容）
            var fname = (carrierFile.name || '').toLowerCase();
            if (fname.endsWith('.jpg') || fname.endsWith('.jpeg')) {
                format = supportsJPEG ? 'image/jpeg' : 'image/png';
            } else if (fname.endsWith('.webp')) {
                format = supportsWebP ? 'image/webp' : 'image/png';
            } else {
                format = 'image/png';
            }

            blob = await pixelsToImageBlob(imgData.canvas, imgData.ctx, imgData.pixels, w, h, format);

            // 释放像素数据
            imgData.pixels = null;

            info = {
                mode: 'carrier',
                dimensions: w + '×' + h,
                payloadSize: payload.length,
                available: available,
                outputFormat: format
            };
        } else {
            // 自动生成正方形
            var side = calcMinSquareDimensions(fullData.length);
            var totalPixelsAuto = side * side;
            var totalBytesAuto = totalPixelsAuto * 3;
            var paddedDataAuto = new Uint8Array(totalBytesAuto);
            paddedDataAuto.set(fullData);
            var randomFillAuto = new Uint8Array(totalBytesAuto - fullData.length);
            crypto.getRandomValues(randomFillAuto);
            paddedDataAuto.set(randomFillAuto, fullData.length);

            var canvas = document.createElement('canvas');
            canvas.width = side;
            canvas.height = side;
            var ctx = safeGetContext(canvas);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, side, side);
            var imgDataAuto = ctx.getImageData(0, 0, side, side);

            lsbEmbed(imgDataAuto.data, paddedDataAuto);

            // 释放临时数据
            paddedDataAuto = null;
            randomFillAuto = null;

            blob = await pixelsToImageBlob(canvas, ctx, imgDataAuto.data, side, side, 'image/png');

            info = {
                mode: 'generated',
                dimensions: side + '×' + side,
                payloadSize: payload.length,
                totalPixels: totalPixelsAuto,
                rawCapacity: totalBytesAuto,
                utilization: ((fullData.length / totalBytesAuto) * 100).toFixed(1) + '%',
                outputFormat: 'image/png'
            };
        }

        return {
            blob: blob,
            info: info,
            keyMode: keyMode,
            usedKey: usedKey
        };
    }

    // ===== 核心解码 =====
    async function decode(imageFile, passphrase) {
        var img = await loadImageFromFile(imageFile);
        var imgData = imageToPixels(img);
        var pixels = imgData.pixels;
        var w = imgData.width;
        var h = imgData.height;

        // 大图解码时主动 GC（释放 img 引用）
        img = null;

        // 提取头部
        var header = lsbExtract(pixels, HEADER_SIZE);

        // 校验魔数
        if (header[0] !== MAGIC_HEADER[0] || header[1] !== MAGIC_HEADER[1]) {
            throw new DecodeError(
                'magic_mismatch',
                '该图片不是由本工具生成的隐写图片（魔数不匹配）'
            );
        }

        // 读取密钥标识和数据长度
        var keyId = header[2];
        var lenBytes = header.subarray(3, 7);
        var dataLength = new DataView(lenBytes.buffer, lenBytes.byteOffset, 4).getUint32(0, false);

        // 校验数据长度合理性
        var maxPossible = capacityForDimensions(w, h);
        if (dataLength > maxPossible || dataLength > 10 * 1024 * 1024) {
            throw new DecodeError(
                'corrupted',
                '数据长度异常（' + dataLength + ' 字节），图片可能已损坏'
            );
        }

        // 提取 payload
        var payload = lsbExtractPayload(pixels, HEADER_SIZE, dataLength);

        // 根据密钥标识处理
        var text;

        if (keyId === KEY_ID_DEFAULT) {
            try {
                if (typeof TextDecoder !== 'undefined') {
                    text = new TextDecoder('utf-8', { fatal: false }).decode(payload);
                } else {
                    text = utf8Decode(payload);
                }
            } catch (e) {
                throw new DecodeError('corrupted', '数据已损坏，无法解码为文本');
            }
        } else if (keyId === KEY_ID_RANDOM) {
            if (!passphrase) {
                throw new DecodeError('wrong_key', '此图片使用随机密钥加密，请输入密钥');
            }
            var b64 = '';
            for (var i = 0; i < payload.length; i++) {
                b64 += String.fromCharCode(payload[i]);
            }
            b64 = btoa(b64);

            try {
                text = await StegoCrypto.decryptText(b64, passphrase);
            } catch (e) {
                if (e.name === 'OperationError' || (e.message && e.message.includes('decrypt'))) {
                    throw new DecodeError('wrong_key', '密钥不正确，解密失败');
                }
                throw new DecodeError('corrupted', '数据已损坏或已被篡改: ' + e.message);
            }
        } else {
            throw new DecodeError('corrupted', '未知的密钥标识: 0x' + keyId.toString(16).toUpperCase());
        }

        return {
            text: text,
            info: {
                dimensions: w + '×' + h,
                payloadSize: dataLength,
                keyMode: keyId === KEY_ID_DEFAULT ? 'default' : 'random'
            }
        };
    }

    /**
     * 从像素中精确提取 payload（跳过头部）
     */
    function lsbExtractPayload(pixels, headerByteSize, payloadByteSize) {
        var totalBytes = headerByteSize + payloadByteSize;
        var allData = lsbExtract(pixels, totalBytes);
        return allData.subarray(headerByteSize);
    }

    /**
     * 加载图片文件为 HTMLImageElement
     * 安卓兼容：处理 crossOrigin 和 blob URL
     */
    function loadImageFromFile(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();

            // 安卓部分 WebView 需要设置 crossOrigin
            img.crossOrigin = 'anonymous';

            img.onload = function () {
                // 延迟一帧确保像素数据可读
                requestAnimationFrame(function () {
                    resolve(img);
                });
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('图片加载失败，请确认文件格式正确（支持 PNG/JPG/WebP/BMP）'));
            };

            // 安卓超时保护（某些大图会卡死）
            setTimeout(function () {
                if (!img.complete) {
                    URL.revokeObjectURL(url);
                    reject(new Error('图片加载超时，请尝试压缩后重试'));
                }
            }, 30000);

            img.src = url;
        });
    }

    // ===== UTF-8 编解码降级（安卓旧版浏览器） =====
    function utf8Encode(str) {
        var bytes = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) {
                bytes.push(c);
            } else if (c < 0x800) {
                bytes.push(0xC0 | (c >> 6));
                bytes.push(0x80 | (c & 0x3F));
            } else if (c < 0xD800 || c >= 0xE000) {
                bytes.push(0xE0 | (c >> 12));
                bytes.push(0x80 | ((c >> 6) & 0x3F));
                bytes.push(0x80 | (c & 0x3F));
            } else {
                i++;
                var surrogate = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
                bytes.push(0xF0 | (surrogate >> 18));
                bytes.push(0x80 | ((surrogate >> 12) & 0x3F));
                bytes.push(0x80 | ((surrogate >> 6) & 0x3F));
                bytes.push(0x80 | (surrogate & 0x3F));
            }
        }
        return new Uint8Array(bytes);
    }

    function utf8Decode(bytes) {
        var str = '';
        var i = 0;
        while (i < bytes.length) {
            var b = bytes[i];
            if (b < 0x80) {
                str += String.fromCharCode(b);
                i++;
            } else if (b < 0xE0) {
                str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i+1] & 0x3F));
                i += 2;
            } else if (b < 0xF0) {
                str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F));
                i += 3;
            } else {
                var codePoint = ((b & 0x07) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F);
                codePoint -= 0x10000;
                str += String.fromCharCode(0xD800 + (codePoint >> 10));
                str += String.fromCharCode(0xDC00 + (codePoint & 0x3FF));
                i += 4;
            }
        }
        return str;
    }

    // ===== 解码错误类 =====
    function DecodeError(type, message) {
        this.name = 'DecodeError';
        this.errorType = type;
        this.message = message;
    }
    DecodeError.prototype = Object.create(Error.prototype);

    // ===== 暴露 API =====
    global.StegoEngine = {
        encode: encode,
        decode: decode,
        DecodeError: DecodeError,
        calcMinSquareDimensions: calcMinSquareDimensions,
        capacityForDimensions: capacityForDimensions,
        constants: {
            MAGIC_HEADER: 'FACE',
            HEADER_SIZE: HEADER_SIZE,
            KEY_ID_DEFAULT: KEY_ID_DEFAULT,
            KEY_ID_RANDOM: KEY_ID_RANDOM
        }
    };

})(window);

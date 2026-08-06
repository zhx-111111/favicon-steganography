/**
 * ============================================
 *  crypto.js — Web Crypto API 加密工具
 *  AES-256-GCM 加密 / 解密
 *  PBKDF2-HMAC-SHA256 密钥派生
 * ============================================
 */

(function (global) {
    'use strict';

    // ===== 常量 =====
    var AES_KEY_SIZE = 256;       // AES-256
    var PBKDF2_ITERATIONS = 100000;
    var PBKDF2_SALT_SIZE = 16;   // 字节
    var GCM_IV_SIZE = 12;        // GCM 推荐 12 字节
    var GCM_TAG_SIZE = 16;       // GCM 认证标签 16 字节

    // ===== 工具函数 =====
    function bytesToBase64(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
    }

    function base64ToBytes(b64) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
    }

    function randomBytes(length) {
        var arr = new Uint8Array(length);
        crypto.getRandomValues(arr);
        return arr;
    }

    /**
     * 从口令派生 AES-256 Key 和 GCM IV
     * PBKDF2-HMAC-SHA256, 100000 次迭代
     */
    async function deriveKeyAndIV(passphrase, salt) {
        // 导入口令为密钥材料
        var keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        // 派生足够长的比特流：256-bit key + 96-bit IV = 44 字节
        var derived = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            AES_KEY_SIZE + GCM_IV_SIZE * 8  // 256 + 96 = 352 bits
        );

        var derivedBytes = new Uint8Array(derived);
        var keyBytes = derivedBytes.slice(0, 32);   // 前 32 字节 = AES-256 key
        var ivBytes = derivedBytes.slice(32, 44);    // 后 12 字节 = GCM IV

        // 导入 AES-GCM 密钥
        var aesKey = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return { key: aesKey, iv: ivBytes };
    }

    /**
     * AES-256-GCM 加密
     * 输出格式：salt(16) + iv(12) + ciphertext + tag(16)
     */
    async function encryptData(plaintext, passphrase) {
        var salt = randomBytes(PBKDF2_SALT_SIZE);
        var { key, iv } = await deriveKeyAndIV(passphrase, salt);

        var encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            key,
            plaintext
        );

        // 组装：salt + iv + ciphertext(with tag appended by WebCrypto)
        var result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        result.set(salt, 0);
        result.set(iv, salt.length);
        result.set(new Uint8Array(encrypted), salt.length + iv.length);

        return result;
    }

    /**
     * AES-256-GCM 解密
     * 输入格式：salt(16) + iv(12) + ciphertext + tag(16)
     */
    async function decryptData(ciphertextBlob, passphrase) {
        if (ciphertextBlob.length < PBKDF2_SALT_SIZE + GCM_IV_SIZE + GCM_TAG_SIZE) {
            throw new Error('密文数据过短，可能已损坏');
        }

        var salt = ciphertextBlob.slice(0, PBKDF2_SALT_SIZE);
        var iv = ciphertextBlob.slice(PBKDF2_SALT_SIZE, PBKDF2_SALT_SIZE + GCM_IV_SIZE);
        var encrypted = ciphertextBlob.slice(PBKDF2_SALT_SIZE + GCM_IV_SIZE);

        var { key } = await deriveKeyAndIV(passphrase, salt);

        var decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            key,
            encrypted
        );

        return new Uint8Array(decrypted);
    }

    /**
     * 加密文本 → Base64 字符串
     */
    async function encryptText(text, passphrase) {
        var plaintext = new TextEncoder().encode(text);
        var encrypted = await encryptData(plaintext, passphrase);
        return bytesToBase64(encrypted);
    }

    /**
     * 解密 Base64 字符串 → 文本
     */
    async function decryptText(base64Ciphertext, passphrase) {
        var ciphertextBlob = base64ToBytes(base64Ciphertext);
        var decrypted = await decryptData(ciphertextBlob, passphrase);
        return new TextDecoder('utf-8', { fatal: false }).decode(decrypted);
    }

    /**
     * 生成随机密钥字符串
     * 16 字符，大小写字母 + 数字 + 符号
     */
    function generateRandomKey(length) {
        length = length || 16;
        var charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.?';
        var key = '';
        var bytes = randomBytes(length);
        for (var i = 0; i < length; i++) {
            key += charset[bytes[i] % charset.length];
        }
        return key;
    }

    // ===== 暴露 API =====
    global.StegoCrypto = {
        encryptText: encryptText,
        decryptText: decryptText,
        generateRandomKey: generateRandomKey,
        // 常量（供调试用）
        constants: {
            PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
            AES_KEY_SIZE: AES_KEY_SIZE
        }
    };

})(window);
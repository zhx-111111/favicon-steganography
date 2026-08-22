/* stego.js — LSB Steganography Engine v1.0 */
"use strict";

const Stego = (() => {
  const MAGIC = new Uint8Array([0xFA, 0xCE, 0x5E, 0xCC]);
  const HEADER_LEN = 12; // MAGIC(4) + length(4) + flags(1) + crc(3)
  const REDUNDANCY = 3;

  // CRC32
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function bytesToBits(bytes) {
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++)
      for (let j = 0; j < 8; j++) bits[i * 8 + j] = (bytes[i] >> (7 - j)) & 1;
    return bits;
  }

  function bitsToBytes(bits) {
    const n = Math.floor(bits.length / 8);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j];
      out[i] = v;
    }
    return out;
  }

  function int32ToBytes(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, false);
    return b;
  }

  function bytesToInt32(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + (offset || 0), 4).getUint32(0, false) >>> 0;
  }

  // Embed bits into RGBA data (skip alpha channel)
  function lsbEmbed(rgba, bits, startOffset) {
    let idx = 0;
    for (let i = startOffset || 0; i < rgba.length && idx < bits.length; i++) {
      if (i % 4 === 3) continue; // skip alpha
      rgba[i] = (rgba[i] & 0xFE) | bits[idx++];
    }
    if (idx < bits.length) throw new Error("容量不足：需要 " + Math.ceil(bits.length / 8) + " 字节空间");
    return idx;
  }

  // Extract bits from RGBA data
  function lsbExtract(rgba, count, startOffset) {
    const bits = new Uint8Array(count);
    let idx = 0;
    for (let i = startOffset || 0; i < rgba.length && idx < count; i++) {
      if (i % 4 === 3) continue;
      bits[idx++] = rgba[i] & 1;
    }
    return bits;
  }

  // Build payload: MAGIC + length(4) + flags(1) + data + crc32(4)
  function buildPayload(data, encrypted) {
    const flags = encrypted ? 0x01 : 0x00;
    const total = MAGIC.length + 4 + 1 + data.length + 4;
    const payload = new Uint8Array(total);
    let off = 0;
    payload.set(MAGIC, off); off += MAGIC.length;
    payload.set(int32ToBytes(data.length), off); off += 4;
    payload[off++] = flags;
    payload.set(data, off); off += data.length;
    const crc = crc32(data);
    payload[off] = (crc >>> 24) & 0xFF;
    payload[off + 1] = (crc >>> 16) & 0xFF;
    payload[off + 2] = (crc >>> 8) & 0xFF;
    payload[off + 3] = crc & 0xFF;
    return payload;
  }

  // Parse payload
  function parsePayload(payload) {
    // Check magic
    for (let i = 0; i < MAGIC.length; i++) {
      if (payload[i] !== MAGIC[i]) throw new Error("未找到隐写数据（魔术字节不匹配）");
    }
    const dataLen = bytesToInt32(payload, MAGIC.length);
    if (dataLen === 0 || dataLen > 10 * 1024 * 1024) throw new Error("数据长度异常：" + dataLen);
    const flags = payload[MAGIC.length + 4];
    const encrypted = !!(flags & 0x01);
    const dataStart = MAGIC.length + 4 + 1;
    const dataEnd = dataStart + dataLen;
    if (dataEnd + 4 > payload.length) throw new Error("数据不完整");
    const data = payload.slice(dataStart, dataEnd);
    // Verify CRC
    const storedCrc = bytesToInt32(payload, dataEnd);
    const computedCrc = crc32(data);
    if (storedCrc !== computedCrc) throw new Error("CRC 校验失败：数据可能被损坏");
    return { data, encrypted };
  }

  // Capacity in bytes for given image dimensions
  function capacity(w, h) {
    return Math.floor((w * h * 3) / 8); // 3 channels (skip alpha), 1 bit each
  }

  // Load image to canvas
  function loadImageToCanvas(imgSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve({ canvas, ctx, w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = imgSrc;
    });
  }

  // Encode: embed text into image
  async function encode(text, carrierSrc, options) {
    const { canvas, ctx, w, h } = await loadImageToCanvas(carrierSrc);
    const imageData = ctx.getImageData(0, 0, w, h);
    const rgba = imageData.data;

    // Encode text as UTF-8
    const encoder = new TextEncoder();
    let dataBytes = encoder.encode(text);

    // Encrypt if key provided
    let encrypted = false;
    if (options && options.key) {
      dataBytes = await CryptoUtil.encrypt(dataBytes, options.key);
      encrypted = true;
    }

    // Build payload
    const payload = buildPayload(dataBytes, encrypted);
    const bits = bytesToBits(payload);

    // Check capacity
    const cap = capacity(w, h);
    if (payload.length > cap) {
      throw new Error("文本太长（" + payload.length + " 字节），图片最多容纳 " + cap + " 字节");
    }

    // Embed
    lsbEmbed(rgba, bits, 0);

    // Write back
    ctx.putImageData(imageData, 0, 0);

    // Export as PNG
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    return {
      blob,
      w, h,
      capacity: cap,
      used: payload.length,
      utilization: Math.round(payload.length / cap * 100),
      encrypted,
    };
  }

  // Decode: extract text from image
  async function decode(imageSrc, key) {
    const { ctx, w, h } = await loadImageToCanvas(imageSrc);
    const imageData = ctx.getImageData(0, 0, w, h);
    const rgba = imageData.data;

    // Extract header first (to get data length)
    const headerBits = lsbExtract(rgba, (MAGIC.length + 4 + 1) * 8, 0);
    const headerBytes = bitsToBytes(headerBits);

    // Check magic
    for (let i = 0; i < MAGIC.length; i++) {
      if (headerBytes[i] !== MAGIC[i]) throw new Error("未找到隐写数据。请确认这是本工具生成的隐写图片。");
    }

    const dataLen = bytesToInt32(headerBytes, MAGIC.length);
    const flags = headerBytes[MAGIC.length + 4];
    const encrypted = !!(flags & 0x01);

    // Extract full payload
    const totalBytes = MAGIC.length + 4 + 1 + dataLen + 4;
    const totalBits = totalBytes * 8;
    const cap = capacity(w, h);
    if (totalBytes > cap) throw new Error("声明的数据长度超出图片容量");

    const allBits = lsbExtract(rgba, totalBits, 0);
    const allBytes = bitsToBytes(allBits);

    // Parse and verify
    const { data } = parsePayload(allBytes);

    // Decrypt if needed
    if (encrypted) {
      if (!key) throw new Error("此消息已加密，请输入解密密钥");
      try {
        const decrypted = await CryptoUtil.decrypt(data, key);
        const decoder = new TextDecoder();
        return { text: decoder.decode(decrypted), encrypted: true };
      } catch (e) {
        throw new Error("解密失败：密钥不正确");
      }
    }

    const decoder = new TextDecoder();
    return { text: decoder.decode(data), encrypted: false };
  }

  // Visualize: show LSB plane
  async function visualize(imageSrc) {
    const { canvas, ctx, w, h } = await loadImageToCanvas(imageSrc);
    const imageData = ctx.getImageData(0, 0, w, h);
    const rgba = imageData.data;
    const vizCanvas = document.createElement("canvas");
    vizCanvas.width = w;
    vizCanvas.height = h;
    const vizCtx = vizCanvas.getContext("2d");
    const vizData = vizCtx.createImageData(w, h);
    for (let i = 0; i < rgba.length; i += 4) {
      const r = (rgba[i] & 1) * 255;
      const g = (rgba[i + 1] & 1) * 255;
      const b = (rgba[i + 2] & 1) * 255;
      vizData.data[i] = r;
      vizData.data[i + 1] = g;
      vizData.data[i + 2] = b;
      vizData.data[i + 3] = 255;
    }
    vizCtx.putImageData(vizData, 0, 0);
    return vizCanvas;
  }

  return { encode, decode, visualize, capacity };
})();

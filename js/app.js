/* app.js — Main UI Controller v1.0 */
"use strict";

(function() {
  // --- State ---
  let carrierFile = null;
  let carrierDataURL = null;
  let resultBlob = null;
  let resultDataURL = null;

  // --- DOM refs ---
  const $ = id => document.getElementById(id);

  // --- Helpers ---
  function showToast(msg, type) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast show " + (type || "");
    setTimeout(() => { el.className = "toast"; }, 3000);
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- Tab switching ---
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = $(tab.dataset.tab + "Panel");
      if (panel) panel.classList.add("active");
    });
  });

  // --- Theme toggle ---
  const themeBtn = $("themeToggle");
  if (themeBtn) {
    const saved = localStorage.getItem("theme") || "auto";
    function applyTheme(mode) {
      const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    }
    applyTheme(saved);
    themeBtn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem("theme", cur);
      applyTheme(cur);
    });
  }

  // --- Carrier image upload ---
  const dropzone = $("encodeDropzone");
  const fileInput = $("encodeImageInput");

  async function handleCarrierFile(file) {
    if (!file || !file.type.startsWith("image/")) { showToast("请选择图片文件", "error"); return; }
    if (file.size > 25 * 1024 * 1024) { showToast("文件太大（最大 25MB）", "error"); return; }
    carrierFile = file;
    carrierDataURL = await fileToDataURL(file);
    const preview = $("encodePreview");
    const hint = $("encodeHint");
    preview.style.display = "block";
    hint.style.display = "none";
    preview.innerHTML = '<img src="' + carrierDataURL + '" style="max-height:200px;border-radius:8px;margin:8px auto;display:block">' +
      '<p style="font-size:12px;color:var(--text-tertiary);text-align:center">' + file.name + ' (' + Math.round(file.size / 1024) + ' KB) · 容量: ' + '加载中...</p>';
    // Calculate capacity
    const img = new Image();
    img.onload = () => {
      const cap = Stego.capacity(img.naturalWidth, img.naturalHeight);
      preview.querySelector("p").textContent = file.name + ' (' + Math.round(file.size / 1024) + ' KB) · 容量: ' + cap + ' 字节 (' + Math.round(cap / 1024) + ' KB)';
    };
    img.src = carrierDataURL;
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", e => {
      if (e.target === dropzone || e.target.closest(".upload-hint")) fileInput.click();
    });
    fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleCarrierFile(fileInput.files[0]); });
    dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", e => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files[0]) handleCarrierFile(e.dataTransfer.files[0]);
    });
  }

  // Clear carrier
  const clearBtn = $("carrierClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", e => {
      e.stopPropagation();
      carrierFile = null;
      carrierDataURL = null;
      $("encodePreview").style.display = "none";
      $("encodePreview").innerHTML = "";
      $("encodeHint").style.display = "";
      clearBtn.style.display = "none";
    });
  }

  // Show clear button when carrier loaded
  const observer = new MutationObserver(() => {
    if (carrierDataURL) clearBtn.style.display = "flex";
  });
  if (clearBtn && $("encodePreview")) observer.observe($("encodePreview"), { attributes: true });

  // --- Text byte counter ---
  const textArea = $("encodeText");
  const byteCount = $("textByteCount");
  if (textArea && byteCount) {
    textArea.addEventListener("input", () => {
      const bytes = new TextEncoder().encode(textArea.value).length;
      byteCount.textContent = bytes;
    });
  }

  // --- Key mode ---
  document.querySelectorAll('input[name="keyMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const randomOpts = $("randomKeyOptions");
      if (randomOpts) randomOpts.style.display = radio.value === "random" ? "block" : "none";
    });
  });
  document.querySelectorAll('input[name="customKey"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const keyInput = $("keyInput");
      const copyBtn = $("copyKeyBtn");
      const newBtn = $("newKeyBtn");
      if (radio.value === "manual") {
        keyInput.style.display = "";
        copyBtn.style.display = "";
        newBtn.style.display = "none";
      } else {
        keyInput.style.display = "none";
        keyInput.value = CryptoUtil.generatePassword(16);
        copyBtn.style.display = "";
        newBtn.style.display = "";
      }
    });
  });

  // Generate initial key
  const keyInput = $("keyInput");
  if (keyInput && !keyInput.value) keyInput.value = CryptoUtil.generatePassword(16);

  const copyKeyBtn = $("copyKeyBtn");
  if (copyKeyBtn) {
    copyKeyBtn.addEventListener("click", () => {
      const val = keyInput.value;
      if (val && navigator.clipboard) {
        navigator.clipboard.writeText(val).then(() => showToast("密钥已复制", "ok"));
      }
    });
  }
  const newKeyBtn = $("newKeyBtn");
  if (newKeyBtn) {
    newKeyBtn.addEventListener("click", () => { keyInput.value = CryptoUtil.generatePassword(16); showToast("已生成新密钥", "ok"); });
  }

  // --- ENCODE ---
  const encodeBtn = $("encodeBtn");
  if (encodeBtn) {
    encodeBtn.addEventListener("click", async () => {
      const text = $("encodeText").value;
      if (!text.trim()) { showToast("请输入要隐藏的文字", "error"); return; }

      // Key
      const keyMode = document.querySelector('input[name="keyMode"]:checked')?.value;
      let key = null;
      if (keyMode === "random") {
        const customKey = document.querySelector('input[name="customKey"]:checked')?.value;
        key = customKey === "manual" ? $("keyInput").value : $("keyInput").value;
        if (!key || key.length < 4) { showToast("密钥太短（最少 4 字符）", "error"); return; }
      }

      // Carrier
      if (!carrierDataURL) {
        // Generate a plain-color carrier image
        const c = document.createElement("canvas");
        const bytes = new TextEncoder().encode(text).length;
        const side = Math.max(100, Math.ceil(Math.sqrt(bytes * 8 * 4 / 3)));
        c.width = side; c.height = side;
        const ctx = c.getContext("2d");
        // Random gradient background
        const g = ctx.createLinearGradient(0, 0, side, side);
        g.addColorStop(0, "#e8e0d0"); g.addColorStop(1, "#d0c8b8");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, side, side);
        carrierDataURL = c.toDataURL("image/png");
      }

      // Progress
      const progress = $("encodeProgress");
      const progressFill = $("progressFill");
      const progressStage = $("progressStage");
      if (progress) progress.style.display = "block";
      if (progressStage) progressStage.textContent = "编码中...";
      if (progressFill) progressFill.style.width = "50%";

      try {
        const result = await Stego.encode(text, carrierDataURL, { key });
        resultBlob = result.blob;
        resultDataURL = URL.createObjectURL(resultBlob);

        if (progressFill) progressFill.style.width = "100%";
        if (progressStage) progressStage.textContent = "完成";

        // Show result
        const resultArea = $("encodeResult");
        if (resultArea) resultArea.style.display = "block";

        // Result image - use data URL fallback to avoid black screen
        const resultImg = $("resultImage");
        if (resultImg) {
          const reader = new FileReader();
          reader.onload = () => { resultImg.src = reader.result; };
          reader.readAsDataURL(resultBlob);
        }

        // Original carrier image
        const origImg = $("resultImageOriginal");
        if (origImg) {
          if (carrierFile) {
            origImg.src = URL.createObjectURL(carrierFile);
          } else {
            origImg.src = carrierDataURL;
          }
        }

        // Info
        const infoEl = $("encodeInfo");
        if (infoEl) {
          infoEl.innerHTML =
            '<div class="info-item"><div class="label">加密</div><div class="value">' + (result.encrypted ? "AES-256-GCM" : "无") + '</div></div>' +
            '<div class="info-item"><div class="label">图片尺寸</div><div class="value">' + result.w + '×' + result.h + '</div></div>' +
            '<div class="info-item"><div class="label">容量利用率</div><div class="value">' + result.utilization + '%</div></div>';
        }

        // Key card
        const keyCard = $("keyCard");
        if (keyCard) {
          keyCard.style.display = key ? "block" : "none";
          if (key) $("resultKey").textContent = key;
        }

        // Size
        const sizeEl = $("resultSize");
        if (sizeEl) sizeEl.textContent = result.w + " × " + result.h + " px";

        showToast("隐写图片生成成功", "ok");
      } catch (e) {
        showToast("编码失败：" + e.message, "error");
      }
    });
  }

  // --- Download result ---
  const dlBtn = $("btnDownload");
  if (dlBtn) {
    dlBtn.addEventListener("click", e => {
      e.preventDefault();
      if (!resultBlob) { showToast("请先生成隐写图片", "error"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(resultBlob);
      a.download = "stego_" + Date.now() + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("开始下载", "ok");
    });
  }

  // Open image (with data URL fallback to avoid black screen)
  const openBtn = $("btnOpenImage");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (!resultBlob) { showToast("请先生成隐写图片", "error"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const w = window.open(reader.result, "_blank");
        if (!w) showToast("弹窗被拦截，请允许", "info");
      };
      reader.readAsDataURL(resultBlob);
    });
  }

  // Download original carrier
  const dlOrigBtn = $("btnDownloadOriginal");
  if (dlOrigBtn) {
    dlOrigBtn.addEventListener("click", () => {
      if (carrierFile) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(carrierFile);
        a.download = carrierFile.name || "original.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("原图已开始下载", "ok");
      } else {
        showToast("未检测到上传的载体图片", "error");
      }
    });
  }

  // --- DECODE ---
  const decodeBtn = $("decodeBtn");
  let decodeImageDataURL = null;

  const decodeDropzone = $("decodeDropzone");
  const decodeFileInput = $("decodeImageInput");

  async function handleDecodeFile(file) {
    if (!file || !file.type.startsWith("image/")) { showToast("请选择图片文件", "error"); return; }
    decodeImageDataURL = await fileToDataURL(file);
    const preview = $("decodePreview");
    const hint = $("decodeHint");
    preview.style.display = "block";
    hint.style.display = "none";
    preview.innerHTML = '<img src="' + decodeImageDataURL + '" style="max-height:160px;border-radius:8px;margin:8px auto;display:block">' +
      '<p style="font-size:12px;text-align:center;color:var(--text-tertiary)">' + file.name + '</p>';
  }

  if (decodeDropzone && decodeFileInput) {
    decodeDropzone.addEventListener("click", e => {
      if (e.target === decodeDropzone || e.target.closest(".upload-hint")) decodeFileInput.click();
    });
    decodeFileInput.addEventListener("change", () => { if (decodeFileInput.files[0]) handleDecodeFile(decodeFileInput.files[0]); });
    decodeDropzone.addEventListener("dragover", e => { e.preventDefault(); decodeDropzone.classList.add("drag-over"); });
    decodeDropzone.addEventListener("dragleave", () => decodeDropzone.classList.remove("drag-over"));
    decodeDropzone.addEventListener("drop", e => {
      e.preventDefault();
      decodeDropzone.classList.remove("drag-over");
      if (e.dataTransfer.files[0]) handleDecodeFile(e.dataTransfer.files[0]);
    });
  }

  // Paste support
  document.addEventListener("paste", e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        handleDecodeFile(item.getAsFile());
        // Switch to decode tab
        document.querySelector('[data-tab="decode"]')?.click();
        break;
      }
    }
  });

  // Key mode for decode
  document.querySelectorAll('input[name="decodeKeyMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const input = $("decodeKeyInput");
      const pasteBtn = $("pasteKeyBtn");
      if (radio.value === "custom") {
        input.style.display = "";
        if (pasteBtn) pasteBtn.style.display = "";
      } else {
        input.style.display = "none";
        if (pasteBtn) pasteBtn.style.display = "none";
      }
    });
  });

  const pasteKeyBtn = $("pasteKeyBtn");
  if (pasteKeyBtn) {
    pasteKeyBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        $("decodeKeyInput").value = text;
        showToast("密钥已粘贴", "ok");
      } catch { showToast("无法读取剪贴板", "error"); }
    });
  }

  if (decodeBtn) {
    decodeBtn.addEventListener("click", async () => {
      if (!decodeImageDataURL) { showToast("请先上传隐写图片", "error"); return; }

      const keyMode = document.querySelector('input[name="decodeKeyMode"]:checked')?.value;
      const key = keyMode === "custom" ? $("decodeKeyInput").value : null;

      const progress = $("decodeProgress");
      if (progress) progress.style.display = "block";

      try {
        const result = await Stego.decode(decodeImageDataURL, key);

        if (progress) progress.style.display = "none";

        const resultArea = $("decodeResult");
        const errorArea = $("decodeError");
        if (errorArea) errorArea.style.display = "none";
        if (resultArea) resultArea.style.display = "block";

        $("decodeText").textContent = result.text;
        const meta = $("decodeMeta");
        if (meta) meta.textContent = (result.encrypted ? "🔐 已加密" : "🔓 未加密") + " · " + result.text.length + " 字符";

        showToast("解码成功", "ok");
      } catch (e) {
        if (progress) progress.style.display = "none";
        const errorArea = $("decodeError");
        const resultArea = $("decodeResult");
        if (resultArea) resultArea.style.display = "none";
        if (errorArea) {
          errorArea.style.display = "block";
          $("errorMessage").textContent = e.message;
        }
        showToast("解码失败", "error");
      }
    });
  }

  // Copy decoded text
  const copyResultBtn = $("copyResultBtn");
  if (copyResultBtn) {
    copyResultBtn.addEventListener("click", () => {
      const text = $("decodeText").textContent;
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast("已复制", "ok"));
      }
    });
  }

  // --- VISUALIZE ---
  let vizImageDataURL = null;
  const vizDropzone = $("vizDropzone");
  const vizFileInput = $("vizImageInput");

  async function handleVizFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    vizImageDataURL = await fileToDataURL(file);
    const preview = $("vizPreview");
    preview.style.display = "block";
    $("vizHint").style.display = "none";
    preview.innerHTML = '<img src="' + vizImageDataURL + '" style="max-height:160px;border-radius:8px;margin:8px auto;display:block">';
    // Auto-run visualization
    try {
      const vizCanvas = await Stego.visualize(vizImageDataURL);
      const result = $("vizResult");
      if (result) result.style.display = "block";
      const lsbCanvas = $("lsbCanvas");
      if (lsbCanvas) {
        lsbCanvas.width = vizCanvas.width;
        lsbCanvas.height = vizCanvas.height;
        lsbCanvas.getContext("2d").drawImage(vizCanvas, 0, 0);
      }
    } catch (e) { showToast("可视化失败：" + e.message, "error"); }
  }

  if (vizDropzone && vizFileInput) {
    vizDropzone.addEventListener("click", e => {
      if (e.target === vizDropzone || e.target.closest(".upload-hint")) vizFileInput.click();
    });
    vizFileInput.addEventListener("change", () => { if (vizFileInput.files[0]) handleVizFile(vizFileInput.files[0]); });
  }

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); encodeBtn?.click(); }
    if (e.ctrlKey && e.shiftKey && e.key === "D") { e.preventDefault(); decodeBtn?.click(); }
  });

  console.log("[Stego] v1.0 loaded");
})();

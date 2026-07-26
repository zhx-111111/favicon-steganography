# Favicon Steganography - 图片隐写术工具

在 PNG 图片中隐藏和提取文本数据。

## 功能

- **编码**：将任意文本嵌入到图片或创建新的微小 PNG 图标
- **解码**：从任何包含隐写数据的图片中提取隐藏的文本
- **魔数验证**：使用 `0xFA 0xCE` 标记，防止误读普通图片

## 原理

每个像素有 R、G、B 三个通道（各 0-255）。文本转为 UTF-8 字节后，依次写入像素的 RGB 通道。数据前加 4 字节长度头和 2 字节魔数标记，确保解码准确性。

## 用法

```bash
python3 favicon_steganography.py          # 运行演示
python3 favicon_steganography.py encode "你的文本" output.png    # 编码
python3 favicon_steganography.py decode input.png               # 解码
```

## 限制

- 仅支持 PNG 无损格式
- 容量 = 宽 × 高 × 3 字节，需容纳 7 字节头部 + 数据 + 填充
- 16x16 可存约 761 字节

## License

MIT

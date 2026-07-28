"""
Flask 主程序 — 隐写加密通讯工具 Web 应用
"""

import io
import base64
import traceback

from flask import Flask, render_template, request, jsonify, send_file

from stego import (
    encode, decode, DecodeError,
    encode_to_bytes, encode_carrier_to_bytes,
)
from key_manager import (
    DEFAULT_KEY, generate_random_key, is_default_key,
)

app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 最大上传 16MB

# === 路由 ===

@app.route('/')
def index():
    return render_template('index.html', default_key=DEFAULT_KEY)

# === API 接口 ===

@app.route('/api/generate-key', methods=['GET'])
def api_generate_key():
    """生成随机密钥"""
    key = generate_random_key(16)
    return jsonify({
        'success': True,
        'key': key,
        'length': len(key),
    })

@app.route('/api/encode', methods=['POST'])
def api_encode():
    """
    编码接口：文本 → 图片

    表单参数:
        text: 要隐藏的文本
        key_mode: 'default' 或 'random'
        key: 随机密钥模式时的密钥字符串
        carrier: 可选载体图文件

    返回:
        图片文件（PNG 或载体图原格式）
    """
    try:
        text = request.form.get('text', '').strip()
        if not text:
            return jsonify({'success': False, 'error': '文本内容不能为空'}), 400

        key_mode = request.form.get('key_mode', 'default')
        passphrase = request.form.get('key', '').strip() or None

        # 随机密钥模式必须有密钥
        if key_mode == 'random' and not passphrase:
            return jsonify({'success': False, 'error': '随机密钥模式必须提供密钥'}), 400

        # 检查是否有载体图
        carrier_file = request.files.get('carrier')
        carrier_bytes = None
        if carrier_file and carrier_file.filename:
            carrier_bytes = carrier_file.read()

        # 执行编码
        if carrier_bytes:
            # 载体图模式：数据写入载体图像素，但输出始终为 PNG（无损）
            # JPEG/WebP 等有损格式会破坏精确像素值，导致解码失败
            from PIL import Image
            img = Image.open(io.BytesIO(carrier_bytes))
            result_img, used_key, info = encode(
                text, key_mode, passphrase, carrier_image=img
            )

            # 始终输出 PNG 保证无损
            buf = io.BytesIO()
            result_img.save(buf, format='PNG')
            buf.seek(0)

            return send_file(
                buf,
                mimetype='image/png',
                as_attachment=True,
                download_name='stego_carrier.png',
            )
        else:
            # 自动生成 PNG
            img, used_key, info = encode(text, key_mode, passphrase, carrier_image=None)

            buf = io.BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)

            return send_file(
                buf,
                mimetype='image/png',
                as_attachment=True,
                download_name='stego_favicon.png',
            )

    except ValueError as e:
        # 容量不足等参数错误
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'服务器内部错误: {str(e)}'}), 500

@app.route('/api/decode', methods=['POST'])
def api_decode():
    """
    解码接口：图片 → 文本

    表单参数:
        image: 上传的图片文件
        key: 可选密钥（随机密钥时需要）

    返回:
        JSON: { success, text } 或 { success: false, error, error_type }
    """
    try:
        image_file = request.files.get('image')
        if not image_file or not image_file.filename:
            return jsonify({'success': False, 'error': '请上传图片文件'}), 400

        key = request.form.get('key', '').strip() or None

        # 用 PIL 打开图片
        from PIL import Image
        img_bytes = image_file.read()
        img = Image.open(io.BytesIO(img_bytes))

        # 执行解码
        text = decode(img, passphrase=key)

        return jsonify({
            'success': True,
            'text': text,
        })

    except DecodeError as e:
        # 区分错误类型
        error_map = {
            'magic_mismatch': '这不是本工具生成的图片（魔数校验失败）',
            'wrong_key': '密钥不正确，拒绝解析',
            'corrupted': '数据已损坏或已被篡改',
        }
        msg = error_map.get(e.error_type, e.message)
        return jsonify({
            'success': False,
            'error': msg,
            'error_type': e.error_type,
        }), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'解码失败: {str(e)}'}), 500

# === 启动 ===

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

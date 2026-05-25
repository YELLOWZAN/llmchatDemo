from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from services import session_manager, chat_service, llm_service
from utils.config_loader import load_config, save_config
import json
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB 最大文件大小

BG_IMAGE_FOLDER = os.path.join(os.path.dirname(__file__), 'bgimage')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    convs = session_manager.get_all_conversations()
    return jsonify({
        'conversations': [{
            'id': c['id'],
            'title': c['title'],
            'created_at': c['created_at'],
            'updated_at': c['updated_at']
        } for c in convs]
    })

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    conv = session_manager.create_conversation()
    return jsonify({
        'conversation_id': conv['id'],
        'title': conv['title']
    })

@app.route('/api/conversations/<conv_id>', methods=['GET'])
def get_conversation(conv_id):
    conv = session_manager.get_conversation(conv_id)
    if not conv:
        return jsonify({'error': 'Conversation not found'}), 404
    return jsonify({'messages': conv['messages']})

@app.route('/api/conversations/<conv_id>', methods=['DELETE'])
def delete_conversation(conv_id):
    success = session_manager.delete_conversation(conv_id)
    return jsonify({'status': 'ok' if success else 'error'})

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    conv_id = data.get('conversation_id')
    message = data.get('message', '')
    
    def generate():
        try:
            for chunk in chat_service.send_message(conv_id, message):
                if chunk.startswith('__DONE__'):
                    done_conv_id = chunk[8:]
                    yield f"data: {json.dumps({'type': 'done', 'conversation_id': done_conv_id})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            # 发送一个结束标记，确保连接正常关闭
            pass
    
    response = Response(generate(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/api/chat/stop', methods=['POST'])
def stop_chat():
    data = request.json
    conv_id = data.get('conversation_id')
    llm_service.stop_generation(conv_id)
    return jsonify({'status': 'ok'})

@app.route('/api/chat/regenerate', methods=['POST'])
def regenerate():
    data = request.json
    conv_id = data.get('conversation_id')
    
    def generate():
        for chunk in chat_service.regenerate_message(conv_id):
            if chunk.startswith('__DONE__'):
                done_conv_id = chunk[8:]
                yield f"data: {json.dumps({'type': 'done', 'conversation_id': done_conv_id})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/config', methods=['GET'])
def get_config():
    config = load_config()
    return jsonify({
        'api_key': '***' if config.get('api', {}).get('api_key') else '',
        'model': config.get('api', {}).get('model', ''),
        'base_url': config.get('api', {}).get('base_url', ''),
        'system_prompt': config.get('system', {}).get('system_prompt', ''),
        'extra_body': config.get('api', {}).get('extra_body', {}),
        'dark_mode': config.get('theme', {}).get('dark_mode', True),
        'bg_brightness': config.get('theme', {}).get('bg_brightness', 80),
        'bg_blur': config.get('theme', {}).get('bg_blur', 0),
        'bg_opacity': config.get('theme', {}).get('bg_opacity', 100),
        'bg_image': config.get('theme', {}).get('bg_image', ''),
        'bubble_opacity': config.get('theme', {}).get('bubble_opacity', 85),
        'sidebar_opacity': config.get('theme', {}).get('sidebar_opacity', 85),
        'input_opacity': config.get('theme', {}).get('input_opacity', 85)
    })

@app.route('/api/config', methods=['POST'])
def update_config():
    data = request.json
    config = load_config()
    
    if 'api_key' in data:
        config['api']['api_key'] = data['api_key']
    if 'model' in data:
        config['api']['model'] = data['model']
    if 'base_url' in data:
        config['api']['base_url'] = data['base_url']
    if 'system_prompt' in data:
        config['system']['system_prompt'] = data['system_prompt']
    if 'extra_body' in data:
        config['api']['extra_body'] = data['extra_body']
    
    # 主题设置
    if 'dark_mode' in data:
        config['theme']['dark_mode'] = data['dark_mode']
    if 'bg_brightness' in data:
        config['theme']['bg_brightness'] = data['bg_brightness']
    if 'bg_blur' in data:
        config['theme']['bg_blur'] = data['bg_blur']
    if 'bg_opacity' in data:
        config['theme']['bg_opacity'] = data['bg_opacity']
    if 'bg_image' in data:
        config['theme']['bg_image'] = data['bg_image']
    if 'bubble_opacity' in data:
        config['theme']['bubble_opacity'] = data['bubble_opacity']
    if 'sidebar_opacity' in data:
        config['theme']['sidebar_opacity'] = data['sidebar_opacity']
    if 'input_opacity' in data:
        config['theme']['input_opacity'] = data['input_opacity']
    
    save_config(config)
    return jsonify({'status': 'ok'})

@app.route('/api/background/upload', methods=['POST'])
def upload_background():
    try:
        if 'file' not in request.files:
            return jsonify({'error': '没有文件'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': '没有选择文件'}), 400
        
        # 检查文件扩展名
        ext = None
        if '.' in file.filename:
            ext = file.filename.rsplit('.', 1)[1].lower()
        
        if file and ext in ALLOWED_EXTENSIONS:
            # 删除旧文件
            try:
                for old_file in os.listdir(BG_IMAGE_FOLDER):
                    old_file_path = os.path.join(BG_IMAGE_FOLDER, old_file)
                    if os.path.isfile(old_file_path):
                        os.remove(old_file_path)
            except Exception as e:
                print(f"删除旧文件时出错: {e}")
            
            # 保存新文件
            filename = secure_filename(file.filename)
            # 确保文件名唯一
            filename = f"bg_{filename}"
            file_path = os.path.join(BG_IMAGE_FOLDER, filename)
            file.save(file_path)
            
            # 返回图片URL
            image_url = f'/api/background/image/{filename}'
            return jsonify({'url': image_url, 'filename': filename})
        else:
            return jsonify({'error': f'不支持的文件类型: {ext}'}), 400
    except Exception as e:
        print(f"上传背景图片时出错: {e}")
        return jsonify({'error': f'上传失败: {str(e)}'}), 500

@app.route('/api/background/image/<filename>')
def get_background_image(filename):
    return send_from_directory(BG_IMAGE_FOLDER, filename)

@app.route('/api/background/delete', methods=['POST'])
def delete_background():
    try:
        for file in os.listdir(BG_IMAGE_FOLDER):
            file_path = os.path.join(BG_IMAGE_FOLDER, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    if not os.path.exists(BG_IMAGE_FOLDER):
        os.makedirs(BG_IMAGE_FOLDER)
    
    # 检查并初始化数据库
    from services.session_manager import init_db, DB_PATH as DB_FILE
    if not os.path.exists(DB_FILE):
        print(f"数据库文件不存在，正在创建: {DB_FILE}")
        init_db()
    else:
        # 验证数据库文件完整性
        try:
            import sqlite3
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            # 测试数据库连接
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            conn.close()
            
            # 检查必要的表是否存在
            required_tables = ['conversations', 'messages']
            existing_tables = [table[0] for table in tables]
            
            if not all(table in existing_tables for table in required_tables):
                print("数据库表结构不完整，正在重建...")
                init_db()
            else:
                print(f"数据库检查通过: {DB_FILE}")
        except Exception as e:
            print(f"数据库文件损坏，正在重建: {e}")
            init_db()
    
    app.run(debug=True, host='0.0.0.0', port=5000)

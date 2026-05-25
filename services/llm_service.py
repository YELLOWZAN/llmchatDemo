from openai import OpenAI
from utils.config_loader import load_config
from typing import Generator

_stop_flags = {}

def call_llm_stream(messages: list, conv_id: str) -> Generator[str, None, None]:
    config = load_config()
    api_config = config.get('api', {})
    
    client = OpenAI(
        api_key=api_config.get('api_key', ''),
        base_url=api_config.get('base_url', 'https://api.deepseek.com/v1')
    )
    
    _stop_flags[conv_id] = False
    
    # 构建 API 调用参数
    api_params = {
        'model': api_config.get('model', 'deepseek-chat'),
        'messages': messages,
        'stream': True,
        'max_tokens': api_config.get('max_tokens', 4096),
        'temperature': api_config.get('temperature', 0.7)
    }
    
    # 添加 extra_body 支持（如联网搜索等）
    extra_body = api_config.get('extra_body', {})
    if extra_body:
        api_params['extra_body'] = extra_body
    
    try:
        stream = client.chat.completions.create(**api_params)
        
        for chunk in stream:
            if _stop_flags.get(conv_id, False):
                break
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        yield f"\nError: {str(e)}"
    finally:
        if conv_id in _stop_flags:
            del _stop_flags[conv_id]

def stop_generation(conv_id: str):
    _stop_flags[conv_id] = True

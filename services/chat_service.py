from services import session_manager, llm_service
from utils.config_loader import load_config
from typing import Generator

def send_message(conv_id: str, user_message: str) -> Generator[str, None, None]:
    config = load_config()
    system_prompt = config.get('system', {}).get('system_prompt', '')
    
    conv = session_manager.get_conversation(conv_id)
    if not conv:
        conv = session_manager.create_conversation()
        conv_id = conv['id']
    
    # Add user message
    session_manager.add_message(conv_id, 'user', user_message)
    
    # Refresh conversation to get updated messages list
    conv = session_manager.get_conversation(conv_id)
    
    messages = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    
    for msg in conv['messages']:
        messages.append({'role': msg['role'], 'content': msg['content']})
    
    full_response = ""
    for chunk in llm_service.call_llm_stream(messages, conv_id):
        full_response += chunk
        yield chunk
    
    session_manager.add_message(conv_id, 'assistant', full_response)
    yield f"__DONE__{conv_id}"

def regenerate_message(conv_id: str) -> Generator[str, None, None]:
    import sqlite3
    from services import session_manager
    from utils.config_loader import load_config
    
    conv = session_manager.get_conversation(conv_id)
    if not conv or len(conv['messages']) < 2:
        return
    
    last_user_msg = None
    # Find last user message
    for msg in reversed(conv['messages']):
        if msg['role'] == 'user':
            last_user_msg = msg['content']
            break
    
    if last_user_msg:
        # Delete last assistant message from database
        DB_PATH = session_manager.DB_PATH
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            DELETE FROM messages 
            WHERE conversation_id = ? 
            AND role = 'assistant' 
            AND id = (SELECT MAX(id) FROM messages WHERE conversation_id = ? AND role = 'assistant')
        ''', (conv_id, conv_id))
        conn.commit()
        conn.close()
        
        # Resend the last user message
        yield from send_message(conv_id, last_user_msg)

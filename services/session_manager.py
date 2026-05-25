import sqlite3
import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'conversations.db')

__all__ = ['create_conversation', 'get_conversation', 'get_all_conversations', 
           'delete_conversation', 'add_message', 'update_conversation_title', 'DB_PATH']

def init_db():
    """Initialize the database and create tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    # Create conversations table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    
    # Create messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on module load
init_db()

def create_conversation(title: str = "新对话") -> Dict:
    """Create a new conversation"""
    conv_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    cursor.execute(
        'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        (conv_id, title, now, now)
    )
    
    conn.commit()
    conn.close()
    
    return {
        'id': conv_id,
        'title': title,
        'created_at': now,
        'updated_at': now
    }

def get_conversation(conv_id: str) -> Optional[Dict]:
    """Get a conversation by ID with its messages"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    # Get conversation metadata
    cursor.execute('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?', (conv_id,))
    conv_row = cursor.fetchone()
    
    if not conv_row:
        conn.close()
        return None
    
    # Get messages
    cursor.execute(
        'SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY id',
        (conv_id,)
    )
    message_rows = cursor.fetchall()
    
    messages = [{'role': row[0], 'content': row[1], 'timestamp': row[2]} for row in message_rows]
    
    conn.close()
    
    return {
        'id': conv_row[0],
        'title': conv_row[1],
        'created_at': conv_row[2],
        'updated_at': conv_row[3],
        'messages': messages
    }

def get_all_conversations() -> List[Dict]:
    """Get all conversations (without messages) ordered by updated_at descending"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
    rows = cursor.fetchall()
    
    conversations = []
    for row in rows:
        conversations.append({
            'id': row[0],
            'title': row[1],
            'created_at': row[2],
            'updated_at': row[3]
        })
    
    conn.close()
    return conversations

def delete_conversation(conv_id: str) -> bool:
    """Delete a conversation by ID and all associated messages"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    # 先删除关联的消息
    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conv_id,))
    
    # 再删除会话
    cursor.execute('DELETE FROM conversations WHERE id = ?', (conv_id,))
    deleted = cursor.rowcount > 0
    
    conn.commit()
    conn.close()
    
    return deleted

def add_message(conv_id: str, role: str, content: str) -> Optional[Dict]:
    """Add a message to a conversation"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    # Check if conversation exists
    cursor.execute('SELECT id, title FROM conversations WHERE id = ?', (conv_id,))
    conv_row = cursor.fetchone()
    
    if not conv_row:
        conn.close()
        return None
    
    now = datetime.utcnow().isoformat()
    
    # Add message
    cursor.execute(
        'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)',
        (conv_id, role, content, now)
    )
    
    # Update conversation timestamp
    cursor.execute(
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        (now, conv_id)
    )
    
    # Auto-title based on first message if it's still "新对话"
    title = conv_row[1]
    if title == "新对话" and role == "user":
        new_title = content[:30] + ("..." if len(content) > 30 else "")
        cursor.execute(
            'UPDATE conversations SET title = ? WHERE id = ?',
            (new_title, conv_id)
        )
        title = new_title
    
    conn.commit()
    conn.close()
    
    # Return updated conversation
    return get_conversation(conv_id)

def update_conversation_title(conv_id: str, title: str) -> bool:
    """Update a conversation's title"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 启用外键约束
    cursor.execute('PRAGMA foreign_keys = ON')
    
    now = datetime.utcnow().isoformat()
    cursor.execute(
        'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
        (title, now, conv_id)
    )
    
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return updated

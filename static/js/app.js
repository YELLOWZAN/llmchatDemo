let currentConversationId = null;
let isGenerating = false;
let eventSource = null;
let isDarkMode = true;
let isSidebarCollapsed = false;
let savedSettings = {}; // 保存初始设置，用于关闭时恢复

// 防抖函数 - 避免频繁触发后端请求
function debounce(func, delay = 500) {
    let timer = null;
    return function(...args) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newChatBtn = document.getElementById('newChatBtn');
const settingsBtn = document.getElementById('settingsBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const settingsModal = document.getElementById('settingsModal');
const closeBtn = document.querySelector('.close');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const conversationList = document.getElementById('conversationList');
const sidebar = document.querySelector('.sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const backgroundLayer = document.getElementById('backgroundLayer');

document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadConversations();
    loadSettings();
    loadBackgroundSettings();
    loadSidebarState();
    setupEventListeners();
});

function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', stopGeneration);
    newChatBtn.addEventListener('click', createNewConversation);
    themeToggleBtn.addEventListener('click', toggleTheme);
    settingsBtn.addEventListener('click', openSettingsModal);
    closeBtn.addEventListener('click', closeSettingsModal);
    saveSettingsBtn.addEventListener('click', saveSettings);
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    messageInput.addEventListener('input', autoResize);
    
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
    
    // 设置分页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });
}

function openSettingsModal() {
    // 保存当前设置，用于关闭时恢复
    savedSettings = {
        apiKey: document.getElementById('apiKey').value,
        baseUrl: document.getElementById('baseUrl').value,
        model: document.getElementById('model').value,
        extraBody: document.getElementById('extraBody').value,
        systemPrompt: document.getElementById('systemPrompt').value,
        bgBrightness: document.getElementById('bgBrightness').value,
        bgBlur: document.getElementById('bgBlur').value,
        bgOpacity: document.getElementById('bgOpacity').value
    };
    settingsModal.classList.add('show');
}

function closeSettingsModal() {
    // 恢复设置（不保存修改）
    document.getElementById('apiKey').value = savedSettings.apiKey || '';
    document.getElementById('baseUrl').value = savedSettings.baseUrl || '';
    document.getElementById('model').value = savedSettings.model || '';
    document.getElementById('extraBody').value = savedSettings.extraBody || '';
    document.getElementById('systemPrompt').value = savedSettings.systemPrompt || '';
    
    // 恢复背景设置UI
    if (document.getElementById('bgBrightness')) {
        document.getElementById('bgBrightness').value = savedSettings.bgBrightness || 80;
        document.getElementById('brightnessValue').textContent = `${savedSettings.bgBrightness || 80}%`;
    }
    if (document.getElementById('bgBlur')) {
        document.getElementById('bgBlur').value = savedSettings.bgBlur || 0;
        document.getElementById('blurValue').textContent = `${savedSettings.bgBlur || 0}px`;
    }
    if (document.getElementById('bgOpacity')) {
        document.getElementById('bgOpacity').value = savedSettings.bgOpacity || 100;
        document.getElementById('opacityValue').textContent = `${savedSettings.bgOpacity || 100}%`;
    }
    
    // 恢复背景视觉效果
    const savedBrightness = savedSettings.bgBrightness || 80;
    const savedBlur = savedSettings.bgBlur || 0;
    const savedOpacity = savedSettings.bgOpacity || 100;
    backgroundLayer.style.filter = `brightness(${savedBrightness / 100}) blur(${savedBlur}px)`;
    backgroundLayer.style.opacity = savedOpacity / 100;
    
    settingsModal.classList.remove('show');
}

function switchTab(tab) {
    // 隐藏所有标签内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    // 移除所有标签按钮的active类
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示当前标签内容
    document.getElementById(`${tab}-tab`).classList.add('active');
    event.target.classList.add('active');
}

function loadTheme() {
    // 优先从后端加载主题设置
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        isDarkMode = savedTheme === 'dark';
    }
    applyTheme();
}

async function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
    
    // 同步保存到后端
    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dark_mode: isDarkMode })
        });
    } catch (err) {
        console.error('保存主题设置失败:', err);
    }
}

function applyTheme() {
    const hljsTheme = document.getElementById('hljs-theme');
    
    if (isDarkMode) {
        document.body.classList.remove('light');
        hljsTheme.href = 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css';
        themeToggleBtn.textContent = '深色模式';
    } else {
        document.body.classList.add('light');
        hljsTheme.href = 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css';
        themeToggleBtn.textContent = '浅色模式';
    }
    
    highlightCode();
}

function toggleSidebar() {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        if (sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            sidebar.classList.add('collapsed');
            isSidebarCollapsed = true;
            sidebarToggleBtn.textContent = '☰';
            localStorage.setItem('sidebarCollapsed', 'true');
        } else {
            sidebar.classList.remove('collapsed');
            sidebar.classList.add('active');
            isSidebarCollapsed = false;
            sidebarToggleBtn.textContent = '✕';
            localStorage.setItem('sidebarCollapsed', 'false');
        }
    } else {
        isSidebarCollapsed = !isSidebarCollapsed;
        if (isSidebarCollapsed) {
            sidebar.classList.add('collapsed');
            sidebarToggleBtn.textContent = '☰';
            localStorage.setItem('sidebarCollapsed', 'true');
        } else {
            sidebar.classList.remove('collapsed');
            sidebarToggleBtn.textContent = '✕';
            localStorage.setItem('sidebarCollapsed', 'false');
        }
    }
}

function loadSidebarState() {
    const isMobile = window.innerWidth <= 768;
    const savedState = localStorage.getItem('sidebarCollapsed');
    
    if (isMobile) {
        // 移动端默认隐藏侧边栏
        if (savedState !== 'false') {
            isSidebarCollapsed = true;
            sidebar.classList.add('collapsed');
            sidebarToggleBtn.textContent = '☰';
        } else {
            sidebar.classList.add('active');
            sidebarToggleBtn.textContent = '✕';
        }
    } else {
        // PC端默认显示侧边栏
        if (savedState === 'true') {
            isSidebarCollapsed = true;
            sidebar.classList.add('collapsed');
            sidebarToggleBtn.textContent = '☰';
        } else {
            sidebarToggleBtn.textContent = '✕';
        }
    }
}

function loadBackgroundSettings() {
    const savedBgImage = localStorage.getItem('bgImage');
    const savedBrightness = localStorage.getItem('bgBrightness') || 80;
    const savedBlur = localStorage.getItem('bgBlur') || 0;
    const savedOpacity = localStorage.getItem('bgOpacity') || 100;
    
    if (savedBgImage) {
        backgroundLayer.style.backgroundImage = `url(${savedBgImage})`;
    }
    
    backgroundLayer.style.filter = `brightness(${savedBrightness / 100}) blur(${savedBlur}px)`;
    backgroundLayer.style.opacity = savedOpacity / 100;
    
    // 更新滑块值
    const brightnessSlider = document.getElementById('bgBrightness');
    const blurSlider = document.getElementById('bgBlur');
    const opacitySlider = document.getElementById('bgOpacity');
    
    if (brightnessSlider) {
        brightnessSlider.value = savedBrightness;
        document.getElementById('brightnessValue').textContent = `${savedBrightness}%`;
    }
    if (blurSlider) {
        blurSlider.value = savedBlur;
        document.getElementById('blurValue').textContent = `${savedBlur}px`;
    }
    if (opacitySlider) {
        opacitySlider.value = savedOpacity;
        document.getElementById('opacityValue').textContent = `${savedOpacity}%`;
    }
}

async function uploadBackgroundImage() {
    const fileInput = document.getElementById('bgImageFile');
    const statusEl = document.getElementById('bgUploadStatus');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        statusEl.textContent = '请先选择图片文件';
        statusEl.style.color = '#ef4444';
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    statusEl.textContent = '上传中...';
    statusEl.style.color = '#888';
    
    try {
        const res = await fetch('/api/background/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || '上传失败');
        }
        
        localStorage.setItem('bgImage', data.url);
        backgroundLayer.style.backgroundImage = `url(${data.url})`;
        
        // 同步保存到后端
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bg_image: data.url })
            });
        } catch (err) {
            console.error('保存背景图片路径到后端失败:', err);
        }
        
        statusEl.textContent = '上传成功！';
        statusEl.style.color = '#22c55e';
        
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
        
    } catch (err) {
        console.error(err);
        statusEl.textContent = '上传失败：' + err.message;
        statusEl.style.color = '#ef4444';
    }
}

async function deleteBackgroundImage() {
    const statusEl = document.getElementById('bgUploadStatus');
    
    try {
        const res = await fetch('/api/background/delete', {
            method: 'POST'
        });
        
        if (!res.ok) {
            throw new Error('删除失败');
        }
        
        localStorage.removeItem('bgImage');
        backgroundLayer.style.backgroundImage = 'none';
        
        // 同步保存到后端
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bg_image: '' })
            });
        } catch (err) {
            console.error('保存背景图片路径到后端失败:', err);
        }
        
        statusEl.textContent = '背景已删除';
        statusEl.style.color = '#22c55e';
        
        const fileInput = document.getElementById('bgImageFile');
        if (fileInput) fileInput.value = '';
        
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
        
    } catch (err) {
        console.error(err);
        statusEl.textContent = '删除失败：' + err.message;
        statusEl.style.color = '#ef4444';
    }
}

function setupBackgroundListeners() {
    const brightnessSlider = document.getElementById('bgBrightness');
    const blurSlider = document.getElementById('bgBlur');
    const opacitySlider = document.getElementById('bgOpacity');
    const uploadBtn = document.getElementById('uploadBgBtn');
    const deleteBtn = document.getElementById('deleteBgBtn');
    
    // 保存背景设置到后端
    async function saveBackgroundConfig(key, value) {
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value })
            });
        } catch (err) {
            console.error(`保存${key}到后端失败:`, err);
        }
    }
    
    // 使用防抖包装保存函数，避免频繁请求
    const debouncedSaveBackgroundConfig = debounce(saveBackgroundConfig, 500);
    
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('brightnessValue').textContent = `${value}%`;
            localStorage.setItem('bgBrightness', value);
            backgroundLayer.style.filter = `brightness(${value / 100}) blur(${blurSlider.value}px)`;
            debouncedSaveBackgroundConfig('bg_brightness', parseInt(value));
        });
    }
    
    if (blurSlider) {
        blurSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('blurValue').textContent = `${value}px`;
            localStorage.setItem('bgBlur', value);
            backgroundLayer.style.filter = `brightness(${brightnessSlider.value / 100}) blur(${value}px)`;
            debouncedSaveBackgroundConfig('bg_blur', parseInt(value));
        });
    }
    
    if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('opacityValue').textContent = `${value}%`;
            localStorage.setItem('bgOpacity', value);
            backgroundLayer.style.opacity = value / 100;
            debouncedSaveBackgroundConfig('bg_opacity', parseInt(value));
        });
    }
    
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadBackgroundImage);
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteBackgroundImage);
    }
    
    // API Key 显示/隐藏
    const toggleBtn = document.getElementById('toggleApiKeyBtn');
    const apiKeyInput = document.getElementById('apiKey');
    if (toggleBtn && apiKeyInput) {
        toggleBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleBtn.textContent = '隐藏';
            } else {
                apiKeyInput.type = 'password';
                toggleBtn.textContent = '显示';
            }
        });
    }
}

function setupThemeOpacityListeners() {
    const bubbleOpacitySlider = document.getElementById('bubbleOpacity');
    const sidebarOpacitySlider = document.getElementById('sidebarOpacity');
    const inputOpacitySlider = document.getElementById('inputOpacity');
    
    // 保存主题透明度设置到后端
    async function saveThemeOpacityConfig(key, value) {
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value })
            });
        } catch (err) {
            console.error(`保存${key}到后端失败:`, err);
        }
    }
    
    // 使用防抖包装保存函数，避免频繁请求
    const debouncedSaveThemeOpacityConfig = debounce(saveThemeOpacityConfig, 500);
    
    if (bubbleOpacitySlider) {
        bubbleOpacitySlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('bubbleOpacityValue').textContent = `${value}%`;
            localStorage.setItem('bubbleOpacity', value);
            applyOpacitySetting('--bubble-opacity', value / 100);
            debouncedSaveThemeOpacityConfig('bubble_opacity', parseInt(value));
        });
    }
    
    if (sidebarOpacitySlider) {
        sidebarOpacitySlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('sidebarOpacityValue').textContent = `${value}%`;
            localStorage.setItem('sidebarOpacity', value);
            applyOpacitySetting('--sidebar-opacity', value / 100);
            debouncedSaveThemeOpacityConfig('sidebar_opacity', parseInt(value));
        });
    }
    
    if (inputOpacitySlider) {
        inputOpacitySlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('inputOpacityValue').textContent = `${value}%`;
            localStorage.setItem('inputOpacity', value);
            applyOpacitySetting('--input-opacity', value / 100);
            debouncedSaveThemeOpacityConfig('input_opacity', parseInt(value));
        });
    }
}

function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

async function loadConversations() {
    try {
        const res = await fetch('/api/conversations');
        const data = await res.json();
        renderConversationList(data.conversations);
        
        if (data.conversations.length > 0 && !currentConversationId) {
            selectConversation(data.conversations[0].id);
        } else if (data.conversations.length === 0) {
            renderEmptyState();
        }
    } catch (err) {
        console.error(err);
    }
}

function renderConversationList(conversations) {
    conversationList.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${conv.id === currentConversationId ? 'active' : ''}" data-id="${conv.id}">
            <span class="title">${escapeHtml(conv.title)}</span>
            <button class="edit-btn" data-id="${conv.id}" title="编辑标题">✏️</button>
            <button class="delete-btn" data-id="${conv.id}">×</button>
        </div>
    `).join('');
    
    conversationList.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('edit-btn')) {
                selectConversation(item.dataset.id);
            }
        });
    });
    
    conversationList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(btn.dataset.id);
        });
    });
    
    conversationList.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditTitle(btn);
        });
    });
}

function startEditTitle(btn) {
    const convId = btn.dataset.id;
    const item = btn.parentElement;
    const titleSpan = item.querySelector('.title');
    const currentTitle = titleSpan.textContent;
    
    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'edit-title-input';
    input.style.flex = '1';
    input.style.marginRight = '8px';
    
    // 替换标题为输入框
    item.replaceChild(input, titleSpan);
    
    // 替换编辑按钮为保存按钮
    btn.textContent = '✓';
    btn.title = '保存标题';
    btn.removeEventListener('click', startEditTitle);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveEditTitle(btn, input, convId);
    });
    
    // 聚焦输入框
    input.focus();
    input.select();
    
    // 按回车保存
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveEditTitle(btn, input, convId);
        } else if (e.key === 'Escape') {
            cancelEditTitle(btn, input, currentTitle);
        }
    });
}

function saveEditTitle(btn, input, convId) {
    const newTitle = input.value.trim();
    if (!newTitle) {
        alert('标题不能为空');
        return;
    }
    
    // 更新标题
    fetch(`/api/conversations/${convId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
    }).then(() => {
        // 更新UI
        const item = btn.parentElement;
        const titleSpan = document.createElement('span');
        titleSpan.className = 'title';
        titleSpan.textContent = escapeHtml(newTitle);
        item.replaceChild(titleSpan, input);
        
        btn.textContent = '✏️';
        btn.title = '编辑标题';
        btn.removeEventListener('click', saveEditTitle);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditTitle(btn);
        });
    }).catch(err => {
        console.error(err);
        alert('保存失败');
    });
}

function cancelEditTitle(btn, input, originalTitle) {
    const item = btn.parentElement;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = originalTitle;
    item.replaceChild(titleSpan, input);
    
    btn.textContent = '✏️';
    btn.title = '编辑标题';
    btn.removeEventListener('click', saveEditTitle);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditTitle(btn);
    });
}

async function createNewConversation() {
    try {
        const res = await fetch('/api/conversations', { method: 'POST' });
        const data = await res.json();
        currentConversationId = data.conversation_id;
        loadConversations();
        clearChat();
        renderEmptyState();
    } catch (err) {
        console.error(err);
    }
}

async function selectConversation(convId) {
    currentConversationId = convId;
    loadConversations();
    
    try {
        const res = await fetch(`/api/conversations/${convId}`);
        const data = await res.json();
        renderMessages(data.messages);
    } catch (err) {
        console.error(err);
    }
}

async function deleteConversation(convId) {
    try {
        await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
        if (convId === currentConversationId) {
            currentConversationId = null;
            clearChat();
        }
        loadConversations();
    } catch (err) {
        console.error(err);
    }
}

function clearChat() {
    chatMessages.innerHTML = '';
}

function renderEmptyState() {
    chatMessages.innerHTML = `
        <div class="empty-state">
            <h2>👋 开始对话</h2>
            <p>输入消息开始与AI聊天</p>
        </div>
    `;
}

function renderMessages(messages) {
    if (messages && messages.length > 0) {
        chatMessages.innerHTML = messages.map(msg => renderMessage(msg)).join('');
    } else {
        renderEmptyState();
    }
    scrollToBottom();
    highlightCode();
}

function renderMessage(msg) {
    const content = renderMarkdown(msg.content);
    return `
        <div class="message ${msg.role}">
            <div class="message-content">${content}</div>
        </div>
    `;
}

function renderMarkdown(text) {
    if (!window.marked) return escapeHtml(text);
    
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) {}
            }
            return code;
        }
    });
    
    let html = marked.parse(text);
    
    html = html.replace(/<pre><code( class="language-(\w+)")?>/g, (match, p1, p2) => {
        return `<pre><code${p1 || ''}><button class="copy-btn" onclick="copyCode(this)">复制</button>`;
    });
    
    return html;
}

function highlightCode() {
    if (window.hljs) {
        document.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }
}

function copyCode(btn) {
    const code = btn.parentElement.textContent.replace('复制', '');
    navigator.clipboard.writeText(code);
    btn.textContent = '已复制!';
    setTimeout(() => btn.textContent = '复制', 2000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;
    
    if (!currentConversationId) {
        await createNewConversation();
    }
    
    addMessage('user', message);
    messageInput.value = '';
    autoResize();
    
    isGenerating = true;
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    let assistantMessageId = addMessage('assistant', '', true);
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: currentConversationId,
                message: message
            })
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保存不完整的行
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content') {
                            fullContent += data.content;
                            updateMessage(assistantMessageId, fullContent);
                        } else if (data.type === 'done') {
                            currentConversationId = data.conversation_id;
                            loadConversations();
                        } else if (data.type === 'error') {
                            console.error('Server error:', data.content);
                            updateMessage(assistantMessageId, `抱歉，发生错误：${data.content}`);
                        }
                    } catch (e) {
                        // 忽略无效的JSON数据
                    }
                }
            }
        }
    } catch (err) {
        console.error('Send message error:', err);
        // 只有在消息为空时才显示错误
        const currentContent = document.getElementById(assistantMessageId)?.querySelector('.message-content')?.textContent;
        if (!currentContent || currentContent.trim() === '') {
            updateMessage(assistantMessageId, '抱歉，发生错误，请检查网络连接或API配置');
        }
    } finally {
        isGenerating = false;
        sendBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    }
}

function addMessage(role, content, isPlaceholder = false) {
    // 检查并移除空状态
    const emptyState = chatMessages.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.id = id;
    div.innerHTML = `<div class="message-content">${isPlaceholder ? '' : renderMarkdown(content)}</div>`;
    chatMessages.appendChild(div);
    scrollToBottom();
    if (!isPlaceholder) highlightCode();
    return id;
}

function updateMessage(id, content) {
    const el = document.getElementById(id);
    if (el) {
        el.querySelector('.message-content').innerHTML = renderMarkdown(content);
        scrollToBottom();
        highlightCode();
    }
}

async function stopGeneration() {
    if (!currentConversationId) return;
    try {
        await fetch('/api/chat/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_id: currentConversationId })
        });
    } catch (err) {
        console.error(err);
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadSettings() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        
        // 加载 API Key（后端返回 *** 表示已设置但不显示原值）
        const apiKeyInput = document.getElementById('apiKey');
        if (data.api_key && data.api_key !== '***') {
            apiKeyInput.value = data.api_key;
        } else if (data.api_key === '***') {
            // 如果后端返回 ***，表示API Key已设置但需要重新获取
            // 从本地存储读取
            const savedApiKey = localStorage.getItem('apiKey');
            if (savedApiKey) {
                apiKeyInput.value = savedApiKey;
            }
        }
        
        document.getElementById('baseUrl').value = data.base_url || '';
        document.getElementById('model').value = data.model || '';
        document.getElementById('systemPrompt').value = data.system_prompt || '';
        
        // 加载 extra_body
        if (data.extra_body) {
            document.getElementById('extraBody').value = JSON.stringify(data.extra_body, null, 2);
        }
        
        // 加载主题设置（从后端）
        if (data.dark_mode !== undefined) {
            isDarkMode = data.dark_mode;
            applyTheme();
            localStorage.setItem('darkMode', isDarkMode.toString());
        }
        
        // 加载背景设置（从后端）
        const savedBgImage = data.bg_image || localStorage.getItem('bgImage');
        const savedBrightness = data.bg_brightness !== undefined ? data.bg_brightness : localStorage.getItem('bgBrightness') || 80;
        const savedBlur = data.bg_blur !== undefined ? data.bg_blur : localStorage.getItem('bgBlur') || 0;
        const savedOpacity = data.bg_opacity !== undefined ? data.bg_opacity : localStorage.getItem('bgOpacity') || 100;
        
        if (savedBgImage) {
            backgroundLayer.style.backgroundImage = `url(${savedBgImage})`;
            localStorage.setItem('bgImage', savedBgImage);
        }
        
        backgroundLayer.style.filter = `brightness(${savedBrightness / 100}) blur(${savedBlur}px)`;
        backgroundLayer.style.opacity = savedOpacity / 100;
        
        // 更新背景滑块值
        const brightnessSlider = document.getElementById('bgBrightness');
        const blurSlider = document.getElementById('bgBlur');
        const opacitySlider = document.getElementById('bgOpacity');
        
        if (brightnessSlider) {
            brightnessSlider.value = savedBrightness;
            document.getElementById('brightnessValue').textContent = `${savedBrightness}%`;
            localStorage.setItem('bgBrightness', savedBrightness);
        }
        if (blurSlider) {
            blurSlider.value = savedBlur;
            document.getElementById('blurValue').textContent = `${savedBlur}px`;
            localStorage.setItem('bgBlur', savedBlur);
        }
        if (opacitySlider) {
            opacitySlider.value = savedOpacity;
            document.getElementById('opacityValue').textContent = `${savedOpacity}%`;
            localStorage.setItem('bgOpacity', savedOpacity);
        }
        
        // 加载主题透明度设置（从后端）
        const savedBubbleOpacity = data.bubble_opacity !== undefined ? data.bubble_opacity : localStorage.getItem('bubbleOpacity') || 85;
        const savedSidebarOpacity = data.sidebar_opacity !== undefined ? data.sidebar_opacity : localStorage.getItem('sidebarOpacity') || 85;
        const savedInputOpacity = data.input_opacity !== undefined ? data.input_opacity : localStorage.getItem('inputOpacity') || 85;
        
        // 更新主题透明度滑块值
        const bubbleOpacitySlider = document.getElementById('bubbleOpacity');
        const sidebarOpacitySlider = document.getElementById('sidebarOpacity');
        const inputOpacitySlider = document.getElementById('inputOpacity');
        
        if (bubbleOpacitySlider) {
            bubbleOpacitySlider.value = savedBubbleOpacity;
            document.getElementById('bubbleOpacityValue').textContent = `${savedBubbleOpacity}%`;
            localStorage.setItem('bubbleOpacity', savedBubbleOpacity);
            applyOpacitySetting('--bubble-opacity', savedBubbleOpacity / 100);
        }
        if (sidebarOpacitySlider) {
            sidebarOpacitySlider.value = savedSidebarOpacity;
            document.getElementById('sidebarOpacityValue').textContent = `${savedSidebarOpacity}%`;
            localStorage.setItem('sidebarOpacity', savedSidebarOpacity);
            applyOpacitySetting('--sidebar-opacity', savedSidebarOpacity / 100);
        }
        if (inputOpacitySlider) {
            inputOpacitySlider.value = savedInputOpacity;
            document.getElementById('inputOpacityValue').textContent = `${savedInputOpacity}%`;
            localStorage.setItem('inputOpacity', savedInputOpacity);
            applyOpacitySetting('--input-opacity', savedInputOpacity / 100);
        }
        
        // 设置背景监听器
        setupBackgroundListeners();
        
        // 设置主题透明度监听器
        setupThemeOpacityListeners();
        
        // 加载侧边栏状态
        loadSidebarState();
    } catch (err) {
        console.error(err);
    }
}

function applyOpacitySetting(variableName, value) {
    document.documentElement.style.setProperty(variableName, value);
}

async function saveSettings() {
    try {
        const extraBodyInput = document.getElementById('extraBody').value.trim();
        let extraBody = {};
        
        if (extraBodyInput) {
            try {
                extraBody = JSON.parse(extraBodyInput);
            } catch (e) {
                alert('Extra Body JSON 格式错误，请检查！');
                return;
            }
        }
        
        const apiKey = document.getElementById('apiKey').value;
        
        // 获取主题透明度设置
        const bubbleOpacity = parseInt(document.getElementById('bubbleOpacity')?.value || 85);
        const sidebarOpacity = parseInt(document.getElementById('sidebarOpacity')?.value || 85);
        const inputOpacity = parseInt(document.getElementById('inputOpacity')?.value || 85);
        
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                base_url: document.getElementById('baseUrl').value,
                model: document.getElementById('model').value,
                system_prompt: document.getElementById('systemPrompt').value,
                extra_body: extraBody,
                bubble_opacity: bubbleOpacity,
                sidebar_opacity: sidebarOpacity,
                input_opacity: inputOpacity
            })
        });
        
        // 保存API Key到localStorage
        if (apiKey) {
            localStorage.setItem('apiKey', apiKey);
        }
        
        // 保存主题透明度到localStorage
        localStorage.setItem('bubbleOpacity', bubbleOpacity);
        localStorage.setItem('sidebarOpacity', sidebarOpacity);
        localStorage.setItem('inputOpacity', inputOpacity);
        
        settingsModal.classList.remove('show');
    } catch (err) {
        console.error(err);
    }
}

async function getAPIKey() {
    const response = await fetch('/.netlify/functions/getApiKey');
    const data = await response.json();
    return data.API_KEY;
}

const MODEL = "deepseek/deepseek-chat:free";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MEMORY_LIMIT = 10; // Number of message pairs to remember

const chatContainer = document.getElementById('chatContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.overlay');
const closeSidebarBtn = document.querySelector('.close-sidebar');
const newChatBtn = document.querySelector('.new-chat-btn');
const chatHistory = document.getElementById('chatHistory');

let currentChatId = null;
let conversations = {};
let isProcessing = false;

document.addEventListener('DOMContentLoaded', function() {
    initApp();
    customizeAvatars('images/user-avatar.png', 'images/ai-avatar.png');
});

function initApp() {
    loadConversations();
    setupEventListeners();
    autoResizeTextarea();
}

function loadConversations() {
    const savedConversations = localStorage.getItem('conversations');
    if (savedConversations) {
        conversations = JSON.parse(savedConversations);
        renderChatHistory();
    }
}

function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(conversations));
    renderChatHistory();
}

function setupEventListeners() {
    messageInput.addEventListener('focus', handleInputFocus);
    messageInput.addEventListener('blur', handleInputBlur);
    
    sendBtn.addEventListener('click', handleSendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    function handleInputFocus() {
        document.body.classList.add('keyboard-visible');
        setTimeout(() => {
            scrollToBottom();
        }, 300);
    }
    
    function handleInputBlur() {
        document.body.classList.remove('keyboard-visible');
    }
    
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        if (document.body.classList.contains('keyboard-visible') && window.innerWidth <= 768) {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
    
    menuBtn.addEventListener('click', toggleSidebar);
    closeSidebarBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);
    newChatBtn.addEventListener('click', createNewChat);
}

function autoResizeTextarea() {
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function createNewChat() {
    currentChatId = generateId();
    conversations[currentChatId] = {
        id: currentChatId,
        title: 'New Chat',
        messages: [],
        summary: '',
        lastActive: Date.now()
    };
    
    saveConversations();
    renderChat();
    
    if (sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    messageInput.focus();
}

function loadChat(chatId) {
    currentChatId = chatId;
    
    // Update lastActive timestamp when loading a chat
    if (conversations[currentChatId]) {
        conversations[currentChatId].lastActive = Date.now();
        saveConversations();
    }
    
    renderChat();
    
    if (sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function deleteChat(chatId, event) {
    event.stopPropagation();
    
    if (confirm('Are you sure you want to delete this chat?')) {
        delete conversations[chatId];
        saveConversations();
        
        if (currentChatId === chatId) {
            currentChatId = null;
            renderChat();
        }
    }
}

function renderChatHistory() {
    chatHistory.innerHTML = '';
    
    // Sort chats by lastActive timestamp (most recent first)
    const sortedChats = Object.values(conversations).sort((a, b) => {
        return (b.lastActive || 0) - (a.lastActive || 0);
    });
    
    sortedChats.forEach(chat => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-title">${chat.title}</div>
            <div class="delete-chat">
                <i class="fas fa-trash"></i>
            </div>
        `;
        
        historyItem.addEventListener('click', () => loadChat(chat.id));
        historyItem.querySelector('.delete-chat').addEventListener('click', (e) => deleteChat(chat.id, e));
        
        chatHistory.appendChild(historyItem);
    });
}

function renderChat() {
    chatContainer.innerHTML = '';
    
    if (!currentChatId) {
        chatContainer.appendChild(welcomeScreen);
        return;
    }
    
    welcomeScreen.remove();
    
    const chat = conversations[currentChatId];
    if (!chat) return;
    
    chat.messages.forEach(msg => {
        addMessageToUI(msg.role, msg.content);
    });
    
    scrollToBottom();
}

// Generate a summary of the conversation for memory purposes
async function generateChatSummary(chat) {
    if (chat.messages.length < 4) {
        return ''; // Not enough messages to summarize yet
    }
    
    try {
        const API_KEY = await getAPIKey();
        const lastMessages = chat.messages.slice(-6); // Use last 6 messages for context
        
        const summaryPrompt = [
            {
                role: "system",
                content: "Berikan ringkasan singkat dari percakapan ini dalam 1-2 kalimat. Fokus pada topik utama dan informasi penting."
            },
            ...lastMessages
        ];
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: summaryPrompt,
                temperature: 0.7,
                max_tokens: 100
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('Failed to generate summary:', data.error?.message);
            return '';
        }
        
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error generating summary:', error);
        return '';
    }
}

async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Dismiss keyboard on mobile
    if (window.innerWidth <= 768) {
        messageInput.blur();
    }
    
    if (!currentChatId) {
        createNewChat();
    }
    
    addMessageToUI('user', message);
    
    const chat = conversations[currentChatId];
    chat.messages.push({
        role: 'user',
        content: message
    });
    
    // Update last active timestamp
    chat.lastActive = Date.now();
    
    if (chat.messages.length === 1) {
        chat.title = message.substring(0, 30);
        if (message.length > 30) chat.title += '...';
    }
    
    saveConversations();
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chat-message';
    typingIndicator.innerHTML = `
        <div class="message-ai">
            <div class="message-header">
                <img src="images/ai-avatar.png" alt="AI" class="avatar" id="aiAvatar">
                <strong>Sorachio</strong>
            </div>
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingIndicator);
    scrollToBottom();
    
    isProcessing = true;
    try {
        const response = await getAIResponse(chat);
        
        chatContainer.removeChild(typingIndicator);
        
        addMessageToUI('assistant', response);
        chat.messages.push({
            role: 'assistant',
            content: response
        });
        
        // Generate/update conversation summary after every 4 messages
        if (chat.messages.length % 4 === 0) {
            chat.summary = await generateChatSummary(chat);
        }
        
        saveConversations();
    } catch (error) {
        console.error('Error getting AI response:', error);
        
        chatContainer.removeChild(typingIndicator);
        
        addMessageToUI('assistant', 'Sorry, I encountered an error. Please try again later.');
    } finally {
        isProcessing = false;
        scrollToBottom();
    }
}

function addMessageToUI(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-user">
                <div class="message-header">
                    <img src="images/user-avatar.png" alt="User" class="avatar" id="userAvatar">
                    <strong>You</strong>
                </div>
                <div class="message-content">${escapeHtml(content)}</div>
            </div>
        `;
    } else {
        
        const tempDiv = document.createElement('div');
        
        const mathPlaceholders = [];
        let processedContent = content;
        
        processedContent = processedContent.replace(/\$\$([\s\S]*?)\$\$/g, function(match, p1, offset) {
            const placeholder = `__MATH_DISPLAY_${mathPlaceholders.length}__`;
            mathPlaceholders.push({
                placeholder: placeholder,
                content: match,
                isDisplay: true
            });
            return placeholder;
        });
        
        processedContent = processedContent.replace(/\$([^\$\n]+?)\$/g, function(match, p1, offset) {
            const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
            mathPlaceholders.push({
                placeholder: placeholder,
                content: match,
                isDisplay: false
            });
            return placeholder;
        });

        processedContent = processedContent.replace(/\\int/g, '$\\int$');
        processedContent = processedContent.replace(/\\frac/g, '$\\frac$');
        processedContent = processedContent.replace(/\\cdot/g, '$\\cdot$');
        
        tempDiv.innerHTML = marked.parse(processedContent);
        
        const restoreContent = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                let content = node.textContent;
                let changed = false;
                
                for (const placeholderObj of mathPlaceholders) {
                    if (content.includes(placeholderObj.placeholder)) {
                        changed = true;
                        content = content.replace(placeholderObj.placeholder, placeholderObj.content);
                    }
                }
                
                if (changed) {
                    node.textContent = content;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from(node.childNodes).forEach(restoreContent);
            }
        };
        
        restoreContent(tempDiv);
        
        messageDiv.innerHTML = `
            <div class="message-ai">
                <div class="message-header">
                    <img src="images/ai-avatar.png" alt="AI" class="avatar" id="aiAvatar">
                    <strong>Sorachio</strong>
                </div>
                <div class="message-content markdown-body">${tempDiv.innerHTML}</div>
            </div>
        `;
    }
    
    chatContainer.appendChild(messageDiv);
    
    messageDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
    
    if (role === 'assistant') {
        try {
            renderMathInElement(messageDiv.querySelector('.message-content'), {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false,
                output: 'html',
                trust: true,
                strict: false
            });
        } catch (error) {
            console.error('Error rendering math:', error);
        }
    }
    
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function getAIResponse(chat) {
    // Create a context window with memory of past conversations
    let contextMessages = [];
    
    // Include conversation summary if available to provide memory context
    if (chat.summary) {
        contextMessages.push({
            role: "system",
            content: `Ringkasan percakapan sebelumnya: ${chat.summary}`
        });
    }
    
    // Add system prompt
    contextMessages.push({
        role: "system",
        content: "Kamu adalah Sorachio, asisten AI yang diciptakan oleh Izzul Fahmi sebagai proyek pribadi nya, yang membantu pengguna dengan informasi dan percakapan yang ramah. jika user ingin tahu lebih lanjut maka arahkan le https://github.com/IzzulGod untuk info lebih lanjut terkait proyek ini."
    });
    
    // Get messages for context window
    let messagesToInclude;
    if (chat.messages.length <= MEMORY_LIMIT * 2) {
        // If message count is small, include all messages
        messagesToInclude = chat.messages;
    } else {
        // Otherwise, use first 2 messages + last (MEMORY_LIMIT*2-2) messages
        const firstMessages = chat.messages.slice(0, 2);
        const recentMessages = chat.messages.slice(-(MEMORY_LIMIT * 2 - 2));
        messagesToInclude = [...firstMessages, ...recentMessages];
    }
    
    // Add conversation messages
    contextMessages = [
        ...contextMessages,
        ...messagesToInclude.map(msg => ({
            role: msg.role,
            content: msg.content
        }))
    ];
    
    const API_KEY = await getAPIKey();
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: contextMessages,
            temperature: 0.7,
            max_tokens: 2000
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get response');
    }
    
    return data.choices[0].message.content;
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

function customizeLogo(logoUrl) {
    const mainLogo = document.getElementById('mainLogo');
    const headerLogo = document.getElementById('headerLogo');
    
    if (mainLogo) mainLogo.src = logoUrl;
    if (headerLogo) headerLogo.src = logoUrl;
}

function customizeAvatars(userAvatarUrl, aiAvatarUrl) {
    const userAvatars = document.querySelectorAll('#userAvatar');
    const aiAvatars = document.querySelectorAll('#aiAvatar');
    
    userAvatars.forEach(avatar => {
        avatar.src = userAvatarUrl;
    });
    
    aiAvatars.forEach(avatar => {
        avatar.src = aiAvatarUrl;
    });
}

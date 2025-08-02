class SerialDebugger {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.sendMode = 'text';
        this.receiveMode = 'text';
        this.autoSendInterval = null;
        this.receiveBuffer = '';
        this.isPaused = false;
        
        // Statistics
        this.recvBytesCount = 0;
        this.sentBytesCount = 0;
        this.dataRateTimer = null;
        this.lastDataTime = Date.now();
        
        // Quick commands
        this.customQuickCommands = [];
        this.commandHistory = [];
        this.historyIndex = -1;

        this.initializeElements();
        this.checkBrowserCompatibility();
        this.bindEvents();
        this.loadSettings();
    }

    initializeElements() {
        this.elements = {
            compatibilityWarning: document.getElementById('compatibilityWarning'),
            connectionStatus: document.getElementById('connectionStatus'),
            baudRate: document.getElementById('baudRate'),
            dataBits: document.getElementById('dataBits'),
            stopBits: document.getElementById('stopBits'),
            parity: document.getElementById('parity'),
            flowControl: document.getElementById('flowControl'),
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            sendInput: document.getElementById('sendInput'),
            sendBtn: document.getElementById('sendBtn'),
            sendModeText: document.getElementById('sendModeText'),
            sendModeHex: document.getElementById('sendModeHex'),
            receiveModeText: document.getElementById('receiveModeText'),
            receiveModeHex: document.getElementById('receiveModeHex'),
            receiveDisplay: document.getElementById('receiveDisplay'),
            clearReceiveBtn: document.getElementById('clearReceiveBtn'),
            saveDataBtn: document.getElementById('saveDataBtn'),
            addNewline: document.getElementById('addNewline'),
            autoSend: document.getElementById('autoSend'),
            autoSendInterval: document.getElementById('autoSendInterval'),
            showTimestamp: document.getElementById('showTimestamp'),
            autoScroll: document.getElementById('autoScroll'),
            pauseReceive: document.getElementById('pauseReceive'),
            charCount: document.getElementById('charCount'),
            themeToggle: document.getElementById('themeToggle'),
            
            // New elements
            recvBytes: document.getElementById('recvBytes'),
            sentBytes: document.getElementById('sentBytes'),
            dataRate: document.getElementById('dataRate'),
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            newQuickCmd: document.getElementById('newQuickCmd'),
            addQuickCmd: document.getElementById('addQuickCmd'),
            quickButtons: document.getElementById('quickButtons'),
            exportConfigBtn: document.getElementById('exportConfigBtn'),
            importConfigBtn: document.getElementById('importConfigBtn')
        };
    }

    checkBrowserCompatibility() {
        if (!('serial' in navigator)) {
            this.elements.compatibilityWarning.style.display = 'block';
            this.elements.connectBtn.disabled = true;
            return false;
        }
        return true;
    }

    bindEvents() {
        this.elements.connectBtn.addEventListener('click', () => this.connectSerial());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnectSerial());
        this.elements.sendBtn.addEventListener('click', () => this.sendData());
        this.elements.sendInput.addEventListener('input', () => this.updateCharCount());
        this.elements.sendInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.sendData();
            } else if (e.key === 'ArrowUp' && this.commandHistory.length > 0) {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown' && this.commandHistory.length > 0) {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });

        this.elements.sendModeText.addEventListener('click', () => this.setSendMode('text'));
        this.elements.sendModeHex.addEventListener('click', () => this.setSendMode('hex'));
        this.elements.receiveModeText.addEventListener('click', () => this.setReceiveMode('text'));
        this.elements.receiveModeHex.addEventListener('click', () => this.setReceiveMode('hex'));

        this.elements.clearReceiveBtn.addEventListener('click', () => this.clearReceiveData());
        this.elements.saveDataBtn.addEventListener('click', () => this.saveData());

        this.elements.autoSend.addEventListener('change', () => this.toggleAutoSend());
        this.elements.pauseReceive.addEventListener('change', () => this.togglePauseReceive());

        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

        // New event bindings
        this.elements.searchBtn.addEventListener('click', () => this.searchData());
        this.elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.searchData();
            }
        });
        
        this.elements.addQuickCmd.addEventListener('click', () => this.addQuickCommand());
        this.elements.newQuickCmd.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addQuickCommand();
            }
        });
        
        this.elements.exportConfigBtn.addEventListener('click', () => this.exportConfig());
        this.elements.importConfigBtn.addEventListener('click', () => this.importConfig());

        this.bindQuickCommandEvents();
    }

    bindQuickCommandEvents() {
        this.elements.quickButtons.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-btn')) {
                const cmd = e.target.getAttribute('data-cmd');
                this.elements.sendInput.value = cmd;
                this.updateCharCount();
                
                // Add to history
                this.addToHistory(cmd);
                
                // Remove button if it's a custom command
                if (e.target.classList.contains('custom-cmd')) {
                    if (confirm(`删除快捷命令 "${cmd}"?`)) {
                        this.removeQuickCommand(cmd);
                    }
                }
            }
        });
    }


    async connectSerial() {
        try {
            this.port = await navigator.serial.requestPort();
            
            const config = {
                baudRate: parseInt(this.elements.baudRate.value),
                dataBits: parseInt(this.elements.dataBits.value),
                stopBits: parseInt(this.elements.stopBits.value),
                parity: this.elements.parity.value,
                flowControl: this.elements.flowControl.value
            };

            await this.port.open(config);
            
            this.writer = this.port.writable.getWriter();
            this.reader = this.port.readable.getReader();
            
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.startReading();
            this.startDataRateMonitoring();
            
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 串口连接成功\n`, 'system');
            
        } catch (error) {
            console.error('连接串口失败:', error);
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 连接失败: ${error.message}\n`, 'error');
        }
    }

    async disconnectSerial() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            if (this.autoSendInterval) {
                clearInterval(this.autoSendInterval);
                this.autoSendInterval = null;
                this.elements.autoSend.checked = false;
            }
            
            if (this.dataRateTimer) {
                clearInterval(this.dataRateTimer);
                this.dataRateTimer = null;
            }
            
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 串口已断开连接\n`, 'system');
            
        } catch (error) {
            console.error('断开连接失败:', error);
        }
    }

    updateConnectionStatus(connected) {
        const status = this.elements.connectionStatus;
        const dot = status.querySelector('.status-dot');
        const text = status.querySelector('span:last-child');
        
        if (connected) {
            status.className = 'status-indicator status-connected';
            text.textContent = '已连接';
            this.elements.connectBtn.disabled = true;
            this.elements.disconnectBtn.disabled = false;
            this.elements.sendBtn.disabled = false;
        } else {
            status.className = 'status-indicator status-disconnected';
            text.textContent = '未连接';
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
            this.elements.sendBtn.disabled = true;
        }
    }

    async startReading() {
        try {
            while (this.port.readable && this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                if (!this.isPaused) {
                    this.processReceivedData(value);
                }
            }
        } catch (error) {
            console.error('读取数据失败:', error);
            if (this.isConnected) {
                this.addToReceiveDisplay(`[${this.getTimestamp()}] 读取错误: ${error.message}\n`, 'error');
            }
        }
    }

    processReceivedData(data) {
        // Update statistics
        this.recvBytesCount += data.length;
        this.lastDataTime = Date.now();
        this.updateStatistics();
        
        const timestamp = this.elements.showTimestamp.checked ? `[${this.getTimestamp()}] ` : '';
        
        if (this.receiveMode === 'hex') {
            const hexString = Array.from(data, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            this.addToReceiveDisplay(`${timestamp}${hexString}\n`, 'data');
        } else {
            const textDecoder = new TextDecoder();
            const text = textDecoder.decode(data);
            this.addToReceiveDisplay(`${timestamp}${text}`, 'data');
        }
    }

    addToReceiveDisplay(text, type = 'data') {
        const display = this.elements.receiveDisplay;
        
        const span = document.createElement('span');
        span.textContent = text;
        
        switch (type) {
            case 'system':
                span.style.color = '#00bfff';
                break;
            case 'error':
                span.style.color = '#ff4444';
                break;
            case 'data':
            default:
                span.style.color = '#00ff00';
                break;
        }
        
        display.appendChild(span);
        
        if (this.elements.autoScroll.checked) {
            display.scrollTop = display.scrollHeight;
        }
    }

    async sendData() {
        if (!this.isConnected || !this.writer) {
            alert('请先连接串口设备');
            return;
        }

        const input = this.elements.sendInput.value.trim();
        if (!input) {
            alert('请输入要发送的数据');
            return;
        }

        try {
            let dataToSend;
            
            if (this.sendMode === 'hex') {
                if (!this.isValidHex(input)) {
                    alert('HEX格式无效，请输入有效的十六进制数据（如：48 65 6C 6C 6F）');
                    return;
                }
                dataToSend = this.hexStringToBytes(input);
            } else {
                const encoder = new TextEncoder();
                let textToSend = input;
                if (this.elements.addNewline.checked) {
                    textToSend += '\r\n';
                }
                dataToSend = encoder.encode(textToSend);
            }

            await this.writer.write(dataToSend);
            
            // Update statistics
            this.sentBytesCount += dataToSend.length;
            this.lastDataTime = Date.now();
            this.updateStatistics();
            
            // Add to command history
            this.addToHistory(input);
            
            const timestamp = this.elements.showTimestamp.checked ? `[${this.getTimestamp()}] ` : '';
            const displayText = this.sendMode === 'hex' ? input : input + (this.elements.addNewline.checked ? '\\r\\n' : '');
            this.addToReceiveDisplay(`${timestamp}>> ${displayText}\n`, 'system');
            
        } catch (error) {
            console.error('发送数据失败:', error);
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 发送失败: ${error.message}\n`, 'error');
        }
    }

    isValidHex(hexString) {
        const cleanHex = hexString.replace(/\s+/g, '');
        return /^[0-9A-Fa-f]*$/.test(cleanHex) && cleanHex.length % 2 === 0;
    }

    hexStringToBytes(hexString) {
        const cleanHex = hexString.replace(/\s+/g, '');
        const bytes = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
        }
        return bytes;
    }

    setSendMode(mode) {
        this.sendMode = mode;
        this.elements.sendModeText.classList.toggle('active', mode === 'text');
        this.elements.sendModeHex.classList.toggle('active', mode === 'hex');
        
        const placeholder = mode === 'hex' ? 
            '输入十六进制数据（如：48 65 6C 6C 6F）...' : 
            '输入要发送的数据...';
        this.elements.sendInput.placeholder = placeholder;
    }

    setReceiveMode(mode) {
        this.receiveMode = mode;
        this.elements.receiveModeText.classList.toggle('active', mode === 'text');
        this.elements.receiveModeHex.classList.toggle('active', mode === 'hex');
    }

    updateCharCount() {
        const text = this.elements.sendInput.value;
        const count = this.sendMode === 'hex' ? 
            text.replace(/\s+/g, '').length / 2 : 
            text.length;
        this.elements.charCount.textContent = `${Math.floor(count)} ${this.sendMode === 'hex' ? '字节' : '字符'}`;
    }

    toggleAutoSend() {
        if (this.elements.autoSend.checked) {
            const interval = parseInt(this.elements.autoSendInterval.value) || 1000;
            this.autoSendInterval = setInterval(() => {
                if (this.isConnected && this.elements.sendInput.value.trim()) {
                    this.sendData();
                }
            }, interval);
            this.elements.autoSendInterval.disabled = false;
        } else {
            if (this.autoSendInterval) {
                clearInterval(this.autoSendInterval);
                this.autoSendInterval = null;
            }
            this.elements.autoSendInterval.disabled = true;
        }
    }

    togglePauseReceive() {
        this.isPaused = this.elements.pauseReceive.checked;
    }

    clearReceiveData() {
        if (confirm('确定要清空接收数据吗？')) {
            this.elements.receiveDisplay.innerHTML = '';
        }
    }

    async saveData() {
        const data = this.elements.receiveDisplay.textContent;
        if (!data.trim()) {
            alert('没有数据可保存');
            return;
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `serial_data_${timestamp}.txt`;
            
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 数据已保存到 ${filename}\n`, 'system');
            
        } catch (error) {
            console.error('保存数据失败:', error);
            alert('保存数据失败');
        }
    }

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        this.elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('darkTheme', isDark);
    }

    loadSettings() {
        const isDark = localStorage.getItem('darkTheme') === 'true';
        if (isDark) {
            document.body.classList.add('dark-theme');
            this.elements.themeToggle.textContent = '☀️';
        }

        const savedBaudRate = localStorage.getItem('baudRate');
        if (savedBaudRate) {
            this.elements.baudRate.value = savedBaudRate;
        }

        const savedShowTimestamp = localStorage.getItem('showTimestamp');
        if (savedShowTimestamp !== null) {
            this.elements.showTimestamp.checked = savedShowTimestamp === 'true';
        }

        const savedAutoScroll = localStorage.getItem('autoScroll');
        if (savedAutoScroll !== null) {
            this.elements.autoScroll.checked = savedAutoScroll === 'true';
        }

        // Load additional settings
        this.loadQuickCommands();
        this.loadCommandHistory();
    }

    saveSettings() {
        localStorage.setItem('baudRate', this.elements.baudRate.value);
        localStorage.setItem('showTimestamp', this.elements.showTimestamp.checked);
        localStorage.setItem('autoScroll', this.elements.autoScroll.checked);
    }

    getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('zh-CN', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }

    // New methods for data statistics
    startDataRateMonitoring() {
        this.dataRateTimer = setInterval(() => {
            this.updateDataRate();
        }, 1000);
    }

    updateDataRate() {
        const now = Date.now();
        const timeDiff = (now - this.lastDataTime) / 1000; // seconds
        
        if (timeDiff > 0) {
            const rate = Math.round((this.recvBytesCount + this.sentBytesCount) / timeDiff);
            this.elements.dataRate.textContent = rate;
        } else {
            this.elements.dataRate.textContent = '0';
        }
    }

    updateStatistics() {
        this.elements.recvBytes.textContent = this.recvBytesCount;
        this.elements.sentBytes.textContent = this.sentBytesCount;
    }

    // New methods for search functionality
    searchData() {
        const searchTerm = this.elements.searchInput.value.trim().toLowerCase();
        if (!searchTerm) {
            alert('请输入搜索内容');
            return;
        }

        const display = this.elements.receiveDisplay;
        const text = display.textContent;
        
        if (text.toLowerCase().includes(searchTerm)) {
            // Simple highlight implementation
            const highlightedText = text.replace(
                new RegExp(searchTerm, 'gi'),
                match => `🔍${match}🔍`
            );
            display.textContent = highlightedText;
            
            // Scroll to first occurrence
            const firstMatch = text.toLowerCase().indexOf(searchTerm);
            if (firstMatch !== -1) {
                display.scrollTop = firstMatch * 10; // Approximate scroll position
            }
            
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 找到 ${searchTerm} 的匹配项\n`, 'system');
        } else {
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 未找到 "${searchTerm}"\n`, 'system');
        }
    }

    // New methods for quick commands
    addQuickCommand() {
        const cmd = this.elements.newQuickCmd.value.trim();
        if (!cmd) {
            alert('请输入快捷命令');
            return;
        }

        if (this.customQuickCommands.includes(cmd)) {
            alert('该命令已存在');
            return;
        }

        this.customQuickCommands.push(cmd);
        this.renderQuickCommands();
        this.elements.newQuickCmd.value = '';
        this.saveQuickCommands();
    }

    removeQuickCommand(cmd) {
        const index = this.customQuickCommands.indexOf(cmd);
        if (index > -1) {
            this.customQuickCommands.splice(index, 1);
            this.renderQuickCommands();
            this.saveQuickCommands();
        }
    }

    renderQuickCommands() {
        // Clear existing custom commands
        const existingCustom = this.elements.quickButtons.querySelectorAll('.custom-cmd');
        existingCustom.forEach(btn => btn.remove());

        // Add custom commands
        this.customQuickCommands.forEach(cmd => {
            const btn = document.createElement('button');
            btn.className = 'quick-btn custom-cmd';
            btn.setAttribute('data-cmd', cmd);
            btn.textContent = cmd;
            btn.title = '点击使用，再次点击删除';
            this.elements.quickButtons.appendChild(btn);
        });
    }

    saveQuickCommands() {
        localStorage.setItem('customQuickCommands', JSON.stringify(this.customQuickCommands));
    }

    loadQuickCommands() {
        const saved = localStorage.getItem('customQuickCommands');
        if (saved) {
            this.customQuickCommands = JSON.parse(saved);
            this.renderQuickCommands();
        }
    }

    // New methods for command history
    addToHistory(command) {
        if (!this.commandHistory.includes(command)) {
            this.commandHistory.unshift(command);
            if (this.commandHistory.length > 50) { // Keep last 50 commands
                this.commandHistory.pop();
            }
            this.historyIndex = -1;
            this.saveCommandHistory();
        }
    }

    navigateHistory(direction) {
        if (direction === -1) { // Up arrow
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
            }
        } else { // Down arrow
            if (this.historyIndex > 0) {
                this.historyIndex--;
            } else if (this.historyIndex === 0) {
                this.historyIndex = -1;
                this.elements.sendInput.value = '';
                return;
            }
        }

        if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length) {
            this.elements.sendInput.value = this.commandHistory[this.historyIndex];
            this.updateCharCount();
        }
    }

    saveCommandHistory() {
        localStorage.setItem('commandHistory', JSON.stringify(this.commandHistory));
    }

    loadCommandHistory() {
        const saved = localStorage.getItem('commandHistory');
        if (saved) {
            this.commandHistory = JSON.parse(saved);
        }
    }

    // Configuration import/export methods
    exportConfig() {
        const config = {
            serialSettings: {
                baudRate: this.elements.baudRate.value,
                dataBits: this.elements.dataBits.value,
                stopBits: this.elements.stopBits.value,
                parity: this.elements.parity.value,
                flowControl: this.elements.flowControl.value
            },
            displaySettings: {
                showTimestamp: this.elements.showTimestamp.checked,
                autoScroll: this.elements.autoScroll.checked,
                darkTheme: document.body.classList.contains('dark-theme')
            },
            customQuickCommands: this.customQuickCommands,
            commandHistory: this.commandHistory,
            exportTime: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_config_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addToReceiveDisplay(`[${this.getTimestamp()}] 配置已导出\n`, 'system');
    }

    async importConfig() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            const file = await new Promise((resolve) => {
                input.onchange = (e) => resolve(e.target.files[0]);
                input.click();
            });

            if (!file) return;

            const text = await file.text();
            const config = JSON.parse(text);

            // Validate config structure
            if (!config.serialSettings || !config.displaySettings) {
                throw new Error('无效的配置文件格式');
            }

            // Apply serial settings
            if (config.serialSettings.baudRate) {
                this.elements.baudRate.value = config.serialSettings.baudRate;
            }
            if (config.serialSettings.dataBits) {
                this.elements.dataBits.value = config.serialSettings.dataBits;
            }
            if (config.serialSettings.stopBits) {
                this.elements.stopBits.value = config.serialSettings.stopBits;
            }
            if (config.serialSettings.parity) {
                this.elements.parity.value = config.serialSettings.parity;
            }
            if (config.serialSettings.flowControl) {
                this.elements.flowControl.value = config.serialSettings.flowControl;
            }

            // Apply display settings
            if (config.displaySettings.showTimestamp !== undefined) {
                this.elements.showTimestamp.checked = config.displaySettings.showTimestamp;
            }
            if (config.displaySettings.autoScroll !== undefined) {
                this.elements.autoScroll.checked = config.displaySettings.autoScroll;
            }
            if (config.displaySettings.darkTheme !== undefined) {
                const isDark = config.displaySettings.darkTheme;
                document.body.classList.toggle('dark-theme', isDark);
                this.elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
            }

            // Apply custom commands
            if (config.customQuickCommands && Array.isArray(config.customQuickCommands)) {
                this.customQuickCommands = config.customQuickCommands;
                this.renderQuickCommands();
                this.saveQuickCommands();
            }

            // Apply command history
            if (config.commandHistory && Array.isArray(config.commandHistory)) {
                this.commandHistory = config.commandHistory;
                this.saveCommandHistory();
            }

            this.saveSettings();
            this.addToReceiveDisplay(`[${this.getTimestamp()}] 配置已导入\n`, 'system');

        } catch (error) {
            console.error('导入配置失败:', error);
            alert('导入配置失败: ' + error.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const serialDebugger = new SerialDebugger();
    
    window.addEventListener('beforeunload', () => {
        serialDebugger.saveSettings();
        if (serialDebugger.isConnected) {
            serialDebugger.disconnectSerial();
        }
    });

    console.log('Chrome 串口调试助手已初始化');
    console.log('支持的功能: Web Serial API, HEX/文本模式, 自动发送, 数据保存等');
});
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
            themeToggle: document.getElementById('themeToggle')
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

        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cmd = e.target.getAttribute('data-cmd');
                this.elements.sendInput.value = cmd;
                this.updateCharCount();
            });
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
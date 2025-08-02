class SerialDebugger {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.checkBrowserSupport();
    }
    
    initializeElements() {
        // 连接相关元素
        this.connectBtn = document.getElementById('connect-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.statusElement = document.getElementById('status');
        
        // 串口配置元素
        this.baudrateSelect = document.getElementById('baudrate');
        this.databitsSelect = document.getElementById('databits');
        this.stopbitsSelect = document.getElementById('stopbits');
        this.paritySelect = document.getElementById('parity');
        
        // 接收相关元素
        this.receiveDataElement = document.getElementById('receive-data');
        this.timestampToggle = document.getElementById('timestamp-toggle');
        this.autoScrollToggle = document.getElementById('auto-scroll');
        this.clearReceiveBtn = document.getElementById('clear-receive');
        
        // 发送相关元素
        this.sendDataElement = document.getElementById('send-data');
        this.sendModeElements = document.querySelectorAll('input[name="send-mode"]');
        this.autoNewlineToggle = document.getElementById('auto-newline');
        this.charCountElement = document.getElementById('char-count');
        this.sendBtn = document.getElementById('send-btn');
        this.clearSendBtn = document.getElementById('clear-send');
    }
    
    attachEventListeners() {
        // 连接控制
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        // 接收控制
        this.clearReceiveBtn.addEventListener('click', () => this.clearReceiveData());
        
        // 发送控制
        this.sendBtn.addEventListener('click', () => this.sendData());
        this.clearSendBtn.addEventListener('click', () => this.clearSendData());
        
        // 字符计数
        this.sendDataElement.addEventListener('input', () => this.updateCharCount());
        
        // 发送模式切换
        this.sendModeElements.forEach(element => {
            element.addEventListener('change', () => this.updateCharCount());
        });
    }
    
    checkBrowserSupport() {
        if (!('serial' in navigator)) {
            this.updateStatus('浏览器不支持 Web Serial API', 'error');
            this.connectBtn.disabled = true;
            alert('您的浏览器不支持 Web Serial API。请使用 Chrome 89+ 或 Edge 89+。');
        }
    }
    
    async connect() {
        try {
            // 请求串口权限
            this.port = await navigator.serial.requestPort();
            
            // 获取串口配置
            const options = {
                baudRate: parseInt(this.baudrateSelect.value),
                dataBits: parseInt(this.databitsSelect.value),
                stopBits: parseFloat(this.stopbitsSelect.value),
                parity: this.paritySelect.value
            };
            
            // 打开串口
            await this.port.open(options);
            this.isConnected = true;
            
            // 更新UI状态
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;
            this.updateStatus('已连接', 'connected');
            
            // 启动数据接收
            this.startReading();
            
        } catch (error) {
            console.error('连接失败:', error);
            this.updateStatus(`连接失败: ${error.message}`, 'error');
        }
    }
    
    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
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
        this.connectBtn.disabled = false;
        this.disconnectBtn.disabled = true;
        this.updateStatus('未连接', 'disconnected');
    }
    
    async startReading() {
        if (!this.port || !this.port.readable) return;
        
        try {
            this.reader = this.port.readable.getReader();
            
            while (this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                // 处理接收到的数据
                this.handleReceivedData(value);
            }
        } catch (error) {
            console.error('读取数据时出错:', error);
            this.updateStatus(`读取错误: ${error.message}`, 'error');
        } finally {
            if (this.reader) {
                this.reader.releaseLock();
                this.reader = null;
            }
        }
    }
    
    handleReceivedData(data) {
        // 将接收到的数据转换为字符串
        const text = new TextDecoder().decode(data);
        
        // 添加时间戳（如果启用）
        let displayText = text;
        if (this.timestampToggle.checked) {
            const timestamp = new Date().toLocaleTimeString();
            displayText = `[${timestamp}] ${text}`;
        }
        
        // 显示数据
        const div = document.createElement('div');
        div.textContent = displayText;
        this.receiveDataElement.appendChild(div);
        
        // 自动滚动
        if (this.autoScrollToggle.checked) {
            this.receiveDataElement.scrollTop = this.receiveDataElement.scrollHeight;
        }
    }
    
    async sendData() {
        if (!this.isConnected || !this.port || !this.port.writable) {
            alert('请先连接串口');
            return;
        }
        
        const data = this.sendDataElement.value;
        if (!data) return;
        
        try {
            // 获取发送模式
            const sendMode = document.querySelector('input[name="send-mode"]:checked').value;
            
            let buffer;
            if (sendMode === 'hex') {
                // HEX模式发送
                buffer = this.hexStringToBuffer(data);
            } else {
                // 文本模式发送
                let text = data;
                if (this.autoNewlineToggle.checked) {
                    text += '\n';
                }
                buffer = new TextEncoder().encode(text);
            }
            
            // 发送数据
            if (!this.writer) {
                this.writer = this.port.writable.getWriter();
            }
            
            await this.writer.write(buffer);
        } catch (error) {
            console.error('发送数据时出错:', error);
            alert(`发送失败: ${error.message}`);
        }
    }
    
    hexStringToBuffer(hexString) {
        // 移除空格并转换为大写
        const hex = hexString.replace(/\s/g, '').toUpperCase();
        
        // 验证HEX格式
        if (!/^[0-9A-F]*$/.test(hex) || hex.length % 2 !== 0) {
            throw new Error('无效的HEX格式');
        }
        
        // 转换为字节数组
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        
        return bytes;
    }
    
    updateStatus(message, type = 'info') {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${type}`;
    }
    
    updateCharCount() {
        const data = this.sendDataElement.value;
        const sendMode = document.querySelector('input[name="send-mode"]:checked').value;
        
        let count;
        if (sendMode === 'hex') {
            // HEX模式下计算字节数
            const hex = data.replace(/\s/g, '');
            count = hex.length / 2;
        } else {
            // 文本模式下计算字符数
            count = data.length;
        }
        
        this.charCountElement.textContent = `字符数: ${count}`;
    }
    
    clearReceiveData() {
        this.receiveDataElement.innerHTML = '';
    }
    
    clearSendData() {
        this.sendDataElement.value = '';
        this.updateCharCount();
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.serialDebugger = new SerialDebugger();
});
class SerialDebugAssistant {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.receiveBuffer = [];
        this.receivePaused = false;
        this.recvBytesCount = 0;
        this.sentBytesCount = 0;
        this.connectStartTime = null;
        this.connectTimer = null;
        
        this.initElements();
        this.bindEvents();
        this.checkBrowserCompatibility();
    }

    initElements() {
        // 连接控制元素
        this.baudRateSelect = document.getElementById('baudRate');
        this.dataBitsSelect = document.getElementById('dataBits');
        this.stopBitsSelect = document.getElementById('stopBits');
        this.paritySelect = document.getElementById('parity');
        this.flowControlSelect = document.getElementById('flowControl');
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.statusText = document.getElementById('statusText');

        // 接收区域元素
        this.receiveArea = document.getElementById('receiveArea');
        this.hexDisplayCheckbox = document.getElementById('hexDisplay');
        this.autoScrollCheckbox = document.getElementById('autoScroll');
        this.showTimestampCheckbox = document.getElementById('showTimestamp');
        this.clearReceiveBtn = document.getElementById('clearReceiveBtn');
        this.saveReceiveBtn = document.getElementById('saveReceiveBtn');
        this.pauseReceiveBtn = document.getElementById('pauseReceiveBtn');

        // 发送区域元素
        this.sendArea = document.getElementById('sendArea');
        this.hexSendCheckbox = document.getElementById('hexSend');
        this.appendNewlineCheckbox = document.getElementById('appendNewline');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearSendBtn = document.getElementById('clearSendBtn');
        this.charCountSpan = document.getElementById('charCount');

        // 快捷命令元素
        this.cmdButtons = document.querySelectorAll('.cmd-btn');

        // 统计元素
        this.recvBytesSpan = document.getElementById('recvBytes');
        this.sentBytesSpan = document.getElementById('sentBytes');
        this.connectTimeSpan = document.getElementById('connectTime');
    }

    bindEvents() {
        // 连接控制事件
        this.connectBtn.addEventListener('click', () => this.connectSerial());
        this.disconnectBtn.addEventListener('click', () => this.disconnectSerial());

        // 接收区域事件
        this.hexDisplayCheckbox.addEventListener('change', () => this.updateReceiveDisplay());
        this.clearReceiveBtn.addEventListener('click', () => this.clearReceiveArea());
        this.saveReceiveBtn.addEventListener('click', () => this.saveReceiveData());
        this.pauseReceiveBtn.addEventListener('click', () => this.togglePauseReceive());

        // 发送区域事件
        this.sendArea.addEventListener('input', () => this.updateCharCount());
        this.sendArea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.sendData();
            }
        });
        this.sendBtn.addEventListener('click', () => this.sendData());
        this.clearSendBtn.addEventListener('click', () => this.clearSendArea());

        // 快捷命令事件
        this.cmdButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.getAttribute('data-cmd');
                this.insertCommand(cmd);
            });
        });
    }

    checkBrowserCompatibility() {
        if (!('serial' in navigator)) {
            this.showError('您的浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+ 浏览器');
            this.connectBtn.disabled = true;
            return false;
        }
        return true;
    }

    async connectSerial() {
        try {
            if (!this.checkBrowserCompatibility()) return;

            const options = {
                baudRate: parseInt(this.baudRateSelect.value),
                dataBits: parseInt(this.dataBitsSelect.value),
                stopBits: parseInt(this.stopBitsSelect.value),
                parity: this.paritySelect.value,
                flowControl: this.flowControlSelect.value === 'hardware' ? 'hardware' : 
                             this.flowControlSelect.value === 'software' ? 'software' : 'none'
            };

            this.port = await navigator.serial.requestPort();
            await this.port.open(options);

            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();

            this.isConnected = true;
            this.connectStartTime = Date.now();
            this.startConnectionTimer();
            this.startReading();

            this.updateConnectionStatus();
            this.addLogMessage('串口连接成功', 'info');

        } catch (error) {
            this.showError(`连接失败: ${error.message}`);
        }
    }

    async disconnectSerial() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }

            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.isConnected = false;
            this.stopConnectionTimer();
            this.updateConnectionStatus();
            this.addLogMessage('串口已断开连接', 'info');

        } catch (error) {
            this.showError(`断开连接失败: ${error.message}`);
        }
    }

    async startReading() {
        while (this.isConnected && this.reader) {
            try {
                const { value, done } = await this.reader.read();
                if (done) break;

                this.receiveBuffer.push(...value);
                this.recvBytesCount += value.length;
                this.updateStatistics();

                if (!this.receivePaused) {
                    this.displayReceivedData(value);
                }

            } catch (error) {
                if (error.name === 'NetworkError') {
                    this.addLogMessage('串口读取错误，连接可能已断开', 'error');
                    await this.disconnectSerial();
                    break;
                }
            }
        }
    }

    displayReceivedData(data) {
        const timestamp = this.showTimestampCheckbox.checked ? 
            `[${new Date().toLocaleTimeString()}] ` : '';
        
        let displayText = '';
        
        if (this.hexDisplayCheckbox.checked) {
            displayText = Array.from(data)
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
        } else {
            displayText = new TextDecoder().decode(data);
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'data-receive';
        messageElement.innerHTML = `<span class="timestamp">${timestamp}</span>${displayText}`;
        
        this.receiveArea.appendChild(messageElement);

        if (this.autoScrollCheckbox.checked) {
            this.receiveArea.scrollTop = this.receiveArea.scrollHeight;
        }
    }

    async sendData() {
        if (!this.isConnected || !this.writer) {
            this.showError('串口未连接');
            return;
        }

        const data = this.sendArea.value.trim();
        if (!data) {
            this.showError('发送数据为空');
            return;
        }

        try {
            let sendData;
            
            if (this.hexSendCheckbox.checked) {
                // HEX 模式发送
                const hexString = data.replace(/\s/g, '');
                if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
                    this.showError('HEX 格式错误');
                    return;
                }
                
                sendData = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            } else {
                // 字符串模式发送
                sendData = new TextEncoder().encode(data);
            }

            // 添加换行符
            if (this.appendNewlineCheckbox.checked) {
                const newlineData = new TextEncoder().encode('\r\n');
                const combinedData = new Uint8Array(sendData.length + newlineData.length);
                combinedData.set(sendData);
                combinedData.set(newlineData, sendData.length);
                sendData = combinedData;
            }

            await this.writer.write(sendData);
            this.sentBytesCount += sendData.length;
            this.updateStatistics();

            // 显示发送的数据
            this.displaySentData(data);

        } catch (error) {
            this.showError(`发送失败: ${error.message}`);
        }
    }

    displaySentData(data) {
        const timestamp = this.showTimestampCheckbox.checked ? 
            `[${new Date().toLocaleTimeString()}] ` : '';
        
        let displayText = '';
        
        if (this.hexSendCheckbox.checked) {
            displayText = data.replace(/\s/g, '').match(/.{1,2}/g).join(' ').toUpperCase();
        } else {
            displayText = data;
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'data-send';
        messageElement.innerHTML = `<span class="timestamp">${timestamp}</span>>> ${displayText}`;
        
        this.receiveArea.appendChild(messageElement);

        if (this.autoScrollCheckbox.checked) {
            this.receiveArea.scrollTop = this.receiveArea.scrollHeight;
        }
    }

    updateConnectionStatus() {
        if (this.isConnected) {
            this.statusText.textContent = '已连接';
            this.statusText.className = 'connected';
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;
        } else {
            this.statusText.textContent = '未连接';
            this.statusText.className = '';
            this.connectBtn.disabled = false;
            this.disconnectBtn.disabled = true;
        }
    }

    updateReceiveDisplay() {
        // 重新解析和显示接收到的数据
        const currentData = this.receiveBuffer;
        this.receiveBuffer = [];
        this.displayReceivedData(currentData);
    }

    updateCharCount() {
        const count = this.sendArea.value.length;
        this.charCountSpan.textContent = count;
    }

    clearReceiveArea() {
        this.receiveArea.innerHTML = '';
        this.receiveBuffer = [];
    }

    clearSendArea() {
        this.sendArea.value = '';
        this.updateCharCount();
    }

    togglePauseReceive() {
        this.receivePaused = !this.receivePaused;
        this.pauseReceiveBtn.textContent = this.receivePaused ? '恢复接收' : '暂停接收';
        this.receiveArea.classList.toggle('paused', this.receivePaused);
    }

    insertCommand(command) {
        const currentText = this.sendArea.value;
        const newText = currentText ? currentText + '\n' + command : command;
        this.sendArea.value = newText;
        this.updateCharCount();
        this.sendArea.focus();
    }

    saveReceiveData() {
        const data = this.receiveArea.innerText;
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    startConnectionTimer() {
        this.connectTimer = setInterval(() => {
            if (this.connectStartTime) {
                const elapsed = Date.now() - this.connectStartTime;
                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                this.connectTimeSpan.textContent = 
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopConnectionTimer() {
        if (this.connectTimer) {
            clearInterval(this.connectTimer);
            this.connectTimer = null;
        }
    }

    updateStatistics() {
        this.recvBytesSpan.textContent = this.recvBytesCount.toLocaleString();
        this.sentBytesSpan.textContent = this.sentBytesCount.toLocaleString();
    }

    addLogMessage(message, type = 'info') {
        const timestamp = `[${new Date().toLocaleTimeString()}] `;
        const messageElement = document.createElement('div');
        messageElement.className = `data-${type}`;
        messageElement.innerHTML = `<span class="timestamp">${timestamp}</span>${message}`;
        
        this.receiveArea.appendChild(messageElement);

        if (this.autoScrollCheckbox.checked) {
            this.receiveArea.scrollTop = this.receiveArea.scrollHeight;
        }
    }

    showError(message) {
        this.addLogMessage(message, 'error');
        // 也可以考虑使用 alert 或者更友好的通知方式
        console.error(message);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new SerialDebugAssistant();
});
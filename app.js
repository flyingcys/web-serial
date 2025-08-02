class SerialDebugger {
    constructor() {
        this.serialManager = new SerialPortManager();
        this.receiveBuffer = '';
        this.sendHistory = [];
        this.customCommands = this.loadCustomCommands();
        this.receiveBytes = 0;
        this.sendBytes = 0;
        this.loopSendInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
        this.loadSettings();
        this.updateCustomCommandsList();
        
        // 监听串口连接状态变化
        this.serialManager.addConnectionListener((type, port) => {
            this.log(`串口状态变化: ${type}`, 'info');
            if (type === 'disconnect') {
                this.handleDisconnection();
            }
        });

        // 检查浏览器兼容性
        this.checkBrowserCompatibility();
    }

    setupEventListeners() {
        // 连接控制
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());
        document.getElementById('refreshPorts').addEventListener('click', () => this.refreshPorts());

        // 数据接收控制
        document.getElementById('clearReceive').addEventListener('click', () => this.clearReceive());
        document.getElementById('saveReceive').addEventListener('click', () => this.saveReceive());
        document.getElementById('showTimestamp').addEventListener('change', () => this.updateSettings());
        document.getElementById('autoScroll').addEventListener('change', () => this.updateSettings());
        
        // 数据发送控制
        document.getElementById('sendBtn').addEventListener('click', () => this.sendData());
        document.getElementById('clearSend').addEventListener('click', () => this.clearSend());
        document.getElementById('sendText').addEventListener('input', () => this.updateCharCount());
        document.getElementById('loopSend').addEventListener('change', () => this.toggleLoopSend());

        // 快捷命令
        document.querySelectorAll('.quick-cmd').forEach(btn => {
            btn.addEventListener('click', (e) => this.useQuickCommand(e.target.dataset.cmd));
        });
        document.getElementById('addCustomCmd').addEventListener('click', () => this.addCustomCommand());
        document.getElementById('customCmd').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addCustomCommand();
        });

        // 日志控制
        document.getElementById('clearLog').addEventListener('click', () => this.clearLog());
        document.getElementById('saveLog').addEventListener('click', () => this.saveLog());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                if (this.serialManager.isConnected) {
                    this.sendData();
                }
            }
        });
    }

    async checkBrowserCompatibility() {
        if (!('serial' in navigator)) {
            this.log('当前浏览器不支持Web Serial API，请使用Chrome 89+版本', 'error');
            document.getElementById('connectBtn').disabled = true;
            return false;
        }
        
        // 检查是否在HTTPS环境下运行
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            this.log('Web Serial API需要在HTTPS环境下运行', 'error');
            document.getElementById('connectBtn').disabled = true;
            return false;
        }

        this.log('浏览器兼容性检查通过', 'success');
        return true;
    }

    async refreshPorts() {
        try {
            const result = await this.serialManager.getPorts();
            if (result.success) {
                this.updatePortList(result.ports);
                this.log(`已找到 ${result.ports.length} 个串口设备`, 'info');
            } else {
                this.log(`获取串口列表失败: ${result.error}`, 'error');
            }
        } catch (error) {
            this.log(`刷新串口列表失败: ${error.message}`, 'error');
        }
    }

    updatePortList(ports) {
        const select = document.getElementById('portSelect');
        select.innerHTML = '<option value="">请选择串口设备</option>';
        
        ports.forEach((port, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `串口 ${index + 1}`;
            select.appendChild(option);
        });
    }

    async connect() {
        try {
            this.log('正在连接串口...', 'info');
            
            const config = {
                baudRate: parseInt(document.getElementById('baudRate').value),
                dataBits: parseInt(document.getElementById('dataBits').value),
                stopBits: parseInt(document.getElementById('stopBits').value),
                parity: document.getElementById('parity').value,
                flowControl: document.getElementById('flowControl').value
            };

            const result = await this.serialManager.connect(config);
            
            if (result.success) {
                this.log('串口连接成功', 'success');
                this.startReading();
                this.updateConnectionStatus(true);
                this.saveSettings();
            } else {
                this.log(`连接失败: ${result.error}`, 'error');
                this.updateConnectionStatus(false);
            }
        } catch (error) {
            this.log(`连接错误: ${error.message}`, 'error');
            this.updateConnectionStatus(false);
        }
    }

    async disconnect() {
        try {
            this.log('正在断开连接...', 'info');
            
            // 停止循环发送
            if (this.loopSendInterval) {
                clearInterval(this.loopSendInterval);
                this.loopSendInterval = null;
            }

            const result = await this.serialManager.disconnect();
            
            if (result.success) {
                this.log('串口已断开连接', 'info');
                this.updateConnectionStatus(false);
            } else {
                this.log(`断开连接失败: ${result.error}`, 'error');
            }
        } catch (error) {
            this.log(`断开连接错误: ${error.message}`, 'error');
        }
    }

    handleDisconnection() {
        this.updateConnectionStatus(false);
        this.log('串口设备已断开', 'warning');
        
        // 停止循环发送
        if (this.loopSendInterval) {
            clearInterval(this.loopSendInterval);
            this.loopSendInterval = null;
        }
    }

    async startReading() {
        if (!this.serialManager.isConnected) return;

        try {
            while (this.serialManager.isConnected) {
                const data = await this.serialManager.readData();
                if (data !== null) {
                    this.receiveData(data);
                }
            }
        } catch (error) {
            if (error.message !== '串口未连接') {
                this.log(`读取数据错误: ${error.message}`, 'error');
                this.disconnect();
            }
        }
    }

    receiveData(data) {
        const receiveMode = document.querySelector('input[name="receiveMode"]:checked').value;
        const showTimestamp = document.getElementById('showTimestamp').checked;
        
        let displayData = '';
        
        if (receiveMode === 'hex') {
            // 转换为十六进制显示
            const bytes = new TextEncoder().encode(data);
            displayData = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        } else {
            // 文本模式
            displayData = data;
        }

        // 添加时间戳
        if (showTimestamp) {
            const timestamp = new Date().toLocaleTimeString();
            displayData = `[${timestamp}] ${displayData}`;
        }

        // 添加到接收区
        const receiveText = document.getElementById('receiveText');
        receiveText.value += displayData;
        
        // 自动滚动
        if (document.getElementById('autoScroll').checked) {
            receiveText.scrollTop = receiveText.scrollHeight;
        }

        // 更新统计
        this.receiveBytes += data.length;
        document.getElementById('receiveBytes').textContent = this.receiveBytes;
    }

    async sendData() {
        if (!this.serialManager.isConnected) {
            this.log('请先连接串口', 'warning');
            return;
        }

        try {
            const sendText = document.getElementById('sendText').value;
            if (!sendText.trim()) {
                this.log('请输入要发送的数据', 'warning');
                return;
            }

            const sendMode = document.querySelector('input[name="sendMode"]:checked').value;
            const addNewline = document.getElementById('addNewline').checked;
            
            let dataToSend = sendText;
            if (addNewline && !sendText.endsWith('\n')) {
                dataToSend += '\n';
            }

            let result;
            if (sendMode === 'hex') {
                result = await this.serialManager.writeHexData(dataToSend);
            } else {
                result = await this.serialManager.writeData(dataToSend);
            }

            if (result.success) {
                this.sendBytes += result.bytes;
                this.log(`发送成功: ${result.bytes} 字节`, 'success');
                
                // 添加到发送历史
                this.addToSendHistory(sendText);
            }
        } catch (error) {
            this.log(`发送失败: ${error.message}`, 'error');
        }
    }

    toggleLoopSend() {
        const loopSend = document.getElementById('loopSend').checked;
        const loopIntervalLabel = document.getElementById('loopIntervalLabel');
        
        if (loopSend) {
            loopIntervalLabel.style.display = 'inline';
            this.startLoopSend();
        } else {
            loopIntervalLabel.style.display = 'none';
            this.stopLoopSend();
        }
    }

    startLoopSend() {
        if (!this.serialManager.isConnected) {
            this.log('请先连接串口', 'warning');
            document.getElementById('loopSend').checked = false;
            return;
        }

        const interval = parseInt(document.getElementById('loopInterval').value) || 1000;
        
        this.loopSendInterval = setInterval(() => {
            if (this.serialManager.isConnected) {
                this.sendData();
            } else {
                this.stopLoopSend();
            }
        }, interval);

        this.log(`开始循环发送，间隔: ${interval}ms`, 'info');
    }

    stopLoopSend() {
        if (this.loopSendInterval) {
            clearInterval(this.loopSendInterval);
            this.loopSendInterval = null;
            document.getElementById('loopSend').checked = false;
            this.log('停止循环发送', 'info');
        }
    }

    useQuickCommand(cmd) {
        document.getElementById('sendText').value = cmd;
        this.updateCharCount();
        if (this.serialManager.isConnected) {
            this.sendData();
        }
    }

    addCustomCommand() {
        const input = document.getElementById('customCmd');
        const cmd = input.value.trim();
        
        if (cmd && !this.customCommands.includes(cmd)) {
            this.customCommands.push(cmd);
            this.saveCustomCommands();
            this.updateCustomCommandsList();
            input.value = '';
            this.log(`添加自定义命令: ${cmd}`, 'success');
        }
    }

    removeCustomCommand(cmd) {
        const index = this.customCommands.indexOf(cmd);
        if (index > -1) {
            this.customCommands.splice(index, 1);
            this.saveCustomCommands();
            this.updateCustomCommandsList();
            this.log(`删除自定义命令: ${cmd}`, 'info');
        }
    }

    updateCustomCommandsList() {
        const container = document.getElementById('customCmdList');
        container.innerHTML = '';
        
        this.customCommands.forEach(cmd => {
            const item = document.createElement('div');
            item.className = 'custom-cmd-item';
            item.innerHTML = `
                <span>${cmd}</span>
                <button onclick="debuggerApp.useQuickCommand('${cmd}')">发送</button>
                <button onclick="debuggerApp.removeCustomCommand('${cmd}')">×</button>
            `;
            container.appendChild(item);
        });
    }

    addToSendHistory(text) {
        if (!this.sendHistory.includes(text)) {
            this.sendHistory.unshift(text);
            if (this.sendHistory.length > 50) {
                this.sendHistory.pop();
            }
        }
    }

    updateCharCount() {
        const text = document.getElementById('sendText').value;
        document.getElementById('charCount').textContent = text.length;
    }

    updateConnectionStatus(connected) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const sendBtn = document.getElementById('sendBtn');

        if (connected) {
            statusIndicator.classList.add('connected');
            statusText.textContent = '已连接';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            sendBtn.disabled = false;
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = '未连接';
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            sendBtn.disabled = true;
        }
    }

    clearReceive() {
        document.getElementById('receiveText').value = '';
        this.receiveBytes = 0;
        document.getElementById('receiveBytes').textContent = '0';
        this.log('已清空接收区', 'info');
    }

    clearSend() {
        document.getElementById('sendText').value = '';
        this.updateCharCount();
        this.log('已清空发送区', 'info');
    }

    clearLog() {
        document.getElementById('logText').value = '';
    }

    async saveReceive() {
        const data = document.getElementById('receiveText').value;
        if (!data.trim()) {
            this.log('接收区为空，无需保存', 'warning');
            return;
        }

        try {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `receive_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            this.log('接收数据已保存', 'success');
        } catch (error) {
            this.log(`保存失败: ${error.message}`, 'error');
        }
    }

    async saveLog() {
        const data = document.getElementById('logText').value;
        if (!data.trim()) {
            this.log('日志为空，无需保存', 'warning');
            return;
        }

        try {
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            this.log('日志已保存', 'success');
        } catch (error) {
            this.log(`保存失败: ${error.message}`, 'error');
        }
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logText = document.getElementById('logText');
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
        
        logText.value += `[${timestamp}] ${prefix} ${message}\n`;
        logText.scrollTop = logText.scrollHeight;
        
        // 限制日志大小
        const lines = logText.value.split('\n');
        if (lines.length > 1000) {
            logText.value = lines.slice(-500).join('\n');
        }
    }

    saveSettings() {
        const settings = {
            baudRate: document.getElementById('baudRate').value,
            dataBits: document.getElementById('dataBits').value,
            stopBits: document.getElementById('stopBits').value,
            parity: document.getElementById('parity').value,
            flowControl: document.getElementById('flowControl').value,
            showTimestamp: document.getElementById('showTimestamp').checked,
            autoScroll: document.getElementById('autoScroll').checked,
            addNewline: document.getElementById('addNewline').checked,
            customCommands: this.customCommands
        };
        
        localStorage.setItem('serialDebuggerSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('serialDebuggerSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                document.getElementById('baudRate').value = settings.baudRate || '115200';
                document.getElementById('dataBits').value = settings.dataBits || '8';
                document.getElementById('stopBits').value = settings.stopBits || '1';
                document.getElementById('parity').value = settings.parity || 'none';
                document.getElementById('flowControl').value = settings.flowControl || 'none';
                document.getElementById('showTimestamp').checked = settings.showTimestamp || false;
                document.getElementById('autoScroll').checked = settings.autoScroll !== false;
                document.getElementById('addNewline').checked = settings.addNewline || false;
                this.customCommands = settings.customCommands || [];
            } catch (error) {
                console.error('加载设置失败:', error);
            }
        }
    }

    loadCustomCommands() {
        const saved = localStorage.getItem('serialDebuggerCustomCommands');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (error) {
                console.error('加载自定义命令失败:', error);
            }
        }
        return ['AT', 'AT+GMR', 'AT+RST', 'AT+CWMODE?', 'AT+CWLAP'];
    }

    saveCustomCommands() {
        localStorage.setItem('serialDebuggerCustomCommands', JSON.stringify(this.customCommands));
    }

    updateUI() {
        // 更新UI状态
        this.updateCharCount();
        this.updateConnectionStatus(false);
        this.refreshPorts();
    }
}

// 初始化应用
let debuggerApp;
document.addEventListener('DOMContentLoaded', () => {
    debuggerApp = new SerialDebugger();
    
    // 添加主题切换功能
    const themeToggle = document.createElement('button');
    themeToggle.textContent = '🌙';
    themeToggle.className = 'btn-small';
    themeToggle.style.position = 'fixed';
    themeToggle.style.top = '20px';
    themeToggle.style.right = '20px';
    themeToggle.style.zIndex = '1000';
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', newTheme);
    });
    
    document.body.appendChild(themeToggle);
    
    // 加载保存的主题
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
});
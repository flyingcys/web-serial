class SerialPortManager {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.readBuffer = '';
    }

    async requestPort() {
        try {
            if (!('serial' in navigator)) {
                throw new Error('当前浏览器不支持Web Serial API，请使用Chrome 89+版本');
            }

            this.port = await navigator.serial.requestPort();
            return { success: true, port: this.port };
        } catch (error) {
            console.error('请求串口设备失败:', error);
            return { success: false, error: error.message };
        }
    }

    async getPorts() {
        try {
            if (!('serial' in navigator)) {
                throw new Error('当前浏览器不支持Web Serial API');
            }

            const ports = await navigator.serial.getPorts();
            return { success: true, ports: ports };
        } catch (error) {
            console.error('获取串口列表失败:', error);
            return { success: false, error: error.message };
        }
    }

    async connect(options = {}) {
        if (!this.port) {
            const result = await this.requestPort();
            if (!result.success) {
                return result;
            }
            this.port = result.port;
        }

        try {
            const config = {
                baudRate: options.baudRate || 115200,
                dataBits: options.dataBits || 8,
                stopBits: options.stopBits || 1,
                parity: options.parity || 'none',
                flowControl: options.flowControl || 'none'
            };

            await this.port.open(config);
            
            // 创建读取器和写入器
            const decoder = new TextDecoderStream();
            this.readableStreamClosed = this.port.readable.pipeTo(decoder.writable);
            this.reader = decoder.readable.getReader();

            const encoder = new TextEncoderStream();
            this.writableStreamClosed = encoder.readable.pipeTo(this.port.writable);
            this.writer = encoder.writable.getWriter();

            this.isConnected = true;
            
            console.log('串口连接成功:', {
                port: this.port,
                config: config
            });

            return { success: true, port: this.port };
        } catch (error) {
            console.error('串口连接失败:', error);
            return { success: false, error: error.message };
        }
    }

    async disconnect() {
        if (!this.isConnected) {
            return { success: true };
        }

        try {
            this.isConnected = false;

            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed.catch(() => {});
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.close();
                await this.writableStreamClosed;
                this.writer = null;
            }

            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            console.log('串口已断开连接');
            return { success: true };
        } catch (error) {
            console.error('断开连接失败:', error);
            return { success: false, error: error.message };
        }
    }

    async readData() {
        if (!this.isConnected || !this.reader) {
            throw new Error('串口未连接');
        }

        try {
            const { value, done } = await this.reader.read();
            if (done) {
                console.log('串口读取完成');
                return null;
            }
            return value;
        } catch (error) {
            console.error('读取数据失败:', error);
            throw error;
        }
    }

    async writeData(data) {
        if (!this.isConnected || !this.writer) {
            throw new Error('串口未连接');
        }

        try {
            await this.writer.write(data);
            return { success: true, bytes: data.length };
        } catch (error) {
            console.error('发送数据失败:', error);
            throw error;
        }
    }

    async writeHexData(hexString) {
        try {
            // 移除空格和特殊字符
            const cleanHex = hexString.replace(/\s+/g, '');
            
            // 验证HEX格式
            if (!/^[0-9A-Fa-f]*$/.test(cleanHex)) {
                throw new Error('无效的HEX格式');
            }

            // 确保是偶数个字符
            if (cleanHex.length % 2 !== 0) {
                throw new Error('HEX字符串长度必须为偶数');
            }

            // 转换为字节数组
            const bytes = [];
            for (let i = 0; i < cleanHex.length; i += 2) {
                bytes.push(parseInt(cleanHex.substr(i, 2), 16));
            }

            const uint8Array = new Uint8Array(bytes);
            await this.writer.write(uint8Array);
            
            return { success: true, bytes: bytes.length };
        } catch (error) {
            console.error('发送HEX数据失败:', error);
            throw error;
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            port: this.port
        };
    }

    // 获取串口信息
    async getPortInfo() {
        if (!this.port) {
            return null;
        }

        try {
            const info = await this.port.getInfo();
            return {
                usbVendorId: info.usbVendorId,
                usbProductId: info.usbProductId,
                ...info
            };
        } catch (error) {
            console.error('获取串口信息失败:', error);
            return null;
        }
    }

    // 监听串口连接状态变化
    addConnectionListener(callback) {
        if (navigator.serial) {
            navigator.serial.addEventListener('connect', (event) => {
                console.log('串口已连接:', event.target);
                if (callback) callback('connect', event.target);
            });

            navigator.serial.addEventListener('disconnect', (event) => {
                console.log('串口已断开:', event.target);
                if (callback) callback('disconnect', event.target);
            });
        }
    }
}

// 导出供全局使用
window.SerialPortManager = SerialPortManager;
const axios = require('axios');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36';

async function get(url, params, headers) {
    let response;
    try {
        response = await axios.get(url, { params: params || {},
            headers: Object.assign({ 'User-Agent': UA }, headers), timeout: 15000 });
    } catch (_) {
        throw new Error('音源请求失败，请检查网络或稍后重试');
    }
    if (!response || response.data == null || response.data === '') throw new Error('音源返回空响应');
    return response.data;
}

function zero(data) {
    if (!data || typeof data !== 'object' || data.code !== 0) throw new Error('音源接口失败或响应结构异常');
    return data;
}

function searchInput(query, page, type, supported = ['music']) {
    const text = String(query == null ? '' : query).trim();
    if (!text || (type && !supported.includes(type))) return '';
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('搜索页码必须是从 1 开始的整数');
    return text;
}

function clean(value) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return String(value || '').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
        function (match, code) {
            if (code[0] !== '#') return entities[code.toLowerCase()];
            const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
            return point <= 0x10ffff ? String.fromCodePoint(point) : match;
        }).trim();
}

function httpUrl(value) {
    let url;
    try { url = new URL(value); } catch (_) { throw new Error('音源地址格式无效'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('音源地址协议无效');
    return url.toString();
}

function inputUrl(value, hosts) {
    const url = new URL(httpUrl(value));
    if (!hosts.includes(url.hostname) || url.port) throw new Error('请使用该平台的单曲完整链接，短链接需先展开');
    return url;
}

function decodeBase64(value) {
    if (typeof value !== 'string') throw new Error('歌词编码结构异常');
    const encoded = value.replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error('歌词 Base64 编码异常');
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0;
    let count = 0;
    let escaped = '';
    for (const char of encoded.replace(/=+$/, '')) {
        bits = (bits << 6) | chars.indexOf(char);
        count += 6;
        if (count >= 8) {
            count -= 8;
            escaped += '%' + ((bits >> count) & 255).toString(16).padStart(2, '0');
        }
    }
    try { return decodeURIComponent(escaped); } catch (_) { throw new Error('歌词 UTF-8 编码异常'); }
}

module.exports = { get, zero, searchInput, clean, httpUrl, inputUrl, decodeBase64 };

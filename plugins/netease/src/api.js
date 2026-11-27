const axios = require('axios');

const BASE_URL = 'https://music.163.com';
const HEADERS = { Referer: BASE_URL + '/' };

async function request(path, params) {
    let response;
    try {
        response = await axios.get(BASE_URL + path, {
            params,
            headers: HEADERS,
            timeout: 15000,
        });
    } catch (_) {
        throw new Error('网易云请求失败，请检查网络或稍后重试（可能超时或受到接口限制）');
    }
    const data = response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('网易云响应结构异常');
    }
    if (data.code !== 200) {
        const code = Number.isFinite(Number(data.code)) ? Number(data.code) : '未知';
        throw new Error('网易云接口失败，错误码：' + code);
    }
    return data;
}

module.exports = { request, HEADERS };

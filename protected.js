
(async () => {
    'use strict';

    // =============================================================
    // CẤU HÌNH
    // =============================================================
    const CONFIG = {
        API_SERVER: 'https://tcbinh.kdns.fr',
        PASSWORD: 'KataBump@2012',
        PREFIX: 'kbump',
        START_URL: 'https://dashboard.katabump.com/auth/login',
        CHECK_INTERVAL: 1500,
        MAX_OTP_WAIT: 30,
        TEMPMAIL_API: 'https://api.tempmail.lol/v3',
        BASIC_LIMIT: 25,
        RATE_LIMIT_WAIT: 3000,
        STORAGE_KEY: 'auth_jwt_token',
        OCR_API_KEY: 'K88322501988957',
        OCR_URL: 'https://api.ocr.space/parse/image',
        FORCE_LOWERCASE: true,
        // =============================================================
        // QUẢN LÝ TRẠNG THÁI - ĐẢM BẢO KHÔNG BỎ SÓT BƯỚC
        // =============================================================
        STATE: {
            AUTHENTICATED: false,        // BƯỚC 1: Đã xác thực key
            EMAIL_CREATED: false,        // BƯỚC 2.1: Đã tạo email
            FORM_FILLED: false,          // BƯỚC 2.2: Đã điền form
            CLOUDFLARE_DONE: false,      // BƯỚC 2.3: Đã verify Cloudflare
            OTP_RECEIVED: false,         // BƯỚC 2.4: Đã nhận OTP
            ACCOUNT_CREATED: false,      // BƯỚC 2.5: Đã tạo tài khoản
            CAPTCHA_SOLVED: false,       // BƯỚC 3.1: Đã giải captcha
            CAPTCHA_FILLED: false,       // BƯỚC 3.2: Đã điền captcha
            CAPTCHA_VERIFIED: false,     // BƯỚC 3.3: Đã click Verify
            SERVER_CREATED: false,       // BƯỚC 3.4: Đã tạo server
        }
    };

    // =============================================================
    // UTILITIES
    // =============================================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randStr = (len = 6) => Array(len).fill().map(() => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const FIRST_NAMES = ["James","John","Robert","Michael","William","David","Richard","Joseph"];
    const LAST_NAMES = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis"];

    const getToken = () => GM_getValue(CONFIG.STORAGE_KEY, null);
    const saveToken = (t) => GM_setValue(CONFIG.STORAGE_KEY, t);
    const clearToken = () => { GM_setValue(CONFIG.STORAGE_KEY, null); GM_setValue('auth_saved_key', null); };

    const parseJwt = (token) => {
        try {
            const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = (4 - (base64.length % 4)) % 4;
            return JSON.parse(atob(base64.padEnd(base64.length + pad, '=')));
        } catch { return null; }
    };

    const isTokenValid = (token) => {
        if (!token) return false;
        const payload = parseJwt(token);
        return payload && payload.exp && payload.exp > Math.floor(Date.now() / 1000) + 10;
    };

    const toast = (msg, color = 'linear-gradient(135deg,#0078d4,#4ac0ff)', dur = 4000) => {
        let container = $('#kb-toast');
        if (!container) {
            container = document.createElement('div');
            container.id = 'kb-toast';
            container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;font-family:Segoe UI,sans-serif;pointer-events:none;';
            document.documentElement.appendChild(container);
        }
        const el = document.createElement('div');
        el.style.cssText = `background:${color};color:#fff;padding:10px 18px;border-radius:12px;font-weight:600;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transform:translateY(-20px);transition:all .4s;pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.1);`;
        el.textContent = '🦈 ' + msg;
        el.onclick = () => el.remove();
        container.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, dur);
    };

    const log = (msg) => {
        const el = $('#kb-log');
        if (el) {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            el.innerHTML += `<br><span style="color:rgba(74,192,255,.2);">[${time}]</span> ${msg}`;
            el.scrollTop = el.scrollHeight;
        }
        console.log('[Shark]', msg);
    };

    // =============================================================
    // BƯỚC 1: XÁC THỰC KEY 🔑
    // =============================================================
    const authenticate = (key) => {
        return new Promise((resolve) => {
            let hwid = GM_getValue('auth_client_hwid', null);
            if (!hwid) {
                hwid = 'hwid_' + randStr(20);
                GM_setValue('auth_client_hwid', hwid);
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.API_SERVER + '/api/v1/auth',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ key, hwid }),
                timeout: 10000,
                onload: (r) => {
                    try {
                        const data = JSON.parse(r.responseText);
                        if (r.status === 200 && data.status === 'success') {
                            if (data.referral_link) GM_setValue('auth_referral_link', data.referral_link);
                            resolve({ success: true, token: data.token });
                        } else {
                            resolve({ success: false, error: data.detail || 'Xác thực thất bại' });
                        }
                    } catch { resolve({ success: false, error: 'Phản hồi server không hợp lệ' }); }
                },
                onerror: () => resolve({ success: false, error: 'Không kết nối được server' }),
                ontimeout: () => resolve({ success: false, error: 'Hết thời gian chờ' })
            });
        });
    };

    // =============================================================
    // MODAL NHẬP KEY
    // =============================================================
    const showAuthModal = (onSuccess) => {
        const style = document.createElement('style');
        style.textContent = `
            .shark-overlay {
                position: fixed;
                inset: 0;
                background: radial-gradient(ellipse at center, #0a1628 0%, #020812 100%);
                z-index: 9999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Segoe UI', system-ui, sans-serif;
                animation: sharkFadeIn .8s ease-out;
            }
            @keyframes sharkFadeIn {
                from { opacity: 0; transform: scale(.95) translateY(20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .shark-modal {
                background: linear-gradient(160deg, rgba(8,25,50,.95), rgba(2,12,30,.98));
                color: #e8f4f8;
                width: 100%;
                max-width: 420px;
                padding: 40px 32px 32px;
                border-radius: 24px;
                box-shadow: 0 20px 60px rgba(0,0,0,.8);
                border: 1px solid rgba(0,180,255,.12);
                text-align: center;
                backdrop-filter: blur(20px);
            }
            .shark-title {
                font-size: 32px;
                font-weight: 900;
                background: linear-gradient(135deg, #4ac0ff, #0078d4, #4ac0ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-size: 200% 200%;
                animation: sharkGrad 4s ease infinite;
            }
            @keyframes sharkGrad {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .shark-desc {
                font-size: 13px;
                color: rgba(255,255,255,.45);
                margin-bottom: 24px;
                line-height: 1.6;
            }
            .shark-input {
                width: 100%;
                padding: 14px 18px;
                background: rgba(0,20,50,.6);
                border: 1px solid rgba(74,192,255,.12);
                border-radius: 14px;
                color: #e8f4f8;
                font-size: 15px;
                outline: none;
                box-sizing: border-box;
                transition: all .4s ease;
            }
            .shark-input:focus {
                border-color: #4ac0ff;
                box-shadow: 0 0 0 4px rgba(74,192,255,.06);
                background: rgba(0,20,50,.8);
            }
            .shark-btn {
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, rgba(74,192,255,.15), rgba(0,120,212,.15));
                color: #fff;
                border: 1px solid rgba(74,192,255,.15);
                border-radius: 14px;
                font-size: 15px;
                font-weight: 700;
                cursor: pointer;
                transition: all .4s ease;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                margin-top: 8px;
            }
            .shark-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 40px rgba(74,192,255,.1);
            }
            .shark-error {
                color: #ff6b6b;
                font-size: 13px;
                margin-top: 12px;
                display: none;
                padding: 10px 14px;
                background: rgba(255,107,107,.06);
                border-radius: 10px;
                border: 1px solid rgba(255,107,107,.08);
            }
            .shark-loading {
                display: none;
                color: #4ac0ff;
                margin-top: 10px;
                font-size: 13px;
            }
            .shark-loading::after {
                content: '...';
                animation: dots 1.4s steps(4) infinite;
            }
            @keyframes dots {
                0% { content: ''; }
                25% { content: '.'; }
                50% { content: '..'; }
                75% { content: '...'; }
            }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.className = 'shark-overlay';
        overlay.innerHTML = `
            <div class="shark-modal">
                <div class="shark-title">🦈 KataBump</div>
                <div style="font-size:11px;color:rgba(74,192,255,.35);letter-spacing:3px;margin-bottom:16px;">PRO MAX + OCR</div>
                <div class="shark-desc">Nhập <strong style="color:rgba(74,192,255,.7);">Key kích hoạt</strong> để bắt đầu</div>
                <input class="shark-input" placeholder="Nhập key..." autofocus />
                <button class="shark-btn">KÍCH HOẠT</button>
                <div class="shark-loading">Đang xác thực</div>
                <div class="shark-error"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('.shark-input');
        const btn = overlay.querySelector('.shark-btn');
        const error = overlay.querySelector('.shark-error');
        const loading = overlay.querySelector('.shark-loading');

        const submit = async () => {
            const key = input.value.trim();
            if (!key) {
                error.textContent = 'Vui lòng nhập key';
                error.style.display = 'block';
                return;
            }
            error.style.display = 'none';
            loading.style.display = 'block';
            btn.disabled = true;
            input.disabled = true;

            const result = await authenticate(key);
            loading.style.display = 'none';
            btn.disabled = false;
            input.disabled = false;

            if (result.success) {
                saveToken(result.token);
                GM_setValue('auth_saved_key', key);
                CONFIG.STATE.AUTHENTICATED = true;
                log('✅ BƯỚC 1: XÁC THỰC KEY THÀNH CÔNG');
                overlay.remove();
                onSuccess();
            } else {
                error.textContent = '🦈 ' + result.error;
                error.style.display = 'block';
                log('❌ BƯỚC 1: XÁC THỰC KEY THẤT BẠI: ' + result.error);
            }
        };

        btn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        input.focus();
    };

    // =============================================================
    // BƯỚC 2: TỰ ĐỘNG ĐĂNG KÝ TÀI KHOẢN 📧
    // =============================================================
    let emailCount = 0;
    let minuteStart = Date.now();

    const createInbox = (prefix) => {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            if (now - minuteStart > 60000) { emailCount = 0; minuteStart = now; }
            if (emailCount >= CONFIG.BASIC_LIMIT) {
                setTimeout(() => createInbox(prefix).then(resolve).catch(reject), CONFIG.RATE_LIMIT_WAIT);
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.TEMPMAIL_API + '/inboxes',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ prefix: prefix || 'kbump_' + randStr(6) }),
                timeout: 10000,
                onload: (r) => {
                    try {
                        const data = JSON.parse(r.responseText);
                        if (data.address && data.token) {
                            emailCount++;
                            CONFIG.STATE.EMAIL_CREATED = true;
                            log('✅ BƯỚC 2.1: TẠO EMAIL THÀNH CÔNG: ' + data.address);
                            resolve(data);
                        } else reject(new Error('Invalid response'));
                    } catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    };

    const waitForOTP = (token, timeout) => {
        return new Promise((resolve) => {
            const url = CONFIG.TEMPMAIL_API + '/inboxes/' + token + '/wait?from=*@*&timeout=' + timeout;
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: (timeout + 5) * 1000,
                onload: (r) => {
                    try {
                        const data = JSON.parse(r.responseText);
                        if (data.emails?.length) {
                            const email = data.emails[0];
                            const combined = (email.subject || '') + ' ' + (email.body || '') + ' ' + (email.html || '');
                            const match = combined.match(/\b(\d{6})\b/);
                            if (match) {
                                CONFIG.STATE.OTP_RECEIVED = true;
                                log('✅ BƯỚC 2.4: NHẬN OTP THÀNH CÔNG: ' + match[1]);
                                resolve(match[1]);
                            } else resolve(null);
                        } else resolve(null);
                    } catch { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    };

    // =============================================================
    // BƯỚC 3: GIẢI CAPTCHA + ĐIỀN FORM + VERIFY 🤖
    // =============================================================
    function getOcrApiKey() {
        let key = GM_getValue("OCR_API_KEY", CONFIG.OCR_API_KEY);
        return (key || CONFIG.OCR_API_KEY).trim().replace(/["']/g, '');
    }

    function findCaptchaInput() {
        const inputs = Array.from(document.querySelectorAll('input'));
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const cls = (input.className || '').toLowerCase();

            if (name.indexOf('code') !== -1 || id.indexOf('code') !== -1 || placeholder.indexOf('code') !== -1 ||
                name.indexOf('captcha') !== -1 || id.indexOf('captcha') !== -1 || placeholder.indexOf('captcha') !== -1 || cls.indexOf('captcha') !== -1 ||
                (input.type === 'text' && !input.disabled)) {
                return input;
            }
        }
        return null;
    }

    function findAllCaptchaInputs() {
        const inputs = [];
        const allInputs = Array.from(document.querySelectorAll('input'));
        
        for (const input of allInputs) {
            const type = (input.type || '').toLowerCase();
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const cls = (input.className || '').toLowerCase();
            
            if (type === 'hidden' || type === 'submit' || type === 'button' || 
                type === 'checkbox' || type === 'radio' || input.disabled) {
                continue;
            }
            
            const isCaptcha = 
                name.includes('code') || id.includes('code') || placeholder.includes('code') ||
                name.includes('captcha') || id.includes('captcha') || placeholder.includes('captcha') || cls.includes('captcha') ||
                name.includes('security') || id.includes('security') ||
                name.includes('verification') || id.includes('verification') ||
                placeholder.includes('nhập mã') || placeholder.includes('mã xác nhận');
            
            if (isCaptcha || (type === 'text' && input.value === '' && input.offsetParent !== null)) {
                inputs.push(input);
            }
        }
        
        if (inputs.length === 0) {
            const form = document.querySelector('form');
            if (form) {
                const formInputs = form.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
                for (const input of formInputs) {
                    if (!input.disabled && input.value === '' && input.offsetParent !== null) {
                        inputs.push(input);
                    }
                }
            }
        }
        
        inputs.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            if (Math.abs(rectA.top - rectB.top) < 10) {
                return rectA.left - rectB.left;
            }
            return rectA.top - rectB.top;
        });
        
        return inputs;
    }

    function findCaptchaImage() {
        const targetInput = findCaptchaInput();
        if (targetInput) {
            let parent = targetInput.parentElement;
            for (let depth = 0; depth < 5 && parent; depth++) {
                const imgs = Array.from(parent.querySelectorAll('img, canvas'));
                for (let i = 0; i < imgs.length; i++) {
                    const img = imgs[i];
                    const src = (img.src || '').toLowerCase();
                    const cls = (img.className || '').toLowerCase();
                    const id = (img.id || '').toLowerCase();

                    if (src.indexOf('logo') !== -1 || cls.indexOf('logo') !== -1 || id.indexOf('logo') !== -1) {
                        continue;
                    }

                    const w = img.naturalWidth || img.width || 0;
                    const h = img.naturalHeight || img.height || 0;
                    if (w >= 40 && h >= 20) {
                        return img;
                    }
                }
                parent = parent.parentElement;
            }
        }

        const allImgs = Array.from(document.querySelectorAll('img, canvas'));
        for (let i = 0; i < allImgs.length; i++) {
            const img = allImgs[i];
            const src = (img.src || '').toLowerCase();
            const id = (img.id || '').toLowerCase();
            const cls = (img.className || '').toLowerCase();

            if (src.indexOf('logo') !== -1 || id.indexOf('logo') !== -1 || cls.indexOf('logo') !== -1) {
                continue;
            }

            if (src.indexOf('captcha') !== -1 || id.indexOf('captcha') !== -1 || cls.indexOf('captcha') !== -1 ||
                src.indexOf('security') !== -1 || src.indexOf('code') !== -1 ||
                (img.tagName === 'IMG' && img.width >= 80 && img.width <= 350 && img.height >= 25 && img.height <= 120)) {
                return img;
            }
        }
        return null;
    }

    function getImageBase64(imgElement) {
        return new Promise(function (resolve, reject) {
            try {
                const canvas = document.createElement('canvas');
                const width = imgElement.naturalWidth || imgElement.width || 180;
                const height = imgElement.naturalHeight || imgElement.height || 60;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/png').split(',')[1];
                resolve(base64);
            } catch (e) {
                reject(e);
            }
        });
    }

    function solveWithOCR(base64Image, targetLen) {
        if (!targetLen) targetLen = 5;
        return new Promise(function (resolve, reject) {
            const apiKey = getOcrApiKey();
            
            const url = CONFIG.OCR_URL;
            const formData = new FormData();
            formData.append('apikey', apiKey);
            formData.append('base64Image', 'data:image/png;base64,' + base64Image);
            formData.append('language', 'eng');
            formData.append('OCREngine', '2');
            formData.append('scale', 'true');
            formData.append('isTable', 'false');
            formData.append('filetype', 'PNG');

            function parseResponse(responseText) {
                try {
                    const json = JSON.parse(responseText);
                    if (json.IsErroredOnProcessing) {
                        reject('OCR lỗi: ' + json.ErrorMessage);
                        return null;
                    }
                    let text = '';
                    if (json.ParsedResults && json.ParsedResults.length > 0) {
                        text = json.ParsedResults[0].ParsedText || '';
                    }
                    const cleanText = text.replace(/[^A-Za-z0-9]/g, '');
                    if (cleanText.length >= targetLen) {
                        return cleanText.substring(0, targetLen);
                    }
                    if (cleanText.length > 0) {
                        return cleanText;
                    }
                } catch (e) {
                    log('❌ Lỗi parse response: ' + e.message);
                }
                return null;
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: { "Content-Type": "multipart/form-data" },
                data: formData,
                timeout: 30000,
                onload: function (res) {
                    if (res.status === 200) {
                        const code = parseResponse(res.responseText);
                        if (code) {
                            CONFIG.STATE.CAPTCHA_SOLVED = true;
                            log('✅ BƯỚC 3.1: GIẢI CAPTCHA THÀNH CÔNG: ' + code);
                            resolve(code);
                            return;
                        } else {
                            reject("Không thể parse captcha");
                        }
                    } else {
                        reject("Lỗi API: " + res.status);
                    }
                },
                onerror: function () {
                    reject("Không kết nối được OCR.Space");
                },
                ontimeout: function () {
                    reject("Timeout OCR.Space");
                }
            });
        });
    }

    async function typeLikeHuman(input, char) {
        input.focus();
        input.click();
        await sleep(100 + Math.random() * 150);
        
        if (input.value) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(50 + Math.random() * 50);
        }
        
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
        await sleep(30 + Math.random() * 40);
        input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
        await sleep(20 + Math.random() * 30);
        input.value = char;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30 + Math.random() * 40);
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
        await sleep(20 + Math.random() * 30);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // =============================================================
    // HÀM CHÍNH: GIẢI CAPTCHA + ĐIỀN + VERIFY
    // =============================================================
    async function solveAndFillCaptcha() {
        const img = findCaptchaImage();
        if (!img) {
            toast('❌ Không tìm thấy ảnh captcha', 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
            log('❌ BƯỚC 3.1: KHÔNG TÌM THẤY ẢNH CAPTCHA');
            return null;
        }
        log('✅ BƯỚC 3.1: ĐÃ TÌM THẤY ẢNH CAPTCHA');

        toast('📸 Đang giải captcha...', 'linear-gradient(135deg,#7c3aed,#4f46e5)');
        log('🔄 BƯỚC 3.1: ĐANG GIẢI CAPTCHA...');

        try {
            const base64Image = await getImageBase64(img);
            let result = await solveWithOCR(base64Image, 5);
            
            if (!result) {
                result = await solveWithOCR(base64Image, 5);
            }
            
            if (!result) {
                toast('❌ Không giải được captcha', 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
                log('❌ BƯỚC 3.1: GIẢI CAPTCHA THẤT BẠI');
                return null;
            }

            if (CONFIG.FORCE_LOWERCASE) {
                result = result.toLowerCase();
            }

            if (result.length !== 5) {
                if (result.length > 5) result = result.substring(0, 5);
                while (result.length < 5) result += 'x';
            }

            toast('✅ ' + result, 'linear-gradient(135deg,#00b894,#00d2a0)');
            log('✅ BƯỚC 3.1: GIẢI CAPTCHA THÀNH CÔNG: ' + result);

            // =============================================================
            // BƯỚC 3.2: ĐIỀN CAPTCHA VÀO FORM
            // =============================================================
            log('🔄 BƯỚC 3.2: ĐANG TÌM INPUT CAPTCHA...');
            const inputs = findAllCaptchaInputs();
            log('🔍 BƯỚC 3.2: TÌM THẤY ' + inputs.length + ' INPUT');

            if (inputs.length === 0) {
                toast('⚠️ Không tìm thấy input captcha', 'linear-gradient(135deg,#fdcb6e,#f9a825)');
                log('❌ BƯỚC 3.2: KHÔNG TÌM THẤY INPUT CAPTCHA');
                return result;
            }

            const chars = result.split('');
            const numInputs = inputs.length;
            const numChars = chars.length;

            log('📝 BƯỚC 3.2: CẦN ĐIỀN ' + numChars + ' KÝ TỰ: ' + chars.join(' '));

            for (const input of inputs) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await sleep(300);

            if (numInputs === numChars) {
                for (let i = 0; i < numInputs; i++) {
                    await typeLikeHuman(inputs[i], chars[i]);
                    if (i < numInputs - 1) await sleep(150 + Math.random() * 200);
                }
            } else if (numInputs > numChars) {
                for (let i = 0; i < numChars; i++) {
                    await typeLikeHuman(inputs[i], chars[i]);
                    await sleep(150 + Math.random() * 200);
                }
                for (let i = numChars; i < numInputs; i++) {
                    inputs[i].value = '';
                    inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                }
            } else {
                const charsPerInput = Math.ceil(numChars / numInputs);
                let charIndex = 0;
                for (let i = 0; i < numInputs; i++) {
                    let part = '';
                    for (let j = 0; j < charsPerInput && charIndex < numChars; j++) {
                        part += chars[charIndex];
                        charIndex++;
                    }
                    inputs[i].focus();
                    inputs[i].click();
                    await sleep(100);
                    inputs[i].value = part;
                    inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                    inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
                    log('   ✅ INPUT ' + (i+1) + ': "' + part + '"');
                    await sleep(200 + Math.random() * 200);
                }
            }

            CONFIG.STATE.CAPTCHA_FILLED = true;
            log('✅ BƯỚC 3.2: ĐIỀN CAPTCHA THÀNH CÔNG');

            // =============================================================
            // BƯỚC 3.3: TỰ ĐỘNG CLICK VERIFY
            // =============================================================
            await sleep(500);
            log('🔄 BƯỚC 3.3: ĐANG TÌM NÚT VERIFY...');

            let verifyBtn = null;
            const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a, div[role="button"], span[role="button"]'));

            for (const btn of allButtons) {
                const text = (btn.textContent || btn.value || '').trim();
                if (text === 'Verify' || text.toLowerCase() === 'verify') {
                    verifyBtn = btn;
                    break;
                }
            }

            if (!verifyBtn) {
                for (const btn of allButtons) {
                    const text = (btn.textContent || btn.value || '').toLowerCase();
                    if (text.includes('verify') || text.includes('xác nhận') || text.includes('confirm')) {
                        verifyBtn = btn;
                        break;
                    }
                }
            }

            if (verifyBtn) {
                verifyBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await sleep(300);
                verifyBtn.focus();
                verifyBtn.click();
                verifyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                verifyBtn.dispatchEvent(new Event('click', { bubbles: true }));
                CONFIG.STATE.CAPTCHA_VERIFIED = true;
                log('✅ BƯỚC 3.3: CLICK VERIFY THÀNH CÔNG');
                toast('✅ Đã click Verify!', 'linear-gradient(135deg,#00b894,#00d2a0)');
            } else {
                log('⚠️ BƯỚC 3.3: KHÔNG TÌM THẤY VERIFY, THỬ SUBMIT...');
                const submitBtn = allButtons.find(b => {
                    const text = (b.textContent || b.value || '').toLowerCase();
                    return text.includes('submit') || text.includes('gửi') || text.includes('tiếp tục');
                });
                if (submitBtn) {
                    submitBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    await sleep(300);
                    submitBtn.focus();
                    submitBtn.click();
                    log('✅ BƯỚC 3.3: CLICK SUBMIT THÀNH CÔNG');
                    toast('✅ Đã click Submit!', 'linear-gradient(135deg,#00b894,#00d2a0)');
                } else {
                    const form = document.querySelector('form');
                    if (form) {
                        form.submit();
                        log('✅ BƯỚC 3.3: SUBMIT FORM THÀNH CÔNG');
                        toast('✅ Đã submit form!', 'linear-gradient(135deg,#00b894,#00d2a0)');
                    } else {
                        log('❌ BƯỚC 3.3: KHÔNG TÌM THẤY NÚT NÀO');
                    }
                }
            }

            CONFIG.STATE.ACCOUNT_CREATED = true;
            log('✅ BƯỚC 2.5: TÀI KHOẢN ĐÃ ĐƯỢC TẠO');
            return result;

        } catch (e) {
            log('❌ LỖI: ' + e.message);
            toast('❌ Lỗi: ' + e.message, 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
            return null;
        }
    }

    // =============================================================
    // DOM HELPERS
    // =============================================================
    const setValue = (el, val) => {
        if (!el) return;
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
    };

    const click = (el) => {
        if (!el) return;
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
        el.focus();
        el.click();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new Event('click', { bubbles: true }));
        const evt = document.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        el.dispatchEvent(evt);
    };

    const checkTerms = () => {
        try {
            const selectors = [
                'input[type="checkbox"][id*="terms"]',
                'input[type="checkbox"][id*="accept"]',
                'input[type="checkbox"][name*="terms"]',
                'input[type="checkbox"][name*="accept"]'
            ];
            for (const sel of selectors) {
                const cb = document.querySelector(sel);
                if (cb && !cb.checked) { click(cb); return true; }
            }

            const labels = document.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.toLowerCase().includes('terms') || 
                    label.textContent.toLowerCase().includes('accept') ||
                    label.textContent.toLowerCase().includes('điều khoản')) {
                    const cb = label.querySelector('input[type="checkbox"]');
                    if (cb && !cb.checked) { click(cb); return true; }
                }
            }

            const cbs = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
            for (const cb of cbs) {
                const parent = cb.closest('div, label, p, li, span');
                if (parent && (parent.textContent.toLowerCase().includes('terms') || 
                              parent.textContent.toLowerCase().includes('accept') ||
                              parent.textContent.toLowerCase().includes('điều khoản'))) {
                    click(cb);
                    return true;
                }
            }

            if (cbs.length) { click(cbs[cbs.length - 1]); return true; }
            return false;
        } catch (e) { return false; }
    };

    const isCloudflareVerified = () => {
        try {
            const body = document.body.textContent || '';
            if (body.includes('Thành công!') || body.includes('Success!')) {
                for (const el of document.querySelectorAll('*')) {
                    const text = el.textContent || '';
                    if (text.includes('Thành công!') || text.includes('Success!')) {
                        const color = window.getComputedStyle(el).color;
                        if (color && (color.includes('0,128,0') || color.includes('34,197,94') || color.includes('16,185,129') || color.includes('0,255,0'))) {
                            return true;
                        }
                    }
                }
                return true;
            }
            const response = document.querySelector('input[name="cf-turnstile-response"]');
            return response && response.value && response.value.length > 10;
        } catch (e) { return false; }
    };

    // =============================================================
    // PANEL ĐIỀU KHIỂN
    // =============================================================
    const createPanel = () => {
        if ($('#kb-panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes sharkPulse {
                0% { transform: scale(.9); box-shadow: 0 0 0 0 rgba(74,192,255,.5); }
                70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(74,192,255,0); }
                100% { transform: scale(.9); box-shadow: 0 0 0 0 rgba(74,192,255,0); }
            }
            @keyframes sharkGlow {
                0% { border-color: rgba(74,192,255,.15); }
                50% { border-color: rgba(74,192,255,.4); }
                100% { border-color: rgba(74,192,255,.15); }
            }
            @keyframes waveMove {
                0% { background-position: 0 0; }
                100% { background-position: 40px 0; }
            }
            #kb-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 2147483647;
                width: 320px;
                font-family: 'Segoe UI', sans-serif;
                background: linear-gradient(160deg, rgba(6,20,45,.95), rgba(1,8,20,.98));
                backdrop-filter: blur(16px);
                border: 1px solid rgba(74,192,255,.2);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0,0,0,.7);
                overflow: hidden;
                animation: sharkGlow 3s infinite;
            }
            #kb-panel::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: repeating-linear-gradient(90deg, 
                    transparent 0%, 
                    rgba(74,192,255,.05) 2%, 
                    transparent 4%
                );
                background-size: 40px 2px;
                animation: waveMove 3s linear infinite;
                pointer-events: none;
            }
            #kb-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: linear-gradient(135deg, #0a1a30, #0a2848);
                border-bottom: 1px solid rgba(74,192,255,.08);
                cursor: pointer;
                position: relative;
            }
            #kb-panel-header .title {
                color: #4ac0ff;
                font-weight: 800;
                font-size: 14px;
            }
            #kb-panel-header .title span {
                background: linear-gradient(135deg, #4ac0ff, #0078d4);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            #kb-panel-header .title .ocr-badge {
                font-size: 10px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                padding: 1px 8px;
                border-radius: 10px;
                color: #fff;
                -webkit-text-fill-color: #fff;
                margin-left: 4px;
            }
            #kb-panel-header .dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                background: #4ac0ff;
                border-radius: 50%;
                box-shadow: 0 0 12px #4ac0ff;
                animation: sharkPulse 1.8s infinite;
            }
            #kb-panel-header .toggle {
                background: rgba(74,192,255,.08);
                border: 1px solid rgba(74,192,255,.05);
                color: #4ac0ff;
                width: 26px;
                height: 26px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 11px;
                transition: all .3s;
            }
            #kb-panel-header .toggle:hover {
                background: rgba(74,192,255,.15);
            }
            #kb-panel-content {
                padding: 12px 14px;
                max-height: 500px;
                transition: all .4s cubic-bezier(.4,0,.2,1);
                overflow: hidden;
            }
            #kb-panel-content.collapsed {
                max-height: 0 !important;
                padding: 0 14px !important;
            }
            #kb-info {
                background: rgba(74,192,255,.03);
                border: 1px solid rgba(74,192,255,.05);
                border-radius: 10px;
                padding: 10px 12px;
                margin-bottom: 8px;
                font-size: 12px;
                line-height: 1.8;
                color: #fff;
            }
            #kb-info .label { color: rgba(255,255,255,.3); }
            #kb-info .value { color: #4ac0ff; font-weight: 600; }
            #kb-info .gold { color: #fdcb6e; font-weight: 600; }
            #kb-info .captcha-status { color: #a78bfa; font-weight: 600; }
            #kb-log {
                background: rgba(0,6,15,.6);
                border: 1px solid rgba(74,192,255,.03);
                border-radius: 10px;
                padding: 8px 12px;
                font-family: 'Fira Code', monospace;
                font-size: 11px;
                color: #4ac0ff;
                max-height: 120px;
                overflow-y: auto;
                line-height: 1.6;
            }
            #kb-log .log-time {
                color: rgba(74,192,255,.2);
            }
            #kb-captcha-btn {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: #fff;
                border: none;
                border-radius: 8px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all .3s;
                width: 100%;
                margin-top: 6px;
            }
            #kb-captcha-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(245,158,11,.3);
            }
            #kb-captcha-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .shark-message-log {
                display: block;
                color: #4ac0ff;
                font-weight: 600;
                background: rgba(74,192,255,.04);
                border-left: 2px solid #4ac0ff;
                padding: 4px 0 4px 10px;
                margin: 4px 0 8px 0;
                border-radius: 0 4px 4px 0;
                font-size: 13px;
                line-height: 1.5;
                animation: sharkMessagePulse 2s ease-in-out infinite;
            }
            @keyframes sharkMessagePulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'kb-panel';
        panel.innerHTML = `
            <div id="kb-panel-header">
                <div><span class="title">🦈 <span>Shark Pro</span><span class="ocr-badge">📸OCR</span></span> <span class="dot"></span></div>
                <button class="toggle" id="kb-toggle">▼</button>
            </div>
            <div id="kb-panel-content">
                <div id="kb-info">
                    <div><span class="label">📧 Mail:</span> <span class="value" id="kb-email">Đang chờ...</span></div>
                    <div><span class="label">👤 User:</span> <span class="gold" id="kb-user">Đang chờ...</span></div>
                    <div><span class="label">📊 Email/min:</span> <span id="kb-count">0/25</span></div>
                    <div><span class="label">📸 Captcha:</span> <span class="captcha-status" id="kb-captcha-status">Chưa kích hoạt</span></div>
                </div>
                <button id="kb-captcha-btn">📸 Giải Captcha Ngay</button>
                <div id="kb-log"><span class="log-time">[System]</span> 🦈 Shark Pro + OCR.Space sẵn sàng</div>
            </div>
        `;
        document.documentElement.appendChild(panel);

        $('#kb-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const content = $('#kb-panel-content');
            content.classList.toggle('collapsed');
            $('#kb-toggle').textContent = content.classList.contains('collapsed') ? '▲' : '▼';
        });

        $('#kb-panel-header').addEventListener('click', () => {
            const content = $('#kb-panel-content');
            content.classList.toggle('collapsed');
            $('#kb-toggle').textContent = content.classList.contains('collapsed') ? '▲' : '▼';
        });

        const captchaBtn = $('#kb-captcha-btn');
        if (captchaBtn) {
            captchaBtn.addEventListener('click', async () => {
                captchaBtn.disabled = true;
                captchaBtn.textContent = '⏳ Đang giải...';
                const result = await solveAndFillCaptcha();
                captchaBtn.disabled = false;
                captchaBtn.textContent = '📸 Giải Captcha Ngay';
                if (result) {
                    const status = $('#kb-captcha-status');
                    if (status) status.textContent = '✅ ' + result;
                }
            });
        }
    };

    const updatePanel = (email, user) => {
        const emailEl = $('#kb-email');
        const userEl = $('#kb-user');
        const countEl = $('#kb-count');
        if (emailEl && email) emailEl.textContent = email;
        if (userEl && user) userEl.textContent = user;
        if (countEl) countEl.textContent = emailCount + '/' + CONFIG.BASIC_LIMIT;
    };

    // =============================================================
    // HIỂN THỊ THÔNG BÁO CÁ MẬP
    // =============================================================
    const showSharkMessage = async () => {
        const message = '🦈 Tôi là 1 con cá mập 🦈 nhưng tôi không biết bơi và đây là tool của tôi.';
        const logEl = $('#kb-log');
        if (!logEl) return;

        const msgContainer = document.createElement('div');
        msgContainer.className = 'shark-message-log';
        msgContainer.textContent = '';
        logEl.appendChild(msgContainer);

        let displayText = '';
        for (const char of message) {
            displayText += char;
            msgContainer.textContent = displayText;
            logEl.scrollTop = logEl.scrollHeight;
            await sleep(60);
        }

        await sleep(3000);
        msgContainer.style.opacity = '0';
        setTimeout(() => { if (msgContainer.parentNode) msgContainer.remove(); }, 500);
    };

    // =============================================================
    // XÓA COOKIE & RESET
    // =============================================================
    const cleanAll = async () => {
        toast('🧼 Đang dọn dẹp...', 'linear-gradient(135deg,#fdcb6e,#f9a825)');
        log('Dọn dẹp dữ liệu...');
        localStorage.clear();
        sessionStorage.clear();
        GM_deleteValue('current_email');
        GM_deleteValue('current_username');
        GM_deleteValue('tempmail_inbox_token');

        try {
            GM_cookie.list({ domain: '.katabump.com' }, (cookies) => {
                if (Array.isArray(cookies)) cookies.forEach(c => GM_cookie.delete({ url: window.location.origin, name: c.name }));
            });
            GM_cookie.list({ domain: window.location.hostname }, (cookies) => {
                if (Array.isArray(cookies)) cookies.forEach(c => GM_cookie.delete({ url: window.location.origin, name: c.name }));
            });
            GM_cookie.list({ domain: 'dashboard.katabump.com' }, (cookies) => {
                if (Array.isArray(cookies)) cookies.forEach(c => GM_cookie.delete({ url: 'https://dashboard.katabump.com', name: c.name }));
            });
        } catch (e) {}

        const domains = ['.katabump.com', 'dashboard.katabump.com', window.location.hostname];
        const paths = ['/', '/auth', '/dashboard', '/servers', '/auth/login'];
        for (const d of domains) {
            for (const p of paths) {
                document.cookie.split(';').forEach(c => {
                    const name = c.split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=' + d + '; path=' + p;
                });
            }
        }
        await sleep(1000);
        window.location.href = CONFIG.START_URL;
    };

    const blockDomain = (domain) => {
        if (!domain) return;
        domain = domain.toLowerCase().trim();
        const blocked = GM_getValue('blocked_domains', []);
        if (!blocked.includes(domain)) {
            blocked.push(domain);
            GM_setValue('blocked_domains', blocked);
            log('⛔ Đã chặn domain: ' + domain);
        }
    };

    // =============================================================
    // MAIN WORKER - 3 BƯỚC RÕ RÀNG
    // =============================================================
    const run = async () => {
        let busy = false;
        let formFilled = false;
        let submitted = false;
        let otpWaiting = false;
        let serverReady = false;
        let serverSubmitted = false;
        let waitingCF = false;
        let termsChecked = false;
        let isAltchaProcessing = false;
        let captchaSolved = false;
        let lastCaptchaCheck = 0;
        let sharkMessageShown = false;

        const worker = async () => {
            if (busy) return;
            busy = true;

            try {
                const url = window.location.href;
                const body = document.body.textContent || '';
                createPanel();

                // =============================================================
                // BƯỚC 3: GIẢI CAPTCHA + ĐIỀN + VERIFY
                // =============================================================
                const now = Date.now();
                if (now - lastCaptchaCheck > 1500) {
                    lastCaptchaCheck = now;
                    
                    const captchaInput = findCaptchaInput();
                    const captchaImg = findCaptchaImage();
                    
                    if (captchaInput && !captchaInput.value && !captchaSolved) {
                        log('🔄 BƯỚC 3: PHÁT HIỆN CAPTCHA, ĐANG GIẢI...');
                        const status = $('#kb-captcha-status');
                        if (status) status.textContent = '🔄 Đang giải...';
                        
                        const result = await solveAndFillCaptcha();
                        if (result) {
                            captchaSolved = true;
                            if (status) status.textContent = '✅ ' + result;
                            toast('✅ Đã giải: ' + result, 'linear-gradient(135deg,#00b894,#00d2a0)');
                            log('✅ BƯỚC 3: HOÀN THÀNH GIẢI CAPTCHA');
                        }
                    }
                    
                    if (captchaImg && !captchaSolved) {
                        let parent = captchaImg.parentElement;
                        for (let depth = 0; depth < 5 && parent; depth++) {
                            const inputs = parent.querySelectorAll('input[type="text"]');
                            for (const input of inputs) {
                                if (!input.value && !input.disabled) {
                                    log('🔍 BƯỚC 3: TÌM THẤY INPUT GẦN ẢNH CAPTCHA');
                                    const result = await solveAndFillCaptcha();
                                    if (result) {
                                        captchaSolved = true;
                                        const status = $('#kb-captcha-status');
                                        if (status) status.textContent = '✅ ' + result;
                                    }
                                    break;
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                }

                // =============================================================
                // HIỂN THỊ THÔNG BÁO CÁ MẬP
                // =============================================================
                if (!sharkMessageShown && url.includes('/register') && formFilled === false) {
                    sharkMessageShown = true;
                    await showSharkMessage();
                }

                // =============================================================
                // BƯỚC 1: XÁC THỰC KEY - ĐÃ XỬ LÝ Ở TRÊN
                // =============================================================

                // =============================================================
                // BƯỚC 2: TỰ ĐỘNG ĐĂNG KÝ TÀI KHOẢN
                // =============================================================
                if (url.includes('/login')) {
                    formFilled = false;
                    submitted = false;
                    otpWaiting = false;
                    serverReady = false;
                    serverSubmitted = false;
                    waitingCF = false;
                    termsChecked = false;
                    captchaSolved = false;
                    sharkMessageShown = false;
                    
                    if (!sessionStorage.getItem('ref_visited')) {
                        sessionStorage.setItem('ref_visited', 'true');
                        const refLink = GM_getValue('auth_referral_link', CONFIG.START_URL);
                        window.location.href = refLink;
                        busy = false;
                        return;
                    }

                    const createBtn = document.querySelector('a[href*="register"]') ||
                        Array.from(document.querySelectorAll('a, span, p')).find(el => 
                            el.innerText && el.innerText.trim().toLowerCase().includes('create account')
                        );
                    if (createBtn) click(createBtn);
                    log('🔄 BƯỚC 2: CHUYỂN SANG TRANG ĐĂNG KÝ');
                    busy = false;
                    return;
                }

                if (url.includes('/servers/ongoing') || body.includes('Server being created') || 
                    url.includes('orders=progress') || url.includes('order=')) {
                    toast('🎉 Tạo server thành công!', 'linear-gradient(135deg,#00b894,#00d2a0)');
                    log('✅ BƯỚC 3.4: TẠO SERVER THÀNH CÔNG! RESET...');
                    CONFIG.STATE.SERVER_CREATED = true;
                    const email = GM_getValue('current_email', '');
                    if (email) {
                        const domain = email.split('@')[1];
                        if (domain) blockDomain(domain);
                    }
                    const seeBtn = Array.from(document.querySelectorAll('a, button')).find(el => 
                        el.textContent && el.textContent.trim().toLowerCase() === 'see servers'
                    );
                    if (seeBtn) click(seeBtn);
                    await sleep(1500);
                    cleanAll();
                    busy = false;
                    return;
                }

                if (body.includes('Vous avez atteint votre limite') || 
                    body.includes('reached your server limit') || 
                    url.includes('error=max')) {
                    toast('⚠️ Đạt giới hạn server', 'linear-gradient(135deg,#fdcb6e,#f9a825)');
                    log('⚠️ BƯỚC 3.4: ĐẠT GIỚI HẠN SERVER, RESET...');
                    await sleep(1000);
                    cleanAll();
                    busy = false;
                    return;
                }

                // =============================================================
                // BƯỚC 2.2: ĐIỀN FORM ĐĂNG KÝ
                // =============================================================
                if (url.includes('/register')) {
                    if (!formFilled) {
                        toast('📧 Đang tạo email...');
                        log('🔄 BƯỚC 2.1: ĐANG TẠO EMAIL...');

                        const result = await createInbox('kbump_' + randStr(6));
                        if (!result) {
                            toast('❌ Lỗi tạo email', 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
                            await sleep(3000);
                            busy = false;
                            return;
                        }

                        const email = result.address;
                        const user = email.split('@')[0];
                        const token = result.token;
                        GM_setValue('current_email', email);
                        GM_setValue('current_username', user);
                        GM_setValue('tempmail_inbox_token', token);
                        updatePanel(email, user);

                        const firstName = document.querySelector('input[placeholder*="Firstname"], input[id="firstname"]');
                        const lastName = document.querySelector('input[placeholder*="Lastname"], input[id="lastname"]');
                        const emailInput = document.querySelector('input[type="email"], input[placeholder*="Email"], input[id="email"]');
                        const passwordInput = document.querySelector('input[type="password"], input[id="password"]');

                        setValue(firstName, rand(FIRST_NAMES));
                        setValue(lastName, rand(LAST_NAMES));
                        setValue(emailInput, email);
                        setValue(passwordInput, CONFIG.PASSWORD);

                        checkTerms();
                        formFilled = true;
                        waitingCF = true;
                        toast('✅ Đã điền form, chờ Cloudflare...');
                        log('✅ BƯỚC 2.2: ĐÃ ĐIỀN FORM ĐĂNG KÝ');
                        CONFIG.STATE.FORM_FILLED = true;
                        busy = false;
                        return;
                    }

                    // =============================================================
                    // BƯỚC 2.3: CHỜ CLOUDFLARE VERIFY
                    // =============================================================
                    if (waitingCF && isCloudflareVerified()) {
                        toast('⚡ Cloudflare OK!', 'linear-gradient(135deg,#00b894,#00d2a0)');
                        log('✅ BƯỚC 2.3: CLOUDFLARE VERIFY THÀNH CÔNG');
                        waitingCF = false;
                        CONFIG.STATE.CLOUDFLARE_DONE = true;

                        const submitBtn = document.querySelector('button[type="submit"]') ||
                            Array.from(document.querySelectorAll('button')).find(b =>
                                b.textContent && (
                                    b.textContent.toLowerCase().includes('create my account') ||
                                    b.textContent.toLowerCase().includes('create account') ||
                                    b.textContent.toLowerCase().includes('đăng ký')
                                )
                            );
                        if (submitBtn) {
                            click(submitBtn);
                            const form = submitBtn.closest('form');
                            if (form) form.submit();
                            submitted = true;
                            toast('✅ Đã bấm Create!');
                            log('✅ BƯỚC 2.3: ĐÃ BẤM CREATE MY ACCOUNT');
                            setTimeout(() => { submitted = false; }, 5000);
                        } else {
                            const anyForm = document.querySelector('form');
                            if (anyForm) anyForm.submit();
                            log('✅ BƯỚC 2.3: SUBMIT FORM (FALLBACK)');
                        }
                    }
                    busy = false;
                    return;
                }

                // =============================================================
                // BƯỚC 2.4: LẤY OTP
                // =============================================================
                if (body.includes('Verify your email') && !otpWaiting) {
                    otpWaiting = true;
                    toast('📩 Đang chờ OTP...');
                    log('🔄 BƯỚC 2.4: ĐANG CHỜ OTP...');

                    const token = GM_getValue('tempmail_inbox_token', '');
                    if (!token) {
                        toast('❌ Không có token', 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
                        log('❌ BƯỚC 2.4: KHÔNG CÓ TOKEN, RESET...');
                        await sleep(1000);
                        cleanAll();
                        busy = false;
                        return;
                    }

                    const otp = await waitForOTP(token, CONFIG.MAX_OTP_WAIT);
                    if (otp) {
                        toast('🎉 OTP: ' + otp, 'linear-gradient(135deg,#00b894,#00d2a0)');
                        log('✅ BƯỚC 2.4: NHẬN OTP: ' + otp);

                        const otpInput = document.querySelector('input[type="text"], input[name="code"], input[maxlength="6"]');
                        if (otpInput) {
                            setValue(otpInput, otp);
                            await sleep(500);
                            const verifyBtn = Array.from(document.querySelectorAll('button')).find(b =>
                                b.textContent && b.textContent.toLowerCase().includes('verify')
                            );
                            if (verifyBtn) click(verifyBtn);
                            else otpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                            log('✅ BƯỚC 2.4: ĐÃ NHẬP OTP VÀ XÁC THỰC');
                        }
                    } else {
                        toast('❌ Không nhận OTP sau ' + CONFIG.MAX_OTP_WAIT + 's', 'linear-gradient(135deg,#ff6b6b,#ee5a24)');
                        log('❌ BƯỚC 2.4: OTP TIMEOUT, RESET...');
                        const email = GM_getValue('current_email', '');
                        const domain = email.split('@')[1];
                        if (domain) blockDomain(domain);
                        await sleep(1500);
                        cleanAll();
                    }
                    otpWaiting = false;
                    busy = false;
                    return;
                }

                // =============================================================
                // BƯỚC 2.5: VÀO DASHBOARD
                // =============================================================
                if (url.includes('/dashboard') && !body.includes('Verify your email') && !url.includes('/servers/create')) {
                    log('🔄 BƯỚC 2.5: CHUYỂN ĐẾN TẠO SERVER...');
                    CONFIG.STATE.ACCOUNT_CREATED = true;
                    const orderBtn = Array.from(document.querySelectorAll('a')).find(a =>
                        a.getAttribute('href') && a.getAttribute('href').includes('/servers/create')
                    );
                    if (orderBtn) click(orderBtn);
                    busy = false;
                    return;
                }

                // =============================================================
                // BƯỚC 3.4: TẠO SERVER
                // =============================================================
                if (url.includes('/servers/create')) {
                    if (!serverReady) {
                        serverReady = true;
                        toast('⚙️ Cấu hình server...');
                        log('🔄 BƯỚC 3.4: CẤU HÌNH SERVER...');

                        const env = rand(['Node', 'Py']);
                        const name = env + '-' + randStr(5);
                        const nameInput = document.querySelector('input[type="text"], input[name="name"]');
                        setValue(nameInput, name);

                        const search = env === 'Py' ? 'python' : 'node';
                        for (const label of document.querySelectorAll('label')) {
                            if (label.innerText && label.innerText.toLowerCase().includes(search)) {
                                click(label);
                                break;
                            }
                        }

                        for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
                            if (!cb.closest('altcha-widget') && !cb.closest('[id*="captcha"]') && !cb.checked) {
                                click(cb);
                            }
                        }

                        log('✅ BƯỚC 3.4: SERVER CONFIG: ' + name);
                        toast('⏳ Chờ Altcha...');
                        busy = false;
                        return;
                    }

                    if (!termsChecked) {
                        if (checkTerms()) {
                            termsChecked = true;
                            log('✅ BƯỚC 3.4: ĐÃ TÍCH TERMS CHECKBOX');
                        } else {
                            setTimeout(() => {
                                if (!termsChecked) {
                                    checkTerms();
                                    termsChecked = true;
                                    log('✅ BƯỚC 3.4: ĐÃ TÍCH TERMS CHECKBOX (DELAY)');
                                }
                            }, 1000);
                        }
                    }

                    const altchaWidget = document.querySelector('altcha-widget');
                    const altchaInput = document.querySelector('input[name="altcha"]');
                    const hasVerifiedText = body.includes('Verified') || body.includes('verified');
                    const altchaState = altchaWidget ? altchaWidget.getAttribute('state') : '';
                    const altchaHasValue = altchaInput && altchaInput.value && altchaInput.value.length > 20;
                    const isVerified = altchaState === 'verified' || altchaHasValue || hasVerifiedText;

                    if (isVerified && !serverSubmitted) {
                        serverSubmitted = true;
                        toast('🚀 Altcha OK! Tạo server...', 'linear-gradient(135deg,#00b894,#00d2a0)');
                        log('✅ BƯỚC 3.4: ALTCHA VERIFIED, TẠO SERVER...');

                        const createBtn = document.querySelector('button[type="submit"]') ||
                            Array.from(document.querySelectorAll('button, input')).find(b =>
                                (b.innerText || b.value || '').toLowerCase().includes('create server') ||
                                (b.textContent || '').toLowerCase().includes('deploy') ||
                                (b.textContent || '').toLowerCase().includes('create')
                            );
                        if (createBtn) {
                            click(createBtn);
                            const form = createBtn.closest('form');
                            if (form) form.submit();
                            log('✅ BƯỚC 3.4: ĐÃ BẤM CREATE SERVER');
                            toast('✅ Đã tạo server!', 'linear-gradient(135deg,#00b894,#00d2a0)');
                        } else {
                            const anyForm = document.querySelector('form');
                            if (anyForm) anyForm.submit();
                            log('✅ BƯỚC 3.4: SUBMIT FORM SERVER');
                        }
                    } else if (altchaWidget && !isVerified && !isAltchaProcessing) {
                        isAltchaProcessing = true;
                        log('🔄 BƯỚC 3.4: ĐANG KÍCH ALTCHA...');

                        let clicked = false;
                        if (altchaWidget.shadowRoot) {
                            const targets = [
                                altchaWidget.shadowRoot.querySelector('.altcha-checkbox'),
                                altchaWidget.shadowRoot.querySelector('label'),
                                altchaWidget.shadowRoot.querySelector('input[type="checkbox"]'),
                                altchaWidget.shadowRoot.querySelector('button')
                            ];
                            for (const t of targets) {
                                if (t && !t.disabled) {
                                    click(t);
                                    clicked = true;
                                    log('✅ BƯỚC 3.4: ĐÃ CLICK ALTCHA');
                                    break;
                                }
                            }
                        }

                        if (!clicked && altchaWidget && typeof altchaWidget.verify === 'function') {
                            try {
                                await altchaWidget.verify();
                                clicked = true;
                                log('✅ BƯỚC 3.4: ĐÃ GỌI VERIFY()');
                            } catch (e) {}
                        }

                        if (!clicked) {
                            const fallback = document.querySelector('input[type="checkbox"][id*="altcha"]') || 
                                            document.querySelector('.altcha');
                            if (fallback && !fallback.disabled) {
                                click(fallback);
                                clicked = true;
                                log('✅ BƯỚC 3.4: ĐÃ CLICK ALTCHA FALLBACK');
                            }
                        }

                        isAltchaProcessing = false;
                        if (!clicked) log('⚠️ BƯỚC 3.4: KHÔNG THỂ CLICK ALTCHA');
                    }
                    busy = false;
                    return;
                }

            } catch (e) {
                console.error('[Shark] Error:', e);
                log('❌ LỖI: ' + e.message);
            } finally {
                busy = false;
            }
        };

        setInterval(worker, CONFIG.CHECK_INTERVAL);
        setTimeout(worker, 1000);

        GM_registerMenuCommand('🔄 Reset Shark', () => {
            if (confirm('🦈 Reset toàn bộ dữ liệu?')) cleanAll();
        });
        GM_registerMenuCommand('🔑 Đổi key', () => {
            clearToken();
            alert('🦈 Đã xóa key. F5 để nhập key mới.');
            location.reload();
        });
        GM_registerMenuCommand('📸 Cài OCR API Key', () => {
            const current = GM_getValue('OCR_API_KEY', '');
            const newKey = prompt('Nhập OCR.Space API Key (để trống dùng key mặc định):', current);
            if (newKey !== null) {
                GM_setValue('OCR_API_KEY', newKey.trim());
                alert('✅ Đã lưu OCR API Key!');
                location.reload();
            }
        });
    };

    // =============================================================
    // KHỞI ĐỘNG
    // =============================================================
    const start = () => {
        const token = getToken();
        if (isTokenValid(token)) {
            log('✅ BƯỚC 1: TOKEN HỢP LỆ, BẮT ĐẦU CHẠY...');
            run();
        } else {
            const savedKey = GM_getValue('auth_saved_key', null);
            if (savedKey) {
                log('🔄 BƯỚC 1: ĐANG XÁC THỰC KEY ĐÃ LƯU...');
                authenticate(savedKey).then(result => {
                    if (result.success) {
                        saveToken(result.token);
                        log('✅ BƯỚC 1: XÁC THỰC THÀNH CÔNG');
                        run();
                    } else {
                        GM_setValue('auth_saved_key', null);
                        log('❌ BƯỚC 1: XÁC THỰC THẤT BẠI, YÊU CẦU NHẬP KEY');
                        showAuthModal(run);
                    }
                });
            } else {
                log('🔄 BƯỚC 1: YÊU CẦU NHẬP KEY');
                showAuthModal(run);
            }
        }
    };

    start();
})();

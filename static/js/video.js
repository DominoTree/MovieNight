/// <reference path='./both.js' />

let currentSession = null;

function destroyPlayer() {
    if (!currentSession) return;
    try { currentSession.destroy(); } catch (e) { console.warn('destroy err', e); }
    currentSession = null;
}

function initPlayer() {
    destroyPlayer();
    const el = document.querySelector('#videoElement');
    if (!el) return;

    el.removeAttribute('src');
    el.srcObject = null;
    try { el.load(); } catch (e) { /* noop */ }

    const native = el.canPlayType('application/vnd.apple.mpegurl') !== '';
    if (native) {
        startNativeHLS(el);
        return;
    }
    if (window.Hls && Hls.isSupported()) {
        startHlsJs(el);
        return;
    }
    showPlayerError('Browser does not support live video playback.');
}

function startNativeHLS(el) {
    let retries = 0;
    let destroyed = false;

    const onErr = () => {
        if (destroyed) return;
        retries++;
        const delay = Math.min(1000 * Math.pow(2, retries), 15000);
        console.warn('native HLS error, retry in ' + delay + 'ms');
        setTimeout(initPlayer, delay);
    };
    el.addEventListener('error', onErr);

    el.src = '/hls/index.m3u8';
    el.play().catch(err => console.warn('play() rejected', err));

    currentSession = {
        destroy() {
            destroyed = true;
            el.removeEventListener('error', onErr);
            el.removeAttribute('src');
            try { el.load(); } catch (e) { /* noop */ }
        },
    };
    bindOverlay(el);
}

function startHlsJs(el) {
    const hls = new Hls({
        lowLatencyMode: true,
        liveDurationInfinity: true,
        backBufferLength: 30,
        maxBufferLength: 10,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 6,
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        console.warn('hls.js fatal', data.type, data.details);
        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
            default:
                hls.destroy();
                setTimeout(initPlayer, 2000);
        }
    });

    hls.loadSource('/hls/index.m3u8');
    hls.attachMedia(el);
    el.play().catch(err => console.warn('play() rejected', err));

    currentSession = { destroy() { try { hls.destroy(); } catch (e) { /* noop */ } } };
    bindOverlay(el);
}

function bindOverlay(el) {
    const overlay = document.querySelector('#videoOverlay');
    if (!overlay) return;
    overlay.style.display = '';
    overlay.onclick = () => {
        overlay.style.display = 'none';
        el.muted = false;
    };
}

function showPlayerError(msg) {
    const w = document.querySelector('#videoWrapper');
    if (!w) return;
    let err = document.querySelector('#videoErrorMsg');
    if (!err) {
        err = document.createElement('div');
        err.id = 'videoErrorMsg';
        err.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:#000;z-index:4;text-align:center;padding:1em;';
        w.appendChild(err);
    }
    err.textContent = msg;
}

window.addEventListener('load', initPlayer);
window.addEventListener('beforeunload', destroyPlayer);

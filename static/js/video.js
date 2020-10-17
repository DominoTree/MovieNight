/// <reference path="./both.js" />
function initPlayer() {
    if (!flvjs.isSupported()) {
        console.warn('flvjs not supported');
        return;
    }

    let videoElement = document.querySelector("#videoElement");

    // https://github.com/bilibili/flv.js/blob/master/docs/api.md
    let mediaDataSource = {
        type: "flv",
        url: "/live"
    }

    let playerConfig = {
        "stashInitialSize": "3125KB",
        "lazyLoad": false,
        "deferLoadAfterSourceOpen": false
    };

    let flvPlayer = flvjs.createPlayer(mediaDataSource, playerConfig);

    flvPlayer.attachMediaElement(videoElement);
    flvPlayer.load();
    flvPlayer.play();

    let overlay = document.querySelector('#videoOverlay');
    overlay.onclick = () => {
        overlay.style.display = 'none';
        videoElement.muted = false;
    };
}

window.addEventListener("load", initPlayer);

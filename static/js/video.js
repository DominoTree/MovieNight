/// <reference path="./both.js" />
function initPlayer() {
    clearTimeout(window.playerReload);

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

    flvPlayer.on(flvjs.Events.ERROR, function(a,b,c) {
        //network or other error (probably a 404 from no video)
        //HttpStatusCodeInvalid
        //MediaMSEError will blow it up
	console.log(b);
        if (b == "HttpStatusCodeInvalid") {
            console.log("Setting reload timeout.");
            document.getElementById("noVideo").style.display="flex";
            this.playerReload = setTimeout(function(){
                this.unload();
                this.load();
                this.play();
            }.bind(flvPlayer), 3000);
        }
    });

    flvPlayer.on(flvjs.Events.LOADING_COMPLETE, function(a,b,c) {
        //the stream is over
        console.log("Setting reload timeout.");
        document.getElementById("noVideo").style.display="flex";
        this.playerReload = setTimeout(function(){
            this.unload();
            this.load();
            this.play();
        }.bind(flvPlayer), 3000);
    });

    flvPlayer.on(flvjs.Events.STATISTICS_INFO, function(a,b,c) {
        //we are playing video so hide this thing
        clearTimeout(this.playerReload);
        document.getElementById("noVideo").style.display="none";
    }.bind(flvPlayer));



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

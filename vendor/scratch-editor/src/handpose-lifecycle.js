// Added to the upstream class by prepare.cjs. No automatic ml5 prediction loop.
const {errorMessage}=require('./shared');
let scriptPromise,modelPromise;
function loadScript() {
    if(scriptPromise)return scriptPromise;
    if(window.ml5 && typeof window.ml5.handpose==='function')return Promise.resolve(window.ml5);
    let script;
    scriptPromise=new Promise((resolve,reject)=>{
        script=document.createElement('script');
        script.src='/scratch-editor/ml5.min.js';
        script.onload=()=>{
            try {
                if(!window.ml5 || typeof window.ml5.handpose!=='function')throw Error('ml5 程式載入不完整');
                resolve(window.ml5);
            } catch(e){reject(e);}
        };
        script.onerror=()=>reject(Error('模型程式下載失敗'));
        document.head.appendChild(script);
    }).then(library=>{script.onload=null;script.onerror=null;return library;}).catch(e=>{
        if(script){script.onload=null;script.onerror=null;if(script.parentNode)script.parentNode.removeChild(script);}
        scriptPromise=null;throw e;
    });
    return scriptPromise;
}
function loadModel() {
    // A failed model download can retry without loading ml5/TF a second time.
    // .then also converts a synchronous handpose() throw into a rejection.
    if(!modelPromise)modelPromise=loadScript().then(library=>library.handpose({flipHorizontal:false})).catch(e=>{modelPromise=null;throw e;});
    return modelPromise;
}
function status(runtime, state, message) { runtime.emit('HANDPOSE_STATUS', {state, message}); }
function waitForModel(owner) {
    let timer;
    return Promise.race([loadModel(),new Promise((resolve,reject)=>{
        owner.cancelModelWait=()=>resolve(null);
        timer=setTimeout(()=>reject(new Error('模型下載逾時，請檢查網路')),60000);
    })]).finally(()=>{clearTimeout(timer);owner.cancelModelWait=null;});
}
const lifecycle = {
    init(runtime) {
        this.runtime=runtime; this.landmarks=[]; this.ratio=0.75; this.epoch=0; this.active=false; this.pending=null; this.frame=null; this.detected=null;
        runtime.handpose=this;
        this.stopListener=()=>this.stop();
        runtime.on('PROJECT_STOP_ALL', this.stopListener);
        // Legacy handpose2scratch projects relied on constructor camera startup.
        // Preserve that behavior at the user's green flag gesture, never at load.
        this.startListener=()=>{
            const blocks=(runtime.targets || []).flatMap(t=>Object.values(t.blocks._blocks));
            const usesHandpose=blocks.some(b=>b.opcode && b.opcode.startsWith('handpose2scratch_'));
            const controlsVideo=blocks.some(b=>b.opcode==='handpose2scratch_videoToggle');
            if(usesHandpose && !controlsVideo) this.start('on');
        };
        runtime.on('PROJECT_START', this.startListener);
    },
    stop() {
        this.epoch++; this.active=false; if(this.cancelModelWait) this.cancelModelWait(); if(this.frame!==null) cancelAnimationFrame(this.frame); this.frame=null; this.landmarks=[]; this.detected=null;
        const video=this.runtime.ioDevices.video;
        const stream=video.provider && video.provider.video && video.provider.video.srcObject;
        if(stream) stream.getTracks().forEach(t=>t.stop());
        video.disableVideo();
        status(this.runtime,'off','攝影機已停止');
    },
    async start(state) {
        const video=this.runtime.ioDevices.video;
        video.mirror=state==='on';
        if(this.active) return;
        if(this.pending) {
            const waitingEpoch=this.epoch;
            await this.pending;
            if(this.epoch!==waitingEpoch || this.active) return;
        }
        this.active=true; const epoch=++this.epoch;
        const current=()=>this.active && this.epoch===epoch;
        const task=async()=>{
            if(!current()) return;
            let phase='攝影機';
            try {
                status(this.runtime,'loading','等待攝影機權限');
                await video.enableVideo();
                if(!current()) { video.disableVideo(); return; }
                status(this.runtime,'loading','正在下載 Handpose 模型'); phase='模型載入';
                const model=await waitForModel(this);
                if(!current()) return;
                status(this.runtime,'on','攝影機已開啟，單手辨識中');
                const tick=async()=>{
                    if(!current()) return;
                    try {
                        const input=video.provider.video;
                        if(input && input.readyState >= 2) {
                            this.inference=model.predict(input);
                            const hands=await this.inference;
                            if(!current()) return;
                            this.landmarks=hands.length ? hands[hands.length-1].landmarks : [];
                        } else this.landmarks=[];
                        if(this.detected !== (this.landmarks.length > 0)) {
                            this.detected=this.landmarks.length > 0;
                            status(this.runtime,'on',this.detected ? '攝影機已開啟，單手辨識中' : '攝影機已開啟，單手辨識中（未偵測到手）');
                        }
                        if(current()) this.frame=requestAnimationFrame(tick);
                    } catch(e) { if(current()) { this.stop(); status(this.runtime,'error',`手部推論失敗：${errorMessage(e)}`); } }
                    finally { this.inference=null; }
                };
                await tick();
            } catch(e) {
                if(!current()) return;
                const messages={NotAllowedError:'攝影機權限遭拒，請在瀏覽器網站設定中允許',NotFoundError:'找不到攝影機',NotReadableError:'攝影機被占用或無法讀取'};
                this.stop(); status(this.runtime,'error',messages[e && e.name] || `${phase}失敗：${errorMessage(e)}`);
            }
        };
        // Also wait for the last cancelled inference before starting another loop.
        this.pending=Promise.resolve(this.inference).catch(()=>{}).then(task);
        try { await this.pending; } finally { this.pending=null; }
    }
};
module.exports=lifecycle;
